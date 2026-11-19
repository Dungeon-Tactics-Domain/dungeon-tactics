// Where the 3D command menu sits (menu3d.ts): on the regions measured on FFT: The Ivalice Chronicles' capture
// (ui3d/layout.ts: menu, submenu), at the screen edges or in the centred 16:9 frame, as the player picked. One
// layout for what is drawn and for the transparent buttons over it. Pure and tested (tests/ui3d.test.ts): no DOM, no
// Three.
import { type Box, MIN_SCALE, place, REGIONS, type Stage } from '../ui3d/layout.ts';

export type { Box };

// px on the 1920x1080 reference: a column's head, rows, icon column and plates and the glove's room left of a column
export const REF = {
  head: 42,
  row: 56.5,
  foot: 2,
  iconW: 55,
  icon: 40,
  hand: 62,
};
// how far the submenu starts over the menu (the cascade)
export const LEAD = REGIONS.submenu.x - REGIONS.menu.x;

// A finger's rows (Fernando, Nov 18: on a narrow page the pieces shrink, the touch targets as little as the page lets
// them): on touch the two columns keep the smallest full scale wherever the page is tall enough for them, and half of
// it on a 350 px phone on its side, instead of following the width down to a third
const TOUCH_ROOM = 700; // page px of height per unit of the columns' scale
export const touchScale = (st: Stage) => Math.max(st.s, Math.min(MIN_SCALE, st.h / TOUCH_ROOM));

export interface MenuLayout {
  cs: number; // the two columns' own scale: the stage's, or a finger's
  main: Box;
  sub: Box;
}

// `st`: where the interface is laid out and its scale (ui3d/layout.ts `stage`). Both columns share one height: the
// longer list's, growing upwards from the region's foot (Fernando, Nov 18: no blank fifth row under four commands, as
// the capture's five rows left). A page too narrow for the menu keeps the glove on screen and lets the list run off the
// right, and the menu never covers the acting unit's sheet in the combat bar when there is room beside it
export function menuLayout(st: Stage, rows: number, subRows: number, touch = false): MenuLayout {
  const s = st.s,
    cs = touch ? touchScale(st) : s;
  const at = place(REGIONS.menu, { ...st, s: cs });
  const h = (REF.head + Math.max(rows, subRows) * REF.row + REF.foot) * cs;
  // the acting sheet's right end and a gap; a page too narrow for both lets the menu stay on it
  const end = st.x + (REGIONS.sheet.x + REGIONS.sheet.w + 8) * s,
    bar = end + at.w <= st.x + st.w ? end : 0;
  const main = { x: Math.max(st.x + REF.hand * cs, bar, at.x), y: at.y + at.h - h, w: at.w, h };
  return { cs, main, sub: { ...main, x: main.x + LEAD * cs } };
}

// row `i` of a column, in page px
export const rowBox = (col: Box, i: number, s: number): Box => ({
  x: col.x,
  y: col.y + (REF.head + i * REF.row) * s,
  w: col.w,
  h: REF.row * s,
});
