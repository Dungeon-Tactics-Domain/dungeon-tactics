// Where a 3D sheet sits (sheet3d.ts): the windows the title and Options open (saved games, quick battle, how to play,
// credits, tile marks, controls). FFT: The Ivalice Chronicles' captures in the labs have no counterpart for
// them (no save list, no help page), so they follow the 3D screens the game already has: the Options' head (the name
// over its hairline, a note at the right; options-layout.ts), one parchment sheet in the middle as the town's counter
// (town3d/), dark plates at the foot. A full screen, so always the centred 16:9 frame. One layout for what is drawn and
// for the window's real controls under it. Pure and tested (tests/flow3d.test.ts): no DOM, no Three.
import type { Block } from '../game/sheets.ts';
import { type Box, SCREEN, stage } from '../ui3d/layout.ts';
import { REF as OPT } from './options-layout.ts';

export type { Box };

// px on the 1920x1080 reference
export const REF = {
  size: { name: 28, sub: 22, no: 30, text: 26, head: 30, key: 24 }, // text; the head's and the plates' are the Options'
  panel: { x: 330, y: 186, w: 1260, h: 704 }, // the parchment
  pad: { x: 44, y: 30 }, // the list or the text, inside it
  row: 68, // a plain command
  save: 96, // a saved game: the face and two lines
  face: 72,
  faceX: 78, // a saved game's columns, from the row's left: number, face, who and where; gold and date end at its right
  nameX: 172,
  inset: 24, // a plain row's name, and both ends of a row's text
  side: 290, // the second button's column (Delete), at the row's right end
  sideBox: { w: 266, h: 60 }, // its drawn box: room for the two lines it says while armed, at 16 px on the smallest page
  line: 38, // a line of text
  indent: 38, // a list line starts after its bullet or swatch
  swatch: 22,
  keyW: 340, // the keys' column
  gap: { head: 26, item: 10, text: 16, key: 6 }, // before a heading, and after each kind of block
  foot: { y: 930, w: 420, link: 700, h: 56, gap: 28 }, // the plates under the sheet: the link (credits), then Back
  hand: 62,
};

export interface SheetLayout {
  s: number;
  title: { x: number; y: number }; // middle
  rule: Box;
  note: { x: number; y: number }; // right end, middle
  panel: Box;
  box: Box; // the scrolling window inside it
  rowH: number; // never under the game's 44 px tap
  side: number; // width of the second button's column, 0 without one
  foot: Box[]; // left to right, Back the last
}

export function sheetLayout(
  w: number,
  h: number,
  o: { tall?: boolean; side?: boolean; link?: boolean } = {},
): SheetLayout {
  const st = stage(w, h, 'frame'),
    s = st.s;
  const at = (x: number, y: number, bw = 0, bh = 0): Box => ({
    x: st.x + x * s,
    y: st.y + y * s,
    w: bw * s,
    h: bh * s,
  });
  const { panel, pad, foot } = REF;
  const fh = Math.max(44, foot.h * s),
    widths = [...(o.link ? [foot.link] : []), foot.w],
    total = widths.reduce((a, b) => a + b, 0) + (widths.length - 1) * foot.gap;
  let x = (SCREEN.w - total) / 2;
  return {
    s,
    title: at(SCREEN.w / 2, OPT.titleY),
    rule: at(OPT.rule.x, OPT.rule.y, OPT.rule.w, OPT.rule.h),
    note: at(OPT.noteX, OPT.titleY),
    panel: at(panel.x, panel.y, panel.w, panel.h),
    box: at(panel.x + pad.x, panel.y + pad.y, panel.w - 2 * pad.x, panel.h - 2 * pad.y),
    rowH: Math.max(44, (o.tall ? REF.save : REF.row) * s),
    side: o.side ? REF.side * s : 0,
    foot: widths.map((bw) => {
      const b = at(x, foot.y, bw, 0);
      x += bw + foot.gap;
      return { ...b, h: fh };
    }),
  };
}

