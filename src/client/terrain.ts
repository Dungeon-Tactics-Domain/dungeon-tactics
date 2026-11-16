// Smooth terrain (Nov 13, Fernando's pick in multiple choice: "truly smooth terrain" instead of the KayKit blocks, which
// "look like Minecraft"; textures painted by scripts/assets/paint-textures.py into public/tex). A single mesh for the ground of every open map (crypts
// stay block-based): each tile is flat in the middle (where unit, marker and cursor sit) and the step becomes a slope in the
// outer third. The same mesh continues EXT_RING tiles outward (the extension), darkening to full black, and the river that
// crosses the map continues outside: it starts higher on one side and exits lower on the other, in cascades. Visuals only: the rules
// keep reading each tile's height (grid.ts). The ring and the outside river live in terrain-outer.ts.
import * as THREE from 'three';
import { type Grid, type Tile, tileAt } from '../shared/battle/grid.ts';
import type { Pos } from '../shared/battle/types.ts';
import { EXT_RING, extTone, outerTop, type River, ringOf, streamAt } from './terrain-outer.ts';
import { quads } from './three-util.ts';
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

export function buildTerrain(grid: Grid, o: TerrainOptions): THREE.Mesh {
  const W = grid.width,
    H = grid.height,
    R = o.extend ? EXT_RING : 0;
  const NX = (W + 2 * R) * SUB,
    NZ = (H + 2 * R) * SUB; // sub-tiles
  const raw = new Float32Array(NX * NZ),
    paint = new Float32Array(NX * NZ * 5),
    tone = new Float32Array(NX * NZ);
  for (let b = 0; b < NZ; b++)
    for (let a = 0; a < NX; a++) {
      const u = (a + 0.5) / SUB - R,
        v = (b + 0.5) / SUB - R; // in tiles, 0 = board corner
      const i = Math.floor(u),
        j = Math.floor(v),
        c = b * NX + a;
      const x = u - W / 2,
        z = v - H / 2;
      const inside = i >= 0 && j >= 0 && i < W && j < H;
      const edge: Tile = tileAt(grid, { x: THREE.MathUtils.clamp(i, 0, W - 1), y: THREE.MathUtils.clamp(j, 0, H - 1) });
      const wet = o.outside.get(`${i},${j}`);
      const flowing = wet ? streamAt(grid, o.step, o.levels, o.river, u, j) : null;
      raw[c] = inside
        ? o.inner({ x: i, y: j }, x, z)
        : wet && flowing !== null
          ? flowing - (wet.surface - wet.bed)
          : outerTop(grid, o.step, o.river, i, j);
      const ring = inside ? 0 : ringOf(grid, i, j);
      // darkens from 1 down to 0.12 over the first EXT_FADE rings and goes to full black over the next EXT_DARK
      tone[c] = extTone(ring);
      paint.set(wet ? PAINT.water : (PAINT[edge.look ?? 'grass'] ?? PAINT.grass), c * 5);
    }
  // vertex = average of up to 4 surrounding sub-tiles: the edge between two heights becomes a slope, the middle of the tile stays flat
  const VX = NX + 1,
    VZ = NZ + 1;
  const pos = new Float32Array(VX * VZ * 3),
    col = new Float32Array(VX * VZ * 3),
    w4 = new Float32Array(VX * VZ * 4),
    st = new Float32Array(VX * VZ);
  for (let b = 0; b < VZ; b++)
    for (let a = 0; a < VX; a++) {
      let y = 0,
        k = 0,
        t = 0;
      const p = [0, 0, 0, 0, 0];
      for (const [da, db] of [
        [-1, -1],
        [0, -1],
        [-1, 0],
        [0, 0],
      ]) {
        const ca = a + da,
          cb = b + db;
        if (ca < 0 || cb < 0 || ca >= NX || cb >= NZ) continue;
        const c = cb * NX + ca;
        y += raw[c];
        t += tone[c];
        k++;
        for (let n = 0; n < 5; n++) p[n] += paint[c * 5 + n];
      }
      const v = b * VX + a;
      pos.set([a / SUB - R - W / 2, y / k, b / SUB - R - H / 2], v * 3);
      col.set([t / k, t / k, t / k], v * 3);
      w4.set([p[0] / k, p[1] / k, p[2] / k, p[3] / k], v * 4);
      st[v] = p[4] / k;
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aW', new THREE.BufferAttribute(w4, 4));
  g.setAttribute('aStone', new THREE.BufferAttribute(st, 1));
  g.setIndex(quads([], 0, NX, NZ));
  g.computeVertexNormals();
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
  return mesh;
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
