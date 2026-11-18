// Drawing guides for the labs (?guides=1, localhost only), a screen of the 3D layer like the pieces it measures: the
// 16:9 drawing area, the thirds, the screen centre and every region of layout.ts at the place it takes in the layout
// picked, each box with its piece's name. Lines over everything, never in the way of a click (the layer takes no input).
import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineDashedMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
} from 'three';
import { getLayout } from '../layout-mode.ts';
import type { Ui3dLayer, Ui3dScreen } from './layer.ts';
import { type Box, place, REGIONS, SCREEN, stage } from './layout.ts';
import { QUAD } from './panel.ts';
import { dropText, textMesh } from './text.ts';

const AREA = '#ff2d95', // the 16:9 area and its thirds
  CENTRE = '#ffd400',
  REGION = '#00e5ff';
type Seg = [x1: number, y1: number, x2: number, y2: number]; // page px, y down
const sides = (b: Box): Seg[] => [
  [b.x, b.y, b.x + b.w, b.y],
  [b.x + b.w, b.y, b.x + b.w, b.y + b.h],
  [b.x + b.w, b.y + b.h, b.x, b.y + b.h],
  [b.x, b.y + b.h, b.x, b.y],
];

export class Guides implements Ui3dScreen {
  readonly flat = new Group();
  private readonly plate = new MeshBasicMaterial({ color: 0, opacity: 0.67, transparent: true, depthTest: false });

  constructor(private readonly layer: Ui3dLayer) {
    this.flat.renderOrder = 1; // a group of its own, drawn after every piece and the pixel filter's quad
  }

  private lines(segs: Seg[], color: string, dash = true, opacity = 1) {
    const geo = new BufferGeometry();
    // half a px in: a 1 px line on the pixel's middle is drawn whole
    const at = segs.flatMap(([x1, y1, x2, y2]) => [x1 + 0.5, -y1 - 0.5, 0, x2 + 0.5, -y2 - 0.5, 0]);
    geo.setAttribute('position', new Float32BufferAttribute(at, 3));
    // transparent even when solid: the opaque pass is drawn first, under every panel of the layer
    const o = { color, opacity, transparent: true, depthTest: false };
    const mat = dash ? new LineDashedMaterial({ ...o, dashSize: 4, gapSize: 3 }) : new LineBasicMaterial(o);
    const line = new LineSegments(geo, mat);
    if (dash) line.computeLineDistances();
    this.flat.add(line);
  }
  // a name at x,y (its top left), on a dark plate so it reads over any scene
  private label(str: string, x: number, y: number, color: string) {
    const text = textMesh(str, { size: 12, color, font: 'monospace' }, this.layer.dpr);
    const w = text.scale.x + 8,
      h = text.scale.y + 2;
    const back = new Mesh(QUAD, this.plate);
    back.scale.set(w, h, 1);
    for (const m of [back, text]) m.position.set(Math.round(x + w / 2), -Math.round(y + h / 2), 0);
    back.renderOrder = 1;
    text.renderOrder = 2;
    text.userData.text = true;
    this.flat.add(back, text);
  }

  private clear() {
    for (const o of [...this.flat.children]) {
      if (o.userData.text) dropText(o as Mesh);
      else if (o instanceof LineSegments) {
        o.geometry.dispose();
        o.material.dispose();
      }
      o.removeFromParent();
    }
  }

  // the layer's size, density or layout changed (the layer hears layout-mode.ts): every line again
  resize() {
    this.clear();
    const { w, h, stage: st } = this.layer;
    const fit = stage(w, h, 'frame'); // the 16:9 area that fits the window, whatever the layout
    // the 16:9 drawing area, 2 px, with its thirds and centre
    this.lines([...sides(fit), ...sides({ x: fit.x + 1, y: fit.y + 1, w: fit.w - 2, h: fit.h - 2 })], AREA, false);
    this.lines(
      [1, 2].flatMap((i): Seg[] => [
        [fit.x + (fit.w * i) / 3, fit.y, fit.x + (fit.w * i) / 3, fit.y + fit.h],
        [fit.x, fit.y + (fit.h * i) / 3, fit.x + fit.w, fit.y + (fit.h * i) / 3],
      ]),
      AREA,
      true,
      0.4,
    );
    this.lines(
      [
        [fit.x + fit.w / 2, fit.y, fit.x + fit.w / 2, fit.y + fit.h],
        [fit.x, fit.y + fit.h / 2, fit.x + fit.w, fit.y + fit.h / 2],
      ],
      CENTRE,
    );
    this.label(
      `16:9 ${Math.round(fit.w)}x${Math.round(fit.h)} (referência ${SCREEN.w}x${SCREEN.h}), layout ${getLayout()}`,
      fit.x + 4,
      fit.y + 4,
      AREA,
    );
    // every piece's region where the layout puts it, by name
    const boxes = Object.entries(REGIONS).map(([name, r]) => ({ name, b: place(r, st) }));
    this.lines(
      boxes.flatMap(({ b }) => sides(b)),
      REGION,
    );
    for (const { name, b } of boxes) this.label(name, b.x + 2, b.y + 2, REGION);
    this.layer.wake();
  }
  frame() {
    return false; // nothing moves
  }
  dispose() {
    this.layer.remove(this);
    this.clear();
    this.plate.dispose();
  }
}
