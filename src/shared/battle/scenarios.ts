import { parseGrid, type Grid } from './grid.ts';
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

// Cenário = mapa + quem nasce onde. É dado puro; o BattleState guarda só o id para o mapa não ir no save.
export interface Scenario {
  id: string;
  name: string;
  en: string;
  grid: Grid;
  spawns: Spawn[];
  rules?: Rules; // só o cenário de estudo troca regra; os do jogo não têm
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

// A 1ª batalha (marco 3, liberado pelo Fernando em 11/11): mapa 20x20. Os heróis e o farol nascem no morro do canto de
// baixo, os inimigos no platô do canto de cima; no meio, uma colina de 3 níveis com muros e floresta dá posição alta
// e cobertura para disputar. Só rampas de 1 nível: todo canto se alcança a pé.
export const FIRST_BATTLE: Scenario = {
  id: 'beacon_hill',
  name: 'Colina do Farol',
  en: 'Beacon Hill',
  grid: parseGrid(
    [
      '....................',
      '..............T.....',
      '....T......#........',
      '...........#...T....',
      '.......T............',
      '..#.........T.......',
      '..#....TT......##...',
      '........T...........',
      '.....T......#.......',
      '............#...T...',
      '...T................',
      '......##......T.....',
      '..........T.........',
      '.T.......TT....#....',
      '...............#....',
      '......T.............',
      '..T.........T.......',
      '........#...........',
      '....T...#......T....',
      '....................',
    ],
    [
      '00000000001111100000',
      '00000000011222110000',
      '00000000012232110000',
      '00001100012222100000',
      '00011110001111000000',
      '00012210000000000000',
      '00011100001110000000',
      '00000000012221000000',
      '00000000123321000000',
      '00000001233321000000',
      '00000001223221000000',
      '00000000122210001100',
      '00000000011100012210',
      '00110000000000012210',
      '01221000000000001100',
      '01221000000000000000',
      '00110000001110000000',
      '00000000012210000000',
      '00000000011100000000',
      '00000000000000000000',
    ],
  ),
  spawns: [
    { id: 'beacon', def: 'beacon', team: 'hero', x: 2, y: 15 },
    { id: 'h-warrior', def: 'warrior', team: 'hero', x: 4, y: 14 },
    { id: 'h-archer', def: 'archer', team: 'hero', x: 3, y: 16 },
    { id: 'h-mage', def: 'mage', team: 'hero', x: 1, y: 16 },
    { id: 'h-rogue', def: 'rogue', team: 'hero', x: 5, y: 15 },
    { id: 'e-soldier', def: 'soldier', team: 'enemy', x: 14, y: 4 },
    { id: 'e-archer', def: 'skeleton_archer', team: 'enemy', x: 16, y: 2 },
    { id: 'e-mage', def: 'dark_mage', team: 'enemy', x: 17, y: 3 },
    { id: 'e-brute', def: 'brute', team: 'enemy', x: 15, y: 5 },
  ],
};

export const SCENARIOS: Record<string, Scenario> = Object.fromEntries([SKIRMISH, FIRST_BATTLE].map((s) => [s.id, s]));

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
