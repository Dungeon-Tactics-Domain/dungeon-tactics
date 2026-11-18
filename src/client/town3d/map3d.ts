// The expedition map drawn in 3D (?map=3d, the default; Fernando, Nov 17), a screen of the town's 3D layer, in the
// look of the town's 3D windows (town3d.ts: the town darkened, parchment, dark plaques down the left edge, the glove)
// and after FFT: The Ivalice Chronicles' world map (labs refs/fft-ivalice/05-mapa): the whole descent on one sheet,
// the places as seals joined by their ways, the picked place's text beside it.
//   State and input: the map's own window (game/expedition-map.ts) stays as it is, unseen, its places and commands
//   moved under the drawn ones by map-layout.ts: arrows, Enter, the pad, a tap and a screen reader work as before.
//   This screen takes the open map (setMap3d) with what to draw as plain data, and gives it back: a page under the
//   town windows' smallest scale, a lost context or ?map=html keep the HTML map.
import { Group, type Mesh, type ShaderMaterial } from 'three';
import { type Colors, colors, Hand, label, lift, put, rgba } from '../flow3d/draw.ts';
import { type MapView, setMap3d } from '../game/expedition-map.ts';
import { Part } from '../hints3d/hints3d.ts';
import { t } from '../i18n.ts';
import type { Icon } from '../menu3d/column.ts';
import type { Ui3dLayer, Ui3dScreen } from '../ui3d/layer.ts';
import { type Box, SCREEN } from '../ui3d/layout.ts';
import { paintTexture, paperMaterial, quad } from '../ui3d/panel.ts';
import { ease } from '../ui3d/spring.ts';
import { drawChart, Pen, type Tones, tint } from './map-draw.ts';
import { commandText, M, type MapLayout, mapLayout } from './map-layout.ts';
import { T } from './town-layout.ts';

const SEATS = ['.map-scroll', '.map-party', '.map-info', '.map-commands']; // the window's parts this screen places

export class Map3d implements Ui3dScreen {
  readonly flat = new Group();
  readonly deep = new Group();
  private readonly color: Colors;
  private readonly tone: Tones;
  private readonly pen: Pen;
  private readonly paint = paintTexture();
  private readonly hand = new Hand(this.deep);
  // back to front: the darkened town and its lines, the plaques, the one in focus, what lies on the sheets
  private readonly back = new Part();
  private readonly cmd = new Part();
  private readonly focus = new Part();
  private readonly ways = new Part();
  private readonly halo = new Part(); // around the picked place
  private readonly marks = new Part();
  private readonly party = new Part();
  private readonly info = new Part();
  private readonly help = new Part();
  private sheets: Mesh[] = []; // the parchment, and the faces on it
  private icons: { icon: Icon; size: number }[] = [];
  private readonly seen = new MutationObserver(() => this.commands());
  private view?: MapView;
  private taken = false; // drawn in 3D
  private L?: MapLayout;
  private open = 0;
  private pointer = '';

  constructor(private readonly layer: Ui3dLayer) {
    const css = getComputedStyle(layer.root);
    const town = (name: string) => css.getPropertyValue(`--ui3d-town-${name}`).trim();
    this.color = colors(layer);
    this.pen = new Pen(layer);
    this.tone = {
      gold: town('gold'),
      flag: town('stat'),
      track: town('track'),
      hp: town('hp'),
      mp: town('mp'),
      up: town('up'),
    };
    const parts = [this.back, this.cmd, this.focus, this.ways, this.halo, this.marks, this.party, this.info, this.help];
    this.flat.add(...parts.map((p) => p.group));
    layer.add(this, 'map');
    setMap3d((v) => this.take(v));
  }

  private get rows() {
    return [...(this.view?.overlay.querySelectorAll<HTMLButtonElement>('.map-commands > button') ?? [])];
  }
  // the mouse moves the cursor as the keys do; a button rebuilt under a resting pointer leaves it to the keys
  private readonly over = (e: PointerEvent) => {
    const b = e.target instanceof Element ? e.target.closest<HTMLElement>('.map-place, .map-commands > button') : null;
    const here = `${e.clientX},${e.clientY}`;
    if (this.taken && b && here !== this.pointer) b.focus({ preventScroll: true });
    this.pointer = here;
  };
  private readonly wake = () => this.layer.wake();

