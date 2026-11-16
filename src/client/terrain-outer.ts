// Outside the board: the heights of the extension ring around the map and the river that continues off it, plus the
// mesh of that outside river. terrain.ts draws the ground with these heights; ambience.ts places the surroundings on them.
import * as THREE from 'three';
import { type Grid, tileAt } from '../shared/battle/grid.ts';
import { quads, smooth } from './three-util.ts';
import { WADE, type WaterLevel } from './water-levels.ts';

// extension around the map (Fernando's request, Nov 13): darkens over EXT_FADE blocks and goes to full black over the next EXT_DARK;
// outside trees and objects vanish into the black over the same stretch (surrounding fog, ambience.ts)
export const EXT_FADE = 2,
  EXT_DARK = 4,
  EXT_RING = EXT_FADE + EXT_DARK;
// tone of each outer ring: darkens right at the 1st tile past the edge and reaches full black at the 4th (Nov 13, Fernando's
// request: "the shading starts at the last edge tile and darkens stronger and faster"); before, it went up to the 6th
const TONES = [1, 0.4, 0.16, 0.05, 0];
export const extTone = (ring: number) => TONES[Math.min(ring, TONES.length - 1)];
const RISE = 0.5; // how much the spring side rises (in levels) every 2 tiles outward, along with the water

// height (h) of the lowest tile on the board within `ring` tiles of (i, j): the extension never goes above it, because the camera
// looks diagonally and a tall column in front of a unit on a low tile hid half the unit (Nov 13 review)
export const extH = (g: Grid, i: number, j: number, ring: number) => {
  let h = Infinity;
  for (let b = j - ring; b <= j + ring; b++)
    for (let a = i - ring; a <= i + ring; a++) {
      if (a >= 0 && b >= 0 && a < g.width && b < g.height) h = Math.min(h, tileAt(g, { x: a, y: b }).h);
    }
  return h;
};
export const ringOf = (g: Grid, i: number, j: number) => Math.max(-i, -j, i - g.width + 1, j - g.height + 1);

// river crossing the map from one side to the other (rows with water on both edges). dir 1: the spring is on the right (x >= W),
// the side where the edge water is higher (in Ash Wood, the ford)
export interface River {
  rows: number[];
  dir: 1 | -1;
}
export function riverOf(grid: Grid, levels: Map<string, WaterLevel>): River | null {
  const W = grid.width;
  const rows = Array.from({ length: grid.height }, (_, y) => y).filter(
    (y) => levels.has(`0,${y}`) && levels.has(`${W - 1},${y}`),
  );
  if (!rows.length) return null;
  const y = rows[0];
  return { rows, dir: levels.get(`${W - 1},${y}`)!.surface >= levels.get(`0,${y}`)!.surface ? 1 : -1 };
}

// how much the outside ground rises on the spring side (in levels): the river "comes from above", and the bank rises with the water
const riseAt = (grid: Grid, river: River | null, i: number) => {
  if (!river) return 0;
  const k = river.dir > 0 ? i - grid.width + 1 : -i;
  return k > 0 ? Math.ceil(k / 2) * RISE : 0; // upward: the bank stays above the continuous rapids (streamAt)
};

// top of the outside ground at (i, j), in meters
export const outerTop = (grid: Grid, step: number, river: River | null, i: number, j: number) =>
  (extH(grid, i, j, ringOf(grid, i, j)) + 1 + riseAt(grid, river, i)) * step;

// Outside river (Nov 13, Fernando's request: "the cascade looks crude... more fluid water... water running down the hill"):
// continuous surface in `u` (tiles, continuous; outside the board), flat on the 1st half of each pair of tiles and dropping as
// rapids on the 2nd, RISE levels per pair. Rises on the spring side and drops on the other; null outside the river rows
export function streamAt(
  grid: Grid,
  step: number,
  levels: Map<string, WaterLevel>,
  river: River | null,
  u: number,
  j: number,
): number | null {
  if (!river?.rows.includes(j) || (u >= 0 && u < grid.width)) return null;
  const right = u >= grid.width;
  const lv = levels.get(`${right ? grid.width - 1 : 0},${j}`)!;
  const k = right ? u - grid.width : -u; // distance from the edge, in tiles
  const up = (right ? 1 : -1) === river.dir ? 1 : -1;
  return lv.surface + up * (Math.floor(k / 2) + smooth(0.5, 1, (k / 2) % 1)) * RISE * step;
}

