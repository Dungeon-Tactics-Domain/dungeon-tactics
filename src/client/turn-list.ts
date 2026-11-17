// Pure parts of the turn list (hud.ts renderQueue). Fernando's decision of Nov 15: the list shows every unit of the
// battle, scrolling within its column when it is taller, instead of the next 4.
import { ABILITIES } from '../shared/battle/abilities.ts';
import type { Battle } from '../shared/battle/battle.ts';
import { unitAt } from '../shared/battle/pathing.ts';
import { previewOrder, type QueueEntry } from '../shared/battle/turn-queue.ts';
import type { Pos } from '../shared/battle/types.ts';

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

// The number each unit carries on the map, left of its health bar (Nov 17, Fernando: "the turn order as a number near
// each character's health bar"): the row of its next turn in the list, counted like the list's own numbers. A charge's
// row is the spell's, not its caster's turn, and a unit that never plays (the Beacon) has no number
export function turnOrder(rows: QueueEntry[]): Map<string, number> {
  const order = new Map<string, number>();
  rows.forEach((r, i) => {
    if (!r.charge && !order.has(r.unit)) order.set(r.unit, i + 1);
  });
  return order;
}

// PgUp/PgDn and the right stick move a page less one row, which stays in view to keep the place
export const pageStep = (view: number, row: number) => Math.max(row, view - row);

// rows of the queue projection the turn list reads: today's speeds (5 to 12) show 12 units twice in about 60 rows
// (ponytail: a unit too slow to show within the cap is left off the list; raise it if a battle ever needs more)
const QUEUE_CAP = 128;

// Turn list: every unit that plays, from the one acting now, through this round and the next (Nov 15, Fernando's
// decisions), with each queued charge where it fires and its ticks left (`ticks`). While aiming (`aim`: the Act map
// and "Execute?", Nov 15) the one acting pays the turn cost of acting, after what it already did, instead of the usual
// projection's cost of moving and acting; with a charge (Nov 13, Fernando's request, like FFT's CT list) the spell goes
// in where it will fire (`at`) and whoever it hits goes in `targets`, to see whether the target acts before it (and
// leaves the tile) or not. A copy of the queue: the state does not change, and cancelling the aim brings the usual list back
export function queueRows(b: Battle, aim: { ability: string; target: Pos } | null) {
  const a = aim ? ABILITIES[aim.ability] : null;
  const me = b.actor.id;
  const preview = a?.charge ? aim : null;
  // the same charge that Battle.act would register (a new charge replaces the previous one of the same unit)
  const charges =
    preview && a?.charge
      ? [
          ...b.state.charges.filter((c) => c.unit !== me),
          {
            unit: me,
            ability: preview.ability,
            target: preview.target,
            follow: a.panel ? null : (unitAt(b.state, preview.target)?.id ?? null),
            ticks: a.charge,
          },
        ]
      : b.state.charges;
  const now = aim ? { moved: b.state.turn.moved, acted: true } : undefined;
  const all = previewOrder({ ...b.state, charges }, QUEUE_CAP, now).map((r): QueueEntry & { ticks?: number } =>
    r.charge ? { ...r, ticks: charges.find((c) => c.unit === r.unit && c.ability === r.charge)?.ticks } : r,
  );
  const at = preview ? all.findIndex((r) => r.unit === me && r.charge === preview.ability) : -1;
  const p = preview ? b.preview(preview.ability, preview.target) : null;
  const targets = new Set(p?.ok ? p.targets.map((tg) => tg.unit) : []);
  return { rows: twoRounds(all), targets, at };
}
