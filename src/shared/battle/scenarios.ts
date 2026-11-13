import { parseGrid, type Grid, type Tile } from './grid.ts';
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

// Aparência por casa da Colina do Farol (só desenho, as regras não leem; 12/11, proposta aprovada pelo Fernando): o lado
// dos inimigos (canto de cima à direita, x - y >= 7) fica na neve para ler de longe de que lado cada time começa; a colina
// do meio é rocha, com o topo escuro; areia em volta do Farol e ouro embaixo dele; muro de tijolo; 4 árvores sorteadas
// pela posição (fixo: o mesmo mapa sempre desenha igual).
function dressBeaconHill(grid: Grid, beacon: { x: number; y: number }): Grid {
  const tiles = grid.tiles.map((t, i) => {
    const x = i % grid.width, y = Math.floor(i / grid.width);
    const cold = x - y >= 7;
    const near = Math.abs(x - beacon.x) + Math.abs(y - beacon.y);
    const look =
      t.terrain === 'wall' ? 'brick'
      : t.terrain === 'forest' ? (cold ? ((x + y) % 2 ? 'bare1' : 'bare2') : ['tree', 'tree2', 'tree3', 'tree4'][(x * 7 + y * 3) % 4])
      : near === 0 ? 'gold'
      : near <= 2 ? 'sand'
      : cold ? (t.h >= 2 ? 'snow_rock' : 'snow')
      : t.h >= 3 ? 'summit'
      : t.h >= 2 ? 'rock'
      : 'grass';
    return { ...t, look };
  });
  return { ...grid, tiles };
}

