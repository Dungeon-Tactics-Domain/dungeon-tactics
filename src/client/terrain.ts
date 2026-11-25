// Smooth terrain (Nov 13, Fernando's pick in multiple choice: "truly smooth terrain" instead of the KayKit blocks, which
// "look like Minecraft"; textures painted by scripts/assets/paint-textures.py into public/tex). A single mesh for the ground of every open map (crypts
// stay block-based): each tile is flat in the middle (where unit, marker and cursor sit) and the step becomes a slope in the
// outer third. The same mesh continues EXT_RING tiles outward (the extension), darkening to full black, and the river that
// crosses the map continues outside: it starts higher on one side and exits lower on the other, in cascades. Visuals only: the rules
// keep reading each tile's height (grid.ts). The ring and the outside river live in terrain-outer.ts.
import * as THREE from 'three';
import { type Grid, type Tile, tileAt } from '../shared/battle/grid.ts';
import type { Pos } from '../shared/battle/types.ts';
import {
  type Box,
  type Cells,
  changed,
  fillNormals,
  fillVertices,
  gridIndex,
  grow,
  newVerts,
  type Verts,
} from './terrain-grid.ts';
import { EXT_RING, extTone, outerTop, type River, ringOf, streamAt } from './terrain-outer.ts';
import type { WaterLevel } from './water-levels.ts';

// the board and the surroundings still import these from here
export {
  buildStream,
  EXT_RING,
  extH,
  outerTop,
  riverOf,
  riverOutside,
} from './terrain-outer.ts';

const SUB = 6; // subdivisions per tile: the middle (4 of 6) stays flat and the slope takes 1/3 of a tile around each edge

// paint of each tile look: grass, leaves, dirt, snow and stone (stone also appears by itself on slopes)
type Paint = [grass: number, leaves: number, dirt: number, snow: number, stone: number];
export const PAINT: Record<string, Paint> = {
  grass: [1, 0, 0, 0, 0],
  tree: [0.5, 0.5, 0, 0, 0],
  tree2: [0.6, 0.4, 0, 0, 0],
  tree3: [0.6, 0.4, 0, 0, 0],
  tree4: [0.6, 0.4, 0, 0, 0],
  sand: [0.15, 0, 0.85, 0, 0],
  water: [0, 0, 1, 0, 0],
  crates: [0, 0, 1, 0, 0],
  barrel: [0, 0, 1, 0, 0],
  corpse: [0.2, 0, 0.8, 0, 0],
  snow: [0, 0, 0.3, 0.7, 0],
  snow_rock: [0, 0, 0, 0.8, 0.2],
  bare1: [0, 0, 0.3, 0.7, 0],
  bare2: [0, 0, 0.3, 0.7, 0],
  rock: [0, 0, 0, 0, 1],
  summit: [0, 0, 0, 0, 1],
  gold: [0, 0, 0.3, 0, 0.7],
  stone: [0, 0, 0.4, 0, 0.6],
  // crawl caves (src/content/crawl): the dungeon pieces on the stone floor instead of crypt blocks
  rubble: [0, 0, 0.4, 0, 0.6],
  spikes: [0, 0, 0.4, 0, 0.6],
  boulder: [0, 0, 0.4, 0, 0.6],
  // the walkable town (src/content/crawl/town.ts): trodden earth under the houses and their lots
  lot: [0.2, 0, 0.8, 0, 0],
  guild: [0.2, 0, 0.8, 0, 0],
  shop: [0.2, 0, 0.8, 0, 0],
  tavern: [0.2, 0, 0.8, 0, 0],
  smithy: [0.2, 0, 0.8, 0, 0],
  enchanter: [0.2, 0, 0.8, 0, 0],
  gate: [0.2, 0, 0.8, 0, 0],
  home: [0.2, 0, 0.8, 0, 0],
  well: [0, 0, 0.4, 0, 0.6],
};

const VERT_HEAD =
  'attribute vec4 aW; attribute float aStone; varying vec4 vW; varying float vStone; varying vec3 vWPos; varying vec3 vWN;\n';
const FRAG_HEAD =
  'uniform sampler2D tGrass; uniform sampler2D tLeaves; uniform sampler2D tDirt; uniform sampler2D tSnow; uniform sampler2D tCliff;\nvarying vec4 vW; varying float vStone; varying vec3 vWPos; varying vec3 vWN;\n';
