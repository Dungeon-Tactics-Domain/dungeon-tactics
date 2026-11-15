import type { Pos } from './types.ts';

export type TerrainKind = 'floor' | 'forest' | 'rubble' | 'wall';

// Few terrains on purpose (spec, Oct 25). `blocks` is how far the terrain rises above the tile height for the line of
// sight: forest hides whoever is on the same level, but whoever is up high sees over it (which is what makes archer and rogue valuable).
export const TERRAIN: Record<TerrainKind, { walkable: boolean; blocks: number; cover: boolean }> = {
  floor: { walkable: true, blocks: 0, cover: false },
  // a tree can be neither crossed nor stepped on (Nov 13, Fernando's request: "trees must not be passable"); it still blocks
  // sight. The crypt rubble, which was "forest" to be walkable cover, became its own terrain
  forest: { walkable: false, blocks: 2, cover: true },
  rubble: { walkable: true, blocks: 1, cover: true }, // low, like the LOW objects (the one on the Wood bridge has no rubble `look`)
  wall: { walkable: false, blocks: 4, cover: false },
};
// low object on top of the tile (crate, barrel, corpse, chest, rubble): blocks sight only 1 level above the ground, not the 4 of
// a wall (Nov 13, Fernando's request: the archer on the hill could not shoot over the crates and bodies on the road)
const LOW = new Set(['crates', 'barrel', 'corpse', 'chest', 'rubble']);
export const blocksOf = (t: Tile) => (t.look && LOW.has(t.look) ? 1 : TERRAIN[t.terrain].blocks);

export interface Tile {
  terrain: TerrainKind;
  h: number;
  // Drawing only (Nov 12, Gariland map with the KayKit pieces): the rules do not read it. `look` picks the tile's pieces in the scene;
  // `ramp` tilts the top, rising `rise` levels in the direction FACING[dir]. A map without both is drawn as before. Only a
  // token's stop reads `ramp` (pathing.ts restsOn: no ramp cell under a square between tiles).
  look?: string;
  ramp?: [dir: number, rise: number];
  // Water (BMG 6.5; Fernando's decision of Nov 12): depth in levels. 1 = shallow, 2 or more = deep
  // (cannot be entered or stopped on). Whoever is in the water stands lower: tile height minus the depth.
  depth?: number;
  // Spikes (night of Nov 12, our own rule, not FFT): whoever ends their turn on it or is pushed onto it takes
  // COMBAT.SPIKE_DAMAGE. Walking over it does not hurt. It gives pushes a tactical use (combat.ts) and the AI already values it for the damage.
  spikes?: true;
  // Body on the ground (Nov 13, Fernando's request: "obstacles like the body on the ground must be passable, the character just
  // cannot stay on top"): you can pass over it, but not stop or be pushed onto it
  noStop?: true;
  // Tree that occupies a square of `tree` x `tree` tiles (half tile, half.ts): it sits on the top-left tile; the other
  // tiles of the square are forest without a drawing of their own. Drawing only: the rule reads the terrain of each tile
  tree?: number;
  // Object of the tile (crate, barrel, body, column) drawn over a `span` x `span` square from this cell, and none on a cell
  // with 0 (half.ts: the whole tile's object on the top-left cell of its 4). Drawing only; without it, 1
  span?: number;
}

// Map immutable during the battle: it stays outside the BattleState (the state keeps only the scenario id).
export interface Grid {
  width: number;
  height: number;
  tiles: Tile[];
  levelHeight?: number; // height of one level in the drawing, in tiles; only the FFT study map sets it (finer levels)
  // cells per whole tile on each side: 2 on a map split into half tiles (half.ts), where the rules still read ranges,
  // radii, pushes and hit-chance distance in whole tiles. Without it, 1
  sub?: number;
}
export const subOf = (g: Grid) => g.sub ?? 1;

const SYMBOL: Record<string, TerrainKind> = { '.': 'floor', T: 'forest', '#': 'wall' };

// ASCII format: one terrain grid (`.` floor, `T` forest, `#` wall) and another of heights (digit 0 to 9), same shape.
export function parseGrid(terrain: string[], heights: string[]): Grid {
  const height = terrain.length;
  const width = terrain[0]?.length ?? 0;
  if (heights.length !== height) throw new Error('height: row count differs from the terrain');
  const tiles: Tile[] = [];
  for (let y = 0; y < height; y++) {
    if (terrain[y].length !== width) throw new Error(`width of row ${y} differs from the first`);
    if (heights[y].length !== width) throw new Error(`height: width of row ${y} differs from the terrain`);
    for (let x = 0; x < width; x++) {
      const kind = SYMBOL[terrain[y][x]];
      if (!kind) throw new Error(`unknown symbol '${terrain[y][x]}' at ${x},${y}`);
      const h = Number(heights[y][x]);
      if (!Number.isInteger(h)) throw new Error(`invalid height '${heights[y][x]}' at ${x},${y}`);
      tiles.push({ terrain: kind, h });
    }
  }
  return { width, height, tiles };
}

