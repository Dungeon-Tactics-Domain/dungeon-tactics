// Where the 3D town windows put their parts (town3d/), in px of the 1920x1080 reference, read on FFT: The Ivalice
// Chronicles' menus (labs refs/fft-ivalice: 44 the unit's Status, 47 the unit list, 49 the Inventory, 61 the Tavern;
// +-6 px) and widened where our screens hold more text than theirs. The whole window is the `town` region of
// ui3d/layout.ts, centred and scaled as one. Pure numbers: no DOM, no Three.

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
