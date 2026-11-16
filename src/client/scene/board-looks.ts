// What each tile look (Tile.look) draws on the board: the pieces, the side colors, the detail pieces, and the list of
// pieces a map downloads.
import type { Grid } from '../../shared/battle/grid.ts';

// Pieces for each tile look (Tile.look), in public/models: top cube and column cube below. A bridge has no
// column (water underneath); a tree puts the forest model on top. Mapping by the orchestrator on Nov 12, approved by
// Fernando to go into the game.
// `canopy`: a blocking tree's tile height is the crown's, and the ground comes from the lowest neighbor; its column never hides.
// `stairs`: on a ramp tile the top stays flat and the dungeon stairs (STAIRS) climb over it (crypts, Nov 13)
// `house`: a town building (src/content/crawl/town.ts), `propW` whole tiles wide over its lot, centred on this tile and
// picked as it, so a click on the house finds the place
export const LOOK: Record<
  string,
  {
    top: string;
    side: string | null;
    prop?: string;
    propH?: number;
    propW?: number;
    canopy?: true;
    stairs?: true;
    house?: true;
  }
> = {
  grass: { top: 'blocks/grass', side: 'blocks/dirt' },
  stone: { top: 'blocks/gravel', side: 'blocks/stone' },
  // water: the top piece is the gravel bed (where the unit steps), seen through the water.ts surface (Nov 13)
  water: { top: 'blocks/gravel', side: 'blocks/stone_dark' },
  bridge: { top: 'blocks/wood', side: null },
  tree: { top: 'blocks/grass', side: 'blocks/dirt', prop: 'forest/Tree_1_A_Color1', canopy: true },
  // Beacon Hill (Nov 12, proposal approved by Fernando): rock on the hill, sand and gold on the Beacon mound, brick
  // walls, four varied trees and the enemies' side in the snow (read from afar which side each team starts on)
  rock: { top: 'blocks/stone', side: 'blocks/stone' },
  summit: { top: 'blocks/stone_dark', side: 'blocks/stone' },
  sand: { top: 'blocks/sand_with_grass', side: 'blocks/dirt' },
  gold: { top: 'blocks/stone_with_gold', side: 'blocks/stone' },
  brick: { top: 'blocks/bricks_B', side: 'blocks/bricks_A' },
  snow: { top: 'blocks/dirt_with_snow', side: 'blocks/dirt' },
  snow_rock: { top: 'blocks/snow', side: 'blocks/stone' },
  tree2: { top: 'blocks/grass', side: 'blocks/dirt', prop: 'forest/Tree_2_A_Color1' },
  tree3: { top: 'blocks/grass', side: 'blocks/dirt', prop: 'forest/Tree_3_A_Color1' },
  tree4: { top: 'blocks/grass', side: 'blocks/dirt', prop: 'forest/Tree_4_A_Color1' },
  bare1: { top: 'blocks/dirt_with_snow', side: 'blocks/dirt', prop: 'forest/Tree_Bare_1_A_Color1' },
  bare2: { top: 'blocks/dirt_with_snow', side: 'blocks/dirt', prop: 'forest/Tree_Bare_2_A_Color1' },
  // Flooded Crypt (Nov 12, closed map with the dungeon pieces): gravel floor, dark altar, and tiles that block
  // with a column, crates, barrel or chest on top; the debris is walkable cover. propH = piece height in tiles.
  crypt: { top: 'blocks/gravel', side: 'blocks/stone_dark', stairs: true },
  altar: { top: 'blocks/stone_dark', side: 'blocks/stone_dark', stairs: true },
  pillar: { top: 'blocks/gravel', side: 'blocks/stone_dark', prop: 'dungeon/pillar', propH: 2 },
  crates: { top: 'blocks/gravel', side: 'blocks/stone_dark', prop: 'dungeon/crates_stacked', propH: 1 },
  barrel: { top: 'blocks/gravel', side: 'blocks/stone_dark', prop: 'dungeon/barrel_large', propH: 0.8 },
  chest: { top: 'blocks/stone_dark', side: 'blocks/stone_dark', prop: 'dungeon/chest_gold', propH: 0.6 },
  rubble: { top: 'blocks/gravel', side: 'blocks/stone_dark', prop: 'dungeon/rubble_half', propH: 0.4 },
  spikes: { top: 'blocks/gravel', side: 'blocks/stone_dark', prop: 'dungeon/floor_tile_big_spikes', propW: 0.95 },
  // crawl rooms (Nov 15): a lone rock that blocks, the painted boulder of props.ts on the ground; a stone hill (rock) on a
  // single tile read as a cube
  boulder: { top: 'blocks/gravel', side: 'blocks/stone', prop: 'forest/Rock_3_A_Color1', propW: 1 },
  // fallen body: the ground is the terrain's and the body is a unit at the end of the death animation (buildCorpses)
  corpse: { top: 'blocks/dirt', side: 'blocks/dirt' },
  // the walkable town (Nov 15): KayKit Medieval Hexagon houses, each over a 3x3 lot of trodden earth (`lot`: a wall
  // drawn as flat ground, the house stands on its centre tile); the gate's lot is 3x1 and the well's a single tile
  lot: { top: 'blocks/dirt', side: 'blocks/dirt' },
  guild: { top: 'blocks/dirt', side: 'blocks/dirt', prop: 'town/building_barracks_blue', propW: 2.8, house: true },
  shop: { top: 'blocks/dirt', side: 'blocks/dirt', prop: 'town/building_market_green', propW: 2.8, house: true },
  tavern: { top: 'blocks/dirt', side: 'blocks/dirt', prop: 'town/building_tavern_red', propW: 2.8, house: true },
  smithy: { top: 'blocks/dirt', side: 'blocks/dirt', prop: 'town/building_blacksmith_yellow', propW: 2.8, house: true },
  enchanter: { top: 'blocks/dirt', side: 'blocks/dirt', prop: 'town/building_tower_A_blue', propW: 2.4, house: true },
  gate: { top: 'blocks/dirt', side: 'blocks/dirt', prop: 'town/wall_straight_gate', propW: 2.8, house: true },
  home: { top: 'blocks/dirt', side: 'blocks/dirt', prop: 'town/building_home_A_red', propW: 2.6, house: true },
  well: { top: 'blocks/dirt', side: 'blocks/dirt', prop: 'town/building_well_blue', propW: 0.9 },
};
// caravan body units (knight and rogue, the ones guarding the cargo)
export const CORPSE_MODELS = ['knight', 'rogue'];
// dungeon stairs: 2 wide, 4 deep and 4 high, climbing toward -z (checked on the file's vertices)
export const STAIRS = 'dungeon/stairs_modular_center';
// walls without a piece that the smooth terrain draws as a stone hill (brick stays as blocks: it is construction)
export const MOUND = new Set(['rock', 'snow_rock', 'summit', 'snow']);
export const UNDER = 'blocks/stone_dark'; // column under the bridge water and the map skirt

