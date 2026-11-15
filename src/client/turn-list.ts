// Pure parts of the turn list (hud.ts renderQueue). Fernando's decision of Nov 15: the list shows every unit of the
// battle, scrolling within its column when it is taller, instead of the next 4.
import type { QueueEntry } from '../shared/battle/turn-queue.ts';

// Rows up to the one that completes the round: every unit that plays and every queued charge shows at least once.
// A unit that never shows in `rows` (speed 0, like the Beacon) does not stretch it
export function roundLength(rows: QueueEntry[]): number {
  const seen = new Set<string>();
  let n = 0;
  rows.forEach((r, i) => {
    const key = r.charge ? `${r.unit}/${r.charge}` : r.unit;
    if (seen.has(key)) return;
    seen.add(key);
    n = i + 1;
  });
  return n;
}

// The scroll that shows a row (`top`, `height` in the list's scroll space) in a view of `view` px scrolled to `scroll`,
// moving as little as possible; a row taller than the view shows its top. Like scrollIntoView 'nearest', without
// scrolling the page or the HUD around the list
export function keepInView(scroll: number, view: number, top: number, height: number): number {
  if (top < scroll || height > view) return top;
  if (top + height > scroll + view) return top + height - view;
  return scroll;
}
