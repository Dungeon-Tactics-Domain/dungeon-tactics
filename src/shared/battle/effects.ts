// Timed effects from items (Nov 19, Agir primeiro step 2, second slice): Fire oil and Stone potion change a unit's sheet for
// a few of its own turns. The state keeps only who, which item and the turns left; what each gives is the item's `buff`
// (src/content/items.ts), read here so combat, movement and the save agree on one reading
import { type Buff, CONSUMABLES } from '../../content/items.ts';
import type { BattleState, UnitState } from './types.ts';
import { type Element, HALF, type Resist, UNIT_DEFS } from './units.ts';

export interface Effect {
  unit: string;
  item: string;
  turns: number; // the unit's own turns left; each ends one (tickEffects)
}

export const BUFFS: Record<string, Buff> = Object.fromEntries(
  CONSUMABLES.flatMap((c) => (c.buff ? [[c.id, c.buff]] : [])),
);

const buffsOf = (state: BattleState, id: string): Buff[] =>
  (state.effects ?? []).flatMap((e) => (e.unit === id && BUFFS[e.item] ? [BUFFS[e.item]] : []));

export const powerBonus = (state: BattleState, id: string) =>
  buffsOf(state, id).reduce((s, b) => s + (b.physPower ?? 0), 0);
export const resistBonus = (state: BattleState, id: string, k: Resist) =>
  buffsOf(state, id).reduce((s, b) => s + (b.resist?.[k] ?? 0), 0);
// the element a martial hit of this unit takes (the last effect applied wins)
export const hitElement = (state: BattleState, id: string): Element | undefined =>
  buffsOf(state, id).reduce<Element | undefined>((el, b) => b.element ?? el, undefined);

// The movement points a unit has this turn: its sheet's, plus its effects' (whole tiles, x2 on the split map), never below 0
export function moveOf(state: BattleState, u: UnitState): number {
  const d = UNIT_DEFS[u.def];
  const scale = d.id.endsWith(HALF) ? 2 : 1;
  return Math.max(0, d.move + scale * buffsOf(state, u.id).reduce((s, b) => s + (b.move ?? 0), 0));
}

// Puts an item's effect on a unit; the same item again starts its turns over (it never stacks with itself). On the user
// itself one more, as the turn it is used in ends at once: it still gets its `turns` of play
export function addEffect(state: BattleState, unit: string, item: string): void {
  const buff = BUFFS[item];
  if (!buff) return;
  const rest = (state.effects ?? []).filter((e) => !(e.unit === unit && e.item === item));
  state.effects = [...rest, { unit, item, turns: buff.turns + (unit === state.turn.actor ? 1 : 0) }];
}

// At the end of a unit's turn its effects lose one turn; spent ones and those of the dead leave
export function tickEffects(state: BattleState, actor: string): void {
  if (!state.effects) return;
  const left = state.effects
    .map((e) => (e.unit === actor ? { ...e, turns: e.turns - 1 } : e))
    .filter((e) => e.turns > 0 && state.units.some((u) => u.id === e.unit));
  if (left.length) state.effects = left;
  else delete state.effects; // an empty list is not saved
}

// Trust boundary for the saved effects: known items on units of the battle, 1 to the item's own turns, one per unit and
// item. Absent gives none; any doubt gives null
export function parseEffects(raw: unknown, units: UnitState[]): Effect[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > units.length * Object.keys(BUFFS).length) return null;
  const out: Effect[] = [];
  for (const e of raw) {
    if (!e || typeof e !== 'object') return null;
    const { unit, item, turns } = e as Record<string, unknown>;
    if (typeof unit !== 'string' || typeof item !== 'string' || !BUFFS[item]) return null;
    if (!units.some((u) => u.id === unit) || out.some((x) => x.unit === unit && x.item === item)) return null;
    if (!Number.isInteger(turns) || (turns as number) < 1 || (turns as number) > BUFFS[item].turns + 1) return null;
    out.push({ unit, item, turns: turns as number });
  }
  return out;
}
