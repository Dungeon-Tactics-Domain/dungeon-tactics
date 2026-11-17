// The battle's Status window drawn in 3D (localhost ?status=3d or the ?ui=3d preset; Fernando, Nov 17: every piece of
// the interface in the 3D look, compared with FFT The Ivalice Chronicles), a screen of the shared 3D layer
// (ui3d/layer.ts), read the way the reference shows a unit (labs refs/fft-ivalice/14-ficha.jpg): the battle darkened
// and the rest of the HUD away, and one parchment sheet in the middle with the unit's name on its head, its numbers in
// two columns (label in soft ink, value in ink) and how to close it on the foot. An ability's facts (the I key) are the
// same sheet, narrower, with one paragraph.
//   State: nothing here decides anything. While this screen lives, statusWindow (status-window.ts) hands it the same
//   sheet the HTML window would get; status-view.ts says where each row goes.
//   Input: a window of dialog.ts, unseen, over the drawn sheet: Esc, the pad's B, a tap outside and its ✕ (over the
//   drawn one) close it, as in every other window, and it holds the sheet as real text.
//   If the WebGL context goes while it shows, the HTML window opens in its place.
import { Group, type Mesh, type ShaderMaterial } from 'three';
import { dialog } from '../dialog.ts';
import { NONE, Part, type Quad, type Rgba } from '../hints3d/hints3d.ts';
import { KEYS } from '../hud-pieces.ts';
import { t } from '../i18n.ts';
import { el } from '../icons.ts';
import { alpha, clamp01, move } from '../menu3d/column.ts';
import { type StatusSheet, setStatus3d, statusBody, statusWindow } from '../status-window.ts';
import type { Ui3dLayer, Ui3dScreen } from '../ui3d/layer.ts';
import { paintTexture, paperMaterial, quad } from '../ui3d/panel.ts';
import { land, settled, spring } from '../ui3d/spring.ts';
import { textMesh } from '../ui3d/text.ts';
import { REF, statusLayout, valueWidth } from './status-view.ts';

const VEIL: Rgba = [0.03, 0.04, 0.05, 0.72]; // the battle behind, as the reference's dark screen
const RULE: Rgba = [0.2, 0.17, 0.1, 0.16]; // the hairline under each row, in the paper's edge colour
const CAP: Rgba = [0.78, 0.75, 0.73, 1];
const CAP_EDGE: Rgba = [0.2, 0.18, 0.16, 0.7];
const CAP_INK = '#2a2622';
// text sizes in px of the reference (never under 16 px on the page; a key cap's letters 12)
const SIZE = { head: 24, row: 22, foot: 20, cap: 17, close: 24 };
const OVER = 32; // over every other screen of the layer

export class Status3d implements Ui3dScreen {
  readonly flat = new Group();
  // the sheet as real text, inside the window: hiding the windows (the sandbox's `hide`) hides the screen
  readonly host = el('div', { class: 'status3d-body' });
  private readonly veil = new Part();
  private readonly part = new Part();
  private readonly paint = paintTexture();
  private readonly open = spring(0);
  private paper?: Mesh;
  private sheet?: StatusSheet;
  private win?: { overlay: HTMLElement; close(): void };
  private at = { x: 0, y: 0 };

  constructor(private readonly layer: Ui3dLayer) {
    this.flat.add(this.veil.group, this.part.group);
    setStatus3d((s) => this.show(s));
    layer.add(this);
  }

  private show(s: StatusSheet) {
    this.hide();
    this.sheet = s;
    this.host.replaceChildren(statusBody(s));
    this.win = dialog('status3d', s.title, [this.host]);
    land(this.open, 0);
    this.open.to = this.part.want = this.veil.want = 1;
    this.build();
  }

  private hide() {
    this.win?.close();
    this.win = this.sheet = undefined;
    this.drop();
    this.layer.wake();
  }

  resize() {
    if (this.sheet) this.build();
  }

  private label(str: string, size: number, color: string, width?: number, floor = 16) {
    const px = Math.max(floor, size * this.layer.s);
    return textMesh(
      str,
      { size: px, color, font: this.layer.theme.font, width, line: px * 1.3 },
      this.layer.dpr,
    ) as Quad;
  }