  // a map opened, or was already open when the layer came
  private take(v: MapView) {
    this.release();
    this.view = v;
    v.changed = () => this.picked();
    v.overlay.addEventListener('focusin', this.wake);
    v.overlay.addEventListener('pointerover', this.over);
    this.seen.observe(v.overlay.querySelector('.map-commands')!, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    });
    this.open = 0;
    this.resize();
  }
  private release() {
    this.drop();
    this.seen.disconnect();
    this.view?.overlay.removeEventListener('focusin', this.wake);
    this.view?.overlay.removeEventListener('pointerover', this.over);
    if (this.view) this.view.changed = undefined;
    this.view = undefined;
  }

  // the HTML map again: its own look and places
  private drop() {
    if (!this.taken) return;
    this.taken = false;
    const { overlay } = this.view!;
    overlay.classList.remove('map3d', 'spot-walk');
    for (const sel of [...SEATS, '.dialog']) overlay.querySelector(sel)?.removeAttribute('style');
    for (const el of overlay.querySelectorAll<HTMLElement>('[data-html]')) {
      el.setAttribute('style', el.dataset.html ?? '');
      delete el.dataset.html;
    }
    this.L = undefined;
    this.clear();
    this.hand.point(this.layer, null, 0, 0, 0, 0, true);
    this.layer.wake();
  }
  private clear() {
    for (const p of [
      this.back,
      this.cmd,
      this.focus,
      this.ways,
      this.halo,
      this.marks,
      this.party,
      this.info,
      this.help,
    ])
      p.clear();
    for (const m of this.sheets) {
      m.removeFromParent();
      (m.material as ShaderMaterial).dispose();
    }
    for (const { icon } of this.icons) icon.dispose();
    this.sheets = [];
    this.icons = [];
  }

  resize() {
    const { view } = this;
    if (!view?.overlay.isConnected) return;
    this.taken = true;
    view.overlay.classList.add('map3d', 'spot-walk'); // the arrows go to what is straight that way (dialog.ts)
    this.build();
  }

  private build() {
    const { layer, view, color: c, tone, pen } = this;
    if (!view) return;
    const s = layer.stage.s,
      { theme } = layer,
      { chart: S, party: P, info: I } = M;
    const L = (this.L = mapLayout(
      view.chart,
      view.places.map((p) => p.kind),
      view.heroes.length,
      this.rows.length,
    ));
    this.clear();

    // the window's own parts under the drawn ones
    const px = (v: number) => `${v}px`;
    const seat = (sel: string, b: Box) => {
      const at = this.pen.box(b);
      Object.assign(view.overlay.querySelector<HTMLElement>(sel)!.style, {
        left: px(at.x),
        top: px(at.y),
        width: px(at.w),
        height: px(at.h),
      });
    };
    seat('.map-scroll', L.field);
    seat('.map-party', P);
    seat('.map-info', I);
    const cmds = L.commands;
    if (cmds.length) seat('.map-commands', { ...cmds[0], h: cmds.at(-1)!.y + cmds[0].h - cmds[0].y });
    const vars = view.overlay.querySelector<HTMLElement>('.dialog')!.style;
    vars.setProperty('--map-step', px(L.step * s));
    vars.setProperty('--m3-place', px(Math.max(44, M.place * s))); // never under the game's 44 px tap
    vars.setProperty('--m3-boss', px(Math.max(44, M.boss * s)));
    vars.setProperty('--m3-cmd', px(T.plaque.h * s));
    vars.setProperty('--m3-gap', px(T.plaque.gap * s));
    // each place's button under its seal, on the grid's spot; the HTML chart's own styles are kept for drop()
    const spots: [HTMLElement | null, string][] = [
      [view.overlay.querySelector<HTMLElement>('.map-chart'), 'height:100%'],
      ...L.places.map((p, i): [HTMLElement, string] => [
        view.places[i].el,
        `left:${px((p.x - L.field.x) * s)};top:${px((p.y - L.field.y) * s)}`,
      ]),
    ];
    for (const [el, css] of spots) {
      if (!el) continue;
      el.dataset.html ??= el.getAttribute('style') ?? '';
      el.setAttribute('style', css);
    }

    // around the sheets, as every town window: the town darkened, where the party is, the gold found, help and keys
    const { back } = this;
    back.box(-8, -8, layer.w + 16, layer.h + 16, 0, rgba(c.veil, 0.86));
    this.pen.say(back, view.title.join('  ›  '), T.title.size, c.text, T.title.x, T.title.y);
    this.pen.fill(back, T.rule, rgba(c.line));
    this.pen.say(back, String(view.gold[1]), 34, c.title, T.gold.x, T.gold.y, 'right');
    this.pen.say(back, view.gold[0], 22, c.soft, T.gold.x - 150, T.gold.y, 'right');
    this.pen.fill(back, T.help, rgba(c.band, 0.8));
    const keys = layer.keysLine([
      ['move', t('mudar de lugar', 'change place')],
      ['confirm', t('escolher', 'choose')],
    ]);
    this.pen.say(back, keys, 24, c.soft, T.hints.x, T.hints.y, 'right');
    lift(back, 28);

    const sheet = (b: Box, head = 0) => {
      const at = this.pen.box(b),
        pad = 44 * s;
      const mat = paperMaterial(this.paint, theme, { w: at.w, h: at.h, pad, unit: s, head, seed: b.x });
      this.sheets.push(quad(mat, at.x - pad, at.y - pad, at.w + 2 * pad, at.h + 2 * pad, 62));
    };
    sheet(S);
    sheet(P, M.head);
    sheet(I, M.head);

    this.icons = drawChart(pen, L, view.places, c, tone, this.ways, this.marks, this.deep);

    // the party: face, name and class, the life and the mana carried
    const { party } = this;
    this.pen.say(party, t('Grupo', 'Party'), 26, theme.inkSoft, P.x + 28, P.y + M.head / 2);
    view.heroes.forEach((h, i) => {
      const b = L.heroes[i],
        f = M.hero.face,
        x = b.x + f + 16,
        w = b.w - f - 16;
      if (h.def) this.sheets.push(pen.face(h.def, { x: b.x, y: b.y + (b.h - f) / 2, w: f, h: f }));
      this.pen.say(party, h.name, 26, theme.ink, x, b.y + 18, 'left', w - 110);
      this.pen.say(party, h.job, 20, theme.inkSoft, x + w, b.y + 18, 'right', 104);
      const gauge = (y: number, name: string, v: number, max: number, hex: string) => {
        this.pen.say(party, name, 20, theme.inkSoft, x, y);
        this.pen.say(party, `${v}/${max}`, 22, theme.ink, x + w, y, 'right');
        this.pen.fill(party, { x, y: y + 15, w, h: 10 }, rgba(tone.track), 3);
        if (v > 0) this.pen.fill(party, { x, y: y + 15, w: w * Math.min(1, v / max), h: 10 }, rgba(hex), 3);
      };
      gauge(b.y + 50, t('Vida', 'HP'), h.hp, h.max, tone.hp);
      if (h.manaMax) gauge(b.y + 90, 'MP', h.mana ?? h.manaMax, h.manaMax, tone.mp);
    });
    lift(party, 33);

    this.focus.box(0, 0, T.plaque.w * s, T.plaque.h * s, 0, rgba(tone.gold, 0.94));
    lift(this.focus, 30.5);
    for (const m of this.sheets) this.flat.add(m);
    this.picked();
    this.commands();
    this.hand.reset();
    layer.wake();
  }

  // the picked place: the dark ring around its seal and its box (name and floor on the head, then each fact)
  private picked() {
    const { L, view, layer, info, halo } = this;
    if (!L || !view) return;
    const s = layer.stage.s,
      { theme } = layer,
      { info: I } = M,
      f = view.picked,
      p = L.places[f.node];
    halo.clear();
    const d = p.size + 16;
    this.pen.fill(
      halo,
      { x: p.x - d / 2, y: p.y - d / 2, w: d, h: d },
      tint(theme.edge, 0.9),
      p.kind === 'chest' ? 14 : d,
    );
    lift(halo, 34.5);
    info.clear();
    this.pen.say(info, f.name, 30, theme.ink, I.x + 28, I.y + M.head / 2, 'left', I.w - 56 - 200);
    this.pen.say(info, f.floor, 22, theme.inkSoft, I.x + I.w - 28, I.y + M.head / 2, 'right');
    const at = this.pen.box({ x: I.x + 28, y: I.y + M.head + 34, w: I.w - 56, h: 0 });
    let y = at.y;
    for (const [name, value] of f.facts) {
      put(info, label(layer, s, name, 22, theme.inkSoft), at.x, y);
      const m = label(layer, s, value, 26, theme.ink, at.w);
      info.text(m, at.x + m.scale.x / 2, y + 22 * s + m.scale.y / 2);
      y += 22 * s + m.scale.y + 30 * s;
    }
    lift(info, 33);
    layer.wake();
  }

  // the commands' plaques, from the window's own rows: Travel changes with the picked place, Back to town when armed
  private commands() {
    const { L, cmd, color: c } = this;
    if (!L) return;
    cmd.clear();
    this.rows.forEach((b, i) => {
      const at = L.commands[i];
      if (!at) return;
      const { plaque, note } = this.words(b),
        mid = at.y + at.h / 2,
        x = at.x + at.w / 2 + 20;
      this.pen.fill(cmd, at, rgba(c.plate, b.disabled ? 0.55 : 0.94));
      this.pen.say(cmd, plaque, 30, b.disabled ? c.soft : c.text, x, note ? mid - 16 : mid, 'centre', at.w - 110);
      if (note) this.pen.say(cmd, note, 20, c.soft, x, mid + 22, 'centre', at.w - 110);
    });
    lift(cmd, 30);
    this.layer.wake();
  }
  // a row's name is its bare text (the 2nd tap rewrites it), the reason it is off its small type
  private words(b: HTMLButtonElement) {
    const name = [...b.childNodes]
      .flatMap((n) => (n.nodeType === Node.TEXT_NODE ? [n.textContent ?? ''] : []))
      .join('');
    const note = b.querySelector('small')?.textContent ?? '';
    return { ...commandText(name, note, b.dataset.armed !== undefined), note };
  }

  frame(dt: number, time: number) {
    // the map closed (a room, the town, a chest opened): nothing left to show
    if (this.view && !this.view.overlay.isConnected) this.release();
    const { L, view, layer, focus, help } = this;
    if (!L || !view) return false;
    const s = layer.stage.s,
      still = layer.still || dt === 0;
    const o = (this.open = still ? 1 : ease(this.open, 1, dt, 8));
    const set = (p: Part, a: number) => {
      p.want = a;
      p.fade(10);
    };
    for (const p of [this.back, this.cmd, this.ways, this.halo, this.marks, this.party, this.info]) set(p, o);
    for (const m of this.sheets) (m.material as ShaderMaterial).uniforms.uAlpha.value = o;
    for (const { icon, size } of this.icons) icon.group.scale.setScalar(size * o);
    // the cursor: the gold plaque under the command in focus, the glove inside it or at the left of the place
    const active = document.activeElement,
      rows = this.rows,
      row = rows.indexOf(active as HTMLButtonElement),
      node = view.places.findIndex((p) => p.el === active),
      size = T.hand * s;
    const plate = row >= 0 && L.commands[row] ? this.pen.box(L.commands[row]) : null;
    set(focus, plate ? o : 0);
    if (plate) focus.group.position.set(plate.x, -plate.y, 0);
    const p = L.places[node];
    const at = plate
      ? { ...plate, x: plate.x + 58 * s + size / 2 }
      : p && this.pen.box({ x: p.x - p.size / 2 - 4, y: p.y - p.size / 2, w: p.size, h: p.size });
    this.hand.point(layer, at, o, size, dt, time, still);
    // the help band: what the command in focus does, else the picked place and its way
    const said =
      (row >= 0 && this.words(rows[row]).help) || `${view.picked.name}: ${view.picked.facts.at(-1)?.[1] ?? ''}`;
    if (said !== help.key) {
      help.clear();
      this.pen.say(help, said, 28, this.color.text, SCREEN.w / 2, T.help.y + T.help.h / 2, 'centre', 1700);
      lift(help, 29);
      help.key = said;
    }
    set(help, o);
    return !layer.still; // the glove sways for as long as the map shows
  }

  dispose() {
    this.release(); // the layer went (a lost context): the HTML map is still there, seen again
    setMap3d();
    this.layer.remove(this);
    this.hand.dispose();
    this.paint.dispose();
    this.pen.dispose();
  }
}
