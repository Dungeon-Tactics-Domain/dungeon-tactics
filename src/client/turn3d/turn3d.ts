// The turn list drawn in 3D (localhost ?turn3d; Fernando's request, Nov 16: the combat timeline of FFT The Ivalice
// Chronicles rebuilt in Three.js), a screen of the shared 3D layer (ui3d/layer.ts). One quad per row: a framed card with
// the unit's face on its side's colour, the life bar under it and the order number beside it, 1 at the bottom and
// counting up, like the reference (card.ts holds the shader).
//   Layout and input: the HTML list (hud.ts renderQueue) stays in place, unseen, at the cards' sizes (style.css,
//   .hud.turn3d): it is the layout, the scroll and the hover. The HUD measures it and hands the boxes over (`place`,
//   `hover`); nothing here reads the DOM. Each card springs to its row's box.
//   Sizes were measured at 1280x720, so 1 design px = --t3 CSS px; the list sits on the reference's place (layout.ts).
import { Group, Mesh, type ShaderMaterial, Texture, TextureLoader, type Vector2 } from 'three';
import type { Battle } from '../../shared/battle/battle.ts';
import type { UnitState } from '../../shared/battle/types.ts';
import { UNIT_DEFS } from '../../shared/battle/units.ts';
import { battleFace, type Expression, frameOf } from '../battle-face.ts';
import type { Forecast } from '../forecast.ts';
import { ATLAS_COLUMNS, atlasCell, el } from '../icons.ts';
import { modelOf } from '../markers.ts';
import type { Ui3dLayer, Ui3dScreen } from '../ui3d/layer.ts';
import { place, REGIONS } from '../ui3d/layout.ts';
import { QUAD } from '../ui3d/panel.ts';
import { ease, land, type Spring, spring, stepSpring } from '../ui3d/spring.ts';
import { cardMaterial, hex, LEFT, PAD, RIGHT, sharedUniforms } from './card.ts';
import { matchRows, type Queue, type QueueCard, queueCards } from './queue-view.ts';

const INNER = 40.2 / 43; // the picture's width over its height inside the frame: how a face is cropped
const ATLAS_CELL = 32; // px of an ability icon in /ui/fft/atlas-32.png
// stiffness and damping of the cards: a ratio of 0.69, so a card overshoots its slot a little and settles in about a
// third of a second
const K = 170;
const C = 18;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
// The HTML list as the HUD measured it (hud-skin.ts queueBoxes): each row's box in the list's scroll space, the list's
// own place in the HUD, the height of its pinned title, where it is scrolled and how much list there is past its box
export interface QueueBoxes {
  rows: Box[];
  left: number;
  top: number;
  height: number;
  head: number;
  scroll: number;
  more: number;
}

interface Card {
  d: QueueCard;
  mesh: Mesh<typeof QUAD, ShaderMaterial>;
  box: Record<keyof Box, Spring>; // in the list's scroll space, px
  row: number; // index of the row it follows; -1 once it is leaving
  alpha: number;
  fade: number; // 1 showing, 0 leaving
  crop: (frame: number) => void; // moves the face to that frame of its sheet
  face: ReturnType<typeof battleFace>;
}
const SIDES = ['x', 'y', 'w', 'h'] as const;

export class Turn3d implements Ui3dScreen {
  readonly flat = new Group();
  // name and life of the card under the mouse: the 3D rows carry no text
  private readonly tip = el('div', { class: 'panel turn3d-tip', 'aria-hidden': 'true', hidden: true });
  private readonly loader = new TextureLoader();
  // one load per image; `waiting` holds what to run when it arrives (null once it has)
  private readonly textures = new Map<string, { tex: Texture; waiting: ((img: HTMLImageElement) => void)[] | null }>();
  private readonly shared = sharedUniforms();
  private cards: Card[] = [];
  private leaving: Card[] = [];
  private turn = '';
  private drawn = false; // the first list is placed, not animated: nothing flies in when the battle opens
  private hovered = -1;
  private readonly scroll = spring(0);
  private geo: QueueBoxes = { rows: [], left: 0, top: 0, height: 0, head: 0, scroll: 0, more: 0 };
  private expression: (u: UnitState) => Expression = () => 'neutral';

