// The town's touch pad drawn in 3D (Fernando, Nov 18, on his phone): a joystick on one side, the action button on the
// other, in the dark plates with a gold edge of the corner buttons (window3d/tools3d.ts). Only on a touch device: the
// town builds the unseen skeleton then (game/town-hud.ts townPad) and this screen finds it.
//   Input: the skeleton's zone and button stay under the drawing, unseen (style.css .town-pad), seated on the drawn
//   circles by pad-layout.ts: they take the fingers and the screen reader. The knob follows the zone's data-x and
//   data-y, the button's fade follows its aria-disabled and its word its data-word (game/town.ts). Nothing here decides.
import { Group } from 'three';
import { type Colors, colors, rgba } from '../flow3d/draw.ts';
import { Part, type Quad, type Rgba } from '../hints3d/hints3d.ts';
import { onPadSide, padSide } from '../town-pad.ts';
import type { Ui3dLayer, Ui3dScreen } from '../ui3d/layer.ts';
import { textMesh } from '../ui3d/text.ts';
import { type Circle, padLayout } from './pad-layout.ts';

const OFF = 0.45; // the button with nothing in reach, as the corner buttons fade
const px = (v: number) => `${v}px`;
const faded = (c: Rgba, off: boolean): Rgba => [c[0], c[1], c[2], off ? c[3] * OFF : c[3]];

export class Pad3d implements Ui3dScreen {
  readonly flat = new Group();
  private readonly base = new Part(); // the stick's base and the button
  private readonly knob = new Part(); // drawn at the base's middle, moved by the finger
  private readonly color: Colors;
  private readonly stick: HTMLElement;
  private readonly use: HTMLElement;
  private readonly watch = new MutationObserver(() => this.draw());
  private readonly unside = onPadSide(() => this.draw());
  private tilt = '';
  private travel = 0;

  // `host`: the town's .town-pad
  constructor(
    private readonly layer: Ui3dLayer,
    readonly host: HTMLElement,
  ) {
    this.color = colors(layer);
    this.stick = host.querySelector<HTMLElement>('.pad-stick')!;
    this.use = host.querySelector<HTMLElement>('.pad-use')!;
    this.flat.add(this.base.group, this.knob.group);
    this.base.want = this.knob.want = 1;
    this.watch.observe(this.use, { attributes: true, attributeFilter: ['aria-disabled', 'data-word'] });
    layer.add(this, 'townpad');
  }

  resize() {
    this.base.key = '';
    this.draw();
  }

  private label(str: string, color: string) {
    const { layer } = this;
    return textMesh(str, { size: Math.max(16, 26 * layer.s), color, font: layer.theme.font }, layer.dpr) as Quad;
  }

  // a circle in the corner buttons' plate: dark, with a gold edge
  private disc(part: Part, c: Circle, fill: Rgba, edge: Rgba) {
    part.box(c.cx - c.r, c.cy - c.r, 2 * c.r, 2 * c.r, c.r, fill, edge);
  }

  // Rebuilds when the page, the side or the button's state changed
  private draw() {
    const { layer, base, knob, color: c } = this,
      { w, h, s, inset } = layer,
      lay = padLayout({ w, h, s, inset, side: padSide() });
    layer.wake();
    // the real controls under the drawn ones
    Object.assign(this.stick.style, {
      position: 'absolute',
      left: px(lay.zone.x),
      top: px(lay.zone.y),
      width: px(lay.zone.w),
      height: px(lay.zone.h),
    });
    this.stick.dataset.travel = String(lay.travel);
    Object.assign(this.use.style, {
      position: 'absolute',
      left: px(lay.useBox.x),
      top: px(lay.useBox.y),
      width: px(lay.useBox.w),
      height: px(lay.useBox.h),
      borderRadius: '50%',
    });
    const off = this.use.getAttribute('aria-disabled') === 'true',
      word = this.use.dataset.word ?? '',
      key = JSON.stringify([lay, off, word, layer.dpr, s]);
    if (key === base.key) return;
    base.clear();
    knob.clear();
    base.key = key;
    this.travel = lay.travel;
    this.tilt = '';
    this.disc(base, lay.stick, rgba(c.plate, 0.55), rgba(c.line, 0.7));
    const kr = lay.stick.r * 0.42;
    this.disc(knob, { cx: lay.stick.cx, cy: lay.stick.cy, r: kr }, rgba(c.plate, 0.95), rgba(c.title, 0.9));
    this.disc(base, lay.use, faded(rgba(c.plate, 0.95), off), faded(rgba(c.line, 0.8), off));
    if (word) base.text(this.label(word, off ? c.soft : c.text), lay.use.cx, lay.use.cy);
  }

  frame(dt: number) {
    const x = this.stick.dataset.x ?? '0',
      y = this.stick.dataset.y ?? '0',
      tilt = `${x},${y}`;
    if (tilt !== this.tilt) {
      this.tilt = tilt;
      this.knob.group.position.set(Number(x) * this.travel, -Number(y) * this.travel, 0);
      this.layer.wake();
    }
    const e = this.layer.still ? 10 : dt;
    return this.base.fade(e) || this.knob.fade(e);
  }

  dispose() {
    this.layer.remove(this);
    this.watch.disconnect();
    this.unside();
    this.base.clear();
    this.knob.clear();
    for (const e of [this.stick, this.use]) e.removeAttribute('style');
  }
}