// A 1ª batalha (marco 3, liberado pelo Fernando em 11/11): mapa 20x20. Os heróis e o farol nascem no morro do canto de
// baixo, os inimigos no platô do canto de cima; no meio, uma colina de 3 níveis com muros e floresta dá posição alta
// e cobertura para disputar. Só rampas de 1 nível: todo canto se alcança a pé.
export const FIRST_BATTLE: Scenario = {
  id: 'beacon_hill',
  name: 'Colina do Farol',
  en: 'Beacon Hill',
  grid: dressBeaconHill(
    parseGrid(
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
    { x: 2, y: 15 }, // casa do Farol (spawn "beacon")
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

// Cripta Alagada (12/11, pedido do Fernando: um mapa de masmorra com as peças KayKit): 14x14 fechado. Os inimigos
// guardam um altar elevado (nível 2) no fundo; no meio, um canal de água rasa (BMG 6.5: entrar custa 2 de movimento) com
// duas pontes; colunas, caixotes, barris e o baú bloqueiam; entulho é cobertura pisável; muros de tijolo fecham passagens.
// Uma letra por casa diz terreno, altura e aparência (só desenho, as regras leem o terreno, a altura e a profundidade):
const CRYPT_KEY: Record<string, { terrain: Tile['terrain']; h: number; look: string; depth?: number }> = {
  f: { terrain: 'floor', h: 1, look: 'crypt' },
  d: { terrain: 'floor', h: 2, look: 'altar' },
  w: { terrain: 'floor', h: 0, look: 'water', depth: 1 },
  b: { terrain: 'floor', h: 1, look: 'bridge' },
  B: { terrain: 'wall', h: 1, look: 'brick' },
  p: { terrain: 'wall', h: 1, look: 'pillar' },
  P: { terrain: 'wall', h: 2, look: 'pillar' },
  c: { terrain: 'wall', h: 1, look: 'crates' },
  r: { terrain: 'wall', h: 1, look: 'barrel' },
  x: { terrain: 'wall', h: 2, look: 'chest' },
  u: { terrain: 'forest', h: 1, look: 'rubble' },
};
const CRYPT_MAP = [
  'ddddddxddddddd',
  'dPdddddddddddP',
  'dddddddddddddd',
  'BBffffffffffBB',
  'ffcfffffffffrf',
  'fffuffffffufff',
  'wwwbbwwwwbbwww',
  'wwwbbwwwwbbwww',
  'ffffuffffuffff',
  'fpffffffffffpf',
  'ffBBBffffBBBff',
  'ffffffffffffff',
  'rfffffffffffcf',
  'ffffffffffffff',
];
const CRYPT: Scenario = {
  id: 'flooded_crypt',
  name: 'Cripta Alagada',
  en: 'Flooded Crypt',
  grid: {
    width: CRYPT_MAP[0].length,
    height: CRYPT_MAP.length,
    tiles: CRYPT_MAP.flatMap((row) => [...row].map((c) => ({ ...CRYPT_KEY[c] }))),
  },
  spawns: [
    { id: 'beacon', def: 'beacon', team: 'hero', x: 6, y: 13 },
    { id: 'h-warrior', def: 'warrior', team: 'hero', x: 5, y: 11 },
    { id: 'h-archer', def: 'archer', team: 'hero', x: 8, y: 12 },
    { id: 'h-mage', def: 'mage', team: 'hero', x: 7, y: 13 },
    { id: 'h-rogue', def: 'rogue', team: 'hero', x: 9, y: 11 },
    { id: 'e-soldier', def: 'soldier', team: 'enemy', x: 5, y: 2 },
    { id: 'e-archer', def: 'skeleton_archer', team: 'enemy', x: 8, y: 1 },
    { id: 'e-mage', def: 'dark_mage', team: 'enemy', x: 10, y: 2 },
    { id: 'e-brute', def: 'brute', team: 'enemy', x: 3, y: 2 },
  ],
};

// Bosque das Cinzas (noite de 12/11, fase 1 da campanha): 12x12 sem Farol (vence quem sobrar). Um rio fundo corta o
// mapa: só se passa pela ponte (esquerda, estreita) ou pelo vau de água rasa (direita, custa 2 de movimento). Do lado dos
// heróis, a estrada de areia e a caravana parada (caixotes e barris); do lado dos inimigos, um morrinho de grama alta.
const WOOD_KEY: Record<string, { terrain: Tile['terrain']; h: number; look: string; depth?: number }> = {
  g: { terrain: 'floor', h: 0, look: 'grass' },
  G: { terrain: 'floor', h: 1, look: 'grass' },
  s: { terrain: 'floor', h: 0, look: 'sand' },
  t: { terrain: 'forest', h: 0, look: 'tree' },
  T: { terrain: 'forest', h: 0, look: 'tree2' },
  y: { terrain: 'forest', h: 1, look: 'tree3' },
  W: { terrain: 'floor', h: 0, look: 'water', depth: 2 },
  w: { terrain: 'floor', h: 0, look: 'water', depth: 1 },
  b: { terrain: 'floor', h: 1, look: 'bridge' },
  r: { terrain: 'wall', h: 1, look: 'rock' },
  c: { terrain: 'wall', h: 0, look: 'crates' }, // no chão: a carga da caravana caída na estrada, não em cima de bloco
  x: { terrain: 'wall', h: 0, look: 'barrel' },
};
const WOOD_MAP = [
  'gtgggGGgggtg',
  'tgGGgGGgTggt',
  'ggGGrgggggTg',
  'gtgggggrggtg',
  'WWWbbWWWWwwW',
  'WWWbbWWWWwwW',
  'gtgssgggtssg',
  'ggcsxgggssgT',
  'tgsssssssggg',
  'ggsgcgtggsgt',
  'gTsgggggggyg',
  'ggsggggTgggg',
];
const ASH_WOOD: Scenario = {
  id: 'ash_wood',
  name: 'Bosque das Cinzas',
  en: 'Ash Wood',
  grid: { width: 12, height: 12, tiles: WOOD_MAP.flatMap((row) => [...row].map((c) => ({ ...WOOD_KEY[c] }))) },
  spawns: [
    { id: 'h-warrior', def: 'warrior', team: 'hero', x: 3, y: 11 },
    { id: 'h-archer', def: 'archer', team: 'hero', x: 5, y: 10 },
    { id: 'h-mage', def: 'mage', team: 'hero', x: 6, y: 11 },
    { id: 'h-rogue', def: 'rogue', team: 'hero', x: 8, y: 10 },
    { id: 'e-soldier', def: 'soldier', team: 'enemy', x: 2, y: 0 },
    { id: 'e-archer', def: 'skeleton_archer', team: 'enemy', x: 5, y: 1 },
    { id: 'e-mage', def: 'dark_mage', team: 'enemy', x: 8, y: 0 },
    { id: 'e-brute', def: 'brute', team: 'enemy', x: 9, y: 2 },
  ],
};

// Passo Gelado (noite de 12/11, Ato II da campanha): 12x14 sem Farol, subida em degraus de 1 nível (o salto máximo) da
// neve baixa dos heróis (altura 0) até o cume dos inimigos (3), entre paredões; um lago raso congelado no meio da
// encosta e árvores secas como cobertura. Inimigo no alto enxerga e alcança mais (bônus de altura): subir é o desafio.
const PASS_KEY: Record<string, { terrain: Tile['terrain']; h: number; look: string; depth?: number }> = {
  n: { terrain: 'floor', h: 0, look: 'snow' },
  N: { terrain: 'floor', h: 1, look: 'snow' },
  M: { terrain: 'floor', h: 2, look: 'snow' },
  S: { terrain: 'floor', h: 3, look: 'summit' },
  i: { terrain: 'floor', h: 1, look: 'water', depth: 1 },
  k: { terrain: 'forest', h: 0, look: 'bare1' },
  K: { terrain: 'forest', h: 1, look: 'bare2' },
  r: { terrain: 'wall', h: 1, look: 'snow_rock' },
  R: { terrain: 'wall', h: 2, look: 'snow_rock' },
};
const PASS_MAP = [
  'RRSSSSSSSSRR',
  'RRSSSMMSSSRR',
  'RrMMMMMMMMrR',
  'RrMMKMMKMMrR',
  'RRrNNNNNNrRR',
  'RRrNNiiNNrRR',
  'RrNNNiiNNNrR',
  'RrNKNNNNKNrR',
  'RRnnnNNnnnRR',
  'RrnnnnnnnnrR',
  'Rnnknnnnknnr',
  'Rnnnnnnnnnnr',
  'rnnnnnnnnnnr',
  'rnnnnnnnnnnr',
];
const FROST_PASS: Scenario = {
  id: 'frost_pass',
  name: 'Passo Gelado',
  en: 'Frost Pass',
  grid: { width: 12, height: 14, tiles: PASS_MAP.flatMap((row) => [...row].map((c) => ({ ...PASS_KEY[c] }))) },
  spawns: [
    { id: 'h-warrior', def: 'warrior', team: 'hero', x: 4, y: 13 },
    { id: 'h-archer', def: 'archer', team: 'hero', x: 5, y: 12 },
    { id: 'h-mage', def: 'mage', team: 'hero', x: 6, y: 13 },
    { id: 'h-rogue', def: 'rogue', team: 'hero', x: 7, y: 12 },
    { id: 'e-soldier', def: 'soldier', team: 'enemy', x: 3, y: 0 },
    { id: 'e-archer', def: 'skeleton_archer', team: 'enemy', x: 5, y: 0 },
    { id: 'e-mage', def: 'dark_mage', team: 'enemy', x: 7, y: 0 },
    { id: 'e-brute', def: 'brute', team: 'enemy', x: 8, y: 1 },
  ],
};

export const SCENARIOS: Record<string, Scenario> = Object.fromEntries([SKIRMISH, FIRST_BATTLE, CRYPT, ASH_WOOD, FROST_PASS].map((s) => [s.id, s]));

// ct inicial 0 para todos: a ordem do começo sai só das velocidades
export function initialState(scenario: Scenario, seed: number): BattleState {
  return {
    scenario: scenario.id,
    units: scenario.spawns.map((s) => ({
      id: s.id, def: s.def, team: s.team, pos: { x: s.x, y: s.y }, hp: UNIT_DEFS[s.def].hp, ct: 0,
      // direção e contadores só nascem em cenário que pede: o estado dos mapas do jogo fica igual
      ...(scenario.rules?.facing && { facing: s.team === 'hero' ? 0 : 2 }),
      ...(UNIT_DEFS[s.def].vars && { vars: { ...UNIT_DEFS[s.def].vars } }),
    })),
    rng: seed | 0,
    turn: { actor: '', moved: false, usedAbility: null },
    charges: [],
    outcome: 'ongoing',
    turnsPlayed: 0,
  };
}
