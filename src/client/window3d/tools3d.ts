// The buttons that stay on the screen, drawn in 3D (Fernando, Nov 18 night: no ☰ menu and no blue anywhere; the plates
// of the end of battle, dark with a gold edge): the gear that opens Options, Back and "↶ Undo" to its left, and the
// camera pair ↺ ↻ (tools-layout.ts says where). A screen of the shared 3D layer (ui3d/layer.ts), in the battle and in
// the town.
//   Input: the HTML buttons (hud-tools.ts) stay under the drawing, unseen (style.css .hud.tools3d .tools), each seated
//   on its drawn plate: they take the mouse, the taps and the screen reader. Which show is their `hidden` (the screen
//   buttons switch, Back's screen); a button with nothing to do now (Undo with no step) is faded. Nothing here decides.
import { Group } from 'three';
import { type Colors, colors, rgba } from '../flow3d/draw.ts';
import { NONE, Part, type Quad, type Rgba } from '../hints3d/hints3d.ts';
import { KEYS } from '../hud-pieces.ts';
import { t } from '../i18n.ts';
import type { Ui3dLayer, Ui3dScreen } from '../ui3d/layer.ts';
import type { Box } from '../ui3d/layout.ts';
import { textMesh, textWidth } from '../ui3d/text.ts';
import { type Tool, toolShown, toolsLayout } from './tools-layout.ts';

const OFF = 0.45; // a button with nothing to do now
const SIZE = 28; // the text, px of the reference; never under 16 on the page
// Undo carries its word beside the arrow (Fernando, Nov 18: ↶ and ↩ looked the same); the rest are a glyph alone
const WORD: Record<Tool, () => string> = {
  back: () => '↩',
  edit: () => '✎',
  undo: () => t('↶ Desfazer', '↶ Undo'),
  left: () => '↺',
  right: () => '↻',
  top: () => '⊞',
  gear: () => '',
};
const CLASS: [Tool, string][] = [
  ['back', '.back'],
  ['undo', '.undo'],
  ['left', '.turn-left'],
  ['right', '.turn-right'],
  ['top', '.top-view'],
  ['edit', '.edit-map'],
  ['gear', '.gear'],
];
// the buttons after the turn list
const pair = (k: Tool) => k === 'left' || k === 'right' || k === 'top' || k === 'edit';
const px = (v: number) => `${v}px`;
const faded = (c: Rgba, off: boolean): Rgba => [c[0], c[1], c[2], off ? c[3] * OFF : c[3]];

export class Tools3d implements Ui3dScreen {
  readonly flat = new Group();
  private readonly part = new Part();
  private readonly color: Colors;
  private readonly els: [Tool, HTMLElement][]; // what the host has, in the row's order (the town has no Back or Undo)
  private readonly watch = new MutationObserver(() => this.draw());
  private readonly ac = new AbortController();

  // `host`: the .tools of the HUD; `at`: the camera pair after the turn list (the battle) or beside the gear (the town)
  constructor(
    private readonly layer: Ui3dLayer,
    readonly host: HTMLElement,
    private readonly at: 'list' | 'row' = 'list',
  ) {
    this.color = colors(layer);
    this.els = CLASS.flatMap(([k, cls]) => {
      const e = host.querySelector<HTMLElement>(cls);
      return e ? [[k, e] as [Tool, HTMLElement]] : [];
    });
    this.flat.add(this.part.group);
    this.part.want = 1;
    layer.root.classList.add('tools3d');
    // Back showing, Undo fading and the switch turning are attributes of the HTML buttons
    this.watch.observe(host, { subtree: true, attributes: true, attributeFilter: ['hidden', 'aria-disabled'] });
    // a button Tab reached is lit
    for (const ev of ['focusin', 'focusout'])
      host.addEventListener(ev, () => queueMicrotask(() => this.draw()), { signal: this.ac.signal });
    layer.add(this, 'tools');
  }

  resize() {
    this.part.key = '';
    this.draw();
  }

