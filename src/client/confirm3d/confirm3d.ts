// The "Execute?" window drawn in 3D (localhost ?confirm=3d or the ?ui=3d preset; Fernando, Nov 16: the strike's
// confirmation in the look of the 3D battle, beside the character as today), a screen of the shared 3D layer
// (ui3d/layer.ts): a dark slate box like the banner's pill, the title, the notes (what it spends, the charge, a counter
// owed) and the two choices, the one in focus lit. The strike's numbers stay on the preview plate (bar3d/), which shows
// the target under the cursor and "+N targets".
//   Layout and input: where each piece sits is confirm-layout.ts' (pure). The HTML window (hud-menus.ts
//   renderConfirm) stays under the drawing, unseen (style.css .hud.confirm3d) and seated from the same numbers: its
//   real buttons take the mouse and the taps, and BattleHud.place moves it beside the character, which the drawing
//   follows. Keys and the gamepad stay with the turn (hero-turn.ts). What it says comes from the same pure
//   confirmParts as the HTML window.
import { Group } from 'three';
import { LINE, NONE, Part, PILL, type Quad, type Rgba, WHITE } from '../hints3d/hints3d.ts';
import type { HudView } from '../hud.ts';
import { confirmParts } from '../hud-menus.ts';
import type { Ui3dLayer, Ui3dScreen } from '../ui3d/layer.ts';
import type { Box } from '../ui3d/layout.ts';
import { lineCount, textMesh } from '../ui3d/text.ts';
import { type ConfirmLayout, confirmLayout, SIZE } from './confirm-layout.ts';

const SOFT = '#c9ccd2'; // the notes
const GOLD = '#f2c14e'; // the focus marker, as the HTML window's ▶
const BAND: Rgba = [0.95, 0.82, 0.45, 0.22]; // the choice in focus
const BAND_EDGE: Rgba = [0.95, 0.76, 0.31, 0.9];
const EDGE: Rgba = [0.82, 0.86, 0.92, 0.35];
const px = (v: number) => `${v}px`;

export class Confirm3d implements Ui3dScreen {
  readonly flat = new Group();
  private readonly part = new Part();
  private at = { x: Number.NaN, y: Number.NaN };
  private last?: { v: HudView; open: boolean };
  private lay?: ConfirmLayout;

  // `host`: the HUD's "Execute?" window; hidden by CSS (the sandbox's `hide`), the layer hides the drawing with it
  constructor(
    private readonly layer: Ui3dLayer,
    readonly host: HTMLElement,
  ) {
    this.flat.add(this.part.group);
    layer.root.classList.add('confirm3d');
    layer.add(this, 'confirm');
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
    const { dpr, theme } = this.layer,
      s1 = this.layer.s;
    // the window's pieces, from its own top left: the head, each note, each choice
    const box = (this.lay = confirmLayout(
      { title: parts.title, notes: parts.notes, choices: parts.choices.length },
      s1,
      matchMedia('(pointer: coarse)').matches,
      (str, size, width) => lineCount(str, { size, font: theme.font, width }, dpr),
    ));
    const { head, notes, choices } = box;
    this.seat(box); // the HUD drew the HTML window again: its buttons are new
    const key = JSON.stringify([parts, box, dpr]);
    if (key === part.key) return;
    part.clear();
    part.key = key;
    part.box(0, 0, box.w, box.h, 18 * s1, PILL, EDGE);
    this.text(parts.title, SIZE.head, WHITE, head, 14 * s1);
    part.box(10 * s1, head.y + head.h, box.w - 20 * s1, Math.max(1, s1), 0, LINE, NONE);
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

  // The unseen HTML window takes the drawn one's box, and each of its buttons its drawn choice's: no size of it comes
  // from a style sheet
  private seat(l: ConfirmLayout) {
    Object.assign(this.host.style, { width: px(l.w), height: px(l.h), padding: '0', border: '0', overflow: 'hidden' });
    this.host.querySelectorAll<HTMLElement>('.yes-no .item').forEach((b, i) => {
      const r = l.choices[i];
      if (!r) return;
      Object.assign(b.style, { position: 'absolute', left: px(r.x), top: px(r.y), width: px(r.w), height: px(r.h) });
      b.style.minHeight = b.style.margin = '0';
    });
  }
  // what the HUD places beside the character, in whole px as it always measured it
  get size() {
    return { w: Math.round(this.lay?.w ?? 0), h: Math.round(this.lay?.h ?? 0) };
  }

  // a text in `r` (relative to the window), from its left plus `left`, or centred; wrapped at `width`
  private text(str: string, size: number, color: string, r: Box, left: number, width?: number, centre = false) {
    const px = this.layer.px(size);
    const m = textMesh(
      str,
      { size: px, color, font: this.layer.theme.font, width, line: px * 1.3 },
      this.layer.dpr,
    ) as Quad;
    const x = centre ? r.x + r.w / 2 : r.x + left + m.scale.x / 2;
    this.part.text(m, x, r.y + r.h / 2);
  }

  // the page's size or scale changed: lay out and draw again
  resize() {
    this.part.key = '';
    if (this.last) this.update(this.last.v, this.last.open);
  }

  // follows the window, which BattleHud.place moves beside the character every frame
  frame(dt: number) {
    const { layer, part, host } = this;
    // left and top as the HUD wrote them (BattleHud.place), whole px
    const x = layer.snap(Number.parseFloat(host.style.left) || 0),
      y = layer.snap(Number.parseFloat(host.style.top) || 0);
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