// Ramps (Nov 13, Fernando's request: "more diagonal tiles… it's not Minecraft"): drawing only, the rules do not read `ramp`
// (the jump still follows the standing height) except where a token may stop (pathing.ts restsOn). One letter per tile says where the ground rises (v > ^ <, FACING order) to the
// neighbor 1 level above; a dot is a flat tile. Hand-picked on the passages and slopes with a step of 1 (test in scenario-maps).
const RAMP_DIR: Record<string, number> = { v: 0, '>': 1, '^': 2, '<': 3 };
export function withRamps(grid: Grid, overlay: string[]): Grid {
  // a short row would silently drop ramps, so a drawing that does not match the map fails on load, like parseGrid
  if (overlay.length !== grid.height || overlay.some((row) => row.length !== grid.width))
    throw new Error('ramps: the drawing size differs from the map');
  const tiles = grid.tiles.map((t, i) => {
    const d = RAMP_DIR[overlay[Math.floor(i / grid.width)][i % grid.width]];
    return d === undefined ? t : { ...t, ramp: [d, 1] as [number, number] };
  });
  return { ...grid, tiles };
}

// height of whoever is on the tile (in water, the tile minus the depth, BMG 6.5)
// shallow water does not lower whoever is standing (Nov 13, Fernando's request: "there is water over the rock and I can't get down"):
// with the foot 1 below the surface, the ford had to climb 1 level and ended up above the river; it only costs 2 movement and the
// sunken model is drawing only (WADE). In deep water the swimmer sits at the depth (worse for hit chance, range and sight)
export const standH = (t: Tile) => t.h - (isDeep(t) ? t.depth! : 0);
// Deep water (2 or more). In FFT only swimmers enter (BMG 6.5); here everyone enters since Nov 13 (Fernando's choice:
// "enters, but does not act inside"): costs 2 like shallow, whoever is in it only walks or waits (previewAbility) and a push
// still stops at the edge (simulatePush). The jump to enter and leave is measured by the surface (t.h), not the bottom:
// measured by the bottom, the bank was 2 levels above and only Jump 2 got in
export const isDeep = (t: Tile) => (t.depth ?? 0) >= 2;
// you can stop on the tile: walkable (deep water too, since Nov 13)
export const canStand = (t: Tile) => TERRAIN[t.terrain].walkable;
// movement points to enter the tile: 1 for everything, water too (Nov 13, Fernando's choice: "fewer movement constraints
// to allow more strategies"; water used to cost 2, from BMG 6.5). It stays a function for the day
// some terrain costs more again
export const stepCost = (_t: Tile) => 1;

export const inBounds = (g: Grid, p: Pos) => p.x >= 0 && p.y >= 0 && p.x < g.width && p.y < g.height;
export const tileAt = (g: Grid, p: Pos): Tile => g.tiles[p.y * g.width + p.x];
export const samePos = (a: Pos, b: Pos) => a.x === b.x && a.y === b.y;
export const posKey = (p: Pos) => `${p.x},${p.y}`;
// distance in grid steps (4 directions), the same as movement
export const dist = (a: Pos, b: Pos) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

// Directions of `UnitState.facing`, in turning order: +y, +x, -y, -x
export const FACING: Pos[] = [
  { x: 0, y: 1 },
  { x: 1, y: 0 },
  { x: 0, y: -1 },
  { x: -1, y: 0 },
];

// Where the attack comes from (BMG 1.4, diagram): the largest of the distances in front, to the side and behind the target wins; on a tie
// the one more to the front wins (front over side, side over back). Tile height does not count. It used to be from the FFT study; since
// Nov 13 it applies in the game (combat.ts, hit chance by side and back)
export type Side = 'front' | 'side' | 'back';
// direction of a newly spawned unit (or of an old save without direction): toward the nearest enemy; without an enemy, the first
export const faceNearest = (from: Pos, foes: Pos[]) =>
  foes.length
    ? facingTo(
        from,
        foes.reduce((a, b) => (dist(from, b) < dist(from, a) ? b : a)),
      )
    : 0;
export function sideOf(target: Pos, facing: Pos, attacker: Pos): Side {
  const dx = attacker.x - target.x,
    dy = attacker.y - target.y;
  const ahead = dx * facing.x + dy * facing.y;
  const lateral = Math.abs(dx * facing.y - dy * facing.x);
  if (ahead > 0 && ahead >= lateral) return 'front';
  return ahead < 0 && -ahead > lateral ? 'back' : 'side';
}
// direction from `from` to `to` along the axis of greatest difference (tie: the x axis, as in the push)
export function facingTo(from: Pos, to: Pos): number {
  const dx = to.x - from.x,
    dy = to.y - from.y;
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 1 : 3) : dy > 0 ? 0 : 2;
}

const DIRS: Pos[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];
export function neighbors(g: Grid, p: Pos): Pos[] {
  return DIRS.map((d) => ({ x: p.x + d.x, y: p.y + d.y })).filter((q) => inBounds(g, q));
}