// side color by the floor above (Tile.look) or by the terrain on maps without a per-tile look
export const WALL_COLOR: Record<string, string> = {
  grass: '#4f8f3a',
  tree: '#4f8f3a',
  floor: '#4f8f3a',
  forest: '#3f7a34',
  stone: '#7a7d86',
  box: '#7a7d86',
  wall: '#7a7d86',
  water: '#2f6fae',
  bridge: '#2f6fae',
  roof: '#8a4b32',
  chimney: '#4a4a52',
  wood: '#8a6238',
  rock: '#7a7d86',
  summit: '#4a4a52',
  sand: '#b8a06a',
  gold: '#7a7d86',
  brick: '#8a4b32',
  snow: '#c9d2dc',
  snow_rock: '#c9d2dc',
  tree2: '#4f8f3a',
  tree3: '#4f8f3a',
  tree4: '#4f8f3a',
  bare1: '#c9d2dc',
  bare2: '#c9d2dc',
  crypt: '#5a5d66',
  altar: '#4a4a52',
  pillar: '#5a5d66',
  crates: '#5a5d66',
  barrel: '#5a5d66',
  chest: '#4a4a52',
  rubble: '#5a5d66',
  spikes: '#5a5d66',
  boulder: '#7a7d86',
};
export const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
// Details that break the grid (Nov 13, "it's not Minecraft"): rocks at the foot of ravines, tufts and pebbles at the corners of
// tiles, away from the unit's ring (0.44 from the center). Pieces from KayKit's forest pack (same texture as the trees)
export const DETAIL = {
  rock: 'forest/Rock_1_A_Color1',
  boulder: 'forest/Rock_3_A_Color1',
  pebble: 'forest/Rock_2_A_Color1',
  tuft: 'forest/Grass_1_A_Color1',
};

// pieces a map with a per-tile look downloads (BattleScene.create): only that map brings them (~630 KB with the textures)
export function lookPieceNames(grid: Grid): string[] {
  return [
    ...new Set(
      grid.tiles.flatMap((t) =>
        t.look
          ? [
              LOOK[t.look].top,
              LOOK[t.look].side ?? LOOK.water.top,
              LOOK[t.look].prop ?? '',
              UNDER,
              t.ramp && LOOK[t.look].stairs ? STAIRS : '',
              ...Object.values(DETAIL),
            ]
          : [],
      ),
    ),
  ].filter(Boolean);
}
