// Where the 3D corner menu puts its buttons and its open list (tools3d.ts), with no DOM: the menu button on the page's
// top right corner with Back and Undo to its left, and the list hanging under them: a head, then one row per tool, as
// much of them as the page's height holds (the rest scrolls). The unseen HTML menu under the drawing is seated from
// these same numbers. Pure and tested (tests/tools-layout.test.ts) against what the browser measured before the numbers
// moved here.
import { type Box, lu } from '../ui3d/layout.ts';

const TAP = 44; // a finger's target (design system, section 8): no button or row is ever smaller
const GAP = 8; // between the buttons
const PRESS = 2; // the menu button sinks while its list is open
const CUE = 24; // the list's foot while rows wait under it: one 16 px line of text and its margin

export interface ToolsSpec {
  pageW: number;
  pageH: number;
  s: number; // one reference px on the page
  inset: { top: number; right: number; bottom: number }; // a panel's margin to the page's edges (ui3d/layer.ts)
  buttons: number; // the ones shown: the menu button, and Back and Undo to its left while they show
  // each button's drawn width, left to right (Back and Undo carry their word, Nov 18); a button is never narrower than
  // it is tall
  widths?: number[];
  rows: number; // the tools on the list
  open: boolean;
  scroll: number; // of the open list, px
}

// a button's height, and where the row of buttons ends at the bottom with its gap: what the Height corner keeps under
// (hints3d.ts; Fernando, Nov 18: on a phone it sat under the menu button and Undo)
const buttonSize = (s: number) => Math.max(TAP, lu(56 * s));
export const toolsFoot = (s: number, top: number) => top + buttonSize(s) + GAP;

export function toolsLayout(q: ToolsSpec) {
  const u = (v: number) => lu(v * q.s),
    size = buttonSize(q.s),
    right = q.pageW - q.inset.right,
    top = q.inset.top,
    // left to right, the menu button last (on the corner)
    wide = (i: number) => Math.max(size, q.widths?.[i] ?? 0),
    buttons: Box[] = [];
  // right to left, from the corner
  for (let i = q.buttons - 1, x = right; i >= 0; i--) {
    const w = wide(i);
    x -= w;
    buttons.unshift({ x, y: top + (i === q.buttons - 1 && q.open ? PRESS : 0), w, h: size });
    x -= GAP;
  }
  const w = Math.max(300, u(430)),
    drop = size + u(10),
    head = Math.floor(u(42)), // whole px, as the browser draws a frame
    rowH = Math.max(TAP, u(52)),
    full = head + q.rows * rowH,
    maxH = q.pageH - top - drop - q.inset.bottom,
    h = Math.min(full, maxH),
    below = full - q.scroll > h + 1;
  return {
    buttons,
    size,
    list: { x: right - w, y: top + drop, w, h },
    drop, // from the buttons' top down to the list's
    head,
    rowH,
    maxH,
    more: Math.max(0, full - h), // how far the list scrolls
    // rows hidden under the list's foot where it is scrolled: the foot says so (Nov 18: the arrow on the head went
    // unseen on a phone, and "FPS counter" and "Options and help" were found only by chance)
    below,
    cue: below ? CUE : 0,
    // each row from the list's top left, where it is scrolled
    rows: Array.from({ length: q.rows }, (_, i): Box => ({ x: 0, y: head + i * rowH - q.scroll, w, h: rowH })),
  };
}
export type ToolsLayout = ReturnType<typeof toolsLayout>;

// a row shows only while the whole of it is in the list, under the head and over the foot's cue
export const rowSeen = (l: ToolsLayout, r: Box) => r.y >= l.head - 1 && r.y + r.h <= l.list.h - l.cue + 1;
