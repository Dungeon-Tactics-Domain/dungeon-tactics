import { parseGrid } from '../../shared/battle/grid.ts';
import type { Scenario } from '../../shared/battle/scenarios.ts';

// 8x8 Skirmish for tests and quick simulation: a hill with forest in the center, a wall and the beacon at the back.
export const SKIRMISH: Scenario = {
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
