// Where each part of the 3D combat bar sits inside its region (ui3d/layout.ts `sheet`, `preview`, `target`), in px of
// the 1920x1080 reference from the region's top left corner. Measured on FFT: The Ivalice Chronicles (labs:
// refs/fft-ivalice/layout-fft-ic.json, ficha.*, previa.* and alvo.*, capture 01). The shader (plates.ts) and the text
// (bar3d.ts) read the same boxes. Pure and tested (tests/bar3d.test.ts).
import type { Box } from '../ui3d/layout.ts';

// a text: where it hangs (its left or right end, or its middle, at `x`), the middle of its line and its size
export interface Spot {
  x: number;
  y: number;
  size: number;
  align: 'l' | 'r' | 'c';
  max?: number; // shrinks to fit this width
}
export interface SheetLayout {
  w: number;
  h: number;
  portrait: Box;
  band: Box; // the side's colour behind the text, fading away from the portrait
  mirror: boolean;
  hpBar: Box;
  poolBar: Box;
  ctBar: Box;
  box: Box; // the dark box under the first pool, for the second one
  boxBar: Box;
  strip: Box; // the dark strip under the bars
  name: Spot;
  tag: Spot;
  hpLabel: Spot;
  hpRegen: Spot; // "+4" after the label: the life back each turn
  hpValue: Spot;
  poolLabel: Spot;
  poolValue: Spot;
  ctLabel: Spot;
  ctGain: Spot; // "+8" between the bar and the number: the CT gained each tick
  ctValue: Spot;
  boxLabel: Spot;
  boxValue: Spot;
  line: Spot;
}

// The acting unit's sheet has its portrait on the left; the target's is its mirror, portrait on the right, with the
// text in the same order 168 px to the left (the reference's text starts at x=280 on one and x=1152 on the other)
export function sheetLayout(mirror: boolean): SheetLayout {
  const dx = mirror ? -168 : 0;
  const portrait = mirror ? { x: 520, y: 0, w: 160, h: 194 } : { x: 0, y: 0, w: 162, h: 194 };
  const box = (x: number, y: number, w: number, h: number): Box => ({ x: x + dx, y, w, h });
  const spot = (x: number, y: number, size: number, align: Spot['align'], max?: number): Spot => ({
    x: x + dx,
    y,
    size,
    align,
    max,
  });
  return {
    w: mirror ? 680 : 672,
    h: 214,
    portrait,
    // under the portrait's inner edge, so its round corners show no gap
    band: mirror ? { x: 0, y: 0, w: 532, h: 214 } : { x: 150, y: 0, w: 522, h: 214 },
    mirror,
    hpBar: box(178, 84, 234, 16),
    poolBar: box(428, 84, 234, 16),
    ctBar: box(226, 123, 100, 10), // 130 on the reference: the last 30 px hold the CT gain, which it does not show
    box: box(428, 114, 234, 34),
    boxBar: box(480, 126, 96, 10),
    strip: box(170, 156, 498, 38),
    name: spot(180, 21, 30, 'l', 480),
    tag: { x: portrait.x + portrait.w / 2, y: 179, size: 22, align: 'c', max: portrait.w - 16 },
    hpLabel: spot(180, 65, 26, 'l'),
    hpRegen: spot(242, 67, 20, 'l', 52),
    hpValue: spot(412, 65, 30, 'r'),
    poolLabel: spot(432, 65, 26, 'l'),
    poolValue: spot(662, 65, 30, 'r'),
    ctLabel: spot(180, 128, 24, 'l'),
    ctGain: spot(334, 129, 20, 'l', 36),
    ctValue: spot(412, 128, 24, 'r'),
    boxLabel: spot(438, 131, 20, 'l'),
    boxValue: spot(654, 131, 20, 'r'),
    line: spot(184, 175, 22, 'l', 472),
  };
}

// The preview plate: a dark arrow pointing at the target's sheet, its texts centred left of the tip
export const PLATE = {
  w: 340,
  h: 218,
  tip: 56, // how far the point reaches past the plate's straight edges
  chance: { x: 142, y: 31, size: 26, align: 'c', max: 250 },
  amount: { x: 142, y: 96, size: 80, align: 'c', max: 250 },
  amountText: { x: 142, y: 96, size: 34, align: 'c', max: 250 }, // a support: the ability's name in the number's place
  label: { x: 142, y: 163, size: 24, align: 'c', max: 260 },
  name: { x: 142, y: 195, size: 18, align: 'c', max: 270 },
} satisfies { w: number; h: number; tip: number } & Record<string, Spot | number>;

// A text's middle on the page from its drawn width: `w` is the mesh's width, `pad` the empty margin the label carries on
// each side (text.ts), `s` the scale of one reference px. With `max`, a wider text shrinks to fit (`k`)
export function hang(sp: Spot, w: number, s: number, pad: number): { x: number; k: number } {
  const k = sp.max && w - 2 * pad > sp.max * s ? (sp.max * s) / (w - 2 * pad) : 1;
  const half = (w * k) / 2 - pad * k;
  return { x: sp.x * s + (sp.align === 'l' ? half : sp.align === 'r' ? -half : 0), k };
}
