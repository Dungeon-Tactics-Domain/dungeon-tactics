// Where the 3D turn list and its cards sit (turn3d.ts), with no DOM: the list's box on the page, each row's box in the
// list's scroll space and how far the list scrolls. The unseen HTML list under the drawing (hud.ts renderQueue) is
// seated from these same numbers (queue-seat.ts) and keeps only the scroll and the hover. Pure and tested
// (tests/queue-layout.test.ts) against what the browser measured before the numbers moved here.
import { type Box, lu } from '../ui3d/layout.ts';
import { listFloor } from './queue-view.ts';

// The list as the cards need it: each row's box in the list's scroll space, the list's own place on the page, the
// height of its pinned title, where it is scrolled and how much list there is past its box
export interface QueueBoxes {
  rows: Box[];
  left: number;
  top: number;
  height: number;
  head: number;
  scroll: number;
  more: number;
}

// The least a finger's target is tall (docs/mobile-ux.md: under 28 px it needs a decision). A phone's cards are drawn at
// PHONE_SHRINK: the portrait frame is about 23 px and the unseen row that takes the tap 27, so that box reaches over the
// gap by `tapGrow` px a side, the drawing unchanged; the gap (3 px there) holds it, so two neighbours never overlap
export const TAP_MIN = 28;
export const tapGrow = (h: number) => Math.max(0, Math.ceil((TAP_MIN - h) / 2));

export const HEAD = 22; // the pinned title: one 16 px line and its 6 px of padding

export interface QueueSpec {
  rows: number; // the rows shown
  now: boolean; // the first one is the acting unit's, a bigger card (false when the 3D bar's sheet stands for it)
  s: number; // the list's scale: 1 at 1280x720 (turn3d.ts)
  at: Box; // the list's region on the page (ui3d/layout.ts REGIONS.turn)
  pageH: number;
  sheet: number; // the room the acting panel takes from the page's bottom
  stats: number; // the room the life and CT lines take past the cards' column
  margin?: number; // the page's top margin (ui3d/layer.ts inset.top): the list starts under it
}

// The sizes are the reference's (1280x720) times the scale; a row is never shorter than its two 16 px lines and two
// bars (queue-view.ts statsLayout), a floor that shrinks with the pieces on a narrow page. The column stacks from the
// bottom, 1 above the acting panel and counting up, so a row's y falls as the list grows and the scroll is 0 at rest.
// The list starts under the page's top margin (on a phone its region began above the page) and its title stays out of
// the rows: a list longer than its box drops its top to the row that fits whole under the title, so at rest no card
// shows cut under it (Fernando, Nov 18)
export function queueLayout(q: QueueSpec) {
  const f = listFloor(q.s),
    px = (v: number) => lu(v * q.s),
    size = (now: boolean) => ({
      w: lu(Math.max((now ? 54 : 44) * q.s, (now ? 50 : 41) * f)),
      h: lu(Math.max((now ? 64 : 52) * q.s, (now ? 59 : 48) * f)),
    }),
    gap = px(8),
    pad = { top: px(8), right: px(10), bottom: px(10), left: px(56) },
    left = lu(q.at.x),
    // it ends above the acting panel where that one is taller than the reference's
    bottom = q.pageH - lu(Math.max(q.pageH - q.at.y - q.at.h, q.sheet + 2)),
    sizes = Array.from({ length: q.rows }, (_, i) => size(q.now && i === 0)),
    head = pad.top + HEAD, // where the rows end under the title
    width = lu(120 * q.s + q.stats),
    rows: Box[] = [];
  let top = lu(Math.max(q.at.y, q.margin ?? q.at.y));
  const room = bottom - top - head - pad.bottom; // under the title
  if (sizes.reduce((a, z) => a + z.h + gap, -gap) > room) {
    // a row and the gap over it, from the bottom, while the whole of them fits
    let stack = 0;
    for (const z of sizes) {
      if (stack + z.h + gap > room) break;
      stack += z.h + gap;
    }
    top += Math.floor(room - stack);
  }
  const height = bottom - top;
  let y = height - pad.bottom,
    content = pad.top + HEAD + pad.bottom;
  for (const z of sizes) {
    y -= z.h;
    // whole px, as the cards always sat: the browser hands a row's box rounded
    rows.push({ x: Math.round(pad.left), y: Math.round(y), w: Math.round(z.w), h: Math.round(z.h) });
    y -= gap;
    content += z.h + gap;
  }
  return {
    rows,
    left,
    top,
    height: Math.round(height),
    head, // the rows' clip line: under the title, which does not scroll with them
    // the middle of the list's name: a 16 px line right over the top row, pinned under the list's top padding while
    // the rows scroll under it; over the cards, not over their lines
    title: {
      x: left + pad.left + (width - pad.left - pad.right - q.stats) / 2,
      y: top + Math.max(pad.top, y - HEAD) + 10,
    },
    more: Math.max(0, Math.round(content) - Math.round(height)),
    // for the unseen list (queue-seat.ts) and for what keeps clear of the drawn one (hud.ts place, insets)
    box: { left, top, right: left + width, bottom: top + height },
    seat: { width, height, gap, pad, stats: q.stats, row: size(false), first: size(q.now) },
  };
}
export type QueueLayout = ReturnType<typeof queueLayout>;
