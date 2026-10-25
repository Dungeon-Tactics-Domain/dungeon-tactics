import { parseGrid, type Grid } from '../src/shared/battle/grid.ts';
import { nextRng } from '../src/shared/battle/rng.ts';
import type { BattleState, Team } from '../src/shared/battle/types.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';

// grade plana WxH de chão, ou a partir de linhas ASCII (terreno e altura)
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

// estado mínimo para testar uma regra; o primeiro da lista é o ator da vez
export function stateOf(units: Spec[], rng = 1): BattleState {
  return {
    scenario: 'test',
    units: units.map((u) => ({ id: u.id, def: u.def, team: u.team, pos: { x: u.x, y: u.y }, hp: u.hp ?? UNIT_DEFS[u.def].hp, ct: 0 })),
    rng,
    turn: { actor: units[0].id, moved: false, usedAbility: null },
    outcome: 'ongoing',
    turnsPlayed: 0,
  };
}

// primeira semente cuja primeira rolagem satisfaz o teste: força acerto (valor baixo) ou erro (valor alto) sem mock
export function seedWhere(pred: (firstRoll: number) => boolean): number {
  for (let s = 1; ; s++) if (pred(nextRng(s)[0])) return s;
}
export const HIT_SEED = seedWhere((v) => v < 0.04);
export const MISS_SEED = seedWhere((v) => v > 0.96);
