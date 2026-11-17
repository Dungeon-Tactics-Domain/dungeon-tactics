// What a 3D town window shows (town3d.ts draws it): a page is a flat list of things to draw and of buttons, every place
// in px of the 1920x1080 reference (town-layout.ts), so the drawing is thin and the same list could feed another engine
// (Fernando, Nov 16: positions as data, state apart from the drawing). The views (shop-view.ts, party-view.ts) build
// pages from the saved game; nothing here touches the DOM or Three.js. Tested in tests/town3d.test.ts.
import type { Box } from '../ui3d/layout.ts';
import { T } from './town-layout.ts';

export type { Box };
// text colours: the paper's inks (ink, soft, off), the light ones over the darkened town (light, dim, gold) and the
// direction of a change (up, down; the arrow beside it says the same)
export type Ink = 'ink' | 'soft' | 'off' | 'light' | 'dim' | 'gold' | 'up' | 'down';
// flat colours: the dark backdrop pieces, the paper's inset band, and the bars
export type Tone = 'veil' | 'bar' | 'plate' | 'line' | 'band' | 'track' | 'hp' | 'mp' | 'sp' | 'stat';

interface InList {
  row?: number; // inside the page's scrolling list: the row it belongs to, hidden with it past the list's edge
}
export interface Paper extends InList {
  k: 'paper';
  box: Box;
  head?: number; // height of the darker head band
}
export interface Fill extends InList {
  k: 'fill';
  box: Box;
  tone: Tone;
  a?: number; // opacity, 1 when absent
}
export interface Text extends InList {
  k: 'text';
  str: string;
  x: number;
  y: number; // the middle of its line; with `wrap`, the top of the block
  size: number;
  ink: Ink;
  align?: 'l' | 'c' | 'r'; // which end `x` is; left when absent
  max?: number; // shrinks to this width
  wrap?: number; // wraps at this width
  maxH?: number; // a wrapped block shrinks to this height
}
export interface Face extends InList {
  k: 'face';
  box: Box; // square
  def: string; // the unit sheet whose painted face (or rendered portrait) shows
}
export type Item = Paper | Fill | Text | Face;

// A button: what the cursor (keys, pad, mouse, finger) lands on. `on` says what it lies over, so the drawing knows how
// to light it: a row of a paper panel, or a dark plaque of its own
export interface Hit extends InList {
  id: string;
  box: Box;
  name: string; // what a screen reader and the tests read
  on: 'paper' | 'dark';
  off?: boolean; // disabled; the page says why beside it
  picked?: boolean; // the open tab, the member whose pages show
  hand?: number; // where the glove points, in px under the box's top (its middle when not given)
}
export interface Page {
  items: Item[];
  hits: Hit[]; // in the order the cursor walks them
  list?: { box: Box; rowH: number; rows: number }; // the scrolling list: row i sits at box.y + i * rowH
}

export const fill = (box: Box, tone: Tone, o: Partial<Fill> = {}): Fill => ({ k: 'fill', box, tone, ...o });
export const text = (str: string, x: number, y: number, size: number, ink: Ink, o: Partial<Text> = {}): Text => ({
  k: 'text',
  str,
  x,
  y,
  size,
  ink,
  ...o,
});
// a bar with its track: `share` 0 to 1
export const bar = (box: Box, share: number, tone: Tone, o: InList = {}): Item[] => [
  fill(box, 'track', o),
  fill({ ...box, w: box.w * Math.max(0, Math.min(1, share)) }, tone, o),
];

// What every town window has around its panels, after FFT's menus: the town darkened, the window's name (and where in
// it) top left over a hairline, the gold top right with a second counter under it, the help line on its band and the
// button hints at the foot
export function chrome(o: {
  crumbs: string[];
  gold: [label: string, value: number];
  note?: string;
  help: string;
  hints: string;
}): Item[] {
  return [
    fill({ x: -40, y: -40, w: 2000, h: 1160 }, 'veil', { a: 0.86 }),
    text(o.crumbs.join('  ›  '), T.title.x, T.title.y, T.title.size, 'light'),
    fill(T.rule, 'line'),
    text(String(o.gold[1]), T.gold.x, T.gold.y, 34, 'gold', { align: 'r' }),
    text(o.gold[0], T.gold.x - 150, T.gold.y, 22, 'dim', { align: 'r' }),
    ...(o.note ? [text(o.note, T.gold.x, T.gold.y + 50, 24, 'dim', { align: 'r' })] : []),
    fill(T.help, 'bar', { a: 0.8 }),
    text(o.help, 960, T.help.y + T.help.h / 2, 28, 'light', { align: 'c', max: 1700 }),
    text(o.hints, T.hints.x, T.hints.y, 24, 'dim', { align: 'r' }),
  ];
}

// The plaques down the left edge (FFT's Tavern and Status commands): a dark plate each, its name in the middle
export function plaques(rows: { id: string; label: string; picked?: boolean; off?: boolean }[]): {
  items: Item[];
  hits: Hit[];
} {
  const P = T.plaque;
  const box = (i: number): Box => ({ x: P.x, y: P.y + i * (P.h + P.gap), w: P.w, h: P.h });
  return {
    hits: rows.map((r, i) => ({ id: r.id, box: box(i), name: r.label, on: 'dark', picked: r.picked, off: r.off })),
    items: rows.map((r, i) =>
      text(r.label, P.x + P.w / 2 + 20, box(i).y + P.h / 2, 30, r.off ? 'dim' : 'light', {
        align: 'c',
        max: P.w - 110,
      }),
    ),
  };
}
