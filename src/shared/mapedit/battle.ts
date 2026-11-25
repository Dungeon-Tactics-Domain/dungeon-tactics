// A battle on a ready map, for the battle builder (Fernando, Nov 25: "vai ter outro builder q vai ser o battle
// builder em cima de um mapa pronto"): the map plus who stands where, facing where, with what sheet, and the battle's
// bags, objective and who plays each side.

import type { Loadout } from '../battle/equipment.ts';
import { faceNearest } from '../battle/grid.ts';
import type { Control, Scenario, Spawn } from '../battle/scenarios.ts';
import type { Team } from '../battle/types.ts';
import { baseDef, UNIT_DEFS } from '../battle/units.ts';
import { docFromScenario, type MapDoc, wholeSource } from './doc.ts';

// The battle builder (grill, Nov 25) inherits the Developer menu's sheet: every field absent means the class's
export interface MapUnit {
  id: string;
  def: string;
  team: Team;
  x: number;
  y: number;
  facing: number;
  hp?: number; // own life, in place of the class's (spec: the Developer menu's life)
  name?: string; // own name, the same in both languages (Bran, Vesper)
  speed?: number;
  move?: number;
  jump?: number;
  items?: Loadout;
  abilities?: string[]; // the first is the basic attack
  ct?: number; // starting CT; absent = 0, the usual order by speed
}
// what wins the battle, from what the engine already knows; absent = the engine's default (the Beacon when the map has
// one, else defeat all)
export type Objective = { kind: 'defeat_all' } | { kind: 'beacon' } | { kind: 'survive'; turns: number };
export interface BattleDoc {
  map: MapDoc;
  units: MapUnit[];
  bags?: Partial<Record<Team, Record<string, number>>>; // each side's items (bag.ts); absent = empty
  objective?: Objective;
  control?: Partial<Record<Team, Control>>; // absent: the player plays the heroes, the AI the enemies
}

// the Developer menu's limits (dev-roster.ts LIMITS), the CT's from the turn queue (TURN_THRESHOLD)
export const LIMITS = {
  hp: [1, 999],
  speed: [1, 50],
  move: [1, 12],
  jump: [1, 6],
  ct: [0, 100],
  turns: [1, 99],
} as const;
export const LIFE = LIMITS.hp;
export const sizeOf = (def: string) => UNIT_DEFS[def]?.size ?? 1;

export const blankBattle = (map: MapDoc): BattleDoc => ({ map, units: [] });

// A battle's map and spawns. `classOf` turns a runtime sheet (the developer roster's dev-h0, an expedition's room-h0)
// into its class; a sheet whose life differs from its class's keeps it as the unit's own life
export function battleFromScenario(
  sc: Scenario,
  classOf: (def: string) => string | undefined = () => undefined,
): BattleDoc {
  const { scenario, cells } = wholeSource(sc);
  const spawns: Spawn[] = scenario.spawns.map((s) => ({
    ...s,
    x: Math.floor(s.x / cells),
    y: Math.floor(s.y / cells),
  }));
  const units = spawns.map((s): MapUnit => {
    const sheet = baseDef(s.def);
    const def = classOf(sheet) ?? sheet;
    const hp = UNIT_DEFS[sheet]?.hp;
    return {
      id: s.id,
      def,
      team: s.team,
      x: s.x,
      y: s.y,
      facing:
        s.facing ??
        faceNearest(
          s,
          spawns.filter((o) => o.team !== s.team),
        ),
      ...(def !== sheet && hp !== undefined && hp !== UNIT_DEFS[def]?.hp && { hp }),
    };
  });
  return { map: docFromScenario(sc), units };
}

// the units as the engine's spawns, facing and starting CT kept (scenarios.ts initialState reads them)
export const spawnsOf = (doc: BattleDoc): Spawn[] =>
  doc.units.map(({ id, def, team, x, y, facing, ct }) => ({
    id,
    def,
    team,
    x,
    y,
    facing,
    ...(ct !== undefined && { ct }),
  }));
