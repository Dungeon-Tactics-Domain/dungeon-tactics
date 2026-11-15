// The board the battle happens on: block columns and per-tile pieces, the smooth painted terrain, water, bridges, edge walls,
// caravan bodies, trees with their crown cutout, stairs and the small details. Built once from the map; after that it only
// animates the water and opens the crown holes the scene asks for.
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { FACING, type Grid, inBounds, neighbors, posKey, type Tile, tileAt } from '../../shared/battle/grid.ts';
import type { Pos } from '../../shared/battle/types.ts';
import { EXTEND } from '../ambience.ts';
import { buildBridges } from '../bridge.ts';
import { addDetail } from '../detail.ts';
import { unitHeight } from '../markers.ts';
import { boxOf as pieceBox, variant } from '../painted.ts';
import { DEBRIS, LITTER } from '../props.ts';
import { param } from '../store.ts';
import {
  buildStream,
  buildTerrain,
  PAINT,
  pickTiles,
  riverOf,
  riverOutside,
  type TerrainTextures,
} from '../terrain.ts';
import { Water } from '../water.ts';
import type { WaterLevel } from '../water-levels.ts';
import type { TileSpace } from './space.ts';

// Pieces for each tile look (Tile.look), in public/models: top cube and column cube below. A bridge has no
// column (water underneath); a tree puts the forest model on top. Mapping by the orchestrator on Nov 12 (assembly
// of Gariland from the map file's surface_type), approved by Fernando to go into the game.
// `canopy`: the tile height on the map is the crown's (a Gariland tree), and the ground comes from the lowest neighbor.
// `stairs`: on a ramp tile the top stays flat and the dungeon stairs (STAIRS) climb over it (crypts, Nov 13)
const LOOK: Record<
  string,
  { top: string; side: string | null; prop?: string; propH?: number; propW?: number; canopy?: true; stairs?: true }
> = {
  grass: { top: 'blocks/grass', side: 'blocks/dirt' },
  stone: { top: 'blocks/gravel', side: 'blocks/stone' },
  // water: the top piece is the gravel bed (where the unit steps), seen through the water.ts surface (Nov 13)
  water: { top: 'blocks/gravel', side: 'blocks/stone_dark' },
  roof: { top: 'blocks/bricks_B', side: 'blocks/bricks_A' },
  chimney: { top: 'blocks/stone_dark', side: 'blocks/bricks_A' },
  wood: { top: 'blocks/wood', side: 'blocks/wood' },
  bridge: { top: 'blocks/wood', side: null },
  box: { top: 'dungeon/box_large', side: 'blocks/stone' },
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
};
// caravan body units (knight and rogue, the ones guarding the cargo)
export const CORPSE_MODELS = ['knight', 'rogue'];
// dungeon stairs: 2 wide, 4 deep and 4 high, climbing toward -z (checked on the file's vertices)
const STAIRS = 'dungeon/stairs_modular_center';
const PLAIN_UNITS = param('units') === 'plain';
// walls without a piece that the smooth terrain draws as a stone hill (brick stays as blocks: it is construction)
const MOUND = new Set(['rock', 'snow_rock', 'summit', 'snow']);
const UNDER = 'blocks/stone_dark'; // column under the bridge water and the map skirt

// Map base as a block (Fernando's requests, Nov 12, looking at FFT's board): all columns end on the same
// ground (y = 0), and the edge sides, from each tile's floor down, are a flat color pulled from the floor above that
// darkens until it vanishes into the background ("the floors at the map edges have no texture and it looks better that way"). The tops keep their texture.
const BASE_DEPTH = 2; // in tiles, below the ground; with 1 the gradient ended before fully darkening
const BACKGROUND = '#1b1626'; // the scene background: the gradient ends in it
// side color by the floor above (Tile.look) or by the terrain on maps without a per-tile look
const WALL_COLOR: Record<string, string> = {
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
const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
// Trees (Nov 13, Fernando's request: "bigger trees... some can even take up more than 1 tile"): maximum height and width,
// in tiles, of the 1-tile tree (the unit is 0.85: the crown goes past the tile) and of the one covering 2 or 4 tree tiles
// together at the same height. Each model fits the smaller of the two limits, so the round crown does not get too wide.
const TREE_SIZE: Record<number, { h: number; w: number }> = {
  1: { h: 2.4, w: 1.9 },
  2: { h: 2.8, w: 2.3 },
  4: { h: 3.4, w: 2.9 },
};
// Crown cutout (same request: the crown must not hide a unit, the cursor or a marked tile): each one opens a hole in the
// tree in front of it. Cap of points per frame (9 units, the cursor and the marked tiles)
const CUT_MAX = 64;
// Details that break the grid (Nov 13, "it's not Minecraft"): rocks at the foot of ravines, tufts and pebbles at the corners of
// tiles, away from the unit's ring (0.44 from the center). Pieces from KayKit's forest pack (same texture as the trees)
const DETAIL = {
  rock: 'forest/Rock_1_A_Color1',
  boulder: 'forest/Rock_3_A_Color1',
  pebble: 'forest/Rock_2_A_Color1',
  tuft: 'forest/Grass_1_A_Color1',
};
const GREEN = new Set(['grass', 'sand', 'tree', 'tree2', 'tree3', 'tree4']); // ground that gets a grass tuft
const ROCKY = new Set(['rock', 'summit', 'snow', 'snow_rock', 'bare1', 'bare2']); // ground that gets a pebble
// fixed draw by position (the same map always draws the same), from 0 to 1
const hash = (x: number, y: number, k = 0) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453;
  return s - Math.floor(s);
};
const TMP = new THREE.Vector3(); // per-frame math without creating objects

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

