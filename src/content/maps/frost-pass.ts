import { type Tile, withRamps } from '../../shared/battle/grid.ts';
import type { Scenario } from '../../shared/battle/scenarios.ts';

// Frost Pass (night of Nov 12, campaign Act II): 12x14 without a Beacon, a climb from the
// heroes' low snow to the enemies' summit, between cliff walls (heights in `PASS_H`); a shallow frozen lake in the middle of the
// slope and dry trees as cover. An enemy up high sees and reaches farther (height bonus): climbing is the challenge.
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
// relief (Nov 13, "stages too flat"): the climb becomes a zigzag, on each landing one side rises by a step and the other drops
// as a cliff of 2 (you climb on the left to the middle, on the right to the top, on the left again to the summit);
// the lake sits in a basin and the cliff walls rise above the path. The lake keeps its own height. Summit at 4 and the heroes' valley
// at 1 (stage 7, MEASURE=300): summit at 5 with the valley at 0 left the Colossus up high with 4% hero victory
const PASS_H = [
  '664444444466',
  '664443344466',
  '654333334456',
  '654333334456',
  '664332222466',
  '664321112466',
  '653221112235',
  '541122221145',
  '441112211144',
  '432111111234',
  '322111111223',
  '322111111223',
  '322111111223',
  '322111111223',
];
// ramps (Nov 13): the zigzag's steps become the climb of the path; the cliffs of 2 stay
const PASS_RAMPS = [
  '............',
  '............',
  '....^.......',
  '...<........',
  '......^.....',
  '............',
  '............',
  '.........^..',
  '..v......v..',
  '...<.^^.>...',
  '............',
  '...<....>...',
  '...<....>...',
  '...<....>...',
];
export const FROST_PASS: Scenario = {
  id: 'frost_pass',
  name: 'Passo Gelado',
  en: 'Frost Pass',
  grid: withRamps(
    {
      width: 12,
      height: 14,
      tiles: PASS_MAP.flatMap((row, y) =>
        [...row].map((c, x) => ({ ...PASS_KEY[c], ...(c === 'i' ? {} : { h: Number(PASS_H[y][x]) }) })),
      ),
    },
    PASS_RAMPS,
  ),
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
