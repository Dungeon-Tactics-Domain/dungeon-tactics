// Dungeon crawl rooms (Nov 15, Fernando: the new dungeon loop, a mode apart from Beacon Ashes, with procedural rooms).
// The groups, the boss and the sizes come from the Mechanics lab's descent proposal of Nov 15 (dungeon-tactics-labs,
// web/src/content/mecanicas/descida.json): 1 to 3 enemies worth 64 to 102 life in total, about 5 to 8 hero turns
// at ~12.8 enemy life per hero turn (a deduction from the Skirmish measure, not a measured room). Since the x5 of life and
// damage (Nov 15) the same groups are worth 320 to 510 at ~64 per hero turn. Tune by playing.
import type { CrawlTheme, RoomGroup } from '../../shared/crawl/generate.ts';

// who the room is laid out and checked for, and who enters a ?crawl room: the four starting classes with their whole kit;
// an expedition puts the town's party on these spawns (game/crawl.ts castRoom)
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
// the boss room, once at the end of the expedition: the Colossus (2x2, does not walk) and one minion, 184 life (920 since
// the x5) (Fernando, Nov 15: one boss, at the end of the expedition, with the Colossus and one minion), about 14 hero turns
// plus 2 or 3 to walk in (the lab's descida.json: with two minions on the bigger room it ran past 18)
export const CRAWL_BOSS: Omit<RoomGroup, 'depth'> = {
  name: ['Colosso de Ossos', 'Bone Colossus'],
  enemies: ['colossus', 'minion'],
};

// Look only: the floor by height level, the obstacles, the border and the road of each place, all drawn on the smooth
// painted ground like Ash Wood (Nov 15, Fernando: the rooms looked crude next to it); rules unique to a place wait until
// the dungeon itself plays well (Nov 15, the dungeon loop grill)
export const CRAWL_THEMES: Record<string, CrawlTheme> = {
  // a cave: dirt and stone floor with a bare stone road, stone hills along the border for walls (MOUND in
  // scene/board.ts), boulders, crates and barrels inside
  dungeon: {
    floors: ['stone', 'stone', 'summit', 'summit'],
    props: [
      { terrain: 'wall', look: 'boulder' },
      { terrain: 'wall', look: 'boulder' },
      { terrain: 'wall', look: 'crates' },
      { terrain: 'wall', look: 'barrel' },
      { terrain: 'rubble', look: 'rubble' },
    ],
    border: [{ terrain: 'wall', look: 'rock' }],
    road: 'summit',
    hazard: { terrain: 'floor', look: 'spikes', spikes: true },
  },
  forest: {
    floors: ['grass'],
    props: [
      { terrain: 'forest', look: 'tree2' },
      { terrain: 'forest', look: 'tree3' },
      { terrain: 'forest', look: 'tree4' },
      { terrain: 'wall', look: 'boulder' },
      { terrain: 'wall', look: 'crates' },
      { terrain: 'wall', look: 'barrel' },
    ],
    border: [
      { terrain: 'forest', look: 'tree2' },
      { terrain: 'forest', look: 'tree3' },
      { terrain: 'forest', look: 'tree4' },
    ],
    road: 'sand',
  },
  mountain: {
    floors: ['snow', 'snow', 'snow', 'summit'],
    props: [
      { terrain: 'forest', look: 'bare1' },
      { terrain: 'forest', look: 'bare2' },
      { terrain: 'wall', look: 'boulder' },
      { terrain: 'wall', look: 'boulder' },
    ],
    border: [
      { terrain: 'forest', look: 'bare1' },
      { terrain: 'wall', look: 'snow_rock' },
    ],
    road: 'stone',
  },
};

// The expedition (Nov 15, F2): floors of short rooms the player picks a path through and one boss room after the last
// floor (Fernando, Nov 15: one boss, at the end of the expedition, not one per floor). Floor n draws its rooms at depth n,
// the boss at the last floor's depth. Heals in % of max life, provisional until the camp exists: +25% after each won room
// for whoever stood (a fallen hero comes back at 25% instead), +50% to everyone on going down a floor; never above the max
// (Fernando, Nov 15, decision 43)
export const CRAWL_RUN = {
  floors: 3,
  rows: 2, // rows of rooms on each floor; the player clears one room per row
  width: [2, 3] as [number, number], // rooms to pick from in a row
  roomHeal: 25,
  floorHeal: 50,
  fallen: 25,
  // gold in each floor's chest node (Fernando's gold grill, Nov 15: 1 per floor, off the shortest route; the numbers are
  // the Mechanics lab's equipamento.json proposal). Its 30% common / 10% rare piece waits for the 7-slot equipment
  chest: [80, 150] as [number, number],
};

// Gold each enemy of a won room drops (Fernando's gold grill, Nov 15: only those it makes sense to carry; simple undead
// drop none). Ranges from the Mechanics lab's equipamento.json drop table; an enemy missing here drops no gold
export const CRAWL_GOLD: Record<string, [number, number]> = {
  soldier: [30, 50],
  dark_mage: [40, 60],
  acolyte: [40, 60],
  veil_knight: [60, 90],
  brute: [50, 80],
  colossus: [300, 300],
};
