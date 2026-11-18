// What the flow screens in 3D draw with (options3d.ts, title3d.ts): the result's dark tokens, text in the theme's
// serif, and the glove that points at whatever control holds the focus.
import type { Group } from 'three';
import type { Part, Quad, Rgba } from '../hints3d/hints3d.ts';
import { Icon, move } from '../menu3d/column.ts';
import type { Ui3dLayer } from '../ui3d/layer.ts';
import { type Box, textPx } from '../ui3d/layout.ts';
import type { Rgb } from '../ui3d/panel.ts';
import { land, spring } from '../ui3d/spring.ts';
import { textMesh } from '../ui3d/text.ts';

export const rgba = (hex: string, a = 1): Rgba =>
  [...[1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255), a] as Rgba;
export const solid = (c: Rgb): Rgba => [c[0], c[1], c[2], 1];
export const FOCUS: Rgba = [0.86, 0.8, 0.6, 0.16]; // the band under the row in focus

// the result's tokens (style.css --ui3d-result-*): one dark family for every screen over the darkened game
const COLORS = ['title', 'text', 'soft', 'veil', 'band', 'plate', 'line'] as const;
export type Colors = Record<(typeof COLORS)[number], string>;
export function colors(layer: Ui3dLayer): Colors {
  const css = getComputedStyle(layer.root);
  return Object.fromEntries(
    COLORS.map((name) => [name, css.getPropertyValue(`--ui3d-result-${name}`).trim()]),
  ) as Colors;
}

// over the battle's own 3D pieces, which share the layer
export function lift(p: Part, by: number) {
  for (const m of p.group.children) m.renderOrder += by;
}

// text in the theme's serif, `size` in px of the 1080p layout (`s`: its scale) and never under the game's 16 px
export function label(layer: Ui3dLayer, s: number, str: string, size: number, hex: string, wrap?: number) {
  const px = textPx(size, s);
  return textMesh(
    str,
    { size: px, color: hex, font: layer.theme.font, width: wrap, line: wrap && px * 1.35 },
    layer.dpr,
  ) as Quad;
}
// `mid`: the text's middle; shrunk to `room` when it does not fit
export type Align = 'left' | 'centre' | 'right';
export function put(part: Part, m: Quad, x: number, mid: number, align: Align = 'left', room = Infinity) {
  m.scale.multiplyScalar(Math.min(1, room / m.scale.x));
  const w = m.scale.x;
  return part.text(m, align === 'left' ? x + w / 2 : align === 'right' ? x - w / 2 : x, mid);
}

// The pointing glove: at the left of the box in focus, sliding from one to the next and swaying while it rests
export class Hand {
  private readonly glove = new Icon(null, 'glove', undefined, 0.035);
  private readonly x = spring();
  private readonly y = spring(Number.NaN);
  constructor(deep: Group) {
    this.glove.model.rotation.set(0.2, -0.3, 0);
    this.glove.group.visible = false;
    deep.add(this.glove.group);
  }
  // the next place is the first: no slide from nowhere
  reset() {
    this.y.x = Number.NaN;
  }
  // `at`: the box to point at, or nothing in focus; `see`: 0 to 1; `size`: the glove's, in page px
  point(
    layer: Ui3dLayer,
    at: Box | null | undefined,
    see: number,
    size: number,
    dt: number,
    time: number,
    still: boolean,
  ) {
    const g = this.glove.group;
    g.visible = !!at && see > 0.004;
    if (!at) return;
    this.x.to = at.x - size / 2;
    this.y.to = at.y + at.h / 2;
    if (Number.isNaN(this.y.x)) {
      land(this.x);
      land(this.y);
    }
    move(this.x, dt, still, 330, 25);
    move(this.y, dt, still, 330, 25);
    const nudge = still ? 0 : Math.sin(time * 5.2) * 0.05 * size;
    g.position.set(layer.snap(this.x.x + nudge), -layer.snap(this.y.x), 300);
    g.scale.setScalar(size * see);
  }
  dispose() {
    this.glove.dispose();
  }
}
