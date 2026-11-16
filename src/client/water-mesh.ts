// The water's geometry: the subdivided surface of the water tiles (depth, banks and current per vertex for the shader)
// and the sides where the water drops, waterfalls inside the map and the cut of the volume at its edge.
import * as THREE from 'three';
import { type Grid, inBounds, posKey, tileAt } from '../shared/battle/grid.ts';
import type { Pos } from '../shared/battle/types.ts';
import type { River } from './terrain-outer.ts';
import { quads } from './three-util.ts';
import type { WaterLevel } from './water-levels.ts';

const SUB = 8; // squares of the mesh per tile (one vertex per cell)
const FLOW = { deep: 0.45, shallow: 0.3 }; // tiles/s of the river current inside the map (the outside one, terrain-outer.ts, is similar)

const DIRS: [dx: number, dy: number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
]; // north (-z), east (+x), south (+z), west (-x)
const CORNERS: [dx: number, dy: number][] = [
  [1, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
]; // NE, SE, SW, NW

export interface WaterTile {
  p: Pos;
  lv: WaterLevel;
}

// world point in the middle of tile p, at height y
export const tileCenter = (grid: Grid, p: Pos, y = 0) =>
  new THREE.Vector3(p.x - grid.width / 2 + 0.5, y, p.y - grid.height / 2 + 0.5);

// current: only on the rows of the river crossing the map, from the spring (river.dir) to the other side
export const flowOf = (river: River | null, p: Pos, lv: WaterLevel) =>
  river?.rows.includes(p.y) ? -river.dir * (lv.deep ? FLOW.deep : FLOW.shallow) : 0;

// surface: SUB x SUB squares per tile, upward normal (see the top of water.ts about pixel art)
export function surfaceGeometry(
  grid: Grid,
  levels: Map<string, WaterLevel>,
  tiles: WaterTile[],
  river: River | null,
): THREE.BufferGeometry {
  const W = grid.width,
    H = grid.height;
  // land = tile without water; a bridge flush with the water (no own level) lets the water through and gets no foam
  const land = (q: Pos) => inBounds(grid, q) && !levels.has(posKey(q)) && tileAt(grid, q).look !== 'bridge';
  // depth of each tile for the color: land 0 (the color lightens toward the bank), shallow 0.3, deep 1; outside the map, the
  // edge tile (the river continues)
  const depthOf = (i: number, j: number) => {
    const lv = levels.get(`${THREE.MathUtils.clamp(i, 0, W - 1)},${THREE.MathUtils.clamp(j, 0, H - 1)}`);
    return lv ? (lv.deep ? 1 : 0.3) : 0;
  };
  const pos: number[] = [],
    nor: number[] = [],
    loc: number[] = [],
    edge: number[] = [],
    corner: number[] = [],
    dep: number[] = [],
    flow: number[] = [],
    idx: number[] = [];
  for (const { p, lv } of tiles) {
    const e = DIRS.map(([dx, dy]) => +land({ x: p.x + dx, y: p.y + dy }));
    const c = CORNERS.map(([dx, dy]) => +land({ x: p.x + dx, y: p.y + dy }));
    const f = flowOf(river, p, lv),
      base = pos.length / 3;
    for (let b = 0; b <= SUB; b++)
      for (let a = 0; a <= SUB; a++) {
        const u = p.x + a / SUB,
          v = p.y + b / SUB; // in tiles, 0 = map corner
        // smooth depth: average of the 4 tiles whose middle surrounds the vertex (bilinear)
        const fu = u - 0.5,
          fv = v - 0.5,
          i0 = Math.floor(fu),
          j0 = Math.floor(fv),
          tu = fu - i0,
          tv = fv - j0;
        const d =
          (depthOf(i0, j0) * (1 - tu) + depthOf(i0 + 1, j0) * tu) * (1 - tv) +
          (depthOf(i0, j0 + 1) * (1 - tu) + depthOf(i0 + 1, j0 + 1) * tu) * tv;
        pos.push(u - W / 2, lv.surface, v - H / 2);
        nor.push(0, 1, 0);
        loc.push(a / SUB, b / SUB);
        edge.push(...e);
        corner.push(...c);
        // the tile's own weight counts: deep next to the bank stays deep in its middle
        dep.push(Math.max(d, lv.deep ? 0.8 : 0.3) * (lv.deep ? 1 : Math.min(1, d / 0.3)));
        flow.push(f, 0);
      }
    quads(idx, base, SUB, SUB);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aLocal', new THREE.Float32BufferAttribute(loc, 2));
  g.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 4));
  g.setAttribute('aCorner', new THREE.Float32BufferAttribute(corner, 4));
  g.setAttribute('aDepth', new THREE.Float32BufferAttribute(dep, 1));
  g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 2));
  g.setIndex(idx);
  return g;
}

// Visible side of the water (step down to lower water or lower land, map edge): from the surface to the bed or to
// whatever is in front. A step inside the map becomes an arcing waterfall: the water leaves the edge with speed and falls
// (x ∝ √drop, like a jet); at the map edge it is the straight cut of the volume (it also goes down through the bed slice, one level, where
// the scene's smooth side starts). 2 mm outward so it does not fight with the block face
export function sideGeometries(
  grid: Grid,
  levels: Map<string, WaterLevel>,
  tiles: WaterTile[],
  step: number,
): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (const { p, lv } of tiles) {
    const { x, z } = tileCenter(grid, p);
    for (const [dx, dy] of DIRS) {
      const q = { x: p.x + dx, y: p.y + dy };
      const inside = inBounds(grid, q),
        ql = levels.get(posKey(q));
      const front = !inside ? -Infinity : ql ? ql.surface : (tileAt(grid, q).h + 1) * step;
      const bottom = inside ? Math.max(front, lv.bed) : lv.bed - step;
      const drop = lv.surface - bottom;
      if (drop < 0.01) continue;
      const rows = inside ? 8 : 1;
      const pos: number[] = [],
        uv: number[] = [],
        fall: number[] = [];
      for (let r = 0; r <= rows; r++) {
        const s = r / rows; // 0 at the top, 1 at the foot
        const out = 0.502 + (inside ? 0.22 * Math.sqrt(s) * Math.min(1, drop / step) : 0);
        for (const t of [-0.5, 0.5]) {
          // the side runs along the edge (perpendicular to dx, dy)
          pos.push(x + dx * out - dy * t, lv.surface - s * drop, z + dy * out + dx * t);
          uv.push(t + 0.5, 1 - s);
          fall.push(+inside);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute('aFall', new THREE.Float32BufferAttribute(fall, 1));
      g.setIndex(quads([], 0, 1, rows));
      g.computeVertexNormals();
      out.push(g);
    }
  }
  return out;
}