// texture blend: the ground by the tile paint; stone on slopes (by steepness) and where the tile is stone, in
// triplanar projection so it does not stretch on cliffs. 0.35 = one 512 px texture every ~3 tiles
const FRAG_MIX = `
vec2 tuv = vWPos.xz * 0.35;
vec3 tg = texture2D(tGrass, tuv).rgb, tl = texture2D(tLeaves, tuv * 1.3).rgb, td = texture2D(tDirt, tuv).rgb, ts = texture2D(tSnow, tuv).rgb;
vec3 base = (tg * vW.x + tl * vW.y + td * vW.z + ts * vW.w) / max(vW.x + vW.y + vW.z + vW.w, 1e-3);
vec3 tn = normalize(vWN), an = abs(tn);
vec3 cl = (texture2D(tCliff, vWPos.zy * 0.45).rgb * an.x + texture2D(tCliff, vWPos.xy * 0.45).rgb * an.z + texture2D(tCliff, vWPos.xz * 0.45).rgb * an.y) / (an.x + an.y + an.z);
float rocky = max(1.0 - smoothstep(0.5, 0.82, tn.y), vStone);
// sun patches on the ground, as in FFT (Nov 13, "painted, FFT-like"): wide noise taken from the grass itself, only on the plane
float dap = smoothstep(0.55, 0.62, dot(texture2D(tGrass, vWPos.xz * 0.045 + 0.3).rgb, vec3(0.333)) * 1.6);
base = mix(base, base * vec3(1.45, 1.32, 0.72), dap * 0.55 * (1.0 - rocky) * vW.x);
diffuseColor.rgb *= mix(base, cl, rocky);
`;

