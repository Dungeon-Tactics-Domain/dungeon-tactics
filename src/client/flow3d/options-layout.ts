// Where the 3D Options sit (options3d.ts). Three columns since Nov 18 (Fernando): the categories at the left, the open
// category's rows in the middle with their values in one column, and what the option in focus does at the right; the
// window's commands side by side in a strip under the three, always there, and the key hints on the band at the foot.
// The title, its hairline and the band keep the places measured on FFT: The Ivalice Chronicles' settings screen (labs
// refs/fft-ivalice/15 and 16, 1280x720 read as 1920x1080, +-6 px). A full screen, so it is always the centred 16:9
// frame, whatever layout the battle pieces take. One layout for what is drawn and for the real controls under it. Pure
// and tested (tests/flow3d.test.ts): no DOM, no Three.
import { type Box, MIN_SCALE, NARROW_SCALE, SCREEN, type Stage, stage } from '../ui3d/layout.ts';
import { neighbour, type Way } from '../ui3d/walk.ts';

export type { Box };

// px on the 1920x1080 reference
export const REF = {
  size: { title: 34, note: 22, head: 28, label: 28, value: 26, help: 24, button: 26 }, // text
  titleY: 100, // the title's middle
  rule: { x: 390, y: 145, w: 1140, h: 2 }, // the hairline under it
  noteX: 1770, // a note's right end, on the title's line (the sheets')
  top: 180, // where the three columns start
  cats: { x: 128, w: 292 }, // the categories
  list: { x: 460, w: 860 }, // the open category's rows
  side: { x: 1360, w: 432 }, // what the option in focus does
  row: 68, // a row and a category
  inset: 20, // a row's name starts this far in
  value: 372, // the value column, at the row's right end: arrow, value, arrow
  arrow: 36,
  number: 84, // a bar's number, before its track
  box: 46, // height of a choice's box
  track: 12, // thickness of a bar
  knob: 26,
  toggle: { w: 76, h: 34 },
  hand: 62, // the pointing glove, left of the box in focus
  button: { h: 56, gap: 16, over: 24 }, // the commands' strip, and the room between it and the columns
  help: { h: 84, foot: 52 }, // the band at the foot and what is left under it
};

// a page smaller than the smallest the layout scales to keeps the HTML window: its text and taps would not fit
export const fits = (w: number, h: number) => Math.min(w / SCREEN.w, h / SCREEN.h) >= MIN_SCALE;
// Options go on shrinking with the page down to a phone on its side (Fernando, Nov 18: the pieces may get smaller with
// the screen): its rows keep a 44 px tap and its list scrolls, so only the drawing shrinks.
// An upright page under `fits` (a tablet standing) keeps the HTML window: the frame would be a narrow band of small text
export const fitsOptions = (w: number, h: number) =>
  fits(w, h) || (w > h && Math.min(w / SCREEN.w, h / SCREEN.h) >= NARROW_SCALE);

export interface OptionsLayout {
  s: number;
  title: { x: number; y: number }; // middle
  rule: Box;
  cats: Box[]; // top to bottom
  list: Box; // the scrolling list's window
  rows: number;
  rowH: number; // never under the game's 44 px tap
  content: number; // the rows' height, all of them
  inset: number;
  value: number; // widths inside a row, from its right end: [arrow][number][track][arrow], or [arrow][box][arrow]
  arrow: number;
  number: number;
  side: Box;
  buttons: Box[]; // left to right
  help: Box; // as wide as the page
  helpText: { x: number; y: number; w: number }; // middle, and the room its line has
}