  private build() {
    const { layer, part, veil, sheet } = this;
    if (!sheet) return;
    this.drop();
    const s = layer.s,
      { ink, inkSoft } = layer.theme,
      plain = !sheet.rows.length;
    const cells: [string, string][] = plain ? [['', sheet.text ?? '']] : sheet.rows;
    const values = cells.map(([, v]) => this.label(v, SIZE.row, ink, valueWidth(layer.stage, plain)));
    const L = statusLayout(
      layer.stage,
      values.map((m) => m.scale.y),
      plain,
    );
    this.at = L.box;
    veil.box(-8, -8, layer.w + 16, layer.h + 16, 0, VEIL);
    const pad = 44 * s;
    this.paper = quad(
      paperMaterial(this.paint, layer.theme, {
        w: L.box.w,
        h: L.box.h,
        pad,
        unit: s,
        head: REF.head,
        foot: REF.foot,
        seed: 9,
      }),
      -pad,
      -pad,
      L.box.w + 2 * pad,
      L.box.h + 2 * pad,
      30 + OVER - 1,
    );
    part.group.add(this.paper);
    const left = (m: Quad, x: number, mid: number) => part.text(m, x + m.scale.x / 2, mid);
    left(this.label(sheet.title, SIZE.head, inkSoft), 10 * s, L.head / 2 - s);
    // the drawn ✕ sits under the window's real one (style.css .dialog.status3d): a 44 px square on the top right corner
    part.text(this.label('✕', SIZE.close, inkSoft), L.box.w - 22, Math.max(L.head / 2, 14));
    cells.forEach(([k], i) => {
      const r = L.rows[i],
        mid = r.y + r.h / 2;
      if (k) left(this.label(k, SIZE.row, inkSoft), r.x, mid);
      left(values[i], r.x + L.label, mid);
      if (!plain) part.box(r.x, r.y + r.h - 1, r.w, 1, 0, RULE, NONE);
    });
    // the foot: how to close it, for the device at hand
    const mid = L.box.h - L.foot / 2;
    const close = this.label(
      KEYS ? t('Fechar', 'Close') : t('Toque fora para fechar', 'Tap outside to close'),
      SIZE.foot,
      inkSoft,
    );
    const x = L.box.w - 14 * s - close.scale.x;
    left(close, x, mid);
    if (KEYS) {
      const cap = this.label('Esc', SIZE.cap, CAP_INK, undefined, 12),
        h = Math.max(20, 26 * s),
        w = Math.max(h, cap.scale.x + 8 * s);
      part.box(x - 10 * s - w, mid - h / 2, w, h, 5 * s, CAP, CAP_EDGE);
      part.text(cap, x - 10 * s - w / 2, mid);
    }
    for (const m of [...veil.group.children, ...part.group.children]) if (m !== this.paper) m.renderOrder += OVER;
    for (const m of veil.group.children) m.renderOrder -= 4; // under the sheet
    // the window takes the sheet's box, so a tap outside it closes
    const box = this.win?.overlay.firstElementChild as HTMLElement | null;
    if (box)
      Object.assign(box.style, {
        left: `${L.box.x}px`,
        top: `${L.box.y}px`,
        width: `${L.box.w}px`,
        height: `${L.box.h}px`,
      });
    layer.wake();
  }

  private drop() {
    (this.paper?.material as ShaderMaterial | undefined)?.dispose();
    this.paper = undefined;
    this.part.clear();
    this.veil.clear();
  }

  frame(dt: number) {
    // closed from outside (Esc, the ✕, a tap outside, the game): nothing left to show
    if (this.win && !this.win.overlay.isConnected) this.hide();
    if (!this.sheet) return false;
    const { layer, part, veil } = this,
      still = layer.still,
      e = still ? 10 : dt;
    move(this.open, dt, still, 240, 20); // a little under critical: the sheet drops a hair past its place and settles
    const fading = [part.fade(e), veil.fade(e)].some(Boolean);
    if (this.paper) alpha(this.paper, part.alpha);
    const rise = (1 - clamp01(this.open.x)) * 18 * layer.s;
    part.group.position.set(layer.snap(this.at.x), -layer.snap(this.at.y - rise), 0);
    return !still && (fading || !settled(this.open));
  }

  dispose() {
    const sheet = this.sheet;
    this.hide();
    setStatus3d();
    this.layer.remove(this);
    this.paint.dispose();
    if (sheet) statusWindow(sheet);
  }
}
