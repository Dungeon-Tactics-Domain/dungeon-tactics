// The forest-tile trees of the board and their crown cutout, which opens a hole in front of the units, the cursor and
// the marked tiles.
import * as THREE from 'three';
import { inBounds, posKey, tileAt } from '../../shared/battle/grid.ts';
import type { Pos } from '../../shared/battle/types.ts';
import { boxOf as pieceBox, variant } from '../painted.ts';
import { hash, prepare } from '../three-util.ts';
import type { Board } from './board.ts';
import { LOOK } from './board-looks.ts';

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
const TMP = new THREE.Vector3(); // per-frame math without creating objects

export class TreeCrowns {
  has = false; // the map has trees (Board.hasTrees)

  constructor(private readonly board: Board) {}

  // Forest-tile trees, bigger than the tile (TREE_SIZE). Neighboring tree tiles at the same height become a single
  // tree (2x2 first, then 2x1): drawing only, each tile is still a tree in the rules. The group uses the widest model
  // among its tiles'; rotation and size vary by position. The crown gets the cutout (cutMaterial).
  build(legacy: THREE.Object3D) {
    const g = this.board.grid,
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
    const pieceOf = (name: string) => (name ? this.board.lookPieces.get(name)! : legacy);
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
          const c = this.board.space.world({ x, y }).add(new THREE.Vector3((n - 1) / 2, 0, (n - 1) / 2));
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
          this.board.lookPieces,
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
          .reduce((s: THREE.Vector3, p) => s.add(this.board.space.world(p)), new THREE.Vector3())
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
      for (const inst of this.board.instanced(prepare(pieceOf(name).clone()), at)) {
        inst.material = this.cutMaterial(inst.material as THREE.MeshStandardMaterial);
        // the pixel art normal pass swaps everyone's material; the tree uses its own, with the same cutout, and only
        // returns the normal (without this the outline of the cut crown showed up over the unit)
        inst.onBeforeRender = (_r, scene) =>
          void (this.cuts.normals.value = (scene as THREE.Scene).overrideMaterial ? 1 : 0);
        this.has = true;
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
}
