// The board the battle happens on: block columns and per-tile pieces, the smooth painted terrain, water, bridges, edge walls,
// caravan bodies, trees with their crown cutout, stairs and the small details. Built once from the map; after that it only
// animates the water and opens the crown holes the scene asks for.
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FACING, type Grid, inBounds, neighbors, posKey, type Tile, tileAt } from '../../shared/battle/grid.ts';
import type { Pos } from '../../shared/battle/types.ts';
import { EXTEND } from '../ambience-moods.ts';
import { buildBridges } from '../bridge.ts';
import { addDetail } from '../detail.ts';
import { boxOf as pieceBox, variant } from '../painted.ts';
import { DEBRIS } from '../props.ts';
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
import { hash, prepare } from '../three-util.ts';
import { Water } from '../water.ts';
import type { WaterLevel } from '../water-levels.ts';
import { buildBorder, buildCorpses, buildDetails, buildStairs, buildWalls } from './board-extras.ts';
import { LOOK, MOUND, NEIGHBORS, UNDER, WALL_COLOR } from './board-looks.ts';
import type { TileSpace } from './space.ts';
import { TreeCrowns } from './tree-crowns.ts';

const PLAIN_UNITS = param('units') === 'plain';

export class Board {
  readonly tileTops: THREE.Object3D[] = []; // what touch can pick as a tile (pick)
  private water: Water | null = null; // only on maps with water
  private stream: { meshes: THREE.Mesh[]; time: { value: number } } | null = null;
  private readonly crowns: TreeCrowns;
  // tile drawn by the smooth terrain (terrain.ts) instead of blocks: paintable look, plus pieceless wall (stone, brick)
  // stone or snow wall (pieceless wall) also becomes terrain: a stone hill two levels above (rock(t))
  private readonly ground = (t: Tile): boolean =>
    !!this.terrainTex &&
    !!t.look &&
    t.look in PAINT &&
    (t.terrain !== 'wall' || !!LOOK[t.look].prop || MOUND.has(t.look) || t.look === 'corpse' || t.look === 'lot');
  private readonly rock = (t: Tile) => t.terrain === 'wall' && !LOOK[t.look ?? '']?.prop && MOUND.has(t.look ?? '');
  readonly grid: Grid;

  constructor(
    readonly scene: THREE.Scene,
    readonly space: TileSpace,
    readonly models: Map<string, GLTF>,
    pieces: Record<'top' | 'side' | 'stone' | 'tree', THREE.Object3D>,
    readonly lookPieces: Map<string, THREE.Object3D>,
    readonly packClips: THREE.AnimationClip[],
    readonly terrainTex: TerrainTextures | null,
  ) {
    this.grid = space.grid;
    this.crowns = new TreeCrowns(this);
    this.buildBoard(pieces);
  }

  // the map has trees, so the crowns need the cutout points every frame
  get hasTrees(): boolean {
    return this.crowns.has;
  }

  // Points the crowns open a hole for, given by the scene every frame (tree-crowns.ts)
  updateCuts(view: THREE.Matrix4, protect: (add: (x: number, y: number, z: number, r: number) => void) => void) {
    this.crowns.updateCuts(view, protect);
  }

  // water waves and the outside river current, on the battle clock
  // the map's dotted border again, in the mark style of now (BattleScene.restyle)
  restyle() {
    if (this.terrainTex) buildBorder(this, this.space.levels);
  }

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
      buildBorder(this, levels);
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
    buildCorpses(this);
    this.crowns.build(pieces.tree);
    buildStairs(this);
    buildDetails(this);
    buildWalls(this, walls);
  }

  // Tiles with a look (Tile.look): column of whole 1-tile cubes, from the tile top down, with the top piece
  // and the column piece of each look. Whole cube because the cube flattened to the height of one level (0.25 on the old FFT study map) squeezed the
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
      // `canopy` tree that blocks: the ground is the lowest neighbor's (on our maps the height is already the ground's).
      // Pieceless wall on top: two levels above the tile, as without a look; with a piece (column, crate, barrel), the piece is what blocks and the tile stays at ground level.
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
          look.house ? p : undefined,
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

  // open-map pieces (crates, barrels, bridge, walls, trees) with detail.ts's texture and shading;
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

  // One InstancedMesh per piece mesh instead of one object per block: the 20x20 made 2,321 draw calls per frame and fell
  // to 9 fps on the emulated phone (measurement of Nov 11). `tiles` marks the pieces that count as a tile for touch.
  instanced(piece: THREE.Object3D, at: (THREE.Vector3 | THREE.Matrix4)[], tiles?: Pos[]): THREE.InstancedMesh[] {
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

  // Column cube that never shows: the 4 neighbors are solid ground (no water, bridge or tree crown) reaching up to
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
}