// how many categories, rows in the open one and commands
export function optionsLayout(w: number, h: number, cats: number, rows: number, buttons: number): OptionsLayout {
  const st: Stage = stage(w, h, 'frame'),
    s = st.s;
  const x = (v: number) => st.x + v * s;
  const rowH = Math.max(44, REF.row * s);
  // from the foot up, by what each part really measures (a 44 px command on a small page): the list takes what is left
  const helpH = REF.help.h * s,
    helpY = st.y + st.h - REF.help.foot * s - helpH;
  const bh = Math.max(44, REF.button.h * s),
    gap = REF.button.gap * s,
    by = helpY - gap - bh;
  const top = st.y + REF.top * s,
    colH = by - REF.button.over * s - top;
  const col = (c: { x: number; w: number }): Box => ({ x: x(c.x), y: top, w: c.w * s, h: colH });
  const span = (REF.side.x + REF.side.w - REF.cats.x) * s, // the strip runs under the three columns
    bw = (span - (buttons - 1) * gap) / Math.max(1, buttons);
  const arrow = Math.max(28, REF.arrow * s); // the two a finger still hits on a phone
  return {
    s,
    title: { x: x(SCREEN.w / 2), y: st.y + REF.titleY * s },
    rule: { x: x(REF.rule.x), y: st.y + REF.rule.y * s, w: REF.rule.w * s, h: REF.rule.h * s },
    cats: Array.from({ length: cats }, (_, i) => ({ ...col(REF.cats), y: top + i * rowH, h: rowH })),
    list: col(REF.list),
    rows,
    rowH,
    content: rows * rowH,
    inset: REF.inset * s,
    value: 2 * arrow + (REF.value - 2 * REF.arrow) * s,
    arrow,
    number: REF.number * s,
    side: col(REF.side),
    buttons: Array.from({ length: buttons }, (_, i) => ({ x: x(REF.cats.x) + i * (bw + gap), y: by, w: bw, h: bh })),
    help: { x: 0, y: helpY, w, h: helpH },
    helpText: { x: x(SCREEN.w / 2), y: helpY + helpH / 2, w: span },
  };
}

// row `i` on the page, with the list scrolled by `scroll` px
export const itemBox = (L: OptionsLayout, i: number, scroll: number): Box => ({
  x: L.list.x,
  y: L.list.y + i * L.rowH - scroll,
  w: L.list.w,
  h: L.rowH,
});

// Where the cursor is: on a category, on a row of the open one, or on a command of the strip
export type Zone = 'cat' | 'row' | 'cmd';
export interface Spot {
  zone: Zone;
  i: number;
}
const mid = (b: Box) => b.x + b.w / 2;
// Where an arrow or the d-pad takes the cursor (Fernando, Nov 17: it follows what is seen; Nov 18: the two ways of
// walking together). Inside a column or along the strip, the box seen that way (ui3d/walk.ts) and it stays at an edge.
//   a category: up and down change it (the caller opens the one in focus); right goes into its rows, at the first;
//     down from the last, the strip.
//   a row: up and down; left goes back to its category (on a row with a value the caller never asks: left and right
//     change it); down from the last, the strip.
//   a command: left and right along the strip; up goes back to the column over it, the open category or the last row.
// `cat`: the open category. `off`: the commands that are off (Restart on the enemy's turn), which the cursor skips.
export function optionsWalk(L: OptionsLayout, at: Spot, way: Way, cat: number, off: readonly boolean[] = []): Spot {
  const on = L.buttons.map((_, i) => i).filter((i) => !off[i]);
  // the command under a column: the nearest one that is on
  const under = (from: Box): Spot =>
    on.length
      ? {
          zone: 'cmd',
          i: on.reduce((a, b) =>
            Math.abs(mid(L.buttons[b]) - mid(from)) < Math.abs(mid(L.buttons[a]) - mid(from)) ? b : a,
          ),
        }
      : at;
  const flat = way === 'left' || way === 'right';
  if (at.zone === 'cat') {
    if (!L.cats[at.i] || way === 'left') return at;
    if (way === 'right') return L.rows ? { zone: 'row', i: 0 } : at;
    const to = neighbour(L.cats, at.i, way);
    return to !== at.i ? { zone: 'cat', i: to } : way === 'down' ? under(L.cats[at.i]) : at;
  }
  if (at.zone === 'row') {
    if (at.i < 0 || at.i >= L.rows || way === 'right') return at;
    if (way === 'left') return { zone: 'cat', i: cat };
    // the rows as they lie with nothing scrolled: the one under the last seen is still the next
    const boxes = Array.from({ length: L.rows }, (_, i) => itemBox(L, i, 0));
    const to = neighbour(boxes, at.i, way);
    return to !== at.i ? { zone: 'row', i: to } : way === 'down' ? under(L.list) : at;
  }
  if (!L.buttons[at.i] || way === 'down') return at;
  if (flat) {
    const to = neighbour([L.buttons[at.i], ...on.filter((i) => i !== at.i).map((i) => L.buttons[i])], 0, way);
    return to ? { zone: 'cmd', i: on.filter((i) => i !== at.i)[to - 1] } : at;
  }
  return mid(L.buttons[at.i]) < L.list.x || !L.rows ? { zone: 'cat', i: cat } : { zone: 'row', i: L.rows - 1 };
}
// Q and E, or the pad's shoulders, from anywhere: the category before or after, staying at the first and at the last
export const optionsTab = (cat: number, cats: number, dir: -1 | 1) => Math.max(0, Math.min(cats - 1, cat + dir));

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