// row `i` of the list on the page, scrolled by `scroll` px: its main button, and the second one's drawn box
export const rowBox = (L: SheetLayout, i: number, scroll: number): Box => ({
  x: L.box.x,
  y: L.box.y + i * L.rowH - scroll,
  w: L.box.w - L.side,
  h: L.rowH,
});
export function sideBox(L: SheetLayout, i: number, scroll: number): Box {
  const r = rowBox(L, i, scroll),
    w = REF.sideBox.w * L.s,
    h = Math.min(L.rowH - 8, Math.max(44, REF.sideBox.h * L.s));
  return { x: r.x + r.w + L.side - w, y: r.y + (r.h - h) / 2, w, h };
}
// Where the cursor can stop on a list, in the order of the window's own controls: each row, its second button when it
// has one (`sides`), then the plates. The list as if unscrolled, the plates under its last row; under a list the plates
// span the sheet, so down from any column of the last row reaches Back and up from Back returns to the row
export function stops(L: SheetLayout, sides: readonly boolean[]): Box[] {
  const under = Math.max(0, sides.length * L.rowH - L.box.h);
  return [
    ...sides.flatMap((side, i) => [rowBox(L, i, 0), ...(side ? [sideBox(L, i, 0)] : [])]),
    ...L.foot.map((f) => ({ ...f, y: f.y + under, ...(sides.length ? { x: L.box.x, w: L.box.w } : {}) })),
  ];
}
// how much a piece `h` tall at `top` (px under the window's top) shows, 0 to 1: it fades as it leaves the window, gone
// by the time half of it is out (the Options' list does the same)
export const shown = (L: SheetLayout, top: number, h: number) =>
  Math.max(0, Math.min(1, ((Math.min(top + h, L.box.h) - Math.max(top, 0)) / h) * 2 - 1));
// The drawing's scroll for the window's: the window scrolled a share of its own way, the drawing goes the same share
// of its own (the two wrap their text at different sizes)
export const scrollOf = (L: SheetLayout, content: number, share: number) =>
  Math.max(0, content - L.box.h) * Math.max(0, Math.min(1, share));
// the scroll mark at the sheet's right edge: nothing when everything fits
export function thumb(L: SheetLayout, content: number, scroll: number): Box | null {
  if (content <= L.box.h + 1) return null;
  const h = (L.box.h * L.box.h) / content;
  return {
    x: L.box.x + L.box.w + 14 * L.s,
    y: L.box.y + (scroll / (content - L.box.h)) * (L.box.h - h),
    w: 5 * L.s,
    h,
  };
}

// A line of the reading text, in page px from the window's top left
export interface Line {
  str: string;
  x: number;
  top: number;
  h: number;
  size: number; // px on the page, never under 16
  ink: 'ink' | 'soft';
  bullet?: boolean; // a list line's first: the dot before it
  mark?: string; // or its tile mark's swatch
  rule?: boolean; // a heading: the hairline under it
}
// The blocks as lines, top to bottom. `wrap`: the text of one block broken at `max` px for letters `size` px tall (the
// drawing measures with its own font; ui3d/text.ts wrapLines)
export function flow(
  blocks: Block[],
  L: SheetLayout,
  wrap: (str: string, max: number, size: number) => string[],
): { lines: Line[]; height: number } {
  const s = L.s,
    lines: Line[] = [];
  const px = (size: number) => Math.max(16, size * s);
  let y = 0;
  const put = (str: string, x: number, size: number, ink: Line['ink'], more: Partial<Line> = {}, max = L.box.w - x) => {
    const h = Math.max(REF.line * s, size * 1.4);
    wrap(str, max, size).forEach((part, i) => {
      lines.push({ str: part, x, top: y, h, size, ink, ...(i ? {} : more) });
      y += h;
    });
  };
  blocks.forEach((b, i) => {
    if (b.k === 'head') {
      if (i) y += REF.gap.head * s;
      put(b.str, 0, px(REF.size.head), 'ink', { rule: true });
      y += REF.gap.item * s;
    } else if (b.k === 'item') {
      put(b.str, REF.indent * s, px(REF.size.text), 'ink', b.mark ? { mark: b.mark } : { bullet: true });
      y += REF.gap.item * s;
    } else if (b.k === 'text') {
      put(b.str, 0, px(REF.size.text), 'ink');
      y += REF.gap.text * s;
    } else {
      const top = y;
      put(b.key, 0, px(REF.size.key), 'ink', {}, (REF.keyW - 24) * s);
      const end = y;
      y = top;
      put(b.str, REF.keyW * s, px(REF.size.key), 'soft');
      y = Math.max(y, end) + REF.gap.key * s;
    }
  });
  return { lines, height: y };
}
