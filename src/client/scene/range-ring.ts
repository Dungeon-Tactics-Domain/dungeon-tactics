// The dotted ring of the longest range: the outline of the tiles within reach, laid on the ground as short flat dashes,
// or in a lit style (mark-kit.ts) as short bevelled strips bent over the ground.
import * as THREE from 'three';
import { type Grid, inBounds, posKey, subOf } from '../../shared/battle/grid.ts';
import { cellsOf, gap } from '../../shared/battle/pathing.ts';
import type { Pos } from '../../shared/battle/types.ts';
import { type Ground, type Lit, onGround, type Path, piece } from './mark-kit.ts';
import type { TileSpace } from './space.ts';

// Is the cell's tile within `range` cells of the unit's cells `from`? Measured to the whole tile's square, like the rule
export const inRing = (grid: Grid, r: { from: Pos[]; range: number }, p: Pos) =>
  inBounds(grid, p) && gap(r.from, cellsOf(tileOf(grid, p), subOf(grid))) <= r.range;
const tileOf = (grid: Grid, p: Pos): Pos => ({ x: p.x - (p.x % subOf(grid)), y: p.y - (p.y % subOf(grid)) });

// Outline of the tiles within `range` cells of the unit's cells `from` (the same distance as the rule), at each tile's
// ground height
export function rangeRing(
  space: TileSpace,
  r: { from: Pos[]; range: number },
  style: Lit | null = null,
  ground?: Ground,
): THREE.Mesh {
  const { width: W, height: H } = space.grid,
    pos: number[] = [],
    strips: Path[] = [];
  const inside = (p: Pos) => inRing(space.grid, r, p);
  const yAt = (p: Pos, x: number, z: number) =>
    (space.levels.get(posKey(p))?.surface ?? space.surfaceY(p, x, z)) + 0.05;
  // flat little dash lying on the ground (WebGL's 1 px line barely showed): 2 triangles from `a` to `b`, 0.07 wide
  const dash = (p: Pos, ax: number, az: number, bx: number, bz: number) => {
    if (style && ground) {
      const at = (k: number) => new THREE.Vector3(ax + (bx - ax) * k, 0, az + (bz - az) * k);
      return void strips.push({ pts: onGround(ground, p, [at(0), at(0.5), at(1)], 0.01), closed: false });
    }
    const nx = -(bz - az),
      nz = bx - ax,
      k = 0.035 / Math.hypot(nx, nz);
    const v = (x: number, z: number, side: number) => [x + nx * k * side, yAt(p, x, z), z + nz * k * side];
    const a1 = v(ax, az, 1),
      a2 = v(ax, az, -1),
      b1 = v(bx, bz, 1),
      b2 = v(bx, bz, -1);
    pos.push(...a1, ...a2, ...b1, ...b1, ...a2, ...b2);
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const p = { x, y };
      if (!inside(p)) continue;
      // each side of the tile that touches an outside tile becomes 3 little dashes (they follow ramp and step)
      for (const [dx, dy, ax, az, bx, bz] of [
        [0, -1, 0, 0, 1, 0],
        [0, 1, 0, 1, 1, 1],
        [-1, 0, 0, 0, 0, 1],
        [1, 0, 1, 0, 1, 1],
      ] as const) {
        if (inside({ x: x + dx, y: y + dy })) continue;
        for (let k = 0; k < 3; k++) {
          const t0 = (k + 0.2) / 3,
            t1 = (k + 0.8) / 3;
          const at = (t: number) => [x + ax + (bx - ax) * t - W / 2, y + az + (bz - az) * t - H / 2];
          const [x0, z0] = at(t0),
            [x1, z1] = at(t1);
          dash(p, x0, z0, x1, z1);
        }
      }
    }
  if (style) {
    const lit = piece(style, strips, 0.04, '#ffd27a');
    lit.renderOrder = 11;
    return lit;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const mesh = new THREE.Mesh(
    g,
    new THREE.MeshBasicMaterial({
      color: '#ffd27a',
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  mesh.renderOrder = 11;
  return mesh;
}
