import { ASH_WOOD } from '../../content/maps/ash-wood.ts';
import { BEACON_HILL } from '../../content/maps/beacon-hill.ts';
import { CRYPT_HEART } from '../../content/maps/crypt-heart.ts';
import { FLOODED_CRYPT } from '../../content/maps/flooded-crypt.ts';
import { FROST_PASS } from '../../content/maps/frost-pass.ts';
import { SKIRMISH } from '../../content/maps/skirmish.ts';
import { faceNearest, type Grid } from './grid.ts';
import type { Rules } from './rules.ts';
import type { BattleState, Team } from './types.ts';
import { UNIT_DEFS } from './units.ts';

export interface Spawn {
  id: string;
  def: string;
  team: Team;
  x: number;
  y: number;
}

// Scenario = map + who spawns where. It is plain data; the BattleState keeps only the id so the map does not go in the save.
export interface Scenario {
  id: string;
  name: string;
  en: string;
  grid: Grid;
  spawns: Spawn[];
  rules?: Rules; // only the study scenario swaps rules; the game ones have none
}

// The maps live in src/content/maps, one file each; Beacon Hill is the 1st battle and the standalone default
export const FIRST_BATTLE = BEACON_HILL;

// the game maps as written; SCENARIOS also receives the casts built at runtime (crawl and expedition rooms, developer menu)
export const MAPS: Scenario[] = [SKIRMISH, FIRST_BATTLE, FLOODED_CRYPT, CRYPT_HEART, ASH_WOOD, FROST_PASS];
export const SCENARIOS: Record<string, Scenario> = Object.fromEntries(MAPS.map((s) => [s.id, s]));

// initial ct 0 for everyone: the opening order comes only from the speeds
export function initialState(scenario: Scenario, seed: number): BattleState {
  return {
    scenario: scenario.id,
    units: scenario.spawns.map((s) => ({
      id: s.id,
      def: s.def,
      team: s.team,
      pos: { x: s.x, y: s.y },
      hp: UNIT_DEFS[s.def].hp,
      ct: 0,
      // direction on every map since Nov 13 (Fernando's request: "direction the character will look at the end of each turn and
      // the mechanics around it"): spawns facing the nearest enemy. Counters, only on
      // the sheet that asks for them (the Beacon, which does not play, has no front or back)
      ...(UNIT_DEFS[s.def].speed > 0 && {
        facing: faceNearest(
          s,
          scenario.spawns.filter((o) => o.team !== s.team),
        ),
      }),
      ...(UNIT_DEFS[s.def].vars && { vars: { ...UNIT_DEFS[s.def].vars } }),
    })),
    rng: seed | 0,
    turn: { actor: '', moved: false, main: null, bonus: null },
    charges: [],
    outcome: 'ongoing',
    turnsPlayed: 0,
  };
}
