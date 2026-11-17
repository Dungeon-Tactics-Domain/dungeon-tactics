// Where the 3D command menu sits (menu3d.ts): on the regions measured on FFT: The Ivalice Chronicles' capture
// (ui3d/layout.ts: menu, submenu, detail), at the screen edges or in the centred 16:9 frame, as the player picked. One
// layout for what is drawn and for the transparent buttons over it. Pure and tested (tests/ui3d.test.ts): no DOM, no
// Three.
import { type Box, place, REGIONS, type Stage } from '../ui3d/layout.ts';

export type { Box };

// px on the 1920x1080 reference: a column's head, rows, icon column and plates, the glove's room left of a column and
// the sheet's foot
export const REF = {
  head: 42,
  row: 56.5,
  foot: 2,
  iconW: 55,
  icon: 40,
  hand: 62,
  sheetFoot: 48,
};
// how far the submenu starts over the menu (the cascade)
export const LEAD = REGIONS.submenu.x - REGIONS.menu.x;

export interface MenuLayout {
  main: Box;
  sub: Box;
  sheet: Box;
  prev: Box; // the sheet's page arrows, each half of its foot
  next: Box;
}

// `st`: where the interface is laid out and its scale (ui3d/layout.ts `stage`). Both columns share one height: the
// region's (five rows, as on the capture, the paper left blank under a shorter list) or the longer list's, growing
// upwards from the region's foot. A page too narrow for the menu keeps the glove on screen and lets the submenu run off
// the right
export function menuLayout(st: Stage, rows: number, subRows: number): MenuLayout {
  const s = st.s;
  const at = place(REGIONS.menu, st);
  const h = Math.max(at.h, (REF.head + Math.max(rows, subRows) * REF.row + REF.foot) * s);
  const main = { x: Math.max(st.x + REF.hand * s, at.x), y: at.y + at.h - h, w: at.w, h };
  const page = place(REGIONS.detail, st);
  const sheet = { ...page, y: Math.max(72, page.y) }; // under the help line and the corner buttons
  const foot = { y: sheet.y + sheet.h - REF.sheetFoot * s, w: sheet.w / 2, h: REF.sheetFoot * s };
  return {
    main,
    sub: { ...main, x: main.x + LEAD * s },
    sheet,
    prev: { x: sheet.x, ...foot },
    next: { x: sheet.x + sheet.w / 2, ...foot },
  };
}

// row `i` of a column, in page px
export const rowBox = (col: Box, i: number, s: number): Box => ({
  x: col.x,
  y: col.y + (REF.head + i * REF.row) * s,
  w: col.w,
  h: REF.row * s,
});
