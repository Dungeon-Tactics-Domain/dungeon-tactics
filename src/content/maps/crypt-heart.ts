import { withRamps } from '../../shared/battle/grid.ts';
import type { Scenario } from '../../shared/battle/scenarios.ts';
import { CRYPT_KEY } from './flooded-crypt.ts';

// Crypt Heart (night of Nov 12, campaign stage 4, which used to repeat the Flooded Crypt): 12x12, the same pieces.
// The boss waits on a raised altar at the back, behind a deep moat crossed by the two narrow bridges (or by swimming, without acting, since Nov 13); a 2nd canal in the middle
// has a dry passage in the center guarded by spikes. The heroes bring the crystal (the Beacon) to light the crypt.
const HEART_MAP = [
  'BBBddddddBBB',
  'BPddddddddPB',
  'BddddddddddB',
  'WWWbWWWWbWWW',
  'fsffuffuffsf',
  'ffpffffffpff',
  'ffffcffrffff',
  'wwbwwffwwbww',
  'fffffssfffff',
  'fpffffffffpf',
  'ffffffffffff',
  'ffuffffffuff',
  'ffffffffffff',
  'BBffffffffBB',
];
// relief (Nov 13, "stages too flat"): altar at 3 with steps of 2; middle island at 3 with drops of 2 at the edges (only the dry
// passage and the bridges climb); high edges at the heroes' sides for the archers. Water and bridge keep their own
// height. The altar height decides the stage (stage 4, MEASURE=300): throne at 5 gave 2% victory, a whole altar at 4 gave 7%,
// at 3 with the archer at 2 gave 42% (between stage 3 and 5)
const HEART_H = [
  '333333333333',
  '332232232233',
  '322222222223',
  '000000000000',
  '211222222112',
  '212333333212',
  '211322223112',
  '000001100000',
  '111111111111',
  '221111111122',
  '322111111223',
  '321111111123',
  '321111111123',
  '332111111233',
];
// stairs (Nov 13): the dry passage from the middle to the island, the exit from the bridges to the island and those at the heroes' sides
const HEART_RAMPS = [
  '............',
  '............',
  '............',
  '............',
  '...v....v...',
  '............',
  '.....^^.....',
  '.....^^.....',
  '............',
  '............',
  '.<........>.',
  '.<........>.',
  '.<........>.',
  '...<....>...',
];
export const CRYPT_HEART: Scenario = {
  id: 'crypt_heart',
  name: 'Coração da Cripta',
  en: 'Heart of the Crypt',
  grid: withRamps(
    {
      width: HEART_MAP[0].length,
      height: HEART_MAP.length,
      tiles: HEART_MAP.flatMap((row, y) =>
        [...row].map((c, x) => ({ ...CRYPT_KEY[c], ...('wWb'.includes(c) ? {} : { h: Number(HEART_H[y][x]) }) })),
      ),
    },
    HEART_RAMPS,
  ),
  spawns: [
    { id: 'beacon', def: 'beacon', team: 'hero', x: 5, y: 13 },
    { id: 'h-warrior', def: 'warrior', team: 'hero', x: 4, y: 11 },
    { id: 'h-archer', def: 'archer', team: 'hero', x: 6, y: 12 },
    { id: 'h-mage', def: 'mage', team: 'hero', x: 6, y: 13 },
    { id: 'h-rogue', def: 'rogue', team: 'hero', x: 7, y: 11 },
    { id: 'e-mage', def: 'dark_mage', team: 'enemy', x: 6, y: 0 }, // 1st enemy tile: the stage boss (campaign.ts), at the back
    { id: 'e-soldier', def: 'soldier', team: 'enemy', x: 3, y: 2 }, // the others guard the two bridges
    { id: 'e-archer', def: 'skeleton_archer', team: 'enemy', x: 5, y: 1 },
    // 2nd archer in place of the Brute (Nov 13, standalone Battle only; the campaign puts its own cast on these tiles): with the gap the
    // Rogue AI flew the moat alone and fell on the Brute, 25%; with the archer 60% (with a Soldier, 97%)
    { id: 'e-archer2', def: 'skeleton_archer', team: 'enemy', x: 8, y: 2 },
  ],
};
