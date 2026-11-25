// The battle builder's battle-wide edits (grill, Nov 25): another map under the same units, the objective, who plays
// each side and each side's bag. Every result still reads back through parseBattleDoc (`sound`), so a draft saved
// after any edit opens again after a reload.
import { BAG_MAX, CONSUMABLE_IDS } from '../battle/bag.ts';
import { canStand } from '../battle/grid.ts';
import type { Control } from '../battle/scenarios.ts';
import type { Team } from '../battle/types.ts';
import { isObjective } from '../battle/units.ts';
import { type BattleDoc, LIMITS, type Objective, sizeOf } from './battle.ts';
import { index, inside, type MapDoc } from './doc.ts';
import { parseBattleDoc } from './parse.ts';
import { square } from './units.ts';

// the save's own check: what a reload would read back
export const sound = (doc: BattleDoc) => parseBattleDoc(JSON.parse(JSON.stringify(doc))) !== null;

const hasBeacon = (doc: BattleDoc) => doc.units.some((u) => u.team === 'hero' && isObjective(u.def));
// protecting the Beacon without one on the heroes' side would lose on the first turn (parse.ts parseObjective)
const keepObjective = (doc: BattleDoc): BattleDoc => {
  if (doc.objective?.kind !== 'beacon' || hasBeacon(doc)) return doc;
  const { objective, ...rest } = doc;
  return rest;
};

// The units on another map: whoever's square leaves it, stands on a tile nobody stands on or covers one already taken
// (in the list's order) stays behind; the rest keep their places and sheets
export function withMap(doc: BattleDoc, map: MapDoc): BattleDoc {
  const taken = new Set<string>();
  const units = doc.units.filter((u) => {
    const cells = square(u, sizeOf(u.def));
    const fits = cells.every(
      (p) => inside(map, p) && canStand(map.tiles[index(map, p)]) && !taken.has(`${p.x},${p.y}`),
    );
    if (fits) for (const p of cells) taken.add(`${p.x},${p.y}`);
    return fits;
  });
  return keepObjective({ ...doc, map, units });
}

// the builder's edits on units can take the Beacon away: its objective goes with it
export const afterUnits = keepObjective;

export const OBJECTIVES = ['default', 'defeat_all', 'beacon', 'survive'] as const;
export type ObjectiveKind = (typeof OBJECTIVES)[number];
export const objectiveKind = (doc: BattleDoc): ObjectiveKind => doc.objective?.kind ?? 'default';

// The objective by kind (survive keeps its turns, 10 at first); the Beacon only with one on the heroes' side
export function setObjective(doc: BattleDoc, kind: ObjectiveKind, turns?: number): BattleDoc {
  const { objective: was, ...rest } = doc;
  if (kind === 'default') return rest;
  if (kind === 'beacon') return hasBeacon(doc) ? { ...rest, objective: { kind } } : doc;
  if (kind === 'defeat_all') return { ...rest, objective: { kind } };
  const [lo, hi] = LIMITS.turns;
  const n = Math.min(hi, Math.max(lo, turns ?? (was?.kind === 'survive' ? was.turns : 10)));
  return { ...rest, objective: { kind, turns: n } satisfies Objective };
}

// who plays a side; the default (the player the heroes, the AI the enemies) leaves the field out
export function setControl(doc: BattleDoc, team: Team, c: Control): BattleDoc {
  const usual: Control = team === 'hero' ? 'player' : 'ai';
  const control = { ...doc.control, [team]: c };
  if (c === usual) delete control[team];
  const { control: _, ...rest } = doc;
  return Object.keys(control).length ? { ...rest, control } : rest;
}

// One more or one less of an item in a side's bag, 0 to BAG_MAX; an empty bag leaves the field
export function bagStep(doc: BattleDoc, team: Team, item: string, delta: number): BattleDoc {
  if (!CONSUMABLE_IDS.has(item)) return doc;
  const bag = { ...doc.bags?.[team] };
  const n = Math.min(BAG_MAX, Math.max(0, (bag[item] ?? 0) + delta));
  if (n) bag[item] = n;
  else delete bag[item];
  const bags = { ...doc.bags, [team]: bag };
  if (!Object.keys(bag).length) delete bags[team];
  const { bags: _, ...rest } = doc;
  return Object.keys(bags).length ? { ...rest, bags } : rest;
}
