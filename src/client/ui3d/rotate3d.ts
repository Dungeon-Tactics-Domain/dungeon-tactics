// The turn-the-phone notice drawn in 3D (Fernando, Nov 18: everything the player sees is 3D), a screen every layer
// (layer.ts) carries: on a touch phone held upright (rotate-note.ts ROTATE) the page goes dark and the sideways phone
// and its line stand in the middle, over every other screen of the layer, which hides them while it shows. The HTML
// notice stays under it, unseen, for the screen reader and to hold the game's input; it shows again whenever no layer
// is drawing (before the first one, or a layer the page hides).
import { Group } from 'three';
import { colors, rgba } from '../flow3d/draw.ts';
import { NONE, Part, type Quad } from '../hints3d/hints3d.ts';
import { drawnIn3d, ROTATE, ROTATE_TEXT } from '../rotate-note.ts';
import type { Ui3dLayer, Ui3dScreen } from './layer.ts';
import { rotateLayout } from './rotate-layout.ts';
import { lineCount, textMesh } from './text.ts';

const OVER = 500; // over every screen of the layer

export class Rotate3d implements Ui3dScreen {
  readonly flat = new Group();
  private readonly part = new Part();
  private readonly query = matchMedia(ROTATE);
  private readonly heard = () => this.layer.wake();

  constructor(private readonly layer: Ui3dLayer) {
    this.flat.add(this.part.group);
    this.query.addEventListener('change', this.heard);
  }

  get on() {
    return this.query.matches;
  }

  resize() {
    this.part.key = '';
    this.layer.wake();
  }

  private draw() {
    const { layer, part } = this,
      c = colors(layer),
      str = ROTATE_TEXT(),
      font = layer.theme.font;
    const key = JSON.stringify([layer.w, layer.h, layer.dpr, str]);
    if (key === part.key) return;
    part.clear();
    part.key = key;
    const L = rotateLayout(layer.w, layer.h, (width) => lineCount(str, { size: 24, font, width }, layer.dpr)),
      { plate: b, phone: p } = L,
      ink = rgba(c.text),
      paper = rgba(c.plate),
      k = p.h / 16; // the glyph's own units (a 24x16 box)
    part.box(0, 0, layer.w, layer.h, 0, rgba(c.veil, 0.9));
    part.box(b.x, b.y, b.w, b.h, 8, paper, rgba(c.line, 0.9));
    // the phone: its body as a light ring (a light box, the plate inside it), the speaker and the button
    part.box(p.x + k, p.y + 2 * k, 22 * k, 12 * k, 2.5 * k, ink, NONE);
    part.box(p.x + 2.6 * k, p.y + 3.6 * k, 18.8 * k, 8.8 * k, 1.5 * k, paper, NONE);
    part.box(p.x + 3.7 * k, p.y + 6 * k, 1.6 * k, 4 * k, 0.8 * k, ink, NONE);
    part.box(p.x + 18.6 * k, p.y + 7.1 * k, 1.8 * k, 1.8 * k, 0.9 * k, ink, NONE);
    const m = textMesh(
      str,
      { size: L.size, color: c.text, font, width: L.text.w, line: L.line, centre: true },
      layer.dpr,
    ) as Quad;
    part.text(m, L.text.x + L.text.w / 2, L.text.y + m.scale.y / 2);
    for (const o of part.group.children) o.renderOrder += OVER;
  }

  frame(dt: number) {
    const on = this.on;
    if (on) this.draw();
    this.part.want = on ? 1 : 0;
    const moving = this.part.fade(this.layer.still ? 10 : dt);
    // the HTML notice goes unseen only once this one covers the page
    drawnIn3d(this, on && this.part.alpha > 0.5 && this.layer.seen);
    return moving;
  }

  dispose() {
    this.query.removeEventListener('change', this.heard);
    drawnIn3d(this, false);
    this.part.clear();
    this.layer.remove(this);
  }
}
