// A battle on a ready map, for the future battle builder (Fernando, Nov 25: "vai ter outro builder q vai ser o battle
// builder em cima de um mapa pronto"): the map plus who stands where, facing where, with what life.
import { faceNearest } from '../battle/grid.ts';
import type { Scenario, Spawn } from '../battle/scenarios.ts';
import type { Team } from '../battle/types.ts';
import { baseDef, UNIT_DEFS } from '../battle/units.ts';
import { docFromScenario, type MapDoc, wholeSource } from './doc.ts';

export interface MapUnit {
  id: string;
  def: string;
  team: Team;
  x: number;
  y: number;
  facing: number;
  hp?: number; // own life, in place of the class's (spec: the Developer menu's life)
}
export interface BattleDoc {
  map: MapDoc;
  units: MapUnit[];
}

export const LIFE = [1, 999] as const; // the Developer menu's limits
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

// the units as the engine's spawns, facing kept (scenarios.ts initialState reads it)
export const spawnsOf = (doc: BattleDoc): Spawn[] =>
  doc.units.map(({ id, def, team, x, y, facing }) => ({ id, def, team, x, y, facing }));