export interface TerrainTextures {
  grass: THREE.Texture;
  leaves: THREE.Texture;
  dirt: THREE.Texture;
  snow: THREE.Texture;
  cliff: THREE.Texture;
  wood: THREE.Texture;
  bark: THREE.Texture;
}
export function loadTerrainTextures(): Promise<TerrainTextures> {
  const loader = new THREE.TextureLoader();
  const one = async (n: string) => {
    const t = await loader.loadAsync(`/tex/${n}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  // wood and bark: the real bridge (bridge.ts)
  return Promise.all(['grass', 'leaves', 'dirt', 'snow', 'cliff', 'wood', 'bark'].map(one)).then(
    ([grass, leaves, dirt, snow, cliff, wood, bark]) => ({ grass, leaves, dirt, snow, cliff, wood, bark }),
  );
}

export interface TerrainOptions {
  step: number;
  // ground height (meters) at world point (x, z) inside tile p: the middle of each tile, the ramp, the water bed
  inner: (p: Pos, x: number, z: number) => number;
  outside: Map<string, WaterLevel>; // outside water (riverOutside): the ground there is the bed
  levels: Map<string, WaterLevel>;
  river: River | null;
  extend: boolean; // with the extension around (EXT_RING tiles); without it, only the board
  tex: TerrainTextures;
}

// `last`: the terrain of the build before (the map builder's edit, Board.rebuild): on a map of the same size it is kept
// and only the vertices of the sub-tiles that changed are worked out and uploaded again
export function buildTerrain(grid: Grid, o: TerrainOptions, last?: THREE.Mesh | null): THREE.Mesh {
  const W = grid.width,
    H = grid.height,
    R = o.extend ? EXT_RING : 0;
  const NX = (W + 2 * R) * SUB,
    NZ = (H + 2 * R) * SUB; // sub-tiles
  const raw = new Float32Array(NX * NZ),
    paint = new Float32Array(NX * NZ * 5),
    tone = new Float32Array(NX * NZ);
  // Per tile first, the same for its SUB x SUB sub-tiles: the outside water, the look, the tone and the height, NaN where
  // it changes inside the tile (a ramp). The outside height scans a square round its tile (extH): run per sub-tile it
  // was most of a 24x24 map's redraw (Nov 25, the map builder redraws on every edit)
  const TW = W + 2 * R,
    TH = H + 2 * R,
    wets: (WaterLevel | undefined)[] = [],
    looks: Paint[] = [],
    tones = new Float32Array(TW * TH),
    tops = new Float32Array(TW * TH);
  for (let j = -R; j < H + R; j++)
    for (let i = -R; i < W + R; i++) {
      const ti = (j + R) * TW + i + R,
        inside = i >= 0 && j >= 0 && i < W && j < H;
      const edge: Tile = tileAt(grid, { x: THREE.MathUtils.clamp(i, 0, W - 1), y: THREE.MathUtils.clamp(j, 0, H - 1) });
      const wet = (wets[ti] = o.outside.get(`${i},${j}`));
      looks[ti] = wet ? PAINT.water : (PAINT[edge.look ?? 'grass'] ?? PAINT.grass);
      // darkens from 1 down to 0.12 over the first EXT_FADE rings and goes to full black over the next EXT_DARK
      tones[ti] = extTone(inside ? 0 : ringOf(grid, i, j));
      tops[ti] = !inside
        ? outerTop(grid, o.step, o.river, i, j)
        : edge.ramp
          ? Number.NaN
          : o.inner({ x: i, y: j }, i + 0.5 - W / 2, j + 0.5 - H / 2);
    }
  for (let b = 0; b < NZ; b++)
    for (let a = 0; a < NX; a++) {
      const u = (a + 0.5) / SUB - R,
        v = (b + 0.5) / SUB - R; // in tiles, 0 = board corner
      const i = Math.floor(u),
        j = Math.floor(v),
        c = b * NX + a,
        ti = (j + R) * TW + i + R;
      const wet = wets[ti];
      const flowing = wet ? streamAt(grid, o.step, o.levels, o.river, u, j) : null;
      raw[c] = Number.isNaN(tops[ti])
        ? o.inner({ x: i, y: j }, u - W / 2, v - H / 2)
        : wet && flowing !== null
          ? flowing - (wet.surface - wet.bed)
          : tops[ti];
      tone[c] = tones[ti];
      const look = looks[ti];
      for (let n = 0; n < 5; n++) paint[c * 5 + n] = look[n];
    }
  const cells: Cells = { raw, tone, paint, NX, NZ },
    x0 = -R - W / 2,
    z0 = -R - H / 2,
    was = last?.userData.cells as Cells | undefined;
  if (last && was?.NX === NX && was.NZ === NZ) {
    last.userData.cells = cells;
    const box = changed(was, cells);
    if (box) redrawPart(last.geometry, cells, box, x0, z0);
    return last;
  }
  const v = newVerts(NX, NZ),
    all = { a0: 0, a1: NX, b0: 0, b1: NZ };
  fillVertices(cells, v, all, x0, z0, SUB);
  fillNormals(v.pos, v.normal, NX, NZ, all);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(v.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(v.normal, 3));
  g.setAttribute('color', new THREE.BufferAttribute(v.col, 3));
  g.setAttribute('aW', new THREE.BufferAttribute(v.w4, 4));
  g.setAttribute('aStone', new THREE.BufferAttribute(v.st, 1));
  g.setIndex(new THREE.BufferAttribute(gridIndex(NX, NZ), 1));
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      tGrass: { value: o.tex.grass },
      tLeaves: { value: o.tex.leaves },
      tDirt: { value: o.tex.dirt },
      tSnow: { value: o.tex.snow },
      tCliff: { value: o.tex.cliff },
    });
    sh.vertexShader =
      VERT_HEAD +
      sh.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvW = aW; vStone = aStone; vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);',
      );
    sh.fragmentShader = FRAG_HEAD + sh.fragmentShader.replace('#include <map_fragment>', FRAG_MIX);
  };
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = mesh.castShadow = true;
  mesh.name = 'terrain';
  mesh.userData.cells = cells;
  return mesh;
}

// The vertices in `box` worked out again in the geometry's own arrays, their normals and their neighbours', and only
// those rows uploaded (the ranges add up until the next frame uploads them: two edits before a frame both reach it)
function redrawPart(g: THREE.BufferGeometry, c: Cells, box: Box, x0: number, z0: number) {
  const at = (n: string) => g.getAttribute(n) as THREE.BufferAttribute,
    arr = (n: string) => at(n).array as Float32Array,
    v: Verts = { pos: arr('position'), col: arr('color'), w4: arr('aW'), st: arr('aStone'), normal: arr('normal') },
    wide = grow(box, c.NX, c.NZ),
    VX = c.NX + 1;
  fillVertices(c, v, box, x0, z0, SUB);
  fillNormals(v.pos, v.normal, c.NX, c.NZ, wide);
  for (const n of ['position', 'normal', 'color', 'aW', 'aStone']) {
    const a = at(n);
    a.addUpdateRange(wide.b0 * VX * a.itemSize, (wide.b1 - wide.b0 + 1) * VX * a.itemSize);
    a.needsUpdate = true;
  }
  g.computeBoundingSphere();
}

// board tiles for touch and mouse (the ray hits the tile, not the slope): an invisible square in the middle of each
export function pickTiles(tiles: { p: Pos; at: THREE.Vector3 }[]): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }),
    tiles.length,
  );
  tiles.forEach((t, n) => m.setMatrixAt(n, new THREE.Matrix4().makeTranslation(t.at.x, t.at.y, t.at.z)));
  m.userData.tiles = tiles.map((t) => t.p);
  return m;
}
