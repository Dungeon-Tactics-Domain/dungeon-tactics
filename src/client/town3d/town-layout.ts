// Where the 3D town windows put their parts (town3d/), in px of the 1920x1080 reference, read on FFT: The Ivalice
// Chronicles' menus (labs refs/fft-ivalice: 44 the unit's Status, 47 the unit list, 49 the Inventory, 61 the Tavern;
// +-6 px) and widened where our screens hold more text than theirs. The whole window is the `town` region of
// ui3d/layout.ts, centred and scaled as one. Pure numbers: no DOM, no Three.

import { type Box, lu, MIN_SCALE, pageText, SCREEN, textPx } from '../ui3d/layout.ts';

// The walkable town's HUD (hud3d.ts) in px of the page, not of the reference: the town's name on the top left corner,
// the menu button on the top right one (a finger's 44 px) and what Enter does in the middle of the top edge, taller
// while it shows its key. `inset`: a panel's margin to the page's edges (ui3d/layer.ts)
export function townHud(pageW: number, inset: { top: number; right: number; left: number }, key: boolean) {
  const h = 20 + lu(20.8), // a 16 px line in its panel
    line = key ? 48 : h;
  return {
    name: { x: inset.left, y: inset.top, h },
    menu: { x: pageW - inset.right - 44, y: inset.top, w: 44, h: 44 } as Box,
    prompt: { x: pageW / 2, y: inset.top + line / 2, h: line }, // its middle
  };
}

// What the top pill says. game/town.ts writes the target ("Talk to Hugo") on the help line and as the balloon's name;
// the HTML balloon shows only its symbol, but the 3D one writes the name, so the pill keeps only what has no balloon
// (the walk keys): on a phone the balloon sat right under it, the same words twice (review of Nov 18, 844x390)
export const promptSays = (line: string, balloon: string) => (line === balloon ? '' : line);

// The town window on a page `w` x `h`: the reference centred, one scale `s` across. Down, a tablet under the PC's
// smallest scale stretches it into the page's spare height (`sy`) as far as its 14 px text grew past the drawing (a
// window's common text, 20 px of the reference; ui3d/layout.ts pageFloor), so a row still holds its line (Fernando, Nov
// 18). A phone on its side (no page floor) and a PC (at MIN_SCALE or over) keep one scale both ways
export function townFrame(w: number, h: number, page = pageText()) {
  const s = Math.min(w / SCREEN.w, h / SCREEN.h),
    sy = page && s < MIN_SCALE ? Math.min(h / SCREEN.h, textPx(20, s, 16, page) / 20) : s;
  return { x: (w - SCREEN.w * s) / 2, y: (h - SCREEN.h * sy) / 2, s, sy };
}

// around every window
export const T = {
  title: { x: 42, y: 40, size: 32 }, // the window's name, left end and middle
  rule: { x: 0, y: 76, w: 1920, h: 2 }, // the hairline under it
  gold: { x: 1872, y: 44 }, // the gold counter's right end and middle; a second counter sits 50 px under it
  help: { x: 0, y: 944, w: 1920, h: 70 }, // the help line's band
  hints: { x: 1880, y: 1049 }, // the button hints' right end and middle
  plaque: { x: 0, y: 380, w: 372, h: 112, gap: 14 }, // the commands down the left edge
  hand: 62, // the pointing glove
};

// the counter (Shop, Tavern): the list in the middle, the picked row's box on the right
export const C = {
  list: { x: 560, y: 140, w: 780, h: 716 },
  head: 56,
  rowH: 66, // 10 rows show
  name: 28, // columns, from the list's left: name, kind, how many are owned (right end), price (right end)
  face: 16,
  kind: 400,
  own: 610,
  price: 752,
  box: { x: 1380, y: 140, w: 500, h: 716 },
  pad: 28,
  act: { x: 1408, y: 780, w: 444, h: 58 },
};

// the Party screen: the picked member across the top, the pages' plaques on the left, the page in the middle and the
// roster down the right
export const P = {
  face: { x: 50, y: 112, w: 216, h: 216 },
  name: { x: 290, y: 138 },
  bars: { x: 290, y: 196, w: 250, gap: 32 }, // label and number over a 14 px bar; the pools go beside the life
  tag: { x: 290, y: 302 },
  stats: { x: 900, y: 126, colW: 290, gap: 50, rowH: 46, cols: 3 }, // the sheet's totals: label left, number right
  page: { x: 400, y: 380, w: 1100, h: 540 },
  head: 56,
  pad: 30,
  roster: { x: 1530, y: 380, w: 360, rowH: 58, headH: 40 },
  statRow: 32, // Status: one total per row
  slotW: 420, // Equipment: the slots' column
  slotH: 58,
  gearRow: 72, // Equipment: a chest piece with what it changes
  job: { w: 190, h: 400, gap: 16 }, // Class: a card per class, its numbers under the name
};

// the town menu: its rows down the left as the reference's list of places (57: dark plates, the glove at their left),
// the town's box beside them. The 9 rows of the longest menu end above the help band
export const M = {
  rows: { x: 150, y: 120, w: 620, h: 74, gap: 10 },
  label: 36, // a row's name, from its left end
  box: { x: 860, y: 120, w: 640, h: 264 },
  head: 56,
  pad: 30,
};

// a place's window (the gate's quest, a place still to come): the plaques at the left edge, what the place says beside
export const G = {
  box: { x: 480, y: 380, w: 1000, h: 364 },
  head: 56,
  pad: 34,
};
