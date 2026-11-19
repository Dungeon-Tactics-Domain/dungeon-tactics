// What dresses the board without entering the rules: the smooth edge sides, the caravan bodies, the dotted border, the
// crypt stairs and the rocks, tufts and pebbles.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { FACING, inBounds, posKey, tileAt } from '../../shared/battle/grid.ts';
import type { Pos } from '../../shared/battle/types.ts';
import { corpseModel } from '../corpse-squares.ts';
import { unitHeight } from '../markers.ts';
import { boxOf as pieceBox, variant } from '../painted.ts';
import { LITTER } from '../props.ts';
import { hash, prepare } from '../three-util.ts';
import type { WaterLevel } from '../water-levels.ts';
import type { Board } from './board.ts';
import { DETAIL, LOOK, STAIRS } from './board-looks.ts';
import { groundOf, litStyle, onGround, type Path, piece } from './mark-kit.ts';

// Map base as a block (Fernando's requests, Nov 12, looking at FFT's board): all columns end on the same
// ground (y = 0), and the edge sides, from each tile's floor down, are a flat color pulled from the floor above that
// darkens until it vanishes into the background ("the floors at the map edges have no texture and it looks better that way"). The tops keep their texture.
const BASE_DEPTH = 2; // in tiles, below the ground; with 1 the gradient ended before fully darkening
const BACKGROUND = '#1b1626'; // the scene background: the gradient ends in it
const GREEN = new Set(['grass', 'sand', 'tree', 'tree2', 'tree3', 'tree4']); // ground that gets a grass tuft
const ROCKY = new Set(['rock', 'summit', 'snow', 'snow_rock', 'bare1', 'bare2']); // ground that gets a pebble

// Smooth edge sides in a single drawing (one draw call): floor color at the top, already darkened, down to the bottom
export function buildWalls(board: Board, walls: { x: number; z: number; top: number; color: string }[]) {
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
  board.scene.add(mesh);
}

// Caravan bodies: knight and rogue alternating, with the caravan remains beside each (layBody draws the body)
export function buildCorpses(board: Board) {
  board.grid.tiles.forEach((t, i) => {
    if (t.look !== 'corpse' || t.span === 0) return; // split map: one body per whole tile (Tile.span)
    const p = { x: i % board.grid.width, y: Math.floor(i / board.grid.width) };
    if (!layBody(board, p, t.span ?? 1).length) return;
    const w = board.space.world(p);
    // caravan remains beside the body: bottles, sack, plank (props.ts), only on open maps
    const litter = board.lookPieces.get(variant(board.lookPieces, LITTER, hash(p.x, p.y, 8)))?.clone();
    if (litter) {
      const a = hash(p.x, p.y, 10) * Math.PI * 2;
      litter.position.set(w.x + Math.cos(a) * 0.3, w.y, w.z + Math.sin(a) * 0.3);
      litter.rotation.y = a * 3;
      board.scene.add(litter);
    }
  });
}

const STAIN = new THREE.MeshBasicMaterial({ color: '#2a0f0a', transparent: true, opacity: 0.55, depthWrite: false });

// A body over a `span` x `span` square from `p`: still on the last frame of the death animation, darkened, with a dark
// stain on the ground; rotated by tile. Returns what it added to the scene (the battle's restored corpses take it away
// on undo), nothing when the model is not loaded; `def`: the unit that died there, whose model it wears
export function layBody(board: Board, p: Pos, span: number, def?: string): THREE.Object3D[] {
  const gltf = board.models.get(corpseModel(p, def)) ?? board.models.get(corpseModel(p));
  if (!gltf) return [];
  const body = prepare(cloneSkinned(gltf.scene));
  body.traverse((m) => {
    const mesh = m as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
    mat.color.multiplyScalar(0.55); // lifeless: darker and duller than the battle units
    mesh.material = board.shaded(mat);
  });
  const b = new THREE.Box3().setFromObject(body);
  body.scale.setScalar((span * unitHeight('soldier')) / (b.max.y - b.min.y));
  const clip = [...gltf.animations, ...board.packClips].find((c) => c.name === 'Death_A');
  if (clip) {
    const mixer = new THREE.AnimationMixer(body);
    const act = mixer.clipAction(clip);
    act.setLoop(THREE.LoopOnce, 1);
    act.clampWhenFinished = true;
    act.play();
    mixer.update(clip.duration);
  }
  const w = board.space.world(p);
  body.position.copy(w).add(new THREE.Vector3((span - 1) / 2, 0, (span - 1) / 2));
  body.rotation.y = hash(p.x, p.y, 3) * Math.PI * 2;
  // stain with an irregular edge (brushstroke), not a disc
  const blot = new THREE.CircleGeometry(0.42, 14).rotateX(-Math.PI / 2),
    bp = blot.getAttribute('position');
  for (let k = 1; k < bp.count; k++) {
    const r = 0.7 + 0.5 * hash(p.x + (k % 14) * 0.37, p.y, 9);
    bp.setXYZ(k, bp.getX(k) * r, 0, bp.getZ(k) * r);
  }
  const spot = new THREE.Mesh(blot, STAIN);
  spot.position.set(w.x + 0.08, w.y + 0.012, w.z - 0.05);
  spot.scale.set(1, 1, 0.7);
  spot.renderOrder = -2;
  board.scene.add(body, spot);
  return [body, spot];
}

