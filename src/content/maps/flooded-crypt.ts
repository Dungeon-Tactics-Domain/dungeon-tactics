import { type Tile, withRamps } from '../../shared/battle/grid.ts';
import type { Scenario } from '../../shared/battle/scenarios.ts';

// Flooded Crypt (Nov 12, Fernando's request: a dungeon map with the KayKit pieces): 14x14, enclosed. The enemies
// guard a raised altar at the back (from 3 to 4, in `CRYPT_H`); in the middle, a shallow-water canal (BMG 6.5: entering costs 2 movement) with
// two bridges; columns, crates, barrels and the chest block; rubble is walkable cover; brick walls close passages.
// One letter per tile says terrain, height and look (drawing only, the rules read the terrain, the height and the depth):
export const CRYPT_KEY: Record<
  string,
  { terrain: Tile['terrain']; h: number; look: string; depth?: number; spikes?: true }
> = {
  f: { terrain: 'floor', h: 1, look: 'crypt' },
  d: { terrain: 'floor', h: 2, look: 'altar' },
  // surface at 1 and foot at 0 (Nov 13): with the surface at 0 the foot sat at -1, 2 below the banks, and nobody entered the canal
  w: { terrain: 'floor', h: 0, look: 'water', depth: 1 },
  W: { terrain: 'floor', h: 0, look: 'water', depth: 2 }, // deep moat of the Crypt Heart: the bridges, or swimming without acting (Nov 13)
  b: { terrain: 'floor', h: 1, look: 'bridge' },
  B: { terrain: 'wall', h: 1, look: 'brick' },
  p: { terrain: 'wall', h: 1, look: 'pillar' },
  P: { terrain: 'wall', h: 2, look: 'pillar' },
  c: { terrain: 'wall', h: 1, look: 'crates' },
  r: { terrain: 'wall', h: 1, look: 'barrel' },
  x: { terrain: 'wall', h: 2, look: 'chest' },
  u: { terrain: 'rubble', h: 1, look: 'rubble' },
  s: { terrain: 'floor', h: 1, look: 'spikes', spikes: true }, // night of Nov 12: pushing someone here hurts
};
const CRYPT_MAP = [
  'ddddddxddddddd',
  'dPdddddddddddP',
  'dddddddddddddd',
  'BBffffffffffBB',
  'ffcfffssffffrf',
  'fffuffffffufff',
  'wwwbbwwwwbbwww',
  'wwwbbwwwwbbwww',
  'ffffuffffuffff',
  'fpffffssffffpf',
  'ffBBBffffBBBff',
  'ffffffffffffff',
  'rfffffffffffcf',
  'ffffffffffffff',
];
const CRYPT_H = [
  '44444444444444',
  '44443333334444',
  '33331111113333',
  '22222222222222',
  '22211111111222',
  '11111111111111',
  '00000000000000',
  '00000000000000',
  '11111111111111',
  '11111111111111',
  '22111111111122',
  '21100000000112',
  '21100000000112',
  '22100000000122',
];
// stairs (Nov 13; in the crypts the ramp becomes a staircase in the drawing): those at the altar's sides, those that climb to the high middle strip
// and those that leave the heroes' pit
const CRYPT_RAMPS = [
  '..............',
  '..............',
  '..^^......^^..',
  '..^^......^^..',
  '....^^..^^....',
  '..............',
  '..............',
  '..............',
  '..............',
  '..............',
  '..............',
  '...<.^^^^.>...',
  '...<......>...',
  '..<<......>>..',
];
export const FLOODED_CRYPT: Scenario = {
  id: 'flooded_crypt',
  name: 'Cripta Alagada',
  en: 'Flooded Crypt',
  grid: withRamps(
    {
      width: CRYPT_MAP[0].length,
      height: CRYPT_MAP.length,
      // height per tile kept separately (Nov 13, "stages too flat"): altar at 4 levels, the middle drops 2 (you go down by the stairs
      // at the sides) and the heroes' side sinks next to the Beacon. Water and bridge keep their own height
      tiles: CRYPT_MAP.flatMap((row, y) =>
        [...row].map((c, x) => ({ ...CRYPT_KEY[c], ...('wWb'.includes(c) ? {} : { h: Number(CRYPT_H[y][x]) }) })),
      ),
    },
    CRYPT_RAMPS,
  ),
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
