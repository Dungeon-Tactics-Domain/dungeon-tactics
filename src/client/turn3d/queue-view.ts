// Pure side of the 3D turn list (turn3d.ts): what each card shows, from the same rows as the HTML list and the strike
// preview, and which card each row of a redrawn list keeps. No DOM or Three here; tested in tests/ui3d.test.ts.
import type { Battle } from '../../shared/battle/battle.ts';
import type { UnitState } from '../../shared/battle/types.ts';
import { UNIT_DEFS } from '../../shared/battle/units.ts';
import { chargeCard } from '../charge-lines.ts';
import type { Forecast } from '../forecast.ts';
import { abilityName, t, unitName } from '../i18n.ts';
import { cardBars, cardLines, type queueRows, statsText, unitStats } from '../turn-list.ts';
import { pageText } from '../ui3d/layout.ts';

export type Queue = ReturnType<typeof queueRows>;

// What makes two rows the same entry of the queue: the unit, and the ability when the row is a charge going off
export interface RowId {
  unit: string;
  charge?: string;
}
const same = (a: RowId, b: RowId) => a.unit === b.unit && a.charge === b.charge;

// For each row of the redrawn list, the index of the old row whose card it keeps, or -1 for a new card. A unit shows more
// than once (two rounds), so rows pair up in order: its first row with its first old row. When the turn `passed`, the old
// head played and leaves; without that its card would travel up the list to the unit's next turn instead of sliding out
export function matchRows(prev: RowId[], next: RowId[], passed: boolean): number[] {
  const free = prev.map((_, i) => i).slice(passed ? 1 : 0);
  return next.map((row) => {
    const at = free.findIndex((i) => same(prev[i], row));
    return at < 0 ? -1 : free.splice(at, 1)[0];
  });
}

export interface QueueCard {
  id: RowId;
  unit: UnitState;
  enemy: boolean;
  hp: [left: number, upTo: number]; // of the full bar: what is left for sure, and up to where an aimed strike changes it
  num: number; // the order number, or a charge's ticks
  now: boolean; // the one acting
  target: boolean; // struck by the aimed ability
  pending: boolean; // where the aimed charge would fire
  small: boolean; // a unit already listed above: a smaller card with its name only (Fernando, Nov 20)
  // the lines beside the card: on a unit's first card its name, life and mana, stamina and CT (turn-list.ts cardLines),
  // with a bar under each number (`bars`: mana, stamina and CT filled 0 to 1, under 0 for a pool the unit lacks; the
  // life bar reads `hp`); on a repeat the name only. On a charge's row the spell and its count, then whom it would hit
  // now, with their faces (`faces`, defs; charge-lines.ts chargeCard; Nov 22); folded, the list shows faces and order
  // only (Fernando, Nov 20), so no card has lines
  stats: { lines: string[]; bars?: [mp: number, st: number, ct: number]; faces?: string[] } | null;
  tip: string; // name, life and CT in full, shown beside the card under the mouse
}

// The cards of a drawn list. The first row of each struck unit after the acting one takes the target mark, as in the
// reference; the HTML list only marks a charge's targets, here the strike preview's count too. `sheet`: with the 3D
// combat bar, the unit its sheet shows; when it is the list's head, the sheet's portrait is that card 1 (as on the
// reference), so the list starts at 2 (Fernando, Nov 16). While an enemy's strike plays the state may already have
// passed the turn: the head is then the next unit, not the sheet's, and stays. Numbers and marks count the whole list
// the list's head is the unit the 3D bar's sheet shows (hud.ts hides its HTML row then, style.css)
export const headOnSheet = (q: Queue | null, sheet?: string) =>
  !!sheet && !q?.rows[0]?.charge && q?.rows[0]?.unit === sheet;

// which rows repeat a unit already listed (a charge's row is never one): the list's head counts, even when the 3D
// bar's sheet stands for it, since that sheet shows the unit in full
export function repeats(rows: Queue['rows']): boolean[] {
  const seen = new Set<string>();
  return rows.map((r) => {
    if (r.charge) return false;
    const again = seen.has(r.unit);
    seen.add(r.unit);
    return again;
  });
}

// a charge's lines and the faces of the first three it would hit: more would not fit beside the names
function chargeStats(b: Battle, q: Queue | null, unit: string, ability: string): QueueCard['stats'] {
  const c = q?.charges.find((x) => x.unit === unit && x.ability === ability);
  if (!c) return null;
  const { lines, hit } = chargeCard(b.grid, b.state, c);
  return { lines, faces: hit.slice(0, 3).map((u) => u.def) };
}