// Discreet dotted line on the edge of the battlefield (Nov 13, Fernando's request): follows the ground height of each
// edge tile (on water, the surface), with a step where the height changes. In a lit mark style (mark-kit.ts) each dash is
// a short bevelled strip bent over the ground. Built again on a change of style: the old one leaves
export function buildBorder(board: Board, levels: Map<string, WaterLevel>) {
  const old = board.scene.getObjectByName('border');
  old?.traverse((o) => {
    (o as THREE.Mesh).geometry?.dispose();
    ((o as THREE.Mesh).material as THREE.Material | undefined)?.dispose();
  });
  old?.removeFromParent();
  const style = litStyle(),
    ground = style ? groundOf(board.scene, board.space) : null,
    strips: Path[] = [];
  const { width: W, height: H } = board.grid,
    pts: THREE.Vector3[] = [];
  const yAt = (p: Pos, x: number, z: number) =>
    (levels.get(posKey(p))?.surface ?? board.space.surfaceY(p, x, z)) + 0.04;
  const side = (cells: Pos[], edge: (p: Pos, k: number) => [number, number]) => {
    const line: THREE.Vector3[] = [];
    for (const p of cells)
      for (let k = 0; k <= 4; k++) {
        const [x, z] = edge(p, k / 4);
        line.push(new THREE.Vector3(x, yAt(p, x, z), z));
      }
    for (let i = 1; i < line.length; i++) pts.push(line[i - 1], line[i]);
    // lit: one dash per quarter of a tile, on the ground of its own tile
    if (ground)
      for (const p of cells)
        for (let k = 0; k < 4; k++) {
          const at = (t: number) => {
            const [x, z] = edge(p, (k + t) / 4);
            return new THREE.Vector3(x, 0, z);
          };
          strips.push({ pts: onGround(ground, p, [at(0.1), at(0.35), at(0.6)]), closed: false });
        }
  };
  const X = (x: number) => x - W / 2,
    Z = (z: number) => z - H / 2;
  const row = (y: number) => Array.from({ length: W }, (_, x) => ({ x, y }));
  const col = (x: number) => Array.from({ length: H }, (_, y) => ({ x, y }));
  side(row(0), (p, k) => [X(p.x + k), Z(0) + 0.01]);
  side(row(H - 1), (p, k) => [X(p.x + k), Z(H) - 0.01]);
  side(col(0), (p, k) => [X(0) + 0.01, Z(p.y + k)]);
  side(col(W - 1), (p, k) => [X(W) - 0.01, Z(p.y + k)]);
  if (style) {
    const lit = piece(style, strips, 0.022, '#f4ecd8', { opacity: 0.8 });
    lit.name = 'border';
    lit.renderOrder = 2;
    lit.castShadow = false; // too thin for the sun's shadow map: it only flickered
    return void board.scene.add(lit);
  }
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
  line.name = 'border';
  line.renderOrder = 2;
  board.scene.add(line);
}

// Crypt stairs: on a ramp tile with a dungeon floor (LOOK.stairs) the stairs leave the flat top and climb the whole
// ramp in its direction, taking up the tile (1 wide and deep); the unit stands in the middle, as on the ramp (world)
export function buildStairs(board: Board) {
  const at: THREE.Matrix4[] = [];
  for (const [i, t] of board.grid.tiles.entries()) {
    if (!t.ramp || !t.look || !LOOK[t.look].stairs) continue;
    const p = { x: i % board.grid.width, y: Math.floor(i / board.grid.width) },
      w = board.space.world(p),
      f = FACING[t.ramp[0]];
    const rise = t.ramp[1] * board.space.step;
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
  if (at.length) board.instanced(prepare(board.lookPieces.get(STAIRS)!.clone()), at);
}

// Rocks at the foot of ravines (the side stops being a smooth wall of cubes), grass tufts and pebbles at the corner of
// some tiles. Outside the unit's ring and the water; none of this goes into touch (pick) or the rules.
export function buildDetails(board: Board) {
  if (!board.lookPieces.has(DETAIL.rock)) return; // map without a per-tile look: no detail pieces
  const g = board.grid;
  const at: Record<keyof typeof DETAIL, THREE.Matrix4[]> = { rock: [], boulder: [], pebble: [], tuft: [] };
  const put = (kind: keyof typeof DETAIL, x: number, y: number, z: number, size: number, turn: number) => {
    const box = pieceBox(board.lookPieces.get(DETAIL[kind])!);
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
      w = board.space.world(p);
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
      const low = board.space.surfaceY(p, ex, ez),
        high = u.terrain === 'wall' ? (u.h + 3) * board.space.step : board.space.surfaceY(q, ex, ez);
      if (high - low < board.space.step * 0.9) continue;
      const side = (hash(p.x, p.y, 7 + d) < 0.5 ? -1 : 1) * (0.26 + 0.14 * hash(p.x, p.y, 11 + d));
      const x = ex + f.y * side,
        z = ez + f.x * side;
      put('rock', x, board.space.surfaceY(p, x, z), z, 0.2 + 0.08 * hash(p.x, p.y, 13 + d), hash(p.x, p.y, 17 + d));
      if (high - low >= board.space.step * 1.9)
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
    if (!(green && board.terrainTex))
      put(green ? 'tuft' : 'pebble', cx, board.space.surfaceY(p, cx, cz), cz, green ? 0.2 : 0.13, hash(p.x, p.y, 41));
  }
  for (const kind of Object.keys(at) as (keyof typeof DETAIL)[])
    board.instanced(prepare(board.lookPieces.get(DETAIL[kind])!.clone()), at[kind]);
}
