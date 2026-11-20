// The turn list drawn in 3D (Fernando's request, Nov 16: the combat timeline of FFT The Ivalice
// Chronicles rebuilt in Three.js), a screen of the shared 3D layer (ui3d/layer.ts). One quad per row: a framed card with
// the unit's face on its side's colour, the life bar under it and the order number beside it, 1 at the bottom and
// counting up, like the reference (card.ts holds the shader).
//   Layout and input: where the list and each row sit is queue-layout.ts' (pure), on the reference's place (layout.ts);
//   sizes were measured at 1280x720. The HTML list (hud.ts renderQueue) stays under the drawing, unseen and seated
//   from the same numbers (queue-seat.ts): it is the scroll and the hover, and only its scroll is read back. Each card
//   springs to its row's box.
import { Group, Mesh, type ShaderMaterial, Texture, TextureLoader, type Vector2 } from 'three';
import type { Battle } from '../../shared/battle/battle.ts';
import type { UnitState } from '../../shared/battle/types.ts';
import { UNIT_DEFS } from '../../shared/battle/units.ts';
import { battleFace, type Expression, frameOf } from '../battle-face.ts';
import type { Forecast } from '../forecast.ts';
import { turnsFolded } from '../hud-queue.ts';
import { ATLAS_COLUMNS, atlasCell } from '../icons.ts';
import { modelOf } from '../markers.ts';
import type { Ui3dLayer, Ui3dScreen } from '../ui3d/layer.ts';
import { place, REGIONS, sheetBox } from '../ui3d/layout.ts';
import { QUAD } from '../ui3d/panel.ts';
import { ease, land, type Spring, spring, stepSpring } from '../ui3d/spring.ts';
import { dropText, textMesh } from '../ui3d/text.ts';
import { cardMaterial, hex, INK, LEFT, PAD, RIGHT, sharedUniforms } from './card.ts';
import { CardTip } from './card-tip.ts';
import { type QueueBoxes, type QueueLayout, queueLayout } from './queue-layout.ts';
import { dropName, seatQueue, wireQueue } from './queue-seat.ts';
import { headOnSheet, matchRows, type Queue, type QueueCard, queueCards, repeats, statsLayout } from './queue-view.ts';

const INNER = 40.2 / 43; // the picture's width over its height inside the frame: how a face is cropped
const ATLAS_CELL = 32; // px of an ability icon in /ui/fft/atlas-32.png
// stiffness and damping of the cards: a ratio of 0.69, so a card overshoots its slot a little and settles in about a
// third of a second
const K = 170;
const C = 18;
const TEXT_PAD = 3; // the empty margin a label carries on each side (ui3d/text.ts)

