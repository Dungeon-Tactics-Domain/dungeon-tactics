// Where the 3D Options sit (options3d.ts): on the places measured on FFT: The Ivalice Chronicles' settings screen (labs
// refs/fft-ivalice/15-opcoes-iniciais.jpg and 16-opcoes-audio.jpg, 1280x720 read as 1920x1080, +-6 px): the title over a
// hairline, the list at the left with its values in one column, the message band at the foot. Where the reference has
// its preview pictures, ours has the goal and the window's commands. A full screen, so it is always the centred 16:9
// frame, whatever layout the battle pieces take. One layout for what is drawn and for the real controls under it. Pure
// and tested (tests/flow3d.test.ts): no DOM, no Three.
import { type Box, MIN_SCALE, SCREEN, type Stage, stage } from '../ui3d/layout.ts';

export type { Box };

// px on the 1920x1080 reference
export const REF = {
  size: { title: 34, note: 22, head: 22, label: 28, value: 26, help: 26, button: 26 }, // text
  titleY: 100, // the title's middle
  rule: { x: 390, y: 145, w: 1140, h: 2 }, // the hairline under it
  noteX: 1770, // the note's right end, on the title's line
  list: { x: 128, y: 180, w: 908, h: 748 }, // eleven rows show at once
  row: 68,
  head: 52, // a section's name
  inset: 20, // a row's name starts this far in
  value: 372, // the value column, at the row's right end: arrow, value, arrow
  arrow: 36,
  number: 84, // a bar's number, before its track
  box: 46, // height of a choice's box
  track: 12, // thickness of a bar
  knob: 26,
  toggle: { w: 76, h: 34 },
  hand: 62, // the pointing glove, left of the row
  side: { x: 1140, y: 180, w: 630 }, // the goal, then the commands under it
  goal: 118, // room for the goal's text
  button: { w: 420, h: 56, gap: 16 },
  help: { y: 944, h: 84, w: 1500 }, // the message band across the page, and the width its text wraps at
};

// a page smaller than the smallest the layout scales to keeps the HTML window: its text and taps would not fit
export const fits = (w: number, h: number) => Math.min(w / SCREEN.w, h / SCREEN.h) >= MIN_SCALE;

export interface OptionsLayout {
  s: number;
  title: { x: number; y: number }; // middle
  rule: Box;
  note: { x: number; y: number }; // right end, middle
  list: Box; // the scrolling list's window
  rowH: number; // never under the game's 44 px tap
  headH: number;
  tops: number[]; // each item's top inside the list's content
  content: number; // the content's height
  inset: number;
  value: number; // widths inside a row, from its right end: [arrow][number][track][arrow], or [arrow][box][arrow]
  arrow: number;
  number: number;
  goal: Box;
  buttons: Box[]; // top to bottom
  help: Box; // as wide as the page
  helpText: { x: number; y: number; w: number }; // middle, and the width it wraps at
}

// `heads`: for each item of the list, whether it is a section's name (shorter) or a row
export function optionsLayout(w: number, h: number, heads: boolean[], buttons: number): OptionsLayout {
  const st: Stage = stage(w, h, 'frame'),
    s = st.s;
  const at = (x: number, y: number, bw = 0, bh = 0): Box => ({
    x: st.x + x * s,
    y: st.y + y * s,
    w: bw * s,
    h: bh * s,
  });
  const rowH = Math.max(44, REF.row * s),
    headH = REF.head * s;
  let content = 0;
  const tops = heads.map((head) => {
    const top = content;
    content += head ? headH : rowH;
    return top;
  });
  const side = at(REF.side.x, REF.side.y, REF.side.w, REF.goal);
  const bh = Math.max(44, REF.button.h * s);
  const help = at(0, REF.help.y, 0, REF.help.h);
  return {
    s,
    title: at(SCREEN.w / 2, REF.titleY),
    rule: at(REF.rule.x, REF.rule.y, REF.rule.w, REF.rule.h),
    note: at(REF.noteX, REF.titleY),
    list: at(REF.list.x, REF.list.y, REF.list.w, REF.list.h),
    rowH,
    headH,
    tops,
    content,
    inset: REF.inset * s,
    value: REF.value * s,
    arrow: REF.arrow * s,
    number: REF.number * s,
    goal: side,
    buttons: Array.from({ length: buttons }, (_, i) => ({
      x: side.x,
      y: side.y + side.h + REF.button.gap * s + i * (bh + REF.button.gap * s),
      w: REF.button.w * s,
      h: bh,
    })),
    help: { x: 0, y: help.y, w, h: help.h },
    helpText: { x: at(SCREEN.w / 2, 0).x, y: help.y + help.h / 2, w: REF.help.w * s },
  };
}

// item `i` on the page, with the list scrolled by `scroll` px
export const itemBox = (L: OptionsLayout, i: number, scroll: number): Box => ({
  x: L.list.x,
  y: L.list.y + L.tops[i] - scroll,
  w: L.list.w,
  h: (L.tops[i + 1] ?? L.content) - L.tops[i],
});
// how much a box at the list's edge shows, 0 to 1: a row leaving the window fades instead of crossing the title, gone
// by the time half of it is out
export const shown = (L: OptionsLayout, b: Box) =>
  Math.max(0, Math.min(1, ((Math.min(b.y + b.h, L.list.y + L.list.h) - Math.max(b.y, L.list.y)) / b.h) * 2 - 1));
// the scroll mark at the list's right edge: nothing when everything fits
export function thumb(L: OptionsLayout, scroll: number): Box | null {
  if (L.content <= L.list.h + 1) return null;
  const h = (L.list.h * L.list.h) / L.content;
  return {
    x: L.list.x + L.list.w + 10 * L.s,
    y: L.list.y + (scroll / (L.content - L.list.h)) * (L.list.h - h),
    w: 4 * L.s,
    h,
  };
}
