// The "Execute?" window drawn in 3D (localhost ?confirm=3d or the ?ui=3d preset; Fernando, Nov 16: the strike's
// confirmation in the look of the 3D battle, beside the character as today), a screen of the shared 3D layer
// (ui3d/layer.ts): a dark slate box like the banner's pill, the title, the notes (what it spends, the charge, a counter
// owed) and the two choices, the one in focus lit. The strike's numbers stay on the preview plate (bar3d/), which shows
// the target under the cursor and "+N targets".
//   Layout and input: the HTML window (hud-menus.ts renderConfirm) stays in place, unseen (style.css .hud.confirm3d),
//   at the drawn sizes: it is the layout, the place beside the character (BattleHud.place), and its real buttons take
//   the mouse and the taps. Keys and the gamepad stay with the turn (hero-turn.ts). What it says comes from the same
//   pure confirmParts as the HTML window.
import { Group } from 'three';
import { LINE, NONE, Part, PILL, type Quad, type Rgba, WHITE } from '../hints3d/hints3d.ts';
import type { HudView } from '../hud.ts';
import { confirmParts } from '../hud-menus.ts';
import type { Ui3dLayer, Ui3dScreen } from '../ui3d/layer.ts';
import { textMesh } from '../ui3d/text.ts';

const SOFT = '#c9ccd2'; // the notes
const GOLD = '#f2c14e'; // the focus marker, as the HTML window's ▶
const BAND: Rgba = [0.95, 0.82, 0.45, 0.22]; // the choice in focus
const BAND_EDGE: Rgba = [0.95, 0.76, 0.31, 0.9];
const EDGE: Rgba = [0.82, 0.86, 0.92, 0.35];
// text sizes in px of the reference, the same as style.css .hud.confirm3d .confirm (never under 16 px on the page)
const SIZE = { head: 26, note: 18, choice: 24 };

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class Confirm3d implements Ui3dScreen {
  readonly flat = new Group();
  private readonly part = new Part();
  private at = { x: Number.NaN, y: Number.NaN };
  private last?: { v: HudView; open: boolean };

  // `host`: the HUD's "Execute?" window; hidden by CSS (the sandbox's `hide`), the layer hides the drawing with it
  constructor(
    private readonly layer: Ui3dLayer,
    readonly host: HTMLElement,
  ) {
    this.flat.add(this.part.group);
    layer.root.classList.add('confirm3d');
    layer.add(this);
  }

  // Called by the HUD after it drew the HTML window; `open`: a hero's turn with nothing playing
  update(v: HudView, open: boolean) {
    this.last = { v, open };
    const s = v.screen,
      part = this.part;
    part.want = open && s.k === 'confirm' && !this.host.hidden ? 1 : 0;
    this.layer.wake();
    if (!part.want || s.k !== 'confirm') return;
    const parts = confirmParts(v.battle, s);
    // the HTML window's pieces, from its own top left: the head, each note, each choice
    const box = this.host.getBoundingClientRect();
    const rect = (e: Element | null): Rect => {
      const r = e?.getBoundingClientRect();
      return r ? { x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height } : { x: 0, y: 0, w: 0, h: 0 };
    };
    const head = rect(this.host.querySelector('.panel-head'));
    const notes = [...this.host.querySelectorAll('.unit-note')].map(rect);
    const choices = [...this.host.querySelectorAll('.yes-no .item')].map(rect);
    const key = JSON.stringify([parts, box.width, box.height, head, notes, choices, this.layer.dpr]);
    if (key === part.key) return;
    part.clear();
    part.key = key;
    const s1 = this.layer.s;
    part.box(0, 0, box.width, box.height, 18 * s1, PILL, EDGE);
    this.text(parts.title, SIZE.head, WHITE, head, 14 * s1);
    part.box(10 * s1, head.y + head.h, box.width - 20 * s1, Math.max(1, s1), 0, LINE, NONE);
    parts.notes.forEach((n, i) => notes[i] && this.text(n, SIZE.note, SOFT, notes[i], 0, notes[i].w));
    parts.choices.forEach((c, i) => {
      const r = choices[i];
      if (!r) return;
      if (c.focus) {
        part.box(r.x, r.y, r.w, r.h, 8 * s1, BAND, BAND_EDGE);
        this.text('▶', SIZE.choice * 0.7, GOLD, r, 10 * s1);
      }
      this.text(c.label, SIZE.choice, WHITE, r, 0, undefined, true);
    });
    // over the combat bar and the hints, which share the layer
    for (const m of part.group.children) m.renderOrder += 20;
  }

  // a text in `r` (relative to the window), from its left plus `left`, or centred; wrapped at `width`
  private text(str: string, size: number, color: string, r: Rect, left: number, width?: number, centre = false) {
    const px = Math.max(16, size * this.layer.s);
    const m = textMesh(
      str,
      { size: px, color, font: this.layer.theme.font, width, line: px * 1.3 },
      this.layer.dpr,
    ) as Quad;
    const x = centre ? r.x + r.w / 2 : r.x + left + m.scale.x / 2;
    this.part.text(m, x, r.y + r.h / 2);
  }

  // the page's size or scale changed: the HTML window took its new sizes, measure and draw again
  resize() {
    this.part.key = '';
    if (this.last) this.update(this.last.v, this.last.open);
  }

  // follows the window, which BattleHud.place moves beside the character every frame
  frame(dt: number) {
    const { layer, part, host } = this;
    const x = layer.snap(host.offsetLeft),
      y = layer.snap(host.offsetTop);
    const moved = x !== this.at.x || y !== this.at.y;
    this.at = { x, y };
    part.group.position.set(x, -y, 0);
    const fading = part.fade(layer.still ? 10 : dt);
    // reduced motion: no fade, but the window still follows the camera
    return (fading && !layer.still) || (moved && part.alpha > 0);
  }

  dispose() {
    this.layer.remove(this);
    this.part.clear();
    this.layer.root.classList.remove('confirm3d');
  }
}
