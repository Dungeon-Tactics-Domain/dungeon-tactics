// A window's scroll boxes (Nov 18 tablet review: the Party's Status ran under the window's foot with nothing saying so,
// and no key or button reached the totals, which hold no button): whether a box hides more below, and which box a
// scroll key or the right stick moves. Pure, tested in tests/window-scroll.test.ts; dialog.ts wires it.
import { pageStep } from './turn-list.ts';

export interface ScrollBox {
  top: number; // scrollTop
  view: number; // clientHeight
  height: number; // scrollHeight
}

// 2 px of slack: a zoomed page leaves a fraction of a px at the end
export const moreBelow = (b: ScrollBox) => b.top + b.view < b.height - 2;
const moreAbove = (b: ScrollBox) => b.top > 2;

// the box to move: the first that can go that way, the focused one's first (the caller lists it first); -1 when none
export const scrollPick = (boxes: ScrollBox[], dir: 1 | -1) =>
  boxes.findIndex((b) => (dir > 0 ? moreBelow(b) : moreAbove(b)));

// a page less one row (48 px: a Status total with its source line), so the row at the edge stays in view
export const scrollStep = (b: ScrollBox, dir: 1 | -1) => dir * pageStep(b.view, 48);
