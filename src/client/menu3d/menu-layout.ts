// Where the 3D command menu sits (menu3d.ts): on the regions measured on FFT: The Ivalice Chronicles' capture
// (ui3d/layout.ts: menu, submenu, detail), at the screen edges or in the centred 16:9 frame, as the player picked. One
// layout for what is drawn and for the transparent buttons over it. Pure and tested (tests/ui3d.test.ts): no DOM, no
// Three.
import { type Box, MIN_SCALE, place, REGIONS, type Stage } from '../ui3d/layout.ts';

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

// A finger's rows (Fernando, Nov 18: on a narrow page the pieces shrink, the touch targets as little as the page lets
// them): on touch the two columns keep the smallest full scale wherever the page is tall enough for them, and half of
// it on a 350 px phone on its side, instead of following the width down to a third
const TAP = 44; // style.css --tap
const TOUCH_ROOM = 700; // page px of height per unit of the columns' scale
export const touchScale = (st: Stage) => Math.max(st.s, Math.min(MIN_SCALE, st.h / TOUCH_ROOM));

export interface MenuLayout {
  cs: number; // the two columns' own scale: the stage's, or a finger's
  main: Box;
  sub: Box;
  sheet: Box;
  prev: Box; // the sheet's page arrows, each half of its foot
  next: Box;
}

// `st`: where the interface is laid out and its scale (ui3d/layout.ts `stage`). Each column is as tall as its own list,
// growing upwards from the region's foot (Fernando, Nov 18: no blank fifth row under four commands, as the capture's
// five rows left; Nov 19: the menu must not grow with the submenu). A page too narrow for the menu keeps the glove on screen and lets the submenu run off
// the right. On a short page the sheet reaches down past the columns' top: they step left, clear of it, but never over
// the acting unit's sheet in the combat bar (at 844x390 the menu covered the end of its stamina, "50/5"); where the
// two do not both fit, the submenu's cascade over the menu shortens
export function menuLayout(st: Stage, rows: number, subRows: number, touch = false): MenuLayout {
  const s = st.s,
    cs = touch ? touchScale(st) : s;
  const at = place(REGIONS.menu, { ...st, s: cs });
  // each column as tall as its own list, both standing on the region's foot: the menu kept the submenu's height and grew
  // when Agir opened (Fernando, Nov 19: "it must not")
  const tall = (n: number) => (REF.head + n * REF.row + REF.foot) * cs;
  const h = tall(rows);
  const page = place(REGIONS.detail, st);
  const sheet = { ...page, y: Math.max(st.y + 72, page.y) }; // under the help line and the corner buttons
  const low = sheet.y + sheet.h > at.y,
    x = low ? Math.min(at.x, sheet.x - 8 * s - LEAD * cs - at.w) : at.x;
  // the acting sheet's right end and a gap; a page too narrow for both lets the menu stay on it
  const end = st.x + (REGIONS.sheet.x + REGIONS.sheet.w + 8) * s,
    bar = end + at.w <= st.x + st.w ? end : 0;
  const main = { x: Math.max(st.x + REF.hand * cs, bar, x), y: at.y + at.h - h, w: at.w, h };
  const lead = low ? Math.max(0, Math.min(LEAD * cs, sheet.x - 8 * s - at.w - main.x)) : LEAD * cs;
  // the page arrows: each half of the foot; a finger's box is 44 px tall about the foot's middle (nothing sits under it)
  const fh = Math.max(REF.sheetFoot * s, touch ? TAP : 0);
  const foot = { y: sheet.y + sheet.h - (REF.sheetFoot * s + fh) / 2, w: sheet.w / 2, h: fh };
  return {
    cs,
    main,
    sub: { ...main, x: main.x + lead, y: main.y + main.h - tall(subRows), h: tall(subRows) },
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