  // `host`: the HUD's own list; hidden by CSS (the sandbox's `hide`), the layer hides the cards with it. `headless`: the
  // 3D bar is on, and its sheet stands for the list's head (queueCards; style.css hides that HTML row)
  constructor(
    private readonly layer: Ui3dLayer,
    readonly host: HTMLElement,
    private readonly headless = false,
  ) {
    layer.root.classList.add('turn3d');
    layer.root.append(this.tip);
    this.shared.uIconGrid.value.set(ATLAS_COLUMNS, 1);
    this.shared.uIcons.value = this.texture('/ui/fft/atlas-32.png', (img) =>
      this.shared.uIconGrid.value.set(img.width / ATLAS_CELL, img.height / ATLAS_CELL),
    );
    layer.add(this);
  }

  // The list's scale: the cards were measured at 720 px tall, 1.5 of them to a reference px. The HTML rows take it as
  // --t3 and the list its place on the reference (layout.ts `turn`) as --turn-x, --turn-y and --turn-b (style.css)
  resize() {
    const { layer } = this,
      s = layer.s * 1.5,
      at = place(REGIONS.turn, layer.stage),
      css = layer.root.style;
    this.shared.uS.value = s;
    this.shared.uH.value = layer.h;
    css.setProperty('--t3', String(s));
    css.setProperty('--turn-x', `${at.x}px`);
    css.setProperty('--turn-y', `${at.y}px`);
    css.setProperty('--turn-b', `${layer.h - at.y - at.h}px`);
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

  // A redrawn list (BattleHud.render): the same rows as the HTML, with the strike preview's targets. Each row keeps its
  // card (matchRows), new rows get one and the rest leave: the one that just played slides out, the others fade
  // `sheet`: the unit the HUD's acting sheet shows
  update(
    b: Battle,
    q: Queue | null,
    fs: Forecast[],
    face: (u: UnitState) => Expression,
    geo: QueueBoxes,
    sheet?: string,
  ) {
    this.expression = face;
    const next = queueCards(b, q, fs, this.headless ? sheet : undefined);
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
    this.place(geo, !this.drawn);
    this.drawn = true;
  }

  // The list's boxes changed (a redraw, a scroll, a resize): each card heads for its row's. `first` puts them there at
  // once, as reduced motion does
  place(geo: QueueBoxes, first = false) {
    this.geo = geo;
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
      const qw = w + (LEFT + RIGHT) * s,
        qh = h + 2 * PAD * s;
      un.uCard.value.set(w, h);
      un.uOrigin.value.set(LEFT * s, PAD * s);
      un.uSize.value.set(qw, qh);
      c.mesh.scale.set(qw, qh, 1);
      c.mesh.position.set(ox - LEFT * s + qw / 2, -(oy - PAD * s + qh / 2), 0);
      c.mesh.renderOrder = c === tipped ? 3 : c.d.now ? 2 : c.fade;
    }
    this.tip.hidden = !tipped;
    if (tipped) {
      this.tip.textContent = tipped.d.tip;
      const m = tipped.mesh.material.uniforms;
      this.tip.style.left = `${Math.round(g.left + tipped.box.x.x + tipped.box.w.x + (12 + 8 * m.uTarget.value) * s)}px`;
      this.tip.style.top = `${Math.round(g.top + tipped.box.y.x - this.scroll.x + tipped.box.h.x / 2)}px`;
    }
    // the acting card breathes and a light sweeps it: the list moves for as long as it shows
    return !still && this.cards.length + this.leaving.length > 0;
  }

  dispose() {
    this.layer.remove(this);
    for (const c of [...this.cards, ...this.leaving]) c.mesh.material.dispose();
    for (const tex of [...this.textures.values()].map((e) => e.tex)) tex.dispose();
    this.shared.uPaint.value.dispose();
    this.shared.uDigits.value.dispose();
    this.tip.remove();
    this.layer.root.classList.remove('turn3d');
  }
}
