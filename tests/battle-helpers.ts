import { parseGrid, type Grid } from '../src/shared/battle/grid.ts';
import { nextRng } from '../src/shared/battle/rng.ts';
import type { BattleState, Team } from '../src/shared/battle/types.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';

// flat WxH ground grid, or built from ASCII lines (terrain and height)
export const flat = (w: number, h: number): Grid => parseGrid(Array(h).fill('.'.repeat(w)), Array(h).fill('0'.repeat(w)));
export const gridOf = (terrain: string[], heights?: string[]): Grid => parseGrid(terrain, heights ?? terrain.map((r) => '0'.repeat(r.length)));

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
    units: units.map((u) => ({ id: u.id, def: u.def, team: u.team, pos: { x: u.x, y: u.y }, hp: u.hp ?? UNIT_DEFS[u.def].hp, ct: 0 })),
    rng,
    turn: { actor: units[0].id, moved: false, usedAbility: null },
    charges: [],
    outcome: 'ongoing',
    turnsPlayed: 0,
  };
}

// first seed whose first roll satisfies the test: forces a hit (low value) or a miss (high value) without a mock
export function seedWhere(pred: (firstRoll: number) => boolean): number {
  for (let s = 1; ; s++) if (pred(nextRng(s)[0])) return s;
}
export const HIT_SEED = seedWhere((v) => v < 0.04);
export const MISS_SEED = seedWhere((v) => v > 0.96);