  private label(str: string, color: string) {
    const { layer } = this;
    return textMesh(str, { size: Math.max(16, SIZE * layer.s), color, font: layer.theme.font }, layer.dpr) as Quad;
  }

  // Rebuilds when a button shows, hides, fades or takes the focus, or the page changed
  private draw() {
    const { layer, part, color: c } = this,
      s = layer.s;
    layer.wake();
    const shown = this.els.filter(([k, e]) => toolShown(k, KEYS, !!e.hidden, !e.hidden)),
      row = shown.filter(([k]) => !pair(k)),
      turn = shown.filter(([k]) => pair(k)),
      size = Math.max(16, SIZE * s),
      lay = toolsLayout({
        pageW: layer.w,
        stage: layer.stage,
        inset: layer.inset,
        row: row.map(([k]) => (k === 'gear' ? 0 : textWidth(WORD[k](), size, layer.theme.font) + 24)),
        pair: turn.length ? this.at : 'none',
        turns: turn.length,
      }),
      placed: [Tool, HTMLElement, Box][] = [
        ...turn.map(([k, e], i): [Tool, HTMLElement, Box] => [k, e, lay.pair[i]]),
        ...row.map(([k, e], i): [Tool, HTMLElement, Box] => [k, e, lay.row[i]]),
      ];
    // the real buttons under the drawn ones, whatever the style sheet says
    Object.assign(this.host.style, { left: '0', top: '0', right: 'auto', width: '0', height: '0' });
    for (const [, e, r] of placed)
      Object.assign(e.style, { position: 'absolute', left: px(r.x), top: px(r.y), width: px(r.w), height: px(r.h) });
    const tabbed = placed.find(([, e]) => e.matches(':focus-visible'))?.[1];
    const key = JSON.stringify([
      placed.map(([k, e, r]) => [k, r, e.getAttribute('aria-disabled'), e === tabbed]),
      layer.dpr,
      s,
    ]);
    if (key === part.key) return;
    part.clear();
    part.key = key;
    for (const [k, e, r] of placed) {
      const off = e.getAttribute('aria-disabled') === 'true',
        lit = e === tabbed,
        mid = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
      // the end of battle's plate: dark with a gold edge; lit as Options' commands (flow3d/options3d.ts)
      part.box(
        r.x,
        r.y,
        r.w,
        r.h,
        6 * s,
        faded(rgba(lit ? c.line : c.plate, 0.95), off),
        faded(rgba(lit ? c.title : c.line, 0.8), off),
      );
      if (k !== 'gear') {
        part.text(this.label(WORD[k](), off ? c.soft : lit ? c.title : c.text), mid.x, mid.y);
        continue;
      }
      this.gear(mid, r.h, rgba(lit ? c.plate : c.title), rgba(lit ? c.line : c.plate));
    }
  }

  // the gear: 4 bars turned 45° apart make its 8 teeth, a disc over them and the hole in its middle
  private gear(mid: { x: number; y: number }, h: number, ink: Rgba, hole: Rgba) {
    const { part } = this,
      w = Math.round(h * 0.6),
      bar = Math.round(h * 0.14),
      disc = Math.round(h * 0.42),
      eye = Math.round(h * 0.18);
    for (let k = 0; k < 4; k++) {
      part.box(mid.x - w / 2, mid.y - bar / 2, w, bar, 1, ink, NONE);
      part.group.children[part.group.children.length - 1].rotation.z = (k * Math.PI) / 4;
    }
    part.box(mid.x - disc / 2, mid.y - disc / 2, disc, disc, disc / 2, ink, NONE);
    part.box(mid.x - eye / 2, mid.y - eye / 2, eye, eye, eye / 2, hole, NONE);
  }

  frame(dt: number) {
    return this.part.fade(this.layer.still ? 10 : dt);
  }

  dispose() {
    this.layer.remove(this);
    this.watch.disconnect();
    this.ac.abort();
    this.part.clear();
    this.host.removeAttribute('style');
    for (const [, e] of this.els) e.removeAttribute('style');
    this.layer.root.classList.remove('tools3d');
  }
}
