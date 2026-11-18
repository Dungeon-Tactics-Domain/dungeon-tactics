// Where each piece of the battle interface sits (Fernando, Nov 16: the exact places of FFT: The Ivalice Chronicles): the
// battle regions measured on the 1920x1080 captures (labs: refs/fft-ivalice/layout-fft-ic.json, +-4 px), each with the
// edge or corner it holds on to, and the two ways the player lays them out (Options, ?layout=):
//   edges: every region keeps its distance to its own edge or corner, so on an ultrawide screen they move apart;
//   frame: the whole interface in a centred 16:9 frame, scaled to fit, the same as the reference.
// One scale for every piece. The 3D screens place themselves with `stage` and `place`; the HTML and CSS pieces read the
// same frame as --lay-u, --lay-x and --lay-y (style.css mirrors `stage`). Pure and tested (tests/layout.test.ts).

export type LayoutMode = 'edges' | 'frame';
export const LAYOUT_MODES: readonly LayoutMode[] = ['edges', 'frame']; // the first one is the default
// a missing or unknown value is the default
export const parseLayout = (v: unknown): LayoutMode => (v === 'frame' ? 'frame' : 'edges');

export const SCREEN = { w: 1920, h: 1080 }; // the reference
// under this a full-screen 3D page (the sheets, the town's windows) keeps its HTML window, except Options and the title
// (options-layout.ts `fitsOptions`); `frame` always fits the reference whole
export const MIN_SCALE = 0.6;
// `edges` on a narrow page (a phone on its side, an upright tablet; Fernando, Nov 18: the pieces may shrink with the
// screen): the combat bar spans the reference's width, so under MIN_SCALE the width alone shrinks the pieces, down to
// this (a 640 px page). The height never does: each piece holds on to its own edge and the short page shows less map
export const NARROW_SCALE = 1 / 3;
// The smallest text a 3D piece draws, in page px: the game's 16 px (`floor`) down to MIN_SCALE, and under it shrinking
// with the pieces (Fernando, Nov 18), or a line would no longer fit the plate it sits on
export const textPx = (size: number, s: number, floor = 16) => Math.max(floor * Math.min(1, s / MIN_SCALE), size * s);
// what the notch, the rounded corners and the home bar take on each side (env(safe-area-inset-*)), the larger of the
// two sides on each axis so the interface stays centred
export interface Safe {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
// what a region holds on to: top, middle or bottom, then left, centre or right
export type Anchor = `${'t' | 'm' | 'b'}${'l' | 'c' | 'r'}`;
export interface Region extends Box {
  at: Anchor;
}

// px on the reference, x and y the box's top left corner
export const REGIONS = {
  // the combat timeline: the column of turn cards (66x78 every 90 px, the order number left of each), from the label
  // down to the acting unit's card, which the reference shows as the sheet's portrait
  // (w 180 until Nov 17: each card's life and CT lines, about 150 px, sit to its right)
  turn: { at: 'ml', x: 18, y: 64, w: 300, h: 849 },
  sheet: { at: 'bl', x: 100, y: 818, w: 672, h: 214 }, // the acting unit: portrait and the faded band beside it
  menu: { at: 'br', x: 1152, y: 688, w: 414, h: 327 }, // the command menu (five rows)
  submenu: { at: 'br', x: 1284, y: 688, w: 414, h: 327 }, // Abilities, opened over the menu
  detail: { at: 'tr', x: 1450, y: 100, w: 400, h: 564 }, // the description of the ability in focus
  height: { at: 'tr', x: 1500, y: 95, w: 420, h: 85 }, // "Height", its number and the line under them
  banner: { at: 'tc', x: 650, y: 80, w: 620, h: 78 }, // the instruction pill, centred
  preview: { at: 'bc', x: 790, y: 812, w: 340, h: 218 }, // the strike preview plate between the two sheets
  target: { at: 'br', x: 1140, y: 818, w: 680, h: 214 }, // the target's sheet, mirrored
  bar: { at: 'bc', x: 100, y: 812, w: 1720, h: 220 }, // the whole combat bar: sheet, preview and target
  hints: { at: 'br', x: 1225, y: 1035, w: 660, h: 28 }, // button hints
  hintsLeft: { at: 'bl', x: 45, y: 1035, w: 206, h: 28 },
  // the end of battle (ref 73): what the dark band across the screen holds, from the left plate to the right one's end
  result: { at: 'mc', x: 213, y: 485, w: 1497, h: 340 },
  // the town's windows (Party, Shop, Tavern; town3d/): the whole reference screen, centred and scaled as one
  town: { at: 'mc', x: 0, y: 0, w: 1920, h: 1080 },
} satisfies Record<string, Region>;

// The box the regions anchor in, in page px, and the scale of one reference px
export interface Stage extends Box {
  s: number;
}
export function stage(w: number, h: number, mode: LayoutMode, safe: Safe = { x: 0, y: 0 }): Stage {
  const fit = Math.min(w / SCREEN.w, h / SCREEN.h);
  if (mode === 'frame')
    return { x: (w - SCREEN.w * fit) / 2, y: (h - SCREEN.h * fit) / 2, w: SCREEN.w * fit, h: SCREEN.h * fit, s: fit };
  const iw = w - 2 * safe.x,
    ih = h - 2 * safe.y;
  const s = Math.max(
    Math.min(iw / SCREEN.w, ih / SCREEN.h),
    Math.min(MIN_SCALE, Math.max(NARROW_SCALE, iw / SCREEN.w)),
  );
  return { x: safe.x, y: safe.y, w: iw, h: ih, s };
}

// one axis: the distance to the near edge (or to the middle) is the reference's, times the scale
const along = (at: string, from: number, size: number, v: number, ref: number, s: number) =>
  at === 't' || at === 'l'
    ? from + v * s
    : at === 'b' || at === 'r'
      ? from + size - (ref - v) * s
      : from + size / 2 + (v - ref / 2) * s;

// a region on the page
export const place = (r: Region, st: Stage): Box => ({
  x: along(r.at[1], st.x, st.w, r.x, SCREEN.w, st.s),
  y: along(r.at[0], st.y, st.h, r.y, SCREEN.h, st.s),
  w: r.w * st.s,
  h: r.h * st.s,
});