// outside tiles with water (the middle of each), so the ground and the surrounding trees know where the river is
export function riverOutside(
  grid: Grid,
  step: number,
  levels: Map<string, WaterLevel>,
  river: River | null,
): Map<string, WaterLevel> {
  const out = new Map<string, WaterLevel>();
  if (!river) return out;
  for (const y of river.rows)
    for (const [edge, side] of [
      [grid.width - 1, 1],
      [0, -1],
    ] as const) {
      const deep = levels.get(`${edge},${y}`)!.deep;
      for (let k = 1; k <= EXT_RING; k++) {
        const i = edge + side * k,
          surface = streamAt(grid, step, levels, river, i + 0.5, y)!;
        out.set(`${i},${y}`, { surface, bed: surface - (deep ? step : WADE * step), deep });
      }
    }
  return out;
}

// Outside river mesh: one strip per side, with animated current (stripes moving with the water) and foam where the
// drop is steepest; darkens with the extension down to black, like the ground. `time` runs on the battle clock (scene/timeline.ts)
export function buildStream(
  grid: Grid,
  step: number,
  levels: Map<string, WaterLevel>,
  river: River | null,
): { meshes: THREE.Mesh[]; time: { value: number } } {
  const time = { value: 0 };
  if (!river) return { meshes: [], time };
  const W = grid.width,
    H = grid.height,
    N = 8;
  const z0 = Math.min(...river.rows),
    z1 = Math.max(...river.rows) + 1;
  const meshes = ([1, -1] as const).map((side) => {
    const pos: number[] = [],
      col: number[] = [],
      flow: number[] = [],
      slope: number[] = [];
    const nu = EXT_RING * N,
      nv = (z1 - z0) * 2;
    for (let b = 0; b <= nv; b++)
      for (let a = 0; a <= nu; a++) {
        const k = a / N,
          u = side > 0 ? W + k : -k,
          v = z0 + b / 2;
        const j = Math.min(z1 - 1, Math.floor(v));
        const y = streamAt(grid, step, levels, river, side > 0 ? u + 1e-4 : u - 1e-4, j)!;
        const y2 = streamAt(grid, step, levels, river, side > 0 ? u + 0.05 : u - 0.05, j) ?? y;
        pos.push(u - W / 2, y + 0.01, v - H / 2);
        const ring = Math.floor(k) + 1;
        const t = extTone(ring);
        col.push(t, t, t);
        flow.push(k);
        slope.push(Math.abs(y2 - y) / 0.05);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 1));
    g.setAttribute('aSlope', new THREE.Float32BufferAttribute(slope, 1));
    // the left strip flows toward -x: the vertex order flips so the face keeps pointing up
    g.setIndex(quads([], 0, nu, nv, side < 0));
    g.computeVertexNormals();
    // water flows from the spring outward: on the spring side, toward the edge (k decreases); on the other, away (k increases)
    const dir = side === river.dir ? 1 : -1;
    const mat = new THREE.MeshLambertMaterial({
      color: '#1d4f7a',
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uSTime = time;
      sh.vertexShader =
        'attribute float aFlow; attribute float aSlope; varying float vFlow; varying float vSlope; varying vec2 vSXZ;\n' +
        sh.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvFlow = aFlow; vSlope = aSlope; vSXZ = position.xz;',
        );
      sh.fragmentShader =
        'uniform float uSTime; varying float vFlow; varying float vSlope; varying vec2 vSXZ;\n' +
        sh.fragmentShader.replace(
          '#include <map_fragment>',
          `#include <map_fragment>
        float w = sin(vSXZ.y * 9.0 + vFlow * 3.0) * 0.08;
        float lane = fract(vFlow * 1.6 + ${dir.toFixed(1)} * uSTime * (0.7 + 0.9 * clamp(vSlope, 0.0, 1.5)) + w);
        float streak = smoothstep(0.75, 1.0, lane) * (0.35 + 0.65 * fract(sin(floor(vSXZ.y * 6.0) * 78.233) * 43758.5));
        float foam = clamp(smoothstep(0.15, 0.7, vSlope) * (0.45 + 0.55 * streak) + streak * 0.3, 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.96, 1.0), foam);
        diffuseColor.a = mix(diffuseColor.a, 1.0, foam);`,
        );
    };
    const m = new THREE.Mesh(g, mat);
    m.renderOrder = -1; // together with the map water: markers and cursor on top
    m.receiveShadow = true;
    m.name = 'outer-river';
    return m;
  });
  return { meshes, time };
}
