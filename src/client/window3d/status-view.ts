// Pure side of the 3D Status window (status3d.ts): where the sheet sits on the page and where each of its rows goes.
// Read the way FFT The Ivalice Chronicles lays a unit's numbers out (labs refs/fft-ivalice/14-ficha.jpg: the screen
// darkened, the numbers in columns side by side): a unit's rows go in two columns, the first half on the left; an
// ability's paragraph takes the whole sheet. No DOM or Three here; tested in tests/window3d.test.ts.
import type { Box, Stage } from '../ui3d/layout.ts';

// px on the 1920x1080 reference; the head and the foot are the command menu's and its ability sheet's
export const REF = { w: 1100, plain: 640, head: 42, foot: 48, row: 46, pad: 22, gap: 36, label: 230, rowPad: 14 };

// The sheet's width and columns. Text never goes under 16 px, so on a small page it is wider than the scale says: the
// widths follow the text (`u`, the row text's size over the reference's), up to the page's own width
const TEXT = 22; // the rows' text on the reference (status3d.ts SIZE.row)
function columns(st: Stage, plain: boolean) {
  const u = Math.max(st.s, 16 / TEXT),
    pad = REF.pad * u,
    gap = REF.gap * u,
    w = Math.min((plain ? REF.plain : REF.w) * u, st.w - 16);
  const col = plain ? w - 2 * pad : (w - 2 * pad - gap) / 2;
  return { w, pad, gap, col, label: plain ? 0 : Math.min(REF.label * u, col / 2) };
}

// the room a value's text has before it wraps
export function valueWidth(st: Stage, plain: boolean): number {
  const c = columns(st, plain);
  return c.col - c.label;
}

export interface StatusLayout {
  box: Box; // the sheet on the page
  rows: Box[]; // each row from the sheet's top left
  label: number; // a label column's width (0 on a plain sheet)
  head: number; // the head band's height
  foot: number;
}

// `heights`: each row's value text as drawn, in page px (it may have wrapped). A sheet taller than the stage starts at
// the page's top
export function statusLayout(st: Stage, heights: number[], plain: boolean): StatusLayout {
  const s = st.s,
    { w, pad, gap, col: colW, label } = columns(st, plain),
    head = REF.head * s,
    foot = REF.foot * s;
  const half = plain ? heights.length : Math.ceil(heights.length / 2);
  const ys = [head + pad / 2, head + pad / 2];
  const rows = heights.map((text, i) => {
    const col = i < half ? 0 : 1,
      h = Math.max(REF.row * s, text + REF.rowPad * s);
    const row = { x: pad + col * (colW + gap), y: ys[col], w: colW, h };
    ys[col] += h;
    return row;
  });
  const h = Math.max(...ys) + pad / 2 + foot;
  return { box: { x: st.x + (st.w - w) / 2, y: Math.max(st.y + (st.h - h) / 2, 0), w, h }, rows, label, head, foot };
}
