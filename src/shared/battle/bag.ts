// Items in battle (Agir primeiro, step 2, Nov 19 grill): the heroes' shared bag lives in the state, the Item command spends
// the turn's action like an ability, and every item reaches the user or an ally up to ITEM_RANGE whole tiles away. No die:
// an item always lands, so undoing it is free. The AI does not use items (decision of Nov 19)
import { CONSUMABLES, type Consumable, ITEM_RANGE } from '../../content/items.ts';
import { poolOf } from './combat.ts';
import { addEffect } from './effects.ts';
import { dist, type Grid } from './grid.ts';
import { originsOf } from './options.ts';
import { closest, farCells, footprint, unitAt } from './pathing.ts';
import type { BattleEvent, BattleState, Pos, UnitState } from './types.ts';
import { UNIT_DEFS } from './units.ts';

export const CONSUMABLE: Record<string, Consumable> = Object.fromEntries(CONSUMABLES.map((c) => [c.id, c]));
export const CONSUMABLE_IDS: ReadonlySet<string> = new Set(Object.keys(CONSUMABLE));
export const BAG_MAX = 99; // per item: a save above it is an edited one

// what an item does to one unit, already capped at the sheet's max (the number the preview and the event show)
export interface ItemEffect {
  unit: string;
  heal: number;
  mana: number;
  turns: number; // a timed effect's turns (effects.ts), 0 without one
}
// why an item is off: 'used' (the turn's action is gone), 'none' (none left in the bag), 'water' (swimming), 'no-target'
export type ItemReason = 'used' | 'none' | 'water' | 'no-target';
export interface ItemSpot {
  pos: Pos;
  cost: number;
  effect: ItemEffect;
}
export interface ItemTarget {
  unit: string;
  pos: Pos;
  spots: ItemSpot[]; // from the current tile first, then by movement cost
}
export interface ItemOptions {
  item: string;
  count: number;
  enabled: boolean;
  reason?: ItemReason;
  targets: ItemTarget[]; // the user first, then allies near to far
}

export const bagCount = (state: BattleState, item: string) => state.bag?.[item] ?? 0;

// What using `item` on the unit at `target` does when used from `origin` (default: where the actor stands); null when it
// cannot: no such item, none left, the action spent, nobody of the actor's side there, or out of reach
export function itemEffect(
  grid: Grid,
  state: BattleState,
  id: string,
  item: string,
  target: Pos,
  origin?: Pos,
): ItemEffect | null {
  const actor = state.units.find((u) => u.id === id);
  const c = CONSUMABLE[item];
  if (!actor || !c || state.outcome !== 'ongoing' || bagCount(state, item) < 1) return null;
  if (state.turn.actor === id && state.turn.usedAbility) return null;
  const u = unitAt(state, target);
  if (!u || u.team !== actor.team) return null;
  // measured between the two squares (a 2x2 token on the split map), in cells: 3 whole tiles = farCells. The user itself
  // walks along with the origin, so on itself it always reaches
  const from = footprint({ ...actor, pos: origin ?? actor.pos });
  if (u.id !== id && dist(...closest(from, footprint(u))) > farCells(grid, ITEM_RANGE)) return null;
  return effectOn(c, u);
}

const effectOn = (c: Consumable, u: UnitState): ItemEffect => {
  const d = UNIT_DEFS[u.def];
  const manaMax = d.vars?.mana ?? 0;
  return {
    unit: u.id,
    heal: Math.max(0, Math.min(c.heal ?? 0, d.hp - u.hp)),
    mana: manaMax ? Math.max(0, Math.min(c.mana ?? 0, manaMax - poolOf(u, 'mana'))) : 0,
    turns: c.buff?.turns ?? 0,
  };
};

// The Item command on the state: takes one from the bag, applies it and spends the turn's action. Returns no event when
// it cannot (itemEffect null). `Battle.useItem` keeps the undo; this is the rule
export function applyItem(grid: Grid, state: BattleState, id: string, item: string, target: Pos): BattleEvent[] {
  const fx = itemEffect(grid, state, id, item, target);
  if (!fx) return [];
  const u = state.units.find((x) => x.id === fx.unit)!;
  const left = bagCount(state, item) - 1;
  const bag = { ...state.bag, [item]: left };
  if (left <= 0) delete bag[item];
  state.bag = bag;
  u.hp += fx.heal;
  if (fx.mana) u.vars = { ...u.vars, mana: poolOf(u, 'mana') + fx.mana };
  state.turn.usedAbility = item;
  const events: BattleEvent[] = [{ k: 'item', unit: id, item, target }];
  if (fx.heal) events.push({ k: 'heal', unit: u.id, amount: fx.heal });
  if (fx.mana) events.push({ k: 'mana', unit: u.id, amount: fx.mana });
  if (fx.turns) {
    addEffect(state, u.id, item);
    events.push({ k: 'effect', unit: u.id, item, turns: fx.turns });
  }
  return events;
}

// Every item in the bag and whom it can reach this turn, walking first inside the movement left (the Agir list, like
// actionOptions for abilities). Bag order is CONSUMABLES' order; an item at 0 is not listed
export function itemOptions(grid: Grid, state: BattleState, id: string): ItemOptions[] {
  const actor = state.units.find((u) => u.id === id);
  if (!actor || state.outcome !== 'ongoing') return [];
  const used = state.turn.actor === id && !!state.turn.usedAbility;
  const origins = used ? [] : originsOf(grid, state, actor);
  const allies = state.units.filter((u) => u.team === actor.team && UNIT_DEFS[u.def].speed > 0);
  return CONSUMABLES.filter((c) => bagCount(state, c.id) > 0).map((c) => {
    const count = bagCount(state, c.id);
    if (used) return { item: c.id, count, enabled: false, reason: 'used', targets: [] };
    if (!origins.length) return { item: c.id, count, enabled: false, reason: 'water', targets: [] };
    const targets: ItemTarget[] = [];
    for (const u of allies) {
      const spots = origins.flatMap((o) => {
        const effect = itemEffect(grid, state, id, c.id, u.pos, o.pos);
        return effect ? [{ pos: o.pos, cost: o.cost, effect }] : [];
      });
      if (spots.length) targets.push({ unit: u.id, pos: u.pos, spots });
    }
    targets.sort((x, y) => +(x.unit !== id) - +(y.unit !== id) || dist(actor.pos, x.pos) - dist(actor.pos, y.pos));
    return targets.length
      ? { item: c.id, count, enabled: true, targets }
      : { item: c.id, count, enabled: false, reason: 'no-target', targets: [] };
  });
}

// Trust boundary for a saved bag (the battle's and the expedition's): only known items, whole counts 1 to BAG_MAX; any
// doubt gives null. Absent gives an empty bag
export function parseBag(raw: unknown): Record<string, number> | null {
  if (raw === undefined) return {};
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const bag: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!CONSUMABLE_IDS.has(k) || !Number.isInteger(v) || (v as number) < 0 || (v as number) > BAG_MAX) return null;
    if ((v as number) > 0) bag[k] = v as number;
  }
  return bag;
}
