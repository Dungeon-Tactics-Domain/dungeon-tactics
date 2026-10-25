import { parseGrid, type Grid } from './grid.ts';
import type { BattleState, Team } from './types.ts';
import { UNIT_DEFS } from './units.ts';

export interface Spawn {
  id: string;
  def: string;
  team: Team;
  x: number;
  y: number;
}

// Cenário = mapa + quem nasce onde. É dado puro; o BattleState guarda só o id para o mapa não ir no save.
export interface Scenario {
  id: string;
  name: string;
  en: string;
  grid: Grid;
  spawns: Spawn[];
}

// Escaramuça 8x8 para testes e simulação rápida: um morro com floresta no centro, um muro e o farol no fundo.
const SKIRMISH: Scenario = {
  id: 'skirmish',
  name: 'Escaramuça',
  en: 'Skirmish',
  grid: parseGrid(
    ['........', '..T.....', '....#...', '...T....', '........', '.T......', '........', '........'],
    ['00000000', '00001000', '00112100', '00122100', '00011000', '00000000', '00000000', '00000000'],
  ),
  spawns: [
    { id: 'beacon', def: 'beacon', team: 'hero', x: 1, y: 6 },
    { id: 'h-warrior', def: 'warrior', team: 'hero', x: 2, y: 5 },
    { id: 'h-archer', def: 'archer', team: 'hero', x: 0, y: 6 },
    { id: 'h-mage', def: 'mage', team: 'hero', x: 1, y: 7 },
    { id: 'h-rogue', def: 'rogue', team: 'hero', x: 3, y: 6 },
    { id: 'e-soldier', def: 'soldier', team: 'enemy', x: 5, y: 0 },
    { id: 'e-archer', def: 'skeleton_archer', team: 'enemy', x: 7, y: 1 },
    { id: 'e-mage', def: 'dark_mage', team: 'enemy', x: 6, y: 0 },
    { id: 'e-brute', def: 'brute', team: 'enemy', x: 4, y: 1 },
  ],
};

export const SCENARIOS: Record<string, Scenario> = Object.fromEntries([SKIRMISH].map((s) => [s.id, s]));

// ct inicial 0 para todos: a ordem do começo sai só das velocidades
export function initialState(scenario: Scenario, seed: number): BattleState {
  return {
    scenario: scenario.id,
    units: scenario.spawns.map((s) => ({ id: s.id, def: s.def, team: s.team, pos: { x: s.x, y: s.y }, hp: UNIT_DEFS[s.def].hp, ct: 0 })),
    rng: seed | 0,
    turn: { actor: '', moved: false, usedAbility: null },
    outcome: 'ongoing',
    turnsPlayed: 0,
  };
}
