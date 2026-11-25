// The map builder's screen in 3D (Nov 25, layout A; docs/game-design/map-builder.md): the tool bar's plates along the
// map's foot and the side panel on the right, drawn as the end of battle's plates (dark with a gold edge). A screen of
// the shared 3D layer (ui3d/layer.ts).
//   Input: the builder (mapedit/builder-ui.ts) keeps real buttons, the two name fields and the paste box under the
//   drawing, unseen and seated on these same boxes, so the mouse, the taps, Tab and the screen reader stay theirs. It
//   hands this screen what to draw (`set`); nothing here decides or measures the page.
import { Group } from 'three';
import { type Colors, colors, label, put, rgba } from '../flow3d/draw.ts';
import { Part, type Rgba } from '../hints3d/hints3d.ts';
import type { Cell } from '../mapedit/layout.ts';
import type { Ui3dLayer, Ui3dScreen } from '../ui3d/layer.ts';
import { type Box, textPx } from '../ui3d/layout.ts';

export interface BuilderItem extends Pick<Cell, 'text' | 'kind' | 'on' | 'off'> {
  box: Box;
  focus?: boolean; // Tab or the pad's walk reached it
}
export interface BuilderView {
  panel: Box;
  items: BuilderItem[];
  note: { box: Box; text: string }; // the panel's help line
  hints: { box: Box; text: string }; // the keys, over the tool bar
}

const TEXT = 22; // px of the reference; never under 16 on the page (draw.ts label)
const faded = (c: Rgba, off?: boolean): Rgba => [c[0], c[1], c[2], off ? c[3] * 0.45 : c[3]];

export class Builder3d implements Ui3dScreen {
  readonly flat = new Group();
  private readonly part = new Part();
  private readonly color: Colors;
  private view: BuilderView | null = null;

  constructor(
    private readonly layer: Ui3dLayer,
    readonly host: HTMLElement,
  ) {
    this.color = colors(layer);
    this.flat.add(this.part.group);
    this.part.want = 1;
    layer.add(this, 'builder');
  }

  set(view: BuilderView) {
    this.view = view;
    this.draw();
  }

  resize() {
    this.part.key = '';
    this.draw();
  }

  private draw() {
    const { layer, part, view, color: c } = this;
    if (!view) return;
    const key = JSON.stringify([view, layer.dpr, layer.s]);
    if (key === part.key) return;
    layer.wake();
    part.clear();
    part.key = key;
    const s = layer.s,
      p = view.panel;
    part.box(p.x, p.y, p.w, p.h, 10 * s, rgba(c.plate, 0.9), rgba(c.line, 0.7));
    for (const it of view.items) this.item(it);
    const n = view.note.box;
    if (view.note.text)
      put(part, label(layer, s, view.note.text, TEXT - 2, c.soft, n.w), n.x, n.y + n.h / 2, 'left', n.w);
    const h = view.hints.box;
    if (!view.hints.text) return;
    // over the map: a dark plate under the words, so they read on any ground
    const m = label(layer, s, view.hints.text, TEXT - 2, c.text, h.w - 24);
    part.box(
      h.x + (h.w - m.scale.x) / 2 - 12,
      h.y + h.h - m.scale.y - 12,
      m.scale.x + 24,
      m.scale.y + 12,
      6 * s,
      rgba(c.plate, 0.85),
    );
    part.text(m, h.x + h.w / 2, h.y + h.h - 6 - m.scale.y / 2);
  }

  private item(it: BuilderItem) {
    const { layer, part, color: c } = this,
      s = layer.s,
      b = it.box,
      mid = b.y + b.h / 2;
    if (it.kind === 'label') {
      this.centred(it.text, c.text, b);
      return;
    }
    const lit = it.focus || it.on,
      field = it.kind !== 'button';
    part.box(
      b.x,
      b.y,
      b.w,
      b.h,
      6 * s,
      faded(rgba(field ? c.veil : lit ? c.line : c.plate, 0.95), it.off),
      faded(rgba(it.focus ? c.title : c.line, it.focus ? 1 : 0.8), it.off),
    );
    const ink = it.off ? c.soft : lit && !field ? c.title : c.text;
    if (it.kind === 'area') {
      // the box shows the text's start, as many characters as its lines hold (about 0.55 em each), never spilled
      const px = textPx(TEXT - 6, s),
        room = Math.floor((b.w - 12) / (px * 0.55)) * Math.max(1, Math.floor((b.h - 8) / (px * 1.35))),
        text = it.text.length > room ? `${it.text.slice(0, room - 1)}…` : it.text;
      const m = label(layer, s, text, TEXT - 6, c.soft, b.w - 12);
      m.scale.multiplyScalar(Math.min(1, (b.h - 8) / m.scale.y));
      part.text(m, b.x + 6 + m.scale.x / 2, b.y + 4 + m.scale.y / 2);
      return;
    }
    if (field) {
      put(part, label(layer, s, it.text, TEXT, c.text), b.x + 10, mid, 'left', b.w - 20);
      return;
    }
    this.centred(it.text, ink, b);
  }

  // a name too long for its plate wraps to a second line before it shrinks, and never under 14 px (design system,
  // section 8: a tablet's bar is 9 plates of about 70 px)
  private centred(text: string, ink: string, b: Box) {
    const { layer, part } = this,
      m = label(layer, layer.s, text, TEXT, ink, b.w - 12);
    const fit = Math.min(1, (b.w - 8) / m.scale.x, (b.h - 4) / m.scale.y);
    m.scale.multiplyScalar(Math.max(14 / textPx(TEXT, layer.s), fit));
    part.text(m, b.x + b.w / 2, b.y + b.h / 2);
  }

  frame(dt: number) {
    return this.part.fade(this.layer.still ? 10 : dt);
  }

  dispose() {
    this.layer.remove(this);
    this.part.clear();
  }
}
