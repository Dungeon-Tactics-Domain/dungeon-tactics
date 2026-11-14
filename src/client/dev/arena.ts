// Animation arena of the sandbox bench (docs/sandbox.md, ?scenario=arena): a small test map, one feature per row, for the
// Mechanics lab to watch a body climb, drop, leap, bump and step on spikes. Dev only: it lives in the sandbox chunk and is
// registered when a sandbox page asks for it, never in MAPS, so the game can never open it.
import type { Tile } from '../../shared/battle/grid.ts';
import type { Scenario } from '../../shared/battle/scenarios.ts';

const KEY: Record<string, Tile> = {
  '.': { terrain: 'floor', h: 0, look: 'grass' },
  '~': { terrain: 'floor', h: 0, look: 'water', depth: 2 }, // deep: a 1-tile gap to leap
  '^': { terrain: 'floor', h: 0, look: 'spikes', spikes: true },
  '#': { terrain: 'wall', h: 1, look: 'rock' }, // a push into it bumps
};
// row 0, the stairs: up 1 (x1 > x2), up 2 (x3 > x4), up 3 (x5 > x6), then down 2 (x7 > x8); the other rows are flat
const MAP = ['............', '............', '.....~......', '............', '...^.......#', '............'];
const STAIRS = [0, 0, 1, 1, 3, 3, 6, 6, 4, 4, 4, 4];

export const ARENA: Scenario = {
  id: 'arena',
  name: 'Arena',
  en: 'Arena',
  grid: {
    width: 12,
    height: 6,
    tiles: MAP.flatMap((row, y) => [...row].map((c, x) => ({ ...KEY[c], ...(y === 0 && { h: STAIRS[x] }) }))),
  },
  // one of each side keeps the battle going (the last side standing wins); parked out of the lanes, `add` brings the cast
  spawns: [
    { id: 'a-hero', def: 'warrior', team: 'hero', x: 0, y: 3 },
    { id: 'a-foe', def: 'soldier', team: 'enemy', x: 11, y: 3 },
  ],
};
