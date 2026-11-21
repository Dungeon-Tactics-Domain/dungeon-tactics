import { ABILITIES } from '../src/shared/battle/abilities.ts';
import { type Grid, parseGrid } from '../src/shared/battle/grid.ts';
import { nextRng } from '../src/shared/battle/rng.ts';
import { traceShot } from '../src/shared/battle/shot.ts';
import type { BattleState, Pos, Team } from '../src/shared/battle/types.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';

// The Shield bash before Nov 21 (20-25 damage, a push of 2 tiles, no stun), for the push tests, on a warrior that has it
export const BASH = 'test_bash';
export const BASHER = 'test_basher';
ABILITIES[BASH] = { ...ABILITIES.shove, id: BASH, name: 'Escudada', en: 'Shield bash', damage: [20, 25], push: 2 };
ABILITIES[BASH].cost = ['stamina', 10];
UNIT_DEFS[BASHER] = { ...UNIT_DEFS.warrior, id: BASHER, abilities: [...UNIT_DEFS.warrior.abilities, BASH] };

// flat WxH ground grid, or built from ASCII lines (terrain and height)
export const flat = (w: number, h: number): Grid =>
  parseGrid(Array(h).fill('.'.repeat(w)), Array(h).fill('0'.repeat(w)));
export const gridOf = (terrain: string[], heights?: string[]): Grid =>
  parseGrid(terrain, heights ?? terrain.map((r) => '0'.repeat(r.length)));

interface Spec {
  id: string;
  def: string;
  team: Team;
  x: number;
  y: number;
  hp?: number;
}

// minimal state to test a rule; the first in the list is the current actor
export function stateOf(units: Spec[], rng = 1): BattleState {
  return {
    scenario: 'test',
    units: units.map((u) => ({
      id: u.id,
      def: u.def,
      team: u.team,
      pos: { x: u.x, y: u.y },
      hp: u.hp ?? UNIT_DEFS[u.def].hp,
      ct: 0,
    })),
    rng,
    turn: { actor: units[0].id, moved: false, main: null, bonus: null },
    charges: [],
    outcome: 'ongoing',
    turnsPlayed: 0,
  };
}

// a shot (pathing.ts traceShot) from an archer on `a` at a soldier on `b` stops on nothing; `arc`: a bow's curve
export function clearShot(g: Grid, a: Pos, b: Pos, arc = false): boolean {
  const s = stateOf([
    { id: 'a', def: 'archer', team: 'hero', ...a },
    { id: 'b', def: 'soldier', team: 'enemy', ...b },
  ]);
  return !traceShot(g, s, s.units[0], b, arc).stop;
}

// first seed whose first roll satisfies the test: forces a hit (low value) or a miss (high value) without a mock
export function seedWhere(pred: (firstRoll: number) => boolean): number {
  for (let s = 1; ; s++) if (pred(nextRng(s)[0])) return s;
}
export const HIT_SEED = seedWhere((v) => v < 0.04);
export const MISS_SEED = seedWhere((v) => v > 0.96);
