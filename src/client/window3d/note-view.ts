// Pure side of the 3D notice window (note3d.ts): how wide the sheet is and where its legend, paragraphs, figure and
// buttons go. The sheet is centred on the stage; a page too short for it (a phone lying down) takes the `wide` sheet,
// across the page with the legend in two columns. No DOM or Three here; tested in tests/window3d.test.ts.
import type { Box, Stage } from '../ui3d/layout.ts';

// px on the 1920x1080 reference; the head and the foot are the Status sheet's
export const REF = { w: 780, head: 42, foot: 48, pad: 30, gap: 16, mark: 40, markGap: 14, button: 58, buttonW: 320 };
export const TEXT = 24; // the rows' text on the reference (note3d.ts SIZE.row)
const TAP = 44; // a button is never shorter than a finger

// Text never goes under 16 px, so on a small page the sheet follows the text (`u`) and not the scale, up to the page
export function noteWidths(st: Stage, legend: number, wide: boolean) {
  const u = Math.max(st.s, 16 / TEXT),
    pad = REF.pad * u,
    w = Math.min(wide ? st.w : REF.w * u, st.w - 16),
    inner = w - 2 * pad,
    cols = wide && legend > 3 ? 2 : 1,
    col = (inner - (cols - 1) * pad) / cols;
  // `legendText`: the room a legend's text has beside its mark before it wraps
  return { u, w, pad, inner, cols, col, legendText: col - (REF.mark + REF.markGap) * u };
}

export interface NoteLayout {
  box: Box; // the sheet on the page
  // the rest from the sheet's top left
  legend: Box[];
  text: Box[];
  figure?: Box;
  buttons: Box[]; // side by side, in the order given
  head: number;
  foot: number;
  fits: boolean; // the whole sheet is on the page
}

// `h`: each legend text and paragraph as drawn, in page px (they may have wrapped)
export function noteLayout(
  st: Stage,
  h: { legend: number[]; text: number[]; figure: boolean },
  buttons: number,
  wide: boolean,
): NoteLayout {
  const { u, w, pad, inner, cols, col } = noteWidths(st, h.legend.length, wide),
    gap = REF.gap * u,
    head = REF.head * u,
    foot = REF.foot * u;
  let y = head + pad / 2;
  // the legend down its columns, the first half on the left; a row is as tall as the taller of its two columns
  const per = Math.ceil(h.legend.length / cols);
  const rowH = (r: number) =>
    Math.max(REF.mark * u, ...Array.from({ length: cols }, (_, c) => h.legend[c * per + r] ?? 0)) + gap / 2;
  const tops: number[] = [];
  for (let r = 0; r < per; r++) {
    tops.push(y);
    y += rowH(r);
  }
  const legend = h.legend.map((_, i) => ({
    x: pad + Math.floor(i / per) * (col + pad),
    y: tops[i % per],
    w: col,
    h: rowH(i % per),
  }));
  if (legend.length) y += gap / 2;
  const text = h.text.map((th) => {
    const row = { x: pad, y, w: inner, h: th };
    y += th + gap;
    return row;
  });
  let figure: Box | undefined;
  if (h.figure) {
    figure = { x: pad, y, w: inner, h: REF.mark * u };
    y += figure.h + gap;
  }
  const bh = Math.max(REF.button * u, TAP),
    bw = Math.min(REF.buttonW * u, (inner - (buttons - 1) * gap) / buttons),
    left = (w - buttons * bw - (buttons - 1) * gap) / 2;
  const row = Array.from({ length: buttons }, (_, i) => ({ x: left + i * (bw + gap), y, w: bw, h: bh }));
  const height = y + bh + pad / 2 + foot;
  return {
    box: { x: st.x + (st.w - w) / 2, y: Math.max(st.y + (st.h - height) / 2, 0), w, h: height },
    legend,
    text,
    figure,
    buttons: row,
    head,
    foot,
    fits: height <= st.h + 2 * st.y, // the page's height: the stage is centred on it
  };
}
