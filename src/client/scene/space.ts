// Tile ↔ world coordinates of the battle scene: where a tile, a standing unit and the sloped ground are. Every other part of the
// scene (board, markers, units, camera) places things through here, so a ramp or deep water is measured the same everywhere.
import * as THREE from 'three';
import { FACING, type Grid, inBounds, posKey, tileAt } from '../../shared/battle/grid.ts';
import { cellsOf } from '../../shared/battle/pathing.ts';
import type { Pos } from '../../shared/battle/types.ts';
import { DEEP_DROP, raisedDeep, SWIM, WADE, type WaterLevel, waterLevels } from '../water-levels.ts';

export const STEP = 0.5; // height of one level in meters (1 tile = 1 wide), the same as the approved POC

// Ramp and the tile on top it climbs to: the step between the two is walking, not a jump (Nov 13, Fernando's request: "when
// going down the ramp the units are going down jumping; ramps must be walked down"). walkY follows the sloped ground
export function rampLink(grid: Grid, a: Pos, b: Pos): boolean {
  const up = (r: Pos, top: Pos) => {
    const t = tileAt(grid, r).ramp;
    return !!t && r.x + FACING[t[0]].x === top.x && r.y + FACING[t[0]].y === top.y;
  };
  return up(a, b) || up(b, a);
}

export class TileSpace {
  readonly step: number; // height of one level on this map
  readonly levels: Map<string, WaterLevel>; // water bed and surface of each water tile
  private raised?: Set<string>; // deep stretches at the shallow height (water-levels.ts raisedDeep)

  constructor(readonly grid: Grid) {
    this.step = grid.levelHeight ?? STEP;
    this.levels = waterLevels(grid, this.step);
  }

  // battle tile (x, y) → world: x on the X axis, y on the Z axis, map centered at the origin
  world(p: Pos): THREE.Vector3 {
    const t = tileAt(this.grid, p);
    // on the ramp the unit stands midway up the climb; in deep water, lowered like the drawing (cursor and markers do not float)
    const drop = (t.depth ?? 0) >= 2 && !(this.raised ??= raisedDeep(this.grid)).has(posKey(p)) ? DEEP_DROP : 0;
    return new THREE.Vector3(
      p.x - this.grid.width / 2 + 0.5,
      (t.h + 1 + (t.ramp ? t.ramp[1] / 2 : 0) - drop) * this.step,
      p.y - this.grid.height / 2 + 0.5,
    );
  }

  // middle of the square of `size` cells with its corner on `p`, on its highest cell's ground (where a token stands); cells
  // off the map do not count, so a square the cursor pushes past the edge stays where the cursor is
  squareTop(p: Pos, size: number): THREE.Vector3 {
    if (size === 1) return this.world(p);
    const ys = cellsOf(p, size)
      .filter((c) => inBounds(this.grid, c))
      .map((c) => this.world(c).y);
    const w = this.world(p);
    return w.set(w.x + (size - 1) / 2, Math.max(...ys), w.z + (size - 1) / 2);
  }

  // where the unit stands: the tile, lower in shallow water and swimming in deep (markers and cursor follow in world(), on the surface)
  stand(p: Pos): THREE.Vector3 {
    const w = this.world(p),
      d = tileAt(this.grid, p).depth ?? 0;
    return d ? w.setY(w.y - (d >= 2 ? SWIM : WADE) * this.step) : w;
  }

  // Ramp (Tile.ramp): how much the ground rises, in meters, per tile walked in x and in z; null on a flat tile. The same math
  // serves the tile top, the unit, the markers, the cursor and the details, so nothing ends up buried or floating on the climb
  slope(p: Pos): { x: number; z: number } | null {
    const r = tileAt(this.grid, p).ramp;
    return r ? { x: FACING[r[0]].x * r[1] * this.step, z: FACING[r[0]].y * r[1] * this.step } : null;
  }

  // height of the drawn ground at world point (x, z), inside tile p
  surfaceY(p: Pos, x: number, z: number) {
    const w = this.world(p),
      s = this.slope(p);
    return s ? w.y + s.x * (x - w.x) + s.z * (z - w.z) : w.y;
  }

  // lays a flat piece (marker, danger, path point, cursor frame) on the ramp and stretches it along the climb
  // to cover the whole tile seen from above
  lay(o: THREE.Object3D, p: Pos) {
    const s = this.slope(p) ?? { x: 0, z: 0 };
    o.rotation.set(-Math.atan(s.z), 0, Math.atan(s.x));
    o.scale.set(Math.hypot(1, s.x), 1, Math.hypot(1, s.z));
  }

  // Unit height walking between two tiles when one is a ramp: follows the ground when it is continuous (going up the
  // ramp); at the ramp's side there is half a level of corner, and the step arcs over it instead of passing through.
  // The duration is the flat step's (the rule says it is walking, and the footstep sound counts on that)
  walkY(from: Pos, to: Pos, k: number) {
    const a = this.stand(from),
      b = this.stand(to);
    const mx = (a.x + b.x) / 2,
      mz = (a.z + b.z) / 2;
    const ea = this.surfaceY(from, mx, mz),
      eb = this.surfaceY(to, mx, mz);
    if (Math.abs(ea - eb) < 0.01)
      return this.surfaceY(k < 0.5 ? from : to, a.x + (b.x - a.x) * k, a.z + (b.z - a.z) * k);
    const lift = Math.max(0, Math.max(ea, eb) - (a.y + b.y) / 2);
    return a.y + (b.y - a.y) * k + 4 * lift * k * (1 - k);
  }
}
