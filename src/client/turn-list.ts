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

// The current round and the next (Fernando's decision, Nov 15): round 1 runs until every unit and queued charge has
// shown once, round 2 until every unit has shown once more after it; each row carries its round for the list's mark
export function twoRounds<T extends QueueEntry>(rows: T[]): (T & { round: 1 | 2 })[] {
  const first = roundLength(rows);
  const both = first + roundLength(rows.slice(first));
  return rows.slice(0, both).map((r, i) => ({ ...r, round: i < first ? 1 : 2 }));
}

// The scroll that shows a row (`top`, `height` in the list's scroll space) in a view of `view` px scrolled to `scroll`,
// moving as little as possible; a row taller than the view shows its top. Like scrollIntoView 'nearest', without
// scrolling the page or the HUD around the list
export function keepInView(scroll: number, view: number, top: number, height: number): number {
  if (top < scroll || height > view) return top;
  if (top + height > scroll + view) return top + height - view;
  return scroll;
}

// Scroll after a redraw: the "Execute?" charge row in view (it shows whether the target acts before the spell lands);
// else a new turn goes back to NOW on top, and the same turn keeps where the player scrolled
export function anchorScroll(
  scroll: number,
  view: number,
  newTurn: boolean,
  pending: { top: number; height: number } | null,
): number {
  if (pending) return keepInView(scroll, view, pending.top, pending.height);
  return newTurn ? 0 : scroll;
}

// PgUp/PgDn and the right stick move a page less one row, which stays in view to keep the place
export const pageStep = (view: number, row: number) => Math.max(row, view - row);
