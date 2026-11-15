// Dungeon crawl rooms (Nov 15, Fernando: the new dungeon loop, a mode apart from Beacon Ashes, with procedural rooms).
// The groups, the boss and the sizes come from the Mechanics lab's descent proposal of Nov 15 (dungeon-tactics-labs,
// web/src/content/mecanicas/descida.json): 1 to 3 enemies worth 64 to 102 life in total, about 5 to 8 hero turns
// at ~12.8 enemy life per hero turn (a deduction from the Skirmish measure, not a measured room). Tune by playing.
import type { CrawlTheme, RoomGroup } from '../../shared/crawl/generate.ts';

// who enters the room: the four starting classes with their whole kit (the Beacon Ashes party stays with its campaign)
export const CRAWL_PARTY = ['warrior', 'archer', 'mage', 'rogue'];

// one group per room, drawn among those of the room's depth (deeper than the table: the deepest)
export const CRAWL_GROUPS: RoomGroup[] = [
  { name: ['Patrulha de lacaios', 'Minion patrol'], depth: 1, enemies: ['minion', 'minion', 'minion'] },
  { name: ['Arqueiro e escolta', 'Archer and escort'], depth: 1, enemies: ['minion', 'minion', 'skeleton_archer'] },
  { name: ['Mago na retaguarda', 'Mage at the rear'], depth: 2, enemies: ['soldier', 'dark_mage'] },
  { name: ['Cavaleiro e arqueiro', 'Knight and archer'], depth: 2, enemies: ['veil_knight', 'skeleton_archer'] },
  { name: ['Bruto sozinho', 'Lone brute'], depth: 2, enemies: ['brute'] },
  { name: ['Acólito que cura', 'Healing acolyte'], depth: 3, enemies: ['soldier', 'acolyte'] },
  { name: ['Tropa do Véu', 'Veil troop'], depth: 3, enemies: ['veil_knight', 'acolyte', 'minion'] },
];
// the boss room at any depth: the Colossus (2x2, does not walk) and two minions, 208 life, about 16 hero turns
export const CRAWL_BOSS: RoomGroup = {
  name: ['Colosso de Ossos', 'Bone Colossus'],
  depth: 1,
  enemies: ['colossus', 'minion', 'minion'],
};

// Look only (decision 39 of Nov 15: no destination rules yet): the floor by height level and the obstacles of each place
export const CRAWL_THEMES: Record<string, CrawlTheme> = {
  dungeon: {
    name: ['Masmorra', 'Dungeon'],
    floors: ['crypt', 'crypt', 'altar', 'altar'],
    props: [
      { terrain: 'wall', look: 'pillar' },
      { terrain: 'wall', look: 'pillar' },
      { terrain: 'wall', look: 'crates' },
      { terrain: 'wall', look: 'barrel' },
      { terrain: 'rubble', look: 'rubble' },
    ],
    hazard: { terrain: 'floor', look: 'spikes', spikes: true },
  },
  forest: {
    name: ['Floresta', 'Forest'],
    floors: ['grass'],
    props: [
      { terrain: 'forest', look: 'tree2' },
      { terrain: 'forest', look: 'tree3' },
      { terrain: 'forest', look: 'tree4' },
      { terrain: 'wall', look: 'rock' },
    ],
  },
  mountain: {
    name: ['Montanha', 'Mountain'],
    floors: ['snow', 'snow', 'snow', 'summit'],
    props: [
      { terrain: 'forest', look: 'bare1' },
      { terrain: 'forest', look: 'bare2' },
      { terrain: 'wall', look: 'snow_rock' },
      { terrain: 'wall', look: 'snow_rock' },
    ],
  },
};
