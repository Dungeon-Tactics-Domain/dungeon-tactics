import { type Tile, withRamps } from '../../shared/battle/grid.ts';
import type { Scenario } from '../../shared/battle/scenarios.ts';

// Ash Wood (night of Nov 12, campaign stage 1): 12x12 without a Beacon (last one standing wins). A deep river cuts the
// map: you cross by the bridge (left; 3 tiles wide since Nov 13, with rubble in the middle), by the shallow-water ford (right, costs 2 movement) or by swimming (since Nov 13, without acting). On the
// heroes' side, the sand road and the stopped caravan (crates and barrels); on the enemies' side, a little hill of tall grass.
const WOOD_KEY: Record<string, { terrain: Tile['terrain']; h: number; look: string; depth?: number; noStop?: true }> = {
  g: { terrain: 'floor', h: 0, look: 'grass' },
  G: { terrain: 'floor', h: 1, look: 'grass' },
  s: { terrain: 'floor', h: 0, look: 'sand' },
  t: { terrain: 'forest', h: 0, look: 'tree' },
  T: { terrain: 'forest', h: 0, look: 'tree2' },
  y: { terrain: 'forest', h: 1, look: 'tree3' },
  W: { terrain: 'floor', h: 0, look: 'water', depth: 2 },
  // surface at 1 and foot at 0, as in the Crypt (Nov 13, review): at 0 the foot sat at -1 and only Jump 2 left the ford
  w: { terrain: 'floor', h: 0, look: 'water', depth: 1 },
  b: { terrain: 'floor', h: 1, look: 'bridge' },
  // rubble in the middle of the bridge (Nov 13, Fernando's request: "bridge 3 tiles wide and it can have some rubble in the middle"):
  // walkable cover, like the crypt rubble; the drawing is the caravan's remains on top of the planks (props.ts)
  B: { terrain: 'rubble', h: 1, look: 'bridge' },
  r: { terrain: 'wall', h: 1, look: 'rock' },
  c: { terrain: 'wall', h: 0, look: 'crates' }, // on the ground: the caravan's cargo fallen on the road, not on top of a block
  x: { terrain: 'wall', h: 0, look: 'barrel' },
  // caravan body (Nov 13, Fernando's request: "bodies around the resources to say it was the skeletons that
  // killed them"): the drawing is the fallen model (scene.ts)
  k: { terrain: 'floor', h: 0, look: 'corpse', noStop: true }, // you pass over it, do not stop on it (grid.ts noStop)
};
// without the trees at 1,0, 11,1 and 10,2 (Nov 13): with impassable trees, the two top corners became closed pockets
// road (Nov 13, Fernando's request: "a road that passes through the bridge, lower the relief to allow the road"): the
// sand one on the heroes' side continues after the bridge, in a cut that rises as a ramp to the enemy plateau (columns 3 and 4).
// Crates, barrels and bodies scattered on both sides (Nov 13, Fernando's request: at the bridge entrance it became a clump)
const WOOD_MAP = [
  'gggssGGggctg',
  'tgGssGGkTggg',
  'gxGssggggggg',
  'gtgssggrggtg',
  'WWbBbWWWWwwW',
  'WWbbbWWWWwwW',
  'gtgssgggtssg',
  'ggssggggssgT',
  'tgsssskssxgg',
  'ggsgggtcgsgt',
  'gTskggggggyg',
  'ggsggggTgggg',
];
const WOOD_H = [
  '443333333344',
  '443223333344',
  '222112221222',
  '221110001122',
  '000000000000',
  '000000000000',
  '000000000000',
  '100000000001',
  '210000000012',
  '211000000112',
  '221100001122',
  '321110011123',
];
// ramps (Nov 13): the climbs from the north bank to the enemy plateau and those from the south bank to the heroes' high corners
const WOOD_RAMPS = [
  '..<.........',
  '..<^^....>..',
  '..^^^^^^.^..',
  '..^......^..',
  '............',
  '............',
  'v.^^^.......',
  '..........v.',
  '..........>.',
  '.<..........',
  'v......>...v',
  '.<<..<...>>.',
];
export const ASH_WOOD: Scenario = {
  id: 'ash_wood',
  name: 'Bosque das Cinzas',
  en: 'Ash Wood',
  // height of each tile on a separate map (Nov 13, Fernando's request: "stages too flat"; relief reference: Gariland
  // has 47% of neighbors with a drop of 2+, the Wood had 0%): the enemy camp on a plateau 3 levels above the river (4 in the corners),
  // steps of 1 that make ramps and drops of 2 that force you to go around. Water and bridge keep their own height.
  grid: withRamps(
    {
      width: 12,
      height: 12,
      tiles: WOOD_MAP.flatMap((row, y) =>
        [...row].map((c, x) => ({ ...WOOD_KEY[c], ...('WwbB'.includes(c) ? {} : { h: Number(WOOD_H[y][x]) }) })),
      ),
    },
    WOOD_RAMPS,
  ),
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