export function queueCards(b: Battle, q: Queue | null, fs: Forecast[], sheet?: string, folded = false): QueueCard[] {
  const rows = q?.rows ?? [];
  const again = repeats(rows);
  const struck = new Map(fs.map((f) => [f.unit.id, f]));
  const marked = new Set<number>();
  for (const id of new Set([...struck.keys(), ...(q?.targets ?? [])])) {
    const at = rows.findIndex((r, i) => i > 0 && r.unit === id && !r.charge);
    if (at > 0) marked.add(at);
  }
  const cards = rows.map((r, i): QueueCard => {
    const u = b.state.units.find((x) => x.id === r.unit)!;
    const max = UNIT_DEFS[u.def].hp;
    const f = struck.get(u.id);
    // a strike's worst case, a heal's best: the bar blinks between the life now and the life after
    const after = f ? (f.heal ? f.after[1] : f.after[0]) : u.hp;
    const st = unitStats(u),
      text = statsText(st);
    return {
      id: { unit: r.unit, charge: r.charge },
      unit: u,
      enemy: u.team === 'enemy',
      hp: [Math.min(u.hp, after) / max, Math.max(u.hp, after) / max],
      num: r.charge ? (r.ticks ?? 0) : i + 1,
      now: i === 0,
      target: marked.has(i),
      pending: i === q?.at,
      small: again[i],
      stats: folded
        ? null
        : r.charge
          ? chargeStats(b, q, r.unit, r.charge)
          : again[i]
            ? { lines: [unitName(u.def)] }
            : { lines: cardLines(u), bars: cardBars(u) },
      tip: r.charge
        ? `${abilityName(r.charge)} · ${unitName(u.def)} · ${t(`resolve em ${r.ticks}`, `resolves in ${r.ticks}`)}`
        : `${unitName(u.def)} · ${text.long}${marked.has(i) ? t(' · alvo', ' · target') : ''}`,
    };
  });
  return headOnSheet(q, sheet) ? cards.slice(1) : cards;
}

// Where the lines sit beside a card `h` px tall, at the list's scale `s` (1 at 1280x720), in px from the card's top:
// each line's middle and, with `bar` (a first card), a row of bars right under each line after the name: life and
// mana under the second, stamina and CT under the third (Fernando, Nov 20: all four pools, not only the life). The text never
// goes under the game's 16 px, so a first card is never shorter than its lines (queue-layout.ts linesHeight).
// Under LIST_MIN (a narrow page, where the whole interface shrinks: ui3d/layout.ts) those floors shrink with the list
export const LIST_MIN = 0.9; // the list's scale at layout.ts MIN_SCALE (1.5 of it: turn3d.ts)
// a tablet's 14 px (layout.ts pageFloor) lifts the shrunk floors, the rows growing with their text
export const listFloor = (s: number, page = pageText()) => Math.max(Math.min(1, s / LIST_MIN), page / 16);
const lineSizes = (s: number) => {
  const f = listFloor(s),
    size = Math.max(16 * f, Math.round(12 * s));
  return { size, line: size * 1.1, bar: Math.max(4 * f, Math.round(4 * s)), gap: Math.max(2 * f, Math.round(3 * s)) };
};
// what `n` lines take, with a row of bars under each but the first when `bar`
export function linesHeight(n: number, s: number, bar: boolean) {
  const z = lineSizes(s);
  return n * z.line + (n - 1) * z.gap + (bar ? (n - 1) * z.bar : 0);
}
export function statsLayout(h: number, s: number, n = 3, bar = n > 1) {
  const z = lineSizes(s),
    top = (h - linesHeight(n, s, bar)) / 2;
  // each line's top: each row of bars above it moves it down by its thickness
  const at = (i: number) => top + i * (z.line + z.gap) + (bar ? Math.max(0, i - 1) * z.bar : 0);
  return {
    size: z.size,
    bar: z.bar,
    x: Math.max(6, 8 * s), // from the card's right edge
    fits: top >= 0,
    lines: Array.from({ length: n }, (_, i) => at(i) + z.line / 2),
    hpBar: bar ? at(1) + z.line : -1, // under the life and mana line; -1 for none
    stBar: bar && n > 2 ? at(2) + z.line : -1, // under the stamina and CT line
  };
}

// The width of the lines beside the cards, from each line's parts' widths (px, each with `pad` of margin a side). A pair's
// second part starts on its second bar (Fernando, Nov 21: MP and CT over the start of their bars), so the bars take two
// columns as wide as the widest part, 4 px apart as card.ts draws them; a line of one part keeps its own width
export function statWidth(lines: number[][], s: number, pad: number): number {
  const wide = (ls: number[][]) => Math.max(0, ...ls.flat()),
    col = wide(lines.filter((l) => l.length > 1));
  return Math.max(wide(lines.filter((l) => l.length < 2)), col && 2 * col - 2 * pad + 4 * s);
}
