// Where the 3D turn-the-phone notice puts its parts (rotate3d.ts), with no DOM: a dark plate in the page's middle, the
// sideways phone over the words, as the HTML notice of rotate-note.ts (style.css .rotate-card: 24 px text, 24 px of
// padding, 8 px between the glyph and the words, at most 20em wide, 16 px from the page's edges). Pure and tested.
import type { Box } from './layout.ts';

const SIZE = 24,
  LINE = 32, // the words' line: 24 px at 1.35, rounded
  PAD = 24,
  GAP = 8,
  PHONE_H = 34, // the glyph at --fs-xl, 1em tall and 1.5em wide
  EDGE = 16;

// `lines`: how many lines the words take at a width
export function rotateLayout(pageW: number, pageH: number, lines: (width: number) => number) {
  const w = Math.min(pageW - 2 * EDGE, 20 * SIZE),
    tw = w - 2 * PAD,
    h = PAD + PHONE_H + GAP + lines(tw) * LINE + PAD,
    x = (pageW - w) / 2,
    y = (pageH - h) / 2;
  const plate: Box = { x, y, w, h };
  const phone: Box = { x: x + (w - 1.5 * PHONE_H) / 2, y: y + PAD, w: 1.5 * PHONE_H, h: PHONE_H };
  return { plate, phone, text: { x: x + PAD, y: phone.y + PHONE_H + GAP, w: tw }, size: SIZE, line: LINE };
}
