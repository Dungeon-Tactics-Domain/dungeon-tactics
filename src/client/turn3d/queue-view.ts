// Pure side of the 3D turn list (turn3d.ts): what each card shows, from the same rows as the HTML list and the strike
// preview, and which card each row of a redrawn list keeps. No DOM or Three here; tested in tests/ui3d.test.ts.
import type { Battle } from '../../shared/battle/battle.ts';
import type { UnitState } from '../../shared/battle/types.ts';
import { UNIT_DEFS } from '../../shared/battle/units.ts';
import type { Forecast } from '../forecast.ts';
import { abilityName, t, unitName } from '../i18n.ts';
import { type queueRows, statsText, unitStats } from '../turn-list.ts';

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
  // life and CT beside the card, each a short line over its bar (turn-list.ts unitStats); null on a charge's row, which
  // is a spell going off, not a turn
  stats: { hp: string; ct: string; ctFill: number } | null;
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

export function queueCards(b: Battle, q: Queue | null, fs: Forecast[], sheet?: string): QueueCard[] {
  const rows = q?.rows ?? [];
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
      stats: r.charge ? null : { hp: text.hp, ct: text.ct, ctFill: st.ct / st.ctMax },
      tip: r.charge
        ? `${abilityName(r.charge)} · ${unitName(u.def)} · ${t(`resolve em ${r.ticks}`, `resolves in ${r.ticks}`)}`
        : `${unitName(u.def)} · ${text.long}${marked.has(i) ? t(' · alvo', ' · target') : ''}`,
    };
  });
  return headOnSheet(q, sheet) ? cards.slice(1) : cards;
}

// Where the life and CT lines sit beside a card `h` px tall, at the list's scale `s` (1 at 1280x720), in px from the
// card's top: each line's middle and, right under it, its bar's top. The text never goes under the game's 16 px, so the
// rows never get shorter than what two lines and two bars take (style.css .hud.turn3d .queue-row)
// Under LIST_MIN (a narrow page, where the whole interface shrinks: ui3d/layout.ts) those floors shrink with the list
export const LIST_MIN = 0.9; // the list's scale at layout.ts MIN_SCALE (1.5 of it: turn3d.ts)
export const listFloor = (s: number) => Math.min(1, s / LIST_MIN);
export function statsLayout(h: number, s: number) {
  const f = listFloor(s),
    size = Math.max(16 * f, Math.round(12 * s)),
    bar = Math.max(4 * f, Math.round(4 * s)),
    line = size * 1.1,
    gap = Math.max(2 * f, Math.round(3 * s)),
    top = (h - 2 * (line + bar) - gap) / 2,
    second = top + line + bar + gap;
  return {
    size,
    bar,
    x: Math.max(6, 8 * s), // from the card's right edge
    fits: top >= 0,
    hp: { text: top + line / 2, bar: top + line },
    ct: { text: second + line / 2, bar: second + line },
  };
}