// KayKit textures are palettes: with mipmap the low-resolution render blends neighboring colors (learned in the POC)
export function prepare(o: THREE.Object3D) {
  o.traverse((m) => {
    const mesh = m as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = mesh.receiveShadow = true;
    const mat = mesh.material as THREE.MeshStandardMaterial,
      map = mat.map;
    if (map?.generateMipmaps && !mat.userData.procedural)
      Object.assign(map, {
        generateMipmaps: false,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        needsUpdate: true,
      });
  });
  return o;
}

export class Board {
  readonly tileTops: THREE.Object3D[] = []; // what touch can pick as a tile (pick)
  private water: Water | null = null; // only on maps with water
  private stream: { meshes: THREE.Mesh[]; time: { value: number } } | null = null;
  private trees = false;
  // tile drawn by the smooth terrain (terrain.ts) instead of blocks: paintable look, plus pieceless wall (stone, brick)
  // stone or snow wall (pieceless wall) also becomes terrain: a stone hill two levels above (rock(t))
  private readonly ground = (t: Tile): boolean =>
    !!this.terrainTex &&
    !!t.look &&
    t.look in PAINT &&
    (t.terrain !== 'wall' || !!LOOK[t.look].prop || MOUND.has(t.look) || t.look === 'corpse');
  private readonly rock = (t: Tile) => t.terrain === 'wall' && !LOOK[t.look ?? '']?.prop && MOUND.has(t.look ?? '');
  private readonly grid: Grid;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly space: TileSpace,
    private readonly models: Map<string, GLTF>,
    pieces: Record<'top' | 'side' | 'stone' | 'tree', THREE.Object3D>,
    private readonly lookPieces: Map<string, THREE.Object3D>,
    private readonly packClips: THREE.AnimationClip[],
    private readonly terrainTex: TerrainTextures | null,
  ) {
    this.grid = space.grid;
    this.buildBoard(pieces);
  }

  // the map has trees, so the crowns need the cutout points every frame
  get hasTrees(): boolean {
    return this.trees;
  }

  // water waves and the outside river current, on the battle clock
  update(t: number, units: Iterable<{ holder: THREE.Object3D }>) {
    this.water?.update(t, units);
    if (this.stream) this.stream.time.value = t / 1000;
  }

  private buildBoard(pieces: Record<'top' | 'side' | 'stone' | 'tree', THREE.Object3D>) {
    // normalizes the piece to 1 tile wide and STEP high, with the top at y = 0
    const norm = (src: THREE.Object3D) => {
      const o = src.clone();
      const box = new THREE.Box3().setFromObject(o);
      const size = box.getSize(new THREE.Vector3());
      o.scale.set(1 / size.x, this.space.step / size.y, 1 / size.z);
      o.position.y = -box.max.y * (this.space.step / size.y);
      return prepare(new THREE.Group().add(o));
    };
    const top = norm(pieces.top),
      side = norm(pieces.side),
      stone = norm(pieces.stone);
    const list = () => ({ at: [] as THREE.Vector3[], tiles: [] as Pos[] });
    const batch = { top: list(), stoneTop: list(), side: list(), stone: list() };
    const walls: { x: number; z: number; top: number; color: string }[] = []; // smooth side walls of the edge
    const edge = (p: Pos) => NEIGHBORS.some(([dx, dy]) => columnTop({ x: p.x + dx, y: p.y + dy }) < 0);
    // highest level occupied by the tile's column (-1 outside the map: the edge is left on display)
    const columnTop = (p: Pos) => {
      if (p.x < 0 || p.y < 0 || p.x >= this.grid.width || p.y >= this.grid.height) return -1;
      const t = tileAt(this.grid, p);
      return t.h + (t.terrain === 'wall' ? 2 : 0);
    };
    const levels = this.space.levels;
    const smooth = !!this.terrainTex;
    const river = smooth ? riverOf(this.grid, levels) : null;
    const outside =
      smooth && EXTEND === 'texture'
        ? riverOutside(this.grid, this.space.step, levels, river)
        : new Map<string, WaterLevel>();
    const looks = this.lookBatches(edge, walls, levels);
    for (const [i, tile] of this.grid.tiles.entries()) {
      const p = { x: i % this.grid.width, y: Math.floor(i / this.grid.width) };
      const w = this.space.world(p);
      const wall = tile.terrain === 'wall';
      if (tile.look) looks.add(p);
      // wall: stone stacked two levels above the tile, to read that it blocks passage and sight
      for (let k = 0; !tile.look && k <= tile.h + (wall ? 2 : 0); k++) {
        const at = new THREE.Vector3(w.x, (k + 1) * this.space.step, w.z);
        if (k === tile.h) {
          const b = wall ? batch.stoneTop : batch.top;
          b.at.push(at);
          b.tiles.push(p);
        } else if (wall) batch.stone.at.push(at);
        // a dirt block surrounded on all four sides never shows: out of the scene (they were most of the triangles on the 20x20);
        // at the edge, the smooth side takes the dirt's place
        else if (!edge(p) && !NEIGHBORS.every(([dx, dy]) => columnTop({ x: p.x + dx, y: p.y + dy }) >= k))
          batch.side.at.push(at);
      }
      if (!tile.look && edge(p))
        walls.push({ x: w.x, z: w.z, top: tile.h * this.space.step, color: WALL_COLOR[tile.terrain] });
    }
    this.instanced(top, batch.top.at, batch.top.tiles);
    this.instanced(stone, batch.stoneTop.at, batch.stoneTop.tiles);
    this.instanced(side, batch.side.at);
    this.instanced(stone, batch.stone.at);
    looks.build();
    if (smooth) {
      const inner = (p: Pos, x: number, z: number) => {
        const lv = levels.get(posKey(p)),
          t = tileAt(this.grid, p);
        return lv
          ? lv.bed
          : this.rock(t)
            ? (t.h + 3) * this.space.step
            : this.ground(t)
              ? this.space.surfaceY(p, x, z)
              : (t.h + 1) * this.space.step;
      };
      this.scene.add(
        buildTerrain(this.grid, {
          step: this.space.step,
          inner,
          outside,
          levels,
          river,
          extend: EXTEND === 'texture',
          tex: this.terrainTex!,
        }),
      );
      const picks = this.grid.tiles.flatMap((t, i) => {
        const p = { x: i % this.grid.width, y: Math.floor(i / this.grid.width) };
        if (t.look === 'bridge') return [{ p, at: this.space.world(p) }];
        return this.ground(t) && !levels.has(posKey(p))
          ? [{ p, at: this.rock(t) ? this.space.world(p).setY((t.h + 3) * this.space.step) : this.space.world(p) }]
          : [];
      });
      this.scene.add(buildBridges(this.grid, this.space.step, this.terrainTex!.wood, this.terrainTex!.bark));
      this.buildBorder(levels);
      const pick = pickTiles(picks);
      this.scene.add(pick);
      this.tileTops.push(pick);
    }
    if (levels.size) {
      this.water = new Water(this.scene, this.grid, levels, this.space.step, river);
      // the outside river is a continuous strip with current (terrain.ts buildStream), not stepped water tiles
      if (outside.size) {
        this.stream = buildStream(this.grid, this.space.step, levels, river);
        this.scene.add(...this.stream.meshes);
      }
      this.tileTops.push(this.water.surface); // touching the water picks its tile, not the bed way down below
    }
    this.buildCorpses();
    this.buildTrees(pieces.tree);
    this.buildStairs();
    this.buildDetails();
    this.buildWalls(walls);
  }

  // Smooth edge sides in a single drawing (one draw call): floor color at the top, already darkened, down to the bottom
  private buildWalls(walls: { x: number; z: number; top: number; color: string }[]) {
    if (!walls.length) return;
    const bottom = -BASE_DEPTH;
    const deep = new THREE.Color(BACKGROUND);
    const parts = walls.map(({ x, z, top, color }) => {
      const g = new THREE.BoxGeometry(1, top - bottom, 1).translate(x, (top + bottom) / 2, z);
      const high = new THREE.Color(color).multiplyScalar(0.55); // the side is darker than the top, like a shadow
      const pos = g.getAttribute('position');
      const colors = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) (pos.getY(i) > bottom + 0.001 ? high : deep).toArray(colors, i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      return g;
    });
    const mesh = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshBasicMaterial({ vertexColors: true }));
    for (const g of parts) g.dispose();
    this.scene.add(mesh);
  }

  // Tiles with a look (Tile.look): column of whole 1-tile cubes, from the tile top down, with the top piece
  // and the column piece of each look. Whole cube because the cube flattened to the height of one level (0.25 in Gariland) squeezed the
  // texture into stripes. The ramp tilts the top cube (shear) and stretches it downward, so no gap opens.
  private lookBatches(
    edge: (p: Pos) => boolean,
    walls: { x: number; z: number; top: number; color: string }[],
    water: Map<string, WaterLevel>,
  ) {
    const norm = (name: string, height: number) => {
      const o = this.lookPieces.get(name)!.clone();
      const size = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
      const box = new THREE.Box3().setFromObject(o);
      o.scale.set(1 / size.x, height / size.y, 1 / size.z);
      o.position.set(
        -(box.min.x + box.max.x) / 2 / size.x,
        -box.max.y * (height / size.y),
        -(box.min.z + box.max.z) / 2 / size.z,
      );
      return prepare(new THREE.Group().add(o));
    };
    const batches = new Map<string, { piece: THREE.Object3D; at: THREE.Matrix4[]; tiles?: Pos[] }>();
    const put = (name: string, height: number, m: THREE.Matrix4, tile?: Pos) => {
      const key = `${name}@${height}${tile ? '#' : ''}`;
      let b = batches.get(key);
      // height 0: piece as it came (the scale is already in the matrix)
      if (!b)
        batches.set(
          key,
          (b = {
            piece: height ? norm(name, height) : prepare(this.lookPieces.get(name)!.clone()),
            at: [],
            tiles: tile && [],
          }),
        );
      b.at.push(m);
      if (tile) b.tiles!.push(tile);
    };
    const add = (p: Pos) => {
      const tile = tileAt(this.grid, p);
      const look = LOOK[tile.look!];
      const w = this.space.world(p);
      // Gariland tree (non-walkable tile, the file height is the crown's): the ground is the lowest neighbor's. On our
      // maps the height is already the ground's. Pieceless wall on top: two levels above the tile, as without a look; with a piece
      // (column, crate, barrel), the piece is what blocks and the tile stays at ground level.
      const wall = tile.terrain === 'wall';
      const h =
        look.canopy && wall
          ? Math.min(...neighbors(this.grid, p).map((n) => tileAt(this.grid, n).h))
          : tile.h + (wall && !look.prop ? 2 : 0);
      // water: the top block is the bed (waterLevels: on shallow where the feet step, on deep way below); the surface, lower
      // on deep than on shallow (the step at the bank says "it is deep here"), is drawn in water.ts
      const top = tile.look === 'water' ? water.get(posKey(p))!.bed : (h + 1) * this.space.step;
      // the bridge is a one-level plank over the water; a low tile (top below 1) has the cube flattened to the base; at the edge
      // the top is a one-level slice and the smooth side starts right below it
      const onEdge = edge(p);
      const slab = look.side && !onEdge ? Math.min(1, top) : this.space.step;
      const m = new THREE.Matrix4().makeTranslation(w.x, top, w.z);
      if (tile.ramp && !look.stairs) {
        // stairs: flat top, the piece goes in buildStairs
        const rise = tile.ramp[1] * this.space.step,
          f = FACING[tile.ramp[0]];
        // y' = y * (height + rise) / height + rise * (half step toward the ramp + 1/2)
        m.set(1, 0, 0, w.x, f.x * rise, (slab + rise) / slab, f.y * rise, top + rise / 2, 0, 0, 1, w.z, 0, 0, 0, 1);
      }
      const painted = this.ground(tile);
      // the bridge on open maps is bridge.ts's (planks, ropes and little stairs); the wooden block stays only in the crypts
      if (!painted && !(this.terrainTex && tile.look === 'bridge')) put(look.top, slab, m, p);
      // column down to the flat base (y = 0): whole cubes and the last one flattened to what is missing, so the bottom does not have steps
      const column = look.side ?? UNDER;
      let y = top - slab;
      if (!look.side) {
        // bridge: the bed below, if water passes under the plank (the surface comes from water.ts)
        const under = water.get(posKey(p));
        if (under && !this.terrainTex)
          put(
            LOOK.water.top,
            1,
            new THREE.Matrix4().makeTranslation(w.x, under.bed, w.z).scale(new THREE.Vector3(1, under.bed, 1)),
          );
        y = 0;
      }
      if (painted) {
        /* smooth terrain ground */
      } else if (onEdge) walls.push({ x: w.x, z: w.z, top: y, color: WALL_COLOR[tile.look!] });
      else
        for (; y > 0; y -= 1)
          if (!this.buried(p, y))
            put(
              column,
              1,
              new THREE.Matrix4().makeTranslation(w.x, y, w.z).scale(new THREE.Vector3(1, Math.min(1, y), 1)),
            );
      // the whole tile's object on the split map (Tile.span): once, the size of its 4 cells
      const span = tile.span ?? 1;
      if (look.prop && tile.terrain !== 'forest' && span > 0) {
        // forest tile tree: buildTrees
        // painted object (props.ts): the variation comes from the position, as with the trees
        const prop = variant(this.lookPieces, look.prop, hash(p.x, p.y, 6)),
          box = pieceBox(this.lookPieces.get(prop)!);
        // propW: ground piece (spikes) measured by width, to fit the tile; the others by height (1.1 = the tree)
        const k =
          span *
          (look.propW
            ? look.propW / Math.max(box.max.x - box.min.x, box.max.z - box.min.z)
            : (look.propH ?? 1.1) / (box.max.y - box.min.y));
        const c = (span - 1) / 2;
        put(
          prop,
          0,
          new THREE.Matrix4().makeTranslation(w.x + c, top - box.min.y * k, w.z + c).scale(new THREE.Vector3(k, k, k)),
        );
      }
      // debris on top of the bridge (walkable cover): the caravan remains over the planks (props.ts), only on open maps
      if (tile.terrain === 'rubble' && tile.look === 'bridge' && this.lookPieces.has(DEBRIS))
        put(variant(this.lookPieces, DEBRIS, hash(p.x, p.y, 6)), 0, new THREE.Matrix4().makeTranslation(w.x, top, w.z));
    };
    const build = () => {
      for (const b of batches.values()) this.instanced(b.piece, b.at, b.tiles);
    };
    return { add, build };
  }

  // open-map pieces (crates, barrels, bridge, walls, Gariland trees) with detail.ts's texture and shading;
  // one material per source material, so shader programs do not multiply
  private readonly texturedMats = new Map<THREE.Material, THREE.Material>();
  // unit and body: only detail.ts's shading, without the grain (Nov 13, Fernando found the texture on them "ugly")
  shaded<M extends THREE.Material>(m: M): M {
    const tex = this.terrainTex;
    if (tex && !PLAIN_UNITS) m.onBeforeCompile = (sh) => addDetail(sh, tex, 2.5, 0);
    return m;
  }

  private textured(m: THREE.Material): THREE.Material {
    const tex = this.terrainTex;
    if (!tex || !(m as THREE.MeshStandardMaterial).isMeshStandardMaterial || m.userData.procedural) return m; // painted piece (painted.ts): no grain
    let out = this.texturedMats.get(m);
    if (!out) {
      out = m.clone();
      out.onBeforeCompile = (sh) => addDetail(sh, tex, 1.5);
      this.texturedMats.set(m, out);
    }
    return out;
  }

  // Caravan bodies: knight and rogue alternating, still on the last frame of the death animation, darkened, with a
  // dark stain on the ground; draw by tile for the rotation
  private buildCorpses() {
    const stain = new THREE.MeshBasicMaterial({
      color: '#2a0f0a',
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    this.grid.tiles.forEach((t, i) => {
      if (t.look !== 'corpse' || t.span === 0) return; // split map: one body per whole tile (Tile.span)
      const p = { x: i % this.grid.width, y: Math.floor(i / this.grid.width) };
      const gltf = this.models.get(CORPSE_MODELS[(p.x + p.y) % CORPSE_MODELS.length]);
      if (!gltf) return;
      const body = prepare(cloneSkinned(gltf.scene));
      body.traverse((m) => {
        const mesh = m as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
        mat.color.multiplyScalar(0.55); // lifeless: darker and duller than the battle units
        mesh.material = this.shaded(mat);
      });
      const b = new THREE.Box3().setFromObject(body);
      body.scale.setScalar(((t.span ?? 1) * unitHeight('soldier')) / (b.max.y - b.min.y));
      const clip = [...gltf.animations, ...this.packClips].find((c) => c.name === 'Death_A');
      if (clip) {
        const mixer = new THREE.AnimationMixer(body);
        const act = mixer.clipAction(clip);
        act.setLoop(THREE.LoopOnce, 1);
        act.clampWhenFinished = true;
        act.play();
        mixer.update(clip.duration);
      }
      const w = this.space.world(p);
      body.position.copy(w).add(new THREE.Vector3(((t.span ?? 1) - 1) / 2, 0, ((t.span ?? 1) - 1) / 2));
      body.rotation.y = hash(p.x, p.y, 3) * Math.PI * 2;
      this.scene.add(body);
      // stain with an irregular edge (brushstroke), not a disc
      const blot = new THREE.CircleGeometry(0.42, 14).rotateX(-Math.PI / 2),
        bp = blot.getAttribute('position');
      for (let k = 1; k < bp.count; k++) {
        const r = 0.7 + 0.5 * hash(p.x + (k % 14) * 0.37, p.y, 9);
        bp.setXYZ(k, bp.getX(k) * r, 0, bp.getZ(k) * r);
      }
      const spot = new THREE.Mesh(blot, stain);
      spot.position.set(w.x + 0.08, w.y + 0.012, w.z - 0.05);
      spot.scale.set(1, 1, 0.7);
      // caravan remains beside the body: bottles, sack, plank (props.ts), only on open maps
      const litter = this.lookPieces.get(variant(this.lookPieces, LITTER, hash(p.x, p.y, 8)))?.clone();
      if (litter) {
        const a = hash(p.x, p.y, 10) * Math.PI * 2;
        litter.position.set(w.x + Math.cos(a) * 0.3, w.y, w.z + Math.sin(a) * 0.3);
        litter.rotation.y = a * 3;
        this.scene.add(litter);
      }
      spot.renderOrder = -2;
      this.scene.add(spot);
    });
  }

  // Discreet dotted line on the edge of the battlefield (Nov 13, Fernando's request): follows the ground height of each
  // edge tile (on water, the surface), with a step where the height changes
  private buildBorder(levels: Map<string, WaterLevel>) {
    const { width: W, height: H } = this.grid,
      pts: THREE.Vector3[] = [];
    const yAt = (p: Pos, x: number, z: number) =>
      (levels.get(posKey(p))?.surface ?? this.space.surfaceY(p, x, z)) + 0.04;
    const side = (cells: Pos[], edge: (p: Pos, k: number) => [number, number]) => {
      const line: THREE.Vector3[] = [];
      for (const p of cells)
        for (let k = 0; k <= 4; k++) {
          const [x, z] = edge(p, k / 4);
          line.push(new THREE.Vector3(x, yAt(p, x, z), z));
        }
      for (let i = 1; i < line.length; i++) pts.push(line[i - 1], line[i]);
    };
    const X = (x: number) => x - W / 2,
      Z = (z: number) => z - H / 2;
    const row = (y: number) => Array.from({ length: W }, (_, x) => ({ x, y }));
    const col = (x: number) => Array.from({ length: H }, (_, y) => ({ x, y }));
    side(row(0), (p, k) => [X(p.x + k), Z(0) + 0.01]);
    side(row(H - 1), (p, k) => [X(p.x + k), Z(H) - 0.01]);
    side(col(0), (p, k) => [X(0) + 0.01, Z(p.y + k)]);
    side(col(W - 1), (p, k) => [X(W) - 0.01, Z(p.y + k)]);
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.LineSegments(
      g,
      new THREE.LineDashedMaterial({
        color: '#f4ecd8',
        dashSize: 0.14,
        gapSize: 0.11,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      }),
    );
    line.computeLineDistances();
    line.renderOrder = 2;
    this.scene.add(line);
  }

  // One InstancedMesh per piece mesh instead of one object per block: the 20x20 made 2,321 draw calls per frame and fell
  // to 9 fps on the emulated phone (measurement of Nov 11). `tiles` marks the pieces that count as a tile for touch.
  private instanced(
    piece: THREE.Object3D,
    at: (THREE.Vector3 | THREE.Matrix4)[],
    tiles?: Pos[],
  ): THREE.InstancedMesh[] {
    const out: THREE.InstancedMesh[] = [];
    if (!at.length) return out;
    piece.updateMatrixWorld(true);
    const m = new THREE.Matrix4();
    piece.traverse((o) => {
      const src = o as THREE.Mesh;
      if (!src.isMesh) return;
      const inst = new THREE.InstancedMesh(src.geometry, this.textured(src.material as THREE.Material), at.length);
      at.forEach((p, i) =>
        inst.setMatrixAt(
          i,
          (p instanceof THREE.Matrix4 ? m.copy(p) : m.makeTranslation(p.x, p.y, p.z)).multiply(src.matrixWorld),
        ),
      );
      inst.castShadow = inst.receiveShadow = true;
      if (tiles) {
        inst.userData.tiles = tiles;
        this.tileTops.push(inst);
      }
      this.scene.add(inst);
      out.push(inst);
    });
    return out;
  }

  // Forest-tile trees, bigger than the tile (TREE_SIZE). Neighboring tree tiles at the same height become a single
  // tree (2x2 first, then 2x1): drawing only, each tile is still a tree in the rules. The group uses the widest model
  // among its tiles'; rotation and size vary by position. The crown gets the cutout (cutMaterial).
  private buildTrees(legacy: THREE.Object3D) {
    const g = this.grid,
      taken = new Set<string>();
    const free = (x: number, y: number, h: number) =>
      inBounds(g, { x, y }) &&
      !taken.has(posKey({ x, y })) &&
      tileAt(g, { x, y }).terrain === 'forest' &&
      tileAt(g, { x, y }).h === h;
    // map without a per-tile look (Skirmish) uses the POC tree; the rest, the look's piece
    const modelOf = (p: Pos) => {
      const look = tileAt(g, p).look;
      return look ? (LOOK[look].prop ?? null) : '';
    };
    const pieceOf = (name: string) => (name ? this.lookPieces.get(name)! : legacy);
    const boxOf = (name: string) => pieceBox(pieceOf(name));
    const width = (b: THREE.Box3) => Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
    const batches = new Map<string, THREE.Matrix4[]>();
    for (let y = 0; y < g.height; y++) {
      for (let x = 0; x < g.width; x++) {
        const t = tileAt(g, { x, y });
        // big half-tile tree (half.ts): a single tree, the size of its square
        if (t.tree && !taken.has(posKey({ x, y })) && modelOf({ x, y })) {
          const n = t.tree,
            name = modelOf({ x, y })!;
          for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) taken.add(posKey({ x: x + dx, y: y + dy }));
          const box = boxOf(name);
          const k = Math.min((n * (1 + 0.5 * hash(x, y, 4))) / (box.max.y - box.min.y), (n * 0.95) / width(box));
          const c = this.space.world({ x, y }).add(new THREE.Vector3((n - 1) / 2, 0, (n - 1) / 2));
          const m = new THREE.Matrix4()
            .makeRotationY(hash(x, y, 2) * Math.PI * 2)
            .scale(new THREE.Vector3(k, k, k))
            .setPosition(c.x, c.y - box.min.y * k, c.z);
          if (!batches.has(name)) batches.set(name, []);
          batches.get(name)!.push(m);
          continue;
        }
        if (!free(x, y, t.h)) continue;
        const group =
          free(x + 1, y, t.h) && free(x, y + 1, t.h) && free(x + 1, y + 1, t.h)
            ? [
                [0, 0],
                [1, 0],
                [0, 1],
                [1, 1],
              ]
            : free(x + 1, y, t.h)
              ? [
                  [0, 0],
                  [1, 0],
                ]
              : free(x, y + 1, t.h)
                ? [
                    [0, 0],
                    [0, 1],
                  ]
                : [[0, 0]];
        const tiles = group.map(([dx, dy]) => ({ x: x + dx, y: y + dy }));
        for (const p of tiles) taken.add(posKey(p));
        const names = tiles.map(modelOf).filter((n): n is string => n !== null);
        if (!names.length) continue;
        // the tree variation comes from the position (painted.ts variant): different species and sizes side by side. The draw 16
        // was chosen looking at Ash Wood: 2 tall pines, 4 skirted ones and 2 old trees among the 14 (with 5 it came out 1 pine)
        const name = variant(
          this.lookPieces,
          names.reduce((a, b) => (width(boxOf(b)) > width(boxOf(a)) ? b : a)),
          hash(x, y, 16),
        );
        const box = boxOf(name),
          size = TREE_SIZE[tiles.length],
          tall = (pieceOf(name).userData.tall as number | undefined) ?? 1; // pine: taller than the tile's ceiling
        // more varied size (Nov 13, "trees of different sizes"): from 75% to 135% of the tile size
        // the painted tree's foot (flare and roots, userData.foot) stays on the flat core of its tile: on the edge slope
        // (terrain.ts, 1/6 of the tile) the root hung in the air
        const foot = (0.4 * Math.sqrt(tiles.length)) / ((pieceOf(name).userData.foot as number | undefined) ?? 0.01);
        const k = Math.min(
          Math.min((size.h * tall) / (box.max.y - box.min.y), size.w / width(box)) * (0.75 + 0.6 * hash(x, y, 1)),
          foot,
        );
        const c = tiles
          .reduce((s: THREE.Vector3, p) => s.add(this.space.world(p)), new THREE.Vector3())
          .divideScalar(tiles.length);
        const m = new THREE.Matrix4()
          .makeRotationY(hash(x, y, 2) * Math.PI * 2)
          .scale(new THREE.Vector3(k, k, k))
          .setPosition(c.x, c.y - box.min.y * k, c.z);
        if (!batches.has(name)) batches.set(name, []);
        batches.get(name)!.push(m);
      }
    }
    for (const [name, at] of batches) {
      for (const inst of this.instanced(prepare(pieceOf(name).clone()), at)) {
        inst.material = this.cutMaterial(inst.material as THREE.MeshStandardMaterial);
        // the pixel art normal pass swaps everyone's material; the tree uses its own, with the same cutout, and only
        // returns the normal (without this the outline of the cut crown showed up over the unit)
        inst.onBeforeRender = (_r, scene) =>
          void (this.cuts.normals.value = (scene as THREE.Scene).overrideMaterial ? 1 : 0);
        this.trees = true;
      }
    }
  }

  // Crown cutout: discards the piece of the tree that is in front (closer to the camera) of a protected point and
  // within `w` of it on screen; the hole's edge comes out checkered, in the 16-bit way. Points in camera coordinates,
  // updated every frame (updateCuts). With `cutNormals`, it returns the normal like pixel art's MeshNormalMaterial.
  private readonly cuts = {
    points: { value: Array.from({ length: CUT_MAX }, () => new THREE.Vector4()) },
    count: { value: 0 },
    normals: { value: 0 },
  };
  private cutMaterial(src: THREE.MeshStandardMaterial) {
    const m = src.clone();
    m.allowOverride = false;
    m.customProgramCacheKey = () => `copa${CUT_MAX}`;
    m.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, {
        cutPoints: this.cuts.points,
        cutCount: this.cuts.count,
        cutNormals: this.cuts.normals,
      });
      s.fragmentShader = s.fragmentShader
        .replace(
          'void main() {',
          `uniform vec4 cutPoints[${CUT_MAX}];\nuniform int cutCount;\nuniform float cutNormals;\nvoid main() {`,
        )
        .replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
          vec3 viewPos = -vViewPosition;
          for (int i = 0; i < ${CUT_MAX}; i++) {
            if (i >= cutCount) break;
            vec4 c = cutPoints[i];
            float d = distance(viewPos.xy, c.xy);
            if (viewPos.z > c.z + 0.3 && d < c.w && (d < c.w * 0.7 || mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0) < 1.0)) discard;
          }`,
        )
        .replace(
          '#include <dithering_fragment>',
          '#include <dithering_fragment>\n  if (cutNormals > 0.5) gl_FragColor = vec4(normalize(normal) * 0.5 + 0.5, 1.0);',
        );
    };
    return m;
  }

  // Points the crowns open a hole for, given by the scene every frame (each unit's body, the cursor and the marked tiles),
  // in camera coordinates
  updateCuts(view: THREE.Matrix4, protect: (add: (x: number, y: number, z: number, r: number) => void) => void) {
    const pts = this.cuts.points.value;
    let n = 0;
    const add = (x: number, y: number, z: number, r: number) => {
      if (n >= CUT_MAX) return;
      TMP.set(x, y, z).applyMatrix4(view);
      pts[n++].set(TMP.x, TMP.y, TMP.z, r);
    };
    protect(add);
    this.cuts.count.value = n;
  }

  // Column cube that never shows: the 4 neighbors are solid ground (no water, bridge or Gariland crown) reaching up to
  // its top, and so is the tile. They were most of the triangles on maps with a per-tile look (1.2 million on Beacon Hill);
  // cutting them pays for the bigger trees and the details (Nov 13). Water is left out: the other front may make it transparent
  private buried(p: Pos, y: number) {
    const solid = (t: Tile) =>
      !t.depth && !!t.look && t.look !== 'water' && t.look !== 'bridge' && !LOOK[t.look].canopy;
    if (!solid(tileAt(this.grid, p))) return false;
    return NEIGHBORS.every(([dx, dy]) => {
      const q = { x: p.x + dx, y: p.y + dy };
      if (!inBounds(this.grid, q)) return false;
      const t = tileAt(this.grid, q);
      return (
        solid(t) && (t.h + 1 + (t.terrain === 'wall' && !LOOK[t.look!].prop ? 2 : 0)) * this.space.step >= y - 1e-6
      );
    });
  }

  // Crypt stairs: on a ramp tile with a dungeon floor (LOOK.stairs) the stairs leave the flat top and climb the whole
  // ramp in its direction, taking up the tile (1 wide and deep); the unit stands in the middle, as on the ramp (world)
  private buildStairs() {
    const at: THREE.Matrix4[] = [];
    for (const [i, t] of this.grid.tiles.entries()) {
      if (!t.ramp || !t.look || !LOOK[t.look].stairs) continue;
      const p = { x: i % this.grid.width, y: Math.floor(i / this.grid.width) },
        w = this.space.world(p),
        f = FACING[t.ramp[0]];
      const rise = t.ramp[1] * this.space.step;
      // the piece climbs toward -z: the rotation takes -z to the ramp direction; its center (z = 2) goes to the tile center. Sunk
      // 1 of the 8 steps: each step's corner sits on the ramp plane or below, and the marker, ring and cursor (lying
      // on that plane) do not vanish behind the steps
      at.push(
        new THREE.Matrix4()
          .makeRotationY(Math.atan2(-f.x, -f.y))
          .setPosition(w.x, w.y - rise / 2 - rise / 8, w.z)
          .multiply(new THREE.Matrix4().makeScale(0.5, rise / 4, 0.25))
          .multiply(new THREE.Matrix4().makeTranslation(0, 0, -2)),
      );
    }
    if (at.length) this.instanced(prepare(this.lookPieces.get(STAIRS)!.clone()), at);
  }

  // Rocks at the foot of ravines (the side stops being a smooth wall of cubes), grass tufts and pebbles at the corner of
  // some tiles. Outside the unit's ring and the water; none of this goes into touch (pick) or the rules.
  private buildDetails() {
    if (!this.lookPieces.has(DETAIL.rock)) return; // map without a per-tile look: no detail pieces
    const g = this.grid;
    const at: Record<keyof typeof DETAIL, THREE.Matrix4[]> = { rock: [], boulder: [], pebble: [], tuft: [] };
    const put = (kind: keyof typeof DETAIL, x: number, y: number, z: number, size: number, turn: number) => {
      const box = pieceBox(this.lookPieces.get(DETAIL[kind])!);
      const k = size / Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
      // base on the ground, sunk 15% of the piece's height: a settled rock, not a landed one
      at[kind].push(
        new THREE.Matrix4()
          .makeRotationY(turn * Math.PI * 2)
          .scale(new THREE.Vector3(k, k, k))
          .setPosition(x, y - (box.min.y + 0.15 * (box.max.y - box.min.y)) * k, z),
      );
    };
    const natural = (t: { look?: string; depth?: number }) =>
      !t.depth && (GREEN.has(t.look ?? '') || ROCKY.has(t.look ?? ''));
    for (const [i, t] of g.tiles.entries()) {
      const p = { x: i % g.width, y: Math.floor(i / g.width) },
        w = this.space.world(p);
      if (!natural(t) || t.terrain === 'wall') continue;
      // ravine: the neighbor is 1 level or more higher at the corner between the two. The rock sits against the wall, near
      // one of the corners (0.45 or more from the center, outside the unit's ring), and the taller one gets another in the middle of the wall
      for (const [d, f] of FACING.entries()) {
        const q = { x: p.x + f.x, y: p.y + f.y };
        if (!inBounds(g, q) || hash(p.x, p.y, 3 + d) > 0.55) continue;
        const u = tileAt(g, q);
        if (!natural(u) && !(u.terrain === 'wall' && ROCKY.has(u.look ?? ''))) continue;
        const ex = w.x + f.x / 2,
          ez = w.z + f.y / 2;
        const low = this.space.surfaceY(p, ex, ez),
          high = u.terrain === 'wall' ? (u.h + 3) * this.space.step : this.space.surfaceY(q, ex, ez);
        if (high - low < this.space.step * 0.9) continue;
        const side = (hash(p.x, p.y, 7 + d) < 0.5 ? -1 : 1) * (0.26 + 0.14 * hash(p.x, p.y, 11 + d));
        const x = ex + f.y * side,
          z = ez + f.x * side;
        put('rock', x, this.space.surfaceY(p, x, z), z, 0.2 + 0.08 * hash(p.x, p.y, 13 + d), hash(p.x, p.y, 17 + d));
        if (high - low >= this.space.step * 1.9)
          put(
            'boulder',
            ex - f.y * side * 0.5,
            low + (high - low) * 0.4,
            ez - f.x * side * 0.5,
            0.26 + 0.08 * hash(p.x, p.y, 19 + d),
            hash(p.x, p.y, 23 + d),
          );
      }
      // tuft or pebble at a tile corner (~0.5 from the center): breaks the top's stamp without looking like an obstacle
      if (t.terrain !== 'floor' || hash(p.x, p.y, 29) > 0.4) continue;
      const cx = w.x + (hash(p.x, p.y, 31) < 0.5 ? -0.36 : 0.36),
        cz = w.z + (hash(p.x, p.y, 37) < 0.5 ? -0.36 : 0.36);
      const green = GREEN.has(t.look ?? '');
      // grass tuft only on block maps: on the smooth terrain it did not match the ground photo (Nov 13, Fernando's request)
      if (!(green && this.terrainTex))
        put(green ? 'tuft' : 'pebble', cx, this.space.surfaceY(p, cx, cz), cz, green ? 0.2 : 0.13, hash(p.x, p.y, 41));
    }
    for (const kind of Object.keys(at) as (keyof typeof DETAIL)[])
      this.instanced(prepare(this.lookPieces.get(DETAIL[kind])!.clone()), at[kind]);
  }
}
