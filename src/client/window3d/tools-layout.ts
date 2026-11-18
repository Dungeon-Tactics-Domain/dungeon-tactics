// Where the 3D corner menu puts its buttons and its open list (tools3d.ts), with no DOM: the menu button on the page's
// top right corner with Back and Undo to its left, and the list hanging under them: a head, then one row per tool, as
// much of them as the page's height holds (the rest scrolls). The unseen HTML menu under the drawing is seated from
// these same numbers. Pure and tested (tests/tools-layout.test.ts) against what the browser measured before the numbers
// moved here.
import { type Box, lu } from '../ui3d/layout.ts';

const TAP = 44; // a finger's target (design system, section 8): no button or row is ever smaller
const GAP = 8; // between the buttons
const PRESS = 2; // the menu button sinks while its list is open

export interface ToolsSpec {
  pageW: number;
  pageH: number;
  s: number; // one reference px on the page
  inset: { top: number; right: number; bottom: number }; // a panel's margin to the page's edges (ui3d/layer.ts)
  buttons: number; // the ones shown: the menu button, and Back and Undo to its left while they show
  rows: number; // the tools on the list
  open: boolean;
  scroll: number; // of the open list, px
}

export function toolsLayout(q: ToolsSpec) {
  const u = (v: number) => lu(v * q.s),
    size = Math.max(TAP, u(56)),
    right = q.pageW - q.inset.right,
    top = q.inset.top,
    // left to right, the menu button last (on the corner)
    buttons: Box[] = Array.from({ length: q.buttons }, (_, i) => {
      const k = q.buttons - 1 - i;
      return { x: right - (k + 1) * size - k * GAP, y: top + (k === 0 && q.open ? PRESS : 0), w: size, h: size };
    }),
    w = Math.max(300, u(430)),
    drop = size + u(10),
    head = Math.floor(u(42)), // whole px, as the browser draws a frame
    rowH = Math.max(TAP, u(52)),
    full = head + q.rows * rowH,
    maxH = q.pageH - top - drop - q.inset.bottom,
    h = Math.min(full, maxH);
  return {
    buttons,
    size,
    list: { x: right - w, y: top + drop, w, h },
    drop, // from the buttons' top down to the list's
    head,
    rowH,
    maxH,
    more: Math.max(0, full - h), // how far the list scrolls
    // each row from the list's top left, where it is scrolled
    rows: Array.from({ length: q.rows }, (_, i): Box => ({ x: 0, y: head + i * rowH - q.scroll, w, h: rowH })),
  };
}
export type ToolsLayout = ReturnType<typeof toolsLayout>;

// a row shows only while the whole of it is in the list, under the head
export const rowSeen = (l: ToolsLayout, r: Box) => r.y >= l.head - 1 && r.y + r.h <= l.list.h + 1;