type Box = QueueBoxes['rows'][number];
interface Card {
  d: QueueCard;
  mesh: Mesh<typeof QUAD, ShaderMaterial>;
  box: Record<keyof Box, Spring>; // in the list's scroll space, px
  row: number; // index of the row it follows; -1 once it is leaving
  alpha: number;
  fade: number; // 1 showing, 0 leaving
  crop: (frame: number) => void; // moves the face to that frame of its sheet
  face: ReturnType<typeof battleFace>;
  // the lines beside it (queue-view.ts `stats`): redrawn only when their text or size changes
  texts: { key: string; lines: Mesh<typeof QUAD, ShaderMaterial>[] } | null;
}
const SIDES = ['x', 'y', 'w', 'h'] as const;
// GLSL's smoothstep, for the texts to fade at the list's ends as the cards do
const ramp = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class Turn3d implements Ui3dScreen {
  readonly flat = new Group();
  private readonly tip: CardTip; // name and life of the card under the mouse
  private readonly loader = new TextureLoader();
  // one load per image; `waiting` holds what to run when it arrives (null once it has)
  private readonly textures = new Map<string, { tex: Texture; waiting: ((img: HTMLImageElement) => void)[] | null }>();
  private readonly shared = sharedUniforms();
  private cards: Card[] = [];
  private leaving: Card[] = [];
  private turn = '';
  private drawn = false; // the first list is placed, not animated: nothing flies in when the battle opens
  private hovered = -1;
  private statW = 0; // the widest life or CT line of the list, px: every bar takes it, so they compare at a glance
  private readonly scroll = spring(0);
  private geo: QueueBoxes = { rows: [], left: 0, top: 0, height: 0, head: 0, scroll: 0, more: 0 };
  private lay!: QueueLayout; // set by the layer's first resize, in the constructor
  private shown = { rows: 0, now: false, head: false, room: undefined as number | undefined, stats: 0, folded: false };
  private small: boolean[] = []; // per shown row: a repeat's smaller card (queue-view.ts repeats)
  private expression: (u: UnitState) => Expression = () => 'neutral';

  // `host`: the HUD's own list; hidden by CSS (the sandbox's `hide`), the layer hides the cards with it. `headless`: the
  // 3D bar is on, and its sheet stands for the list's head (queueCards; style.css hides that HTML row)
  constructor(
    private readonly layer: Ui3dLayer,
    readonly host: HTMLElement,
    private readonly headless = false,
  ) {
    layer.root.classList.add('turn3d');
    this.tip = new CardTip(layer);
    this.flat.add(this.tip.group);
    this.shared.uIconGrid.value.set(ATLAS_COLUMNS, 1);
    this.shared.uIcons.value = this.texture('/ui/fft/atlas-32.png', (img) =>
      this.shared.uIconGrid.value.set(img.width / ATLAS_CELL, img.height / ATLAS_CELL),
    );
    layer.add(this, 'turn');
    wireQueue(host, this);
  }

  // The list's scale: the cards were measured at 720 px tall, 1.5 of them to a reference px
  resize() {
    this.shared.uS.value = this.layer.small.s * 1.5; // 65% on a phone (layout.ts PHONE_SHRINK)
    this.shared.uH.value = this.layer.h;
    this.retext(); // the lines' size follows the scale
    this.relay();
  }

  // The list on the page, from its own layout: the cards head for it and the unseen HTML list is seated on it
  private relay() {
    const { layer, shown } = this;
    this.lay = queueLayout({
      ...shown, // the rows, the acting card, the lines' room and the fold
      s: this.shared.uS.value,
      at: place(REGIONS.turn, layer.stage),
      pageH: layer.h,
      margin: layer.inset.top,
      sheet: shown.room ?? layer.h - Math.round(sheetBox(layer.small, layer.h).y), // the 3D bar's sheet or an HTML one
      small: this.small,
    });
    seatQueue(this.host, this.lay, shown.head, layer, this.flat);
    this.place();
  }
  // what keeps clear of the list (hud.ts place, insets)
  get box() {
    return this.lay.box;
  }
  // A redrawn list's rows, before the HUD anchors its scroll. `sheet`: the acting sheet's unit; `room`: an HTML panel's
  seat(q: Queue | null, sheet?: string, room?: number) {
    const head = this.headless && headOnSheet(q, sheet),
      rows = (q?.rows.length ?? 0) - (head ? 1 : 0),
      small = repeats(q?.rows ?? []).slice(head ? 1 : 0);
    Object.assign(this.shown, { rows, now: rows > 0 && !head, head, room, folded: turnsFolded(this.layer.phone) });
    this.small = small;
    this.relay();
  }

  private texture(url: string, loaded: (img: HTMLImageElement) => void) {
    let entry = this.textures.get(url);
    if (!entry) {
      const made = { tex: new Texture(), waiting: [] as ((img: HTMLImageElement) => void)[] | null };
      made.tex = this.loader.load(url, (tex) => {
        for (const run of made.waiting ?? []) run(tex.image as HTMLImageElement);
        made.waiting = null;
        this.layer.wake();
      });
      made.tex.flipY = false;
      this.textures.set(url, (entry = made));
    }
    if (entry.waiting) entry.waiting.push(loaded);
    else loaded(entry.tex.image as HTMLImageElement);
    return entry.tex;
  }

  private card(d: QueueCard): Card {
    // each card takes its own patch of the paint, the same on every load (a screenshot repeats)
    const key = `${d.id.unit}/${d.id.charge ?? ''}`;
    const seed = ([...key].reduce((n, ch) => n + ch.charCodeAt(0), 0) * 0.137) % 1;
    const mesh = new Mesh(QUAD, cardMaterial(this.shared, seed));
    this.flat.add(mesh);
    const c: Card = {
      d,
      mesh,
      box: { x: spring(0), y: spring(0), w: spring(0), h: spring(0) },
      row: -1,
      alpha: 0,
      fade: 1,
      crop: () => {},
      face: undefined,
      texts: null,
    };
    this.setFace(c, d.unit);
    return c;
  }

  // the face of a unit on its card: the painted sheet's frame, else the rendered portrait's top, cut to the picture's shape
  private setFace(c: Card, u: UnitState) {
    const un = c.mesh.material.uniforms;
    const uv = un.uFaceUv.value;
    const tint = UNIT_DEFS[u.def].tint;
    // the HUD's .tinted filter, approximated: the face's light in the unit's glow colour
    if (tint) un.uTint.value.set(...(hex(tint) as [number, number, number]), 0.55);
    c.face = battleFace(u.def);
    const model = modelOf(u.def);
    if (c.face) {
      const n = c.face.frames;
      c.crop = (frame) => uv.set((frame + (1 - INNER) / 2) / n, 0, INNER / n, 1);
      c.crop(frameOf(c.face, this.expression(u)));
      un.uFace.value = this.texture(`/chars/${c.face.sheet}`, () => (un.uHasFace.value = 1));
    } else if (model) {
      un.uFace.value = this.texture(`/chars/${model}.webp`, (img) => {
        uv.set(0, 0, 1, Math.min(1, img.width / INNER / img.height));
        un.uHasFace.value = 1;
      });
    }
  }

  // the card's lines of text; unchanged lines keep their textures (the CT of every row changes each turn, not each draw)
  private setTexts(c: Card) {
    const { layer } = this,
      st = c.d.stats,
      size = statsLayout(0, this.shared.uS.value).size,
      key = st ? JSON.stringify([st.lines, size, layer.dpr]) : '';
    if (c.texts?.key === key) return;
    this.dropTexts(c);
    if (!st) return;
    const make = (str: string) => {
      const m = textMesh(str, { size, color: INK, font: layer.theme.font }, layer.dpr);
      m.renderOrder = 4; // over every card: a hovered neighbour grows a little
      this.flat.add(m);
      return m;
    };
    c.texts = { key, lines: st.lines.map(make) };
  }
  private retext() {
    for (const c of this.cards) this.setTexts(c);
    this.statW = Math.max(0, ...this.cards.flatMap((c) => c.texts?.lines.map((m) => m.scale.x) ?? []));
    // the list grows by the room the lines take past its cards' column (20 design px are already there), so what
    // keeps clear of the list keeps clear of them too (queue-layout.ts `stats`)
    const s = this.shared.uS.value,
      room = this.statW ? statsLayout(0, s).x + this.statW + (6 - 20) * s : 0;
    this.shown.stats = Math.max(0, Math.ceil(room));
  }
  private dropTexts(c: Card) {
    if (c.texts) for (const m of c.texts.lines) dropText(m);
    c.texts = null;
  }

  // A redrawn list (BattleHud.render): the same rows as the HTML, with the strike preview's targets. Each row keeps its
  // card (matchRows), new rows get one and the rest leave: the one that just played slides out, the others fade
  // `sheet`: the unit the HUD's acting sheet shows
  update(b: Battle, q: Queue | null, fs: Forecast[], face: (u: UnitState) => Expression, sheet?: string) {
    this.expression = face;
    const next = queueCards(b, q, fs, this.headless ? sheet : undefined, turnsFolded(this.layer.phone));
    const turn = q ? `${b.state.turnsPlayed}:${b.state.turn.actor}` : '';
    const passed = turn !== this.turn;
    this.turn = turn;
    const kept = matchRows(
      this.cards.map((c) => c.d.id),
      next.map((d) => d.id),
      passed,
    );
    const s = this.shared.uS.value;
    this.cards.forEach((c, i) => {
      if (kept.includes(i)) return;
      c.row = -1;
      c.fade = 0;
      if (i === 0 && passed) {
        c.box.x.to -= 70 * s;
        c.box.y.to += 18 * s;
      }
      this.leaving.push(c);
    });
    const old = this.cards;
    this.cards = next.map((d, i) => {
      const c = kept[i] < 0 ? this.card(d) : old[kept[i]];
      c.row = i;
      c.d = d;
      const un = c.mesh.material.uniforms;
      (un.uHp.value as Vector2).set(...d.hp);
      un.uTeam.value = d.enemy ? 1 : 0;
      un.uGold.value = d.id.charge ? 1 : 0;
      un.uNum.value = d.num;
      const cell = d.id.charge ? atlasCell(d.id.charge) : null;
      un.uIcon.value.set(cell?.[0] ?? 0, cell?.[1] ?? 0, d.id.charge ? (cell ? 2 : 1) : 0);
      return c;
    });
    this.retext();
    this.relay(); // the lines' room may have changed the list's width
    if (!this.drawn) this.place(true);
    this.drawn = true;
  }

  // The list's boxes changed (a redraw, a scroll, a resize): each card heads for its row's. `first` puts them there at
  // once, as reduced motion does
  place(first = false) {
    const geo = (this.geo = { ...this.lay, scroll: this.host.scrollTop });
    const snap = first || this.layer.still;
    for (const c of this.cards) {
      const r = geo.rows[c.row];
      if (!r) continue;
      for (const k of SIDES) c.box[k].to = r[k];
      // a new card grows in place
      if (c.alpha === 0 && !snap) {
        land(c.box.x);
        land(c.box.y);
        c.box.w.x = r.w * 0.6;
        c.box.h.x = r.h * 0.6;
      }
      if (snap) {
        for (const k of SIDES) land(c.box[k]);
        c.alpha = 1;
      }
    }
    this.layer.wake();
  }

  // the row under the mouse, -1 for none (the HUD's list tells)
  hover(row: number) {
    if (row !== this.hovered) this.layer.wake();
    this.hovered = row;
  }

  frame(dt: number, t: number) {
    const still = this.layer.still;
    const e = still ? 10 : dt; // reduced motion: every ease is already there
    this.shared.uTime.value = t;
    const s = this.shared.uS.value;
    const g = this.geo;
    // the list's scroll glides too (PgUp, PgDn and the wheel jump it)
    this.scroll.to = g.scroll;
    if (still) land(this.scroll);
    else stepSpring(this.scroll, dt, K, C);
    // rows fade at an end only when there is more list past it; the column stacks from the bottom, so the scroll is 0 at
    // rest and negative up the list
    this.shared.uClip.value.set(
      g.more + g.scroll > 1 ? g.top + g.head : -1e5,
      g.scroll < -1 ? g.top + g.height + PAD * s : 1e5,
    );
    this.leaving = this.leaving.filter((c) => {
      if (c.alpha > 0.01 && !still) return true;
      c.mesh.removeFromParent();
      c.mesh.material.dispose();
      this.dropTexts(c);
      return false;
    });
    const tipped = this.cards[this.hovered];
    for (const c of [...this.cards, ...this.leaving]) {
      for (const k of SIDES) {
        if (still) land(c.box[k]);
        else stepSpring(c.box[k], dt, K, C);
      }
      c.alpha = ease(c.alpha, c.fade, e, c.fade ? 14 : 9);
      const un = c.mesh.material.uniforms;
      const on = (flag: boolean) => (flag && c.fade ? 1 : 0);
      un.uNow.value = ease(un.uNow.value, on(c.d.now), e, 7);
      un.uTarget.value = ease(un.uTarget.value, on(c.d.target), e, 12);
      un.uPending.value = ease(un.uPending.value, on(c.d.pending), e, 12);
      un.uHover.value = ease(un.uHover.value, on(c === tipped), e, 16);
      un.uShift.value = 8 * s * un.uTarget.value;
      un.uLift.value = 4 * s * un.uHover.value;
      un.uAlpha.value = c.alpha;
      if (c.face) c.crop(frameOf(c.face, this.expression(c.d.unit)));
      // hovered cards grow a little around their middle
      const grow = 1 + 0.06 * un.uHover.value;
      const w = Math.max(1, c.box.w.x * grow),
        h = Math.max(1, c.box.h.x * grow);
      const ox = g.left + c.box.x.x - (w - c.box.w.x) / 2,
        oy = g.top + c.box.y.x - this.scroll.x - (h - c.box.h.x) / 2;
      // the lines right of the card, the life bar under the life line; the quad's room on the right grows to hold them
      const lay = statsLayout(h, s, c.texts?.lines.length ?? 1),
        barW = c.texts ? this.statW - 2 * TEXT_PAD : 0,
        barX = w + lay.x;
      un.uStat.value.set(barX, barW, lay.hpBar, lay.stBar);
      un.uPools.value.set(...(c.d.stats?.bars ?? [-1, -1, 0]));
      un.uBarH.value = lay.bar;
      const qw = w + LEFT * s + Math.max(RIGHT * s, barX + barW + 24 * s),
        qh = h + 2 * PAD * s;
      un.uCard.value.set(w, h);
      un.uOrigin.value.set(LEFT * s, PAD * s);
      un.uSize.value.set(qw, qh);
      c.mesh.scale.set(qw, qh, 1);
      c.mesh.position.set(ox - LEFT * s + qw / 2, -(oy - PAD * s + qh / 2), 0);
      c.mesh.renderOrder = c === tipped ? 3 : c.d.now ? 2 : c.fade;
      if (c.texts) {
        // the same step aside, rise and fade at the list's ends as the card's own drawing (card.ts)
        const tx = ox + barX - TEXT_PAD + un.uShift.value,
          ty = oy - un.uLift.value;
        for (const [i, m] of c.texts.lines.entries()) {
          const y = ty + lay.lines[i],
            clip = this.shared.uClip.value;
          m.position.set(this.layer.snap(tx + m.scale.x / 2), -this.layer.snap(y), 0);
          m.material.uniforms.uAlpha.value =
            c.alpha * ramp(clip.x, clip.x + 16 * s, y) * (1 - ramp(clip.y - 16 * s, clip.y, y));
        }
      }
    }
    // the tip opens after the card, or after its own lines
    const m = tipped?.mesh.material.uniforms,
      past = m && (tipped.texts ? m.uStat.value.x + m.uStat.value.y : tipped.box.w.x);
    this.tip.show(
      tipped ? tipped.d.tip : null,
      g.left + (tipped?.box.x.x ?? 0) + (past ?? 0) + (12 + 8 * (m?.uTarget.value ?? 0)) * s,
      g.top + (tipped?.box.y.x ?? 0) - this.scroll.x + (tipped?.box.h.x ?? 0) / 2,
    );
    // the acting card breathes and a light sweeps it: the list moves for as long as it shows
    return (this.tip.frame(e) || !still) && this.cards.length + this.leaving.length > 0;
  }

  dispose() {
    this.layer.remove(this);
    for (const c of [...this.cards, ...this.leaving]) {
      c.mesh.material.dispose();
      this.dropTexts(c);
    }
    for (const tex of [...this.textures.values()].map((e) => e.tex)) tex.dispose();
    this.shared.uPaint.value.dispose();
    this.shared.uDigits.value.dispose();
    dropName();
    this.tip.dispose();
    this.layer.root.classList.remove('turn3d');
  }
}
