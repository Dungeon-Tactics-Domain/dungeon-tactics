// Ambience around the board (Nov 13, Fernando's request: "more realistic scenery... fog, lighting, godrays,
// volumetric; in the forest, more forest-like surroundings"): ground that continues past the edge, forest, rocks and walls in
// rings, fog, light rays, torches and particles. It only draws, like the scene, and with no post-processing: BattleScene
// creates it (create), updates it on the battle clock (frame), follows the phase light (setDaylight) and releases it (dispose).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type Grid, tileAt } from '../shared/battle/grid.ts';
import { SCENARIOS } from '../shared/battle/scenarios.ts';
import { HALF } from '../shared/battle/units.ts';
import { boxOf, loadPaint, variant } from './painted.ts';
import { swapProps } from './props.ts';
import { param } from './store.ts';
import { EXT_RING, extH, outerTop, riverOf, riverOutside } from './terrain.ts';
import { swapTrees } from './trees.ts';
import { waterLevels } from './water-levels.ts';

type Kind = 'forest' | 'field' | 'crypt' | 'frost';
type Pair = [night: string, day: string];
interface Prop {
  model: string;
  n: number;
  d: [number, number];
  h: [number, number];
}
interface Mood {
  low: Pair;
  high: Pair; // fog at the bottom and top of the screen (the top one is the "sky": the farthest)
  near: number;
  far: number; // fog by distance from the board edge: starts at near, closes at far
  mist: number;
  ceiling: number;
  snow: number; // animated low mist, darkness up high (crypt ceiling), snow on what faces up
  ground: string;
  rise: number;
  bump: number; // ground color, slope of the surroundings and height of the mounds
  shade: number; // how much light reaches the surroundings (canopy shade): darker than the board, which stays highlighted
  props: Prop[];
  beams: { n: number; color: Pair; power: [night: number, day: number]; tilt: number }; // tilt 1: toward the sun; 0: plumb
  motes: { n: number; color: Pair; size: number; fall: number; add: boolean; top: number };
  walls?: true; // crypt: walls, columns, torches and crystals
  // scene light on top of the phase light: multiplies the sky and the sun and puts the sun at `at` (position, like the scene's)
  light?: { sky: number; sun: number; at: [number, number, number] };
}

const F = 'forest/',
  M = 'dungeon/';
export const MOODS: Record<Kind, Mood> = {
  // Ash Wood (Nov 13, Fernando's request: "darker... low and directional light, rays between the crowns, dense forest and taller
  // on the 4 sides, closed-forest backdrop"): dark green fog, weak sky and low sun from the side (long shadows)
  forest: {
    low: ['#03070a', '#0c1610'],
    high: ['#0b141a', '#2f4636'],
    near: 2,
    far: 24,
    mist: 0.6,
    ceiling: 0,
    snow: 0,
    ground: '#203a1c',
    rise: 0.22,
    bump: 0.7,
    shade: 0.6,
    props: [
      { model: `${F}Bush_2_A_Color1`, n: 160, d: [0.3, 4], h: [0.4, 1.1] },
      // fuller forest with varied sizes (Nov 13, "fill Ash Wood map with more trees of different sizes")
      { model: `${F}Tree_3_A_Color1`, n: 140, d: [0.4, 3.5], h: [0.9, 1.9] },
      { model: `${F}Tree_1_A_Color1`, n: 120, d: [1, 4], h: [1.8, 3] },
      { model: `${F}Rock_3_A_Color1`, n: 14, d: [0.8, 7], h: [0.4, 1.1] },
      { model: `${F}Rock_1_A_Color1`, n: 10, d: [0.6, 5], h: [0.3, 0.7] },
      { model: `${F}Tree_2_A_Color1`, n: 110, d: [1.5, 7], h: [2.2, 3.5] }, // more forest nearby (Nov 13, Fernando's request: "bigger volume of trees"): the fade wipes out what is far away
      { model: `${F}Tree_1_A_Color1`, n: 110, d: [2.5, 9], h: [3.5, 5] },
      { model: `${F}Tree_3_A_Color1`, n: 80, d: [3, 9], h: [3.5, 4.8] },
      { model: `${F}Tree_2_C_Color1`, n: 70, d: [7, 28], h: [6, 8] },
      { model: `${F}Tree_1_B_Color1`, n: 60, d: [7, 28], h: [6, 8] },
      { model: `${F}Tree_4_B_Color1`, n: 60, d: [8, 28], h: [6.5, 8] },
    ],
    beams: { n: 14, color: ['#8fb0ff', '#ffd79a'], power: [0.1, 0.42], tilt: 1 },
    motes: { n: 360, color: ['#c8ff7a', '#ffe7a3'], size: 0.07, fall: -0.00008, add: true, top: 6 },
    // sky 0.7 (before 0.45): Fernando found Ash Wood "a bit dark" (Nov 13); sun from the side stays, with long shadow
    light: { sky: 0.7, sun: 0.95, at: [-10, 7, 5] },
  },
  field: {
    low: ['#0b0b18', '#7da36a'],
    high: ['#252648', '#b9d3c8'],
    near: 12,
    far: 48,
    mist: 0.06,
    ceiling: 0,
    snow: 0,
    ground: '#5f9a3e',
    rise: 0.12,
    bump: 1.2,
    shade: 0.9,
    props: [
      { model: `${F}Bush_2_A_Color1`, n: 30, d: [0.5, 6], h: [0.4, 0.9] },
      { model: `${F}Rock_3_A_Color1`, n: 16, d: [0.8, 12], h: [0.4, 1.2] },
      { model: `${F}Rock_1_A_Color1`, n: 12, d: [0.6, 8], h: [0.3, 0.7] },
      { model: `${F}Tree_1_A_Color1`, n: 16, d: [5, 22], h: [3, 4.5] },
      { model: `${F}Tree_3_A_Color1`, n: 10, d: [6, 22], h: [3, 4] },
      { model: `${F}Tree_4_A_Color1`, n: 12, d: [9, 30], h: [4, 6] },
    ],
    beams: { n: 0, color: ['#8fb0ff', '#ffe2a6'], power: [0, 0], tilt: 1 },
    motes: { n: 160, color: ['#b8c8ff', '#fff3c4'], size: 0.05, fall: -0.00005, add: true, top: 5 },
  },
  crypt: {
    low: ['#04070b', '#071017'],
    high: ['#010203', '#020407'],
    near: 1.5,
    far: 12,
    mist: 0.75,
    ceiling: 1,
    snow: 0,
    ground: '#2a2c33',
    rise: 0,
    bump: 0.15,
    shade: 0.85,
    props: [
      { model: `${M}column`, n: 10, d: [0.8, 4], h: [0.7, 1.4] },
      { model: `${M}pillar`, n: 8, d: [3.5, 5], h: [2.6, 3.3] },
    ],
    beams: { n: 3, color: ['#8fc6ff', '#8fc6ff'], power: [0.07, 0.09], tilt: 0.25 },
    motes: { n: 220, color: ['#ffb070', '#ffb070'], size: 0.045, fall: -0.00012, add: true, top: 4 },
    walls: true,
  },
  frost: {
    low: ['#060a17', '#8d9db3'],
    high: ['#16234a', '#dde7f1'],
    near: 3,
    far: 26,
    mist: 0.5,
    ceiling: 0,
    snow: 1,
    ground: '#7b8593',
    rise: 0.45,
    bump: 1,
    shade: 0.95,
    props: [
      { model: `${F}Rock_3_A_Color1`, n: 26, d: [0.6, 10], h: [0.5, 1.6] },
      { model: `${F}Rock_1_A_Color1`, n: 14, d: [0.5, 6], h: [0.3, 0.8] },
      { model: `${F}Tree_Bare_1_A_Color1`, n: 12, d: [1, 9], h: [1.5, 2.6] },
      { model: `${F}Tree_Bare_2_A_Color1`, n: 12, d: [1.5, 10], h: [1.8, 3] },
      { model: `${F}Tree_4_A_Color1`, n: 26, d: [5, 24], h: [3, 5] },
      { model: `${F}Tree_4_B_Color1`, n: 26, d: [7, 26], h: [4, 6.5] },
    ],
    beams: { n: 0, color: ['#8fb0ff', '#ffe2a6'], power: [0, 0], tilt: 1 },
    motes: { n: 900, color: ['#dfe8ff', '#ffffff'], size: 0.065, fall: 0.0011, add: false, top: 9 },
  },
};
// the map comes from the grid: campaign stage, developer room and Until Dawn reuse the base map's Grid, and
// the base maps are the first of SCENARIOS (what is found is the map id, not the stage's)
const KIND: Record<string, Kind> = {
  ash_wood: 'forest',
  flooded_crypt: 'crypt',
  crypt_heart: 'crypt',
  frost_pass: 'frost',
};
export const kindOf = (grid: Grid): Kind => {
  const id = Object.keys(SCENARIOS).find((k) => SCENARIOS[k].grid === grid) ?? '';
  // half tiles (half.ts): the split map `<id>½` is drawn with the mood of the whole one it came from
  return id.endsWith(HALF) ? kindOf(SCENARIOS[id.slice(0, -HALF.length)].grid) : (KIND[id] ?? 'field');
};
// ground color that continues each edge tile (the river goes on outside the map, so does Beacon Hill's snow)
const EDGE: Record<string, string> = {
  water: '#1f4a6e',
  bridge: '#1f4a6e',
  snow: '#c9d2dc',
  snow_rock: '#c9d2dc',
  bare1: '#c9d2dc',
  bare2: '#c9d2dc',
  sand: '#9c8a5a',
  rock: '#6a6d76',
  gold: '#6a6d76',
  summit: '#4a4a52',
};
const WALL = [`${M}wall`, `${M}wall_arched`, `${M}wall_broken`],
  TORCH = `${M}torch_mounted`;
const SUN = new THREE.Vector3(6, -12, -4).normalize(); // the light ray comes from where the scene's sun comes from (sun.position -6, 12, 4)
// Nothing in the surroundings rises above this line: with the camera at 32° (tan = 0.625), whatever sits d tiles from the edge up to
// 0.5 + 0.55·d in height never covers a tile or unit, from any angle of the rotation (the lowest tile has its top at 0.5).
// Caps of 8 (models) and 5.5 (ground): higher than that, far away, it gets close to the camera's front plane and little would be seen
export const LIMIT = (d: number) => Math.min(0.5 + 0.55 * d, 8);
const GROUND_MAX = 5.5;
// fade to black around (Nov 13, Fernando's request, default since then; ?fade=off compares): the surroundings' fog
// turns black from 0.2 to 3.2 tiles from the edge, together with the terrain extension (terrain.ts extTone); the board
// does not get this fog
const FADE = param('fade') !== 'off';
// map extension: 'texture' (default since Nov 13, "I want the fade to black and the texture") is the smooth terrain from terrain.ts
// continuing outward; ?extension=dark and ?extension=gray are the block-based test versions from here; ?extension=none removes
export const EXTEND = param('extension') || 'texture';
const TEST_RING = 5; // tiles of the block-based test versions
const DARK_TONE: Record<string, string> = {
  grass: '#3f8a35',
  tree: '#3f8a35',
  tree2: '#3f8a35',
  tree3: '#3f8a35',
  tree4: '#3f8a35',
  sand: '#b39a5e',
  wood: '#8a6a44',
  brick: '#8a5a44',
  rock: '#7a7d86',
  gold: '#7a7d86',
  summit: '#5a5a62',
  stone: '#8a8c92',
  snow: '#dfe6ee',
  snow_rock: '#9aa3ad',
  bare1: '#dfe6ee',
  bare2: '#dfe6ee',
};
const DARK_FALLBACK = '#6b6f7a'; // crypt floors, altar and the rest: stone

// seeded draw: the same map always builds the same surroundings
const seeded = (seed: number) => () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
const hash = (x: number, z: number) => {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
function noise(x: number, z: number) {
  const ix = Math.floor(x),
    iz = Math.floor(z),
    fx = x - ix,
    fz = z - iz,
    u = fx * fx * (3 - 2 * fx),
    v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz),
    b = hash(ix + 1, iz),
    c = hash(ix, iz + 1),
    d = hash(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const smooth = (a: number, b: number, x: number) => {
  const k = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return k * k * (3 - 2 * k);
};

// Surroundings fog, injected into their materials (the board stays sharp: none of this touches the scene's materials).
// By distance from the edge (not from the camera, which rotates and zooms) and with the screen's color from bottom to top, so the distance
// fades into the same background gradient from any angle.
const FOG_HEAD = `varying vec3 vAmbW; varying vec3 vAmbN; varying float vAmbY; varying float vAmbZ;
uniform vec3 ambLow; uniform vec3 ambHigh; uniform vec2 ambHalf; uniform float ambNear; uniform float ambFar;
uniform float ambMist; uniform float ambCeil; uniform float ambSnow;
`;
const FOG_VERT = `#include <project_vertex>
vec4 ambW = vec4(transformed, 1.0); vec3 ambN = objectNormal;
#ifdef USE_INSTANCING
ambW = instanceMatrix * ambW; ambN = mat3(instanceMatrix) * ambN;
#endif
vAmbW = (modelMatrix * ambW).xyz; vAmbN = normalize(mat3(modelMatrix) * ambN); vAmbY = gl_Position.y / gl_Position.w * 0.5 + 0.5; vAmbZ = -mvPosition.z;`;
const SNOW_FRAG = `#include <map_fragment>
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.9, 0.96), ambSnow * smoothstep(0.45, 0.8, vAmbN.y));`;
const FOG_FRAG = `float ambD = length(max(abs(vAmbW.xz) - ambHalf, 0.0));
float ambF = smoothstep(ambNear, ambFar, ambD);
ambF = max(ambF, ambMist * 0.6 * (1.0 - smoothstep(-1.6, 0.4, vAmbW.y)) * smoothstep(0.5, 5.0, ambD)); // low mist on the ground
ambF = max(ambF, ambCeil * smoothstep(1.2, 4.5, vAmbW.y)); // crypt: the top vanishes into the dark, as if there were a ceiling
// stuck to the camera (30 from the focus, near 0.1; only with the whole map in view, at the bottom edge): fades into the mist instead of
// showing the hollow of the model cut by the front plane (a light ring was left on the 20x20)
if (vAmbZ < 1.5) discard;
ambF = max(ambF, 1.0 - smoothstep(1.5, 5.0, vAmbZ));
gl_FragColor.rgb = mix(gl_FragColor.rgb, mix(ambLow, ambHigh, clamp(vAmbY, 0.0, 1.0)), ambF);
#include <tonemapping_fragment>`;

// Pixel art redraws the scene with the normal material (RenderPixelatedPass): light, fog and particles turned into solid
// plates with outlines. In that pass they do not draw (onBeforeRender runs before each object is drawn).
const skipNormalPass = (o: THREE.Object3D) => {
  o.onBeforeRender = (_r, scene, _c, geo) => geo.setDrawRange(0, scene.overrideMaterial ? 0 : Infinity);
};

export class Ambience {
  readonly root = new THREE.Group();
  private scene: THREE.Scene | null = null;
  private sky: THREE.HemisphereLight | undefined;
  private sun: THREE.DirectionalLight | undefined;
  private k = 1; // phase light (setDaylight); with no call, the usual light, which is daytime
  private readonly u = {
    ambLow: { value: new THREE.Color() },
    ambHigh: { value: new THREE.Color() },
    ambHalf: { value: new THREE.Vector2() },
    ambNear: { value: 0 },
    ambFar: { value: 0 },
    ambMist: { value: 0 },
    ambCeil: { value: 0 },
    ambSnow: { value: 0 },
    uTime: { value: 0 },
  };
  private readonly beams: { mesh: THREE.Mesh; top: THREE.Vector3; dir: THREE.Vector3; w: number; len: number }[] = [];
  private readonly glows: { mesh: THREE.Mesh; size: number; seed: number; light?: THREE.PointLight }[] = [];
  private readonly beamU = { uColor: { value: new THREE.Color() }, uPower: { value: 0 }, uTime: this.u.uTime };
  private readonly moteU = { uColor: { value: new THREE.Color() }, uTime: this.u.uTime, uScale: { value: 1 } };
  private readonly textures: THREE.Texture[] = [];
  private readonly hw: number;
  private readonly hh: number;
  // ground of the smooth outside terrain (terrain.ts), where it exists: nearby trees and rocks land on it
  private readonly outer: { step: number; river: ReturnType<typeof riverOf>; water: Set<string> } | null;

  constructor(
    private readonly grid: Grid,
    private readonly mood: Mood,
    models: Map<string, THREE.Object3D>,
  ) {
    this.hw = grid.width / 2;
    this.hh = grid.height / 2;
    const u = this.u;
    u.ambHalf.value.set(this.hw, this.hh);
    // fade: outside trees and objects vanish into black together with the ground (terrain.ts extTone), right after the edge
    Object.assign(u, {
      ambNear: { value: FADE ? 0.2 : mood.near },
      ambFar: { value: FADE ? 3.2 : mood.far },
      ambMist: { value: mood.mist },
      ambCeil: { value: mood.ceiling },
      ambSnow: { value: mood.snow },
    });
    const rand = seeded(grid.width * 131 + grid.height * 7 + grid.tiles.length);
    if (EXTEND === 'texture' && !mood.walls && grid.tiles.some((t) => t.look)) {
      const step = grid.levelHeight ?? 0.5,
        levels = waterLevels(grid, step),
        river = riverOf(grid, levels);
      this.outer = { step, river, water: new Set(riverOutside(grid, step, levels, river).keys()) };
    } else this.outer = null;
    this.buildGround();
    // not in the crypt: the walls, torches and crystals sit in that band and vanished inside the columns (Nov 13 review)
    if (EXTEND !== 'none' && EXTEND !== 'texture' && !mood.walls) this.buildExtension(rand); // texture: the scene draws it (scene/board.ts)
    for (const p of mood.props) this.scatter(p, models, rand);
    if (mood.walls) this.buildCrypt(models, rand);
    this.buildMist();
    Object.assign(this.beamU, { ambHalf: u.ambHalf, ambNear: u.ambNear, ambFar: u.ambFar }); // the same ones as the fog (swapped above)
    this.buildBeams(rand);
    this.buildMotes(rand);
  }

  // where a surroundings model lands: on the smooth outside terrain (up to EXT_RING tiles) or on the surroundings ground; null
  // on top of the outside river
  private propY(x: number, z: number): number | null {
    if (!this.outer || this.out(x, z) >= EXT_RING) return this.height(x, z);
    const i = Math.floor(x + this.hw),
      j = Math.floor(z + this.hh);
    if (this.outer.water.has(`${i},${j}`)) return null;
    // road leaving the map: clearing, no tree in the way (Nov 13, Fernando's request: "the path the adventurers
    // come from must stay open, opening a clearing in the forest")
    const edge = tileAt(this.grid, {
      x: THREE.MathUtils.clamp(i, 0, this.grid.width - 1),
      y: THREE.MathUtils.clamp(j, 0, this.grid.height - 1),
    });
    if (edge.look === 'sand') return null;
    return outerTop(this.grid, this.outer.step, this.outer.river, i, j);
  }

  // distance to the board edge (0 on top of it), with the map centered at the origin as in the scene
  private out(x: number, z: number) {
    return Math.hypot(Math.max(Math.abs(x) - this.hw, 0), Math.max(Math.abs(z) - this.hh, 0));
  }

  private edgeLook(x: number, z: number) {
    const c = (v: number, n: number) => THREE.MathUtils.clamp(Math.floor(v + n / 2), 0, n - 1);
    return tileAt(this.grid, { x: c(x, this.grid.width), y: c(z, this.grid.height) }).look ?? '';
  }

  // ground height: one step below the board at the edge (the map becomes a plateau), rising around like a basin
  private height(x: number, z: number) {
    const m = this.mood,
      d = this.out(x, z);
    let y =
      -0.7 -
      0.3 * smooth(0, 3, d) +
      m.rise * Math.max(0, d - 1.5) +
      m.bump * smooth(2, 10, d) * (noise(x * 0.11, z * 0.11) * 2 - 1);
    if (EDGE[this.edgeLook(x, z)] === EDGE.water) y -= 0.35 * (1 - smooth(4, 14, d)); // the river goes on in a deep bed
    // under the smooth outside terrain (terrain.ts) the surroundings ground sits lower: it showed over it on Beacon Hill
    if (this.outer && d < EXT_RING + 1) y = Math.min(y, -1.5);
    return Math.min(y, LIMIT(d) - 0.3, GROUND_MAX);
  }

  private material(src: THREE.Material | null, opts: THREE.MeshLambertMaterialParameters = {}) {
    const s = src as THREE.MeshStandardMaterial | null;
    // KayKit textures are palettes: no mipmap and nearest pixel, as in the scene (prepare)
    if (s?.map && !s.userData.procedural)
      Object.assign(s.map, {
        generateMipmaps: false,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        needsUpdate: true,
      });
    if (s?.map) this.textures.push(s.map);
    // Lambert: cheaper than the models' Standard, and from afar the difference is not visible
    const mat = new THREE.MeshLambertMaterial({
      map: s?.map ?? null,
      color: new THREE.Color(s?.color ?? 0xffffff).multiplyScalar(this.mood.shade),
      vertexColors: !!s?.vertexColors,
      ...opts,
    });
    mat.customProgramCacheKey = () => 'amb';
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.u);
      sh.vertexShader = FOG_HEAD + sh.vertexShader.replace('#include <project_vertex>', FOG_VERT);
      sh.fragmentShader =
        FOG_HEAD +
        sh.fragmentShader
          .replace('#include <map_fragment>', SNOW_FRAG)
          .replace('#include <tonemapping_fragment>', FOG_FRAG);
    };
    return mat;
  }

  private buildGround() {
    const size = Math.max(this.hw, this.hh) * 2 + 80; // covers the whole screen even with the whole map in view (F) on a wide monitor
    const n = Math.ceil(size);
    const g = new THREE.PlaneGeometry(size, size, n, n).rotateX(-Math.PI / 2);
    const pos = g.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    const base = new THREE.Color(this.mood.ground),
      c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i),
        z = pos.getZ(i),
        d = this.out(x, z);
      pos.setY(i, this.height(x, z));
      const edge = EDGE[this.edgeLook(x, z)];
      // near the edge it takes the neighboring tile's color; far away, the place's color, with patches and darker
      c.copy(base).lerp(
        new THREE.Color(edge ?? this.mood.ground),
        edge ? 1 - smooth(0.5, edge === EDGE.water ? 12 : 6, d) : 0,
      );
      c.multiplyScalar((0.8 + 0.35 * noise(x * 0.35, z * 0.35)) * (1 - 0.3 * smooth(3, 18, d))).toArray(colors, i * 3);
      // under the smooth outside terrain the ground is black: through the terrain edge the camera saw it from below (green strip on Beacon Hill)
      if (this.outer && d < EXT_RING + 0.5) c.setScalar(0).toArray(colors, i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    this.root.add(new THREE.Mesh(g, this.material(null, { vertexColors: true, flatShading: true })));
  }

  // Extension (Nov 13, Fernando's request: "black and white tiles outside the limit... just to give the vibe
  // that the map continues"): TEST_RING tiles of gray around the board, no rules or clicks. Each one continues the
  // height of the nearest edge tile or sits 1 level below, never above: higher, in front, it covered units.
  private buildExtension(rand: () => number) {
    const { width: W, height: H } = this.grid,
      step = this.grid.levelHeight ?? 0.5,
      BOTTOM = -3;
    const at: THREE.Matrix4[] = [],
      tones: THREE.Color[] = [];
    for (let j = -TEST_RING; j < H + TEST_RING; j++)
      for (let i = -TEST_RING; i < W + TEST_RING; i++) {
        if (i >= 0 && j >= 0 && i < W && j < H) continue;
        const t = tileAt(this.grid, { x: THREE.MathUtils.clamp(i, 0, W - 1), y: THREE.MathUtils.clamp(j, 0, H - 1) });
        if (t.look === 'water' || t.look === 'bridge') continue; // the river goes on in the surroundings ground
        const ring = Math.max(-i, -j, i - W + 1, j - H + 1);
        // height = the lowest board tile within `ring` tiles (Nov 13 review): the camera looks diagonally, and copying only the tile
        // in a straight line left a tall column in front of a unit on a low tile beside it (it covered half a unit on Beacon Hill)
        const top = (extH(this.grid, i, j, ring) + 1 - (rand() < 0.15 + 0.12 * ring ? 1 : 0)) * step;
        if (top <= BOTTOM + 0.1) continue;
        const x = i - this.hw + 0.5,
          z = j - this.hh + 0.5;
        at.push(new THREE.Matrix4().makeScale(0.96, top - BOTTOM, 0.96).setPosition(x, (top + BOTTOM) / 2, z));
        const shade = (0.62 + 0.12 * rand()) * (1 - 0.07 * ring); // darkens outward
        // in the dark, canopy shadow on top (Fernando's request, "with a shadow over them"): patches by noise
        const dapple = 0.45 + 0.55 * noise(x * 0.3, z * 0.3);
        tones.push(
          EXTEND !== 'gray'
            ? new THREE.Color(DARK_TONE[t.look ?? ''] ?? DARK_FALLBACK).multiplyScalar(shade * 0.5 * dapple)
            : new THREE.Color().setScalar(shade),
        );
      }
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.material(null), at.length);
    at.forEach((m, k) => {
      mesh.setMatrixAt(k, m);
      mesh.setColorAt(k, tones[k]);
    });
    mesh.receiveShadow = true; // the real shadow of the outside trees falls on top
    mesh.name = 'extension'; // the line-of-sight test measures the extension by the edge tile, not by LIMIT
    this.root.add(mesh);
  }

  // One InstancedMesh per model (each is a single mesh in KayKit), with the base on the ground and the middle at x and z at the origin
  private instances(src: THREE.Object3D, at: THREE.Matrix4[]) {
    if (!at.length) return;
    src.updateMatrixWorld(true);
    let mesh: THREE.Mesh | null = null;
    src.traverse((o) => {
      if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh;
    });
    const m = mesh as unknown as THREE.Mesh;
    const g = m.geometry.clone().applyMatrix4(m.matrixWorld);
    g.computeBoundingBox();
    const b = (src.userData.box as THREE.Box3 | undefined) ?? g.boundingBox!; // painted piece: the box above ground (the root goes below it)
    g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
    const inst = new THREE.InstancedMesh(g, this.material(m.material as THREE.Material), at.length);
    at.forEach((m, i) => inst.setMatrixAt(i, m));
    this.root.add(inst);
  }

  // Scatters a model in the ring [d0, d1] from the edge, with the size capped so it does not exceed LIMIT
  private scatter(p: Prop, models: Map<string, THREE.Object3D>, rand: () => number) {
    const size = boxOf(models.get(p.model)!).getSize(new THREE.Vector3());
    for (let i = 1; models.has(`${p.model}~${i}`); i++)
      size.max(boxOf(models.get(`${p.model}~${i}`)!).getSize(new THREE.Vector3())); // the widest variation rules the cap
    // the crown leans toward the board side (half diagonal, any rotation): the top must fit in LIMIT at the nearest point
    const lean = Math.hypot(size.x, size.z) / 2 / size.y;
    const at = new Map<string, THREE.Matrix4[]>(); // per variation of the piece (painted.ts variant)
    let n = 0;
    const span = (a: number, b: number) => a + (b - a) * rand();
    // nothing beyond 85% of full fog: it vanishes entirely and, in pixel art, only the dark outline was left in the middle of the mist
    const reach = Math.min(p.d[1], this.mood.far * 0.85);
    for (let tries = 0; n < p.n && tries < p.n * 30; tries++) {
      const x = span(-this.hw - reach, this.hw + reach),
        z = span(-this.hh - reach, this.hh + reach),
        d = this.out(x, z);
      if (d < p.d[0] || d > reach) continue;
      const y = this.propY(x, z);
      if (y === null) continue; // on top of the outside river
      // y + h <= 0.5 + 0.55·(d - lean·h), and the cap of 8
      const h = Math.min(span(p.h[0], p.h[1]), (0.5 + 0.55 * d - y) / (1 + 0.55 * lean), 8 - y);
      if (h < p.h[0] * 0.6) continue; // does not fit there without covering the board
      const k = h / size.y;
      // sinks a little: on sloped ground the base does not hang in the air
      const name = variant(models, p.model, hash(x, z)),
        list = at.get(name) ?? [];
      at.set(name, list);
      n++;
      list.push(
        new THREE.Matrix4().compose(
          new THREE.Vector3(x, y - 0.06 * h, z),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2),
          new THREE.Vector3(k, k, k),
        ),
      );
    }
    for (const [name, list] of at) this.instances(models.get(name)!, list);
  }

  // Crypt: walls in a rectangle around (facing the board), torches on them, lit torches near the edge
  // (with real light) and blue crystals on the floor
  private buildCrypt(models: Map<string, THREE.Object3D>, rand: () => number) {
    const gap = 5.5,
      H = 3.4; // wall 5.5 tiles from the edge, 3.4 high: below LIMIT (5.5) with the ground at -1
    const walls = WALL.map(() => [] as THREE.Matrix4[]),
      torches: THREE.Matrix4[] = [];
    const k = H / 4; // the KayKit wall is 4 x 4
    const up = new THREE.Vector3(0, 1, 0);
    const sides = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ] as const;
    sides.forEach(([sx, sz], side) => {
      const along = sx ? this.hh + gap : this.hw + gap; // half width of the side
      const n = Math.ceil((along * 2) / (4 * k));
      const rot = new THREE.Quaternion().setFromAxisAngle(up, -side * (Math.PI / 2));
      for (let i = 0; i < n; i++) {
        const t = -along + (i + 0.5) * ((along * 2) / n);
        const x = sx ? sx * (this.hw + gap) : t,
          z = sz ? sz * (this.hh + gap) : t;
        const y = this.height(x * 0.97, z * 0.97);
        walls[Math.floor(rand() * walls.length)].push(
          new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), rot, new THREE.Vector3((along * 2) / n / 4, k, k)),
        );
        if (i % 2 === 1) {
          // torch on the inner face of the wall, at half height
          const p = new THREE.Vector3(x - sx * 0.55, y + H * 0.55, z - sz * 0.55);
          torches.push(new THREE.Matrix4().compose(p, rot, new THREE.Vector3(1.1, 1.1, 1.1)));
          this.glow(p.clone().setY(p.y + 0.55), '#ffa040', 1.4, rand());
        }
      }
    });
    WALL.forEach((name, i) => this.instances(models.get(name)!, walls[i]));
    this.instances(models.get(TORCH)!, torches);
    // standing torches at the four corners, near the edge: their warm light reaches the board (only 4 lights: each one costs on every pixel)
    const posts: THREE.BufferGeometry[] = [],
      crystals: THREE.BufferGeometry[] = [];
    for (const [sx, sz] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      const p = new THREE.Vector3(sx * (this.hw + 1.2), 0, sz * (this.hh + 1.2));
      p.y = this.height(p.x, p.z) + 1.6;
      const light = new THREE.PointLight('#ff9a3c', 7, 9, 1.6);
      light.position.copy(p);
      this.root.add(light);
      this.glow(p, '#ffa040', 1.8, rand(), light);
      posts.push(new THREE.CylinderGeometry(0.06, 0.08, 1.6, 6).translate(p.x, p.y - 0.8, p.z));
    }
    // crystals: stretched octahedra that glow on their own (MeshBasic, no light), in groups of 3. Posts and crystals in a
    // single drawing each (they were 16 draw calls, double with pixel art)
    for (let i = 0; i < 4; i++) {
      // one side of the rectangle and a point along it: always d tiles from the edge (never on top of the board)
      const d = 1.5 + rand() * 3,
        along = rand() * 2 - 1,
        sign = rand() < 0.5 ? -1 : 1;
      const [x, z] =
        i % 2 ? [along * (this.hw + d), sign * (this.hh + d)] : [sign * (this.hw + d), along * (this.hh + d)];
      const y = this.height(x, z);
      for (let j = 0; j < 3; j++) {
        const at = new THREE.Vector3(x + (rand() - 0.5) * 0.6, y + 0.3, z + (rand() - 0.5) * 0.6);
        const turn = new THREE.Quaternion().setFromEuler(
          new THREE.Euler((rand() - 0.5) * 0.6, rand() * 3, (rand() - 0.5) * 0.6),
        );
        crystals.push(
          new THREE.OctahedronGeometry(0.18 + rand() * 0.12)
            .scale(1, 2.2, 1)
            .applyMatrix4(new THREE.Matrix4().compose(at, turn, new THREE.Vector3(1, 1, 1))),
        );
      }
      this.glow(new THREE.Vector3(x, y + 0.5, z), '#4fd8ff', 1.4, rand());
    }
    this.root.add(
      new THREE.Mesh(mergeGeometries(posts), this.material(null, { color: '#3a2a20' })),
      new THREE.Mesh(mergeGeometries(crystals), new THREE.MeshBasicMaterial({ color: '#7ff3ff' })),
    );
    for (const g of [...posts, ...crystals]) g.dispose();
  }

  private glowTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    this.textures.push(t);
    return t;
  }

  private glowTex: THREE.Texture | null = null;
  // flame or crystal glow: plane facing the camera, additive, flickering per frame
  private glow(p: THREE.Vector3, color: string, size: number, seed: number, light?: THREE.PointLight) {
    this.glowTex ??= this.glowTexture();
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: this.glowTex,
        color,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    mesh.position.copy(p);
    skipNormalPass(mesh);
    this.root.add(mesh);
    this.glows.push({ mesh, size, seed: seed * 100, light });
  }

  // Low mist: a wide plane a little above the ground, with noise that moves slowly; vanishes over the board
  private buildMist() {
    if (!this.mood.mist) return;
    const size = Math.max(this.hw, this.hh) * 2 + 60;
    const mat = new THREE.ShaderMaterial({
      uniforms: this.u,
      transparent: true,
      depthWrite: false,
      vertexShader:
        'varying vec3 vAmbW; varying float vAmbY; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vAmbW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; vAmbY = gl_Position.y / gl_Position.w * 0.5 + 0.5; }',
      fragmentShader: `${FOG_HEAD} uniform float uTime;
        float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
        void main() {
          float d = length(max(abs(vAmbW.xz) - ambHalf, 0.0));
          float k = n(vAmbW.xz * 0.16 + vec2(uTime * 0.00004, uTime * 0.000025)) * 0.6 + n(vAmbW.xz * 0.42 - vec2(uTime * 0.00007, 0.0)) * 0.4;
          float a = ambMist * smoothstep(0.3, 3.0, d) * smoothstep(0.3, 0.85, k);
          gl_FragColor = vec4(mix(ambLow, ambHigh, clamp(vAmbY, 0.0, 1.0)) * 1.15, a);
        }`,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), mat);
    mesh.position.y = -0.35;
    mesh.renderOrder = 1; // after the ground and the models, which are opaque
    skipNormalPass(mesh);
    this.root.add(mesh);
  }

  // Light rays (god rays): long strips in the sun's direction, additive, always sideways to the camera (they rotate around
  // their own axis per frame); some fall on the board, weak enough not to hide the tiles
  private buildBeams(rand: () => number) {
    const b = this.mood.beams;
    if (!b.n) return;
    const mat = new THREE.ShaderMaterial({
      uniforms: this.beamU,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      vertexShader:
        'varying vec2 vUv; varying vec2 vBeam; varying vec3 vBW; attribute vec2 beam; void main() { vUv = uv; vBeam = beam; vBW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 uColor; uniform float uPower; uniform float uTime; uniform vec2 ambHalf; uniform float ambNear; uniform float ambFar; varying vec2 vUv; varying vec2 vBeam; varying vec3 vBW;
        void main() {
          float across = pow(1.0 - abs(vUv.x * 2.0 - 1.0), 1.6);
          float along = (1.0 - smoothstep(0.55, 1.0, vUv.y)) * smoothstep(0.0, 0.12, vUv.y);
          float dust = 0.7 + 0.3 * sin(vUv.y * 22.0 + uTime * 0.0011 + vBeam.x) * sin(vUv.x * 9.0 - uTime * 0.0006);
          float breathe = 0.55 + 0.45 * sin(uTime * 0.0004 + vBeam.x);
          // vanishes together with the fog: with the fade to black, the ray outside the map drew a light streak in the dark (Beacon Hill)
          float fade = 1.0 - smoothstep(ambNear, ambFar, length(max(abs(vBW.xz) - ambHalf, 0.0)));
          gl_FragColor = vec4(uColor * uPower * vBeam.y * across * along * dust * breathe * fade, 1.0);
        }`,
    });
    const sun = this.mood.light ? new THREE.Vector3(...this.mood.light.at).negate().normalize() : SUN;
    const dir = sun
      .clone()
      .lerp(new THREE.Vector3(0, -1, 0), 1 - b.tilt)
      .normalize();
    for (let i = 0; i < b.n; i++) {
      // one third falls on the board, at 35% strength (the tile and the unit below stay legible); the rest in the surrounding forest
      const onBoard = i % 3 === 0;
      const g = new THREE.PlaneGeometry(1, 1).translate(0, -0.5, 0);
      g.setAttribute(
        'beam',
        new THREE.Float32BufferAttribute(new Array(4).fill([rand() * 100, onBoard ? 0.35 : 1]).flat(), 2),
      );
      const mesh = new THREE.Mesh(g, mat);
      mesh.matrixAutoUpdate = false;
      skipNormalPass(mesh);
      const r = onBoard ? 0 : 1 + rand() * 7;
      const a = rand() * Math.PI * 2;
      const x = onBoard ? (rand() - 0.5) * this.hw * 1.6 : Math.cos(a) * (this.hw + r),
        z = onBoard ? (rand() - 0.5) * this.hh * 1.6 : Math.sin(a) * (this.hh + r);
      const foot = new THREE.Vector3(x, onBoard ? 0.5 : this.height(x, z), z);
      const len = 13 + rand() * 4;
      this.beams.push({
        mesh,
        top: foot.clone().addScaledVector(dir, -len),
        dir,
        w: (onBoard ? 0.7 : 1) * (0.8 + rand() * 1.6),
        len,
      });
      this.root.add(mesh);
    }
  }

  // Particles in the air (pollen, fireflies, flakes, ashes): points in a box around the board, moved only in the shader
  private buildMotes(rand: () => number) {
    const m = this.mood.motes;
    const box = [this.hw + 5, m.top / 2, this.hh + 5];
    const seed = new Float32Array(m.n * 4).map(() => rand());
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(m.n * 3), 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4); // the position comes from the shader: never cull by volume
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        ...this.moteU,
        uBox: { value: new THREE.Vector3(...box) },
        uSize: { value: m.size },
        uFall: { value: m.fall },
        uAlpha: { value: m.add ? 0.9 : 0.85 },
      },
      transparent: true,
      depthWrite: false,
      blending: m.add ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `attribute vec4 seed; uniform vec3 uBox; uniform float uTime; uniform float uSize; uniform float uScale; uniform float uFall; varying float vA;
        void main() {
          vec3 p = (seed.xyz * 2.0 - 1.0) * uBox;
          p.y = mod(seed.y * uBox.y * 2.0 - uTime * uFall * (0.6 + seed.w), uBox.y * 2.0) - 0.5;
          p.x += sin(uTime * 0.0006 + seed.w * 40.0) * 0.5;
          p.z += cos(uTime * 0.00045 + seed.w * 23.0) * 0.5;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = max(1.0, uSize * uScale * (0.6 + seed.w * 0.8));
          vA = 0.55 + 0.45 * sin(uTime * 0.0025 + seed.w * 60.0);
        }`,
      fragmentShader: `uniform vec3 uColor; uniform float uAlpha; varying float vA;
        void main() { float r = length(gl_PointCoord - 0.5); if (r > 0.5) discard; gl_FragColor = vec4(uColor, uAlpha * vA * (1.0 - r * 1.6)); }`,
    });
    const points = new THREE.Points(g, mat);
    points.frustumCulled = false;
    // size in tiles, not pixels: the same with and without pixel art (pixel art draws on a smaller screen)
    points.onBeforeRender = (r, scene, cam, geo) => {
      geo.setDrawRange(0, scene.overrideMaterial ? 0 : Infinity);
      const o = cam as THREE.OrthographicCamera;
      this.moteU.uScale.value = (r.getRenderTarget()?.height ?? r.domElement.height) / (o.top - o.bottom);
    };
    points.renderOrder = 2;
    this.root.add(points);
  }

  mount(scene: THREE.Scene): this {
    this.scene = scene;
    // the scene's two lights (sky and sun): the map's mood darkens and turns the sun on top of the phase light
    this.sky = scene.children.find((o): o is THREE.HemisphereLight => (o as THREE.HemisphereLight).isHemisphereLight);
    this.sun = scene.children.find(
      (o): o is THREE.DirectionalLight => (o as THREE.DirectionalLight).isDirectionalLight,
    );
    scene.add(this.root);
    this.setDaylight(this.k);
    return this;
  }

  // the same phase light the scene uses (0 night, 1 sun): fog, sky, rays and particles follow it
  setDaylight(k: number) {
    this.k = k;
    const m = this.mood;
    // k²: the blend is in linear light, and with k (0.3 on Beacon Hill under the Veil) the surroundings still looked like day
    const mix = ([night, day]: Pair, out: THREE.Color) => out.set(night).lerp(new THREE.Color(day), k * k);
    mix(m.low, this.u.ambLow.value);
    mix(m.high, this.u.ambHigh.value);
    if (FADE) {
      this.u.ambLow.value.set(0);
      this.u.ambHigh.value.set(0);
    } // fade on (default): the surroundings vanish into black
    mix(m.beams.color, this.beamU.uColor.value);
    mix(m.motes.color, this.moteU.uColor.value);
    this.beamU.uPower.value = THREE.MathUtils.lerp(m.beams.power[0], m.beams.power[1], k * k);
    // the background only shows if the ground does not cover the screen: the color of the top of the gradient
    if (this.scene?.background instanceof THREE.Color) this.scene.background.copy(this.u.ambHigh.value);
    // the scene has just set the phase light (BattleScene calls this last; with no phase, the constructor's applies, and mount
    // calls it once): multiplying here does not accumulate. Vanishes at night (k → 0): the scene's night is already dark, and on top of it the
    // units in Until Dawn became shadows
    if (m.light && this.sky && this.sun) {
      this.sky.intensity *= THREE.MathUtils.lerp(1, m.light.sky, k);
      this.sun.intensity *= THREE.MathUtils.lerp(1, m.light.sun, k);
      this.sun.position.set(...m.light.at);
    }
  }

  private readonly fwd = new THREE.Vector3();
  update(ms: number, camera: THREE.Camera) {
    this.u.uTime.value = ms;
    camera.getWorldDirection(this.fwd);
    const side = new THREE.Vector3(),
      face = new THREE.Vector3(),
      up = new THREE.Vector3();
    for (const b of this.beams) {
      // the strip sits on the ray's axis and sideways to the camera: from any rotation it looks like a volume of light
      side.crossVectors(b.dir, this.fwd).normalize();
      up.copy(b.dir).negate();
      face.crossVectors(side, up);
      b.mesh.matrix
        .makeBasis(side, up, face)
        .scale(new THREE.Vector3(b.w, b.len, 1))
        .setPosition(b.top);
    }
    for (const g of this.glows) {
      g.mesh.quaternion.copy(camera.quaternion);
      // flame flicker: two out-of-phase waves, no draw (the battle clock speeds up along with it)
      const f = 0.85 + 0.1 * Math.sin(ms * 0.013 + g.seed) + 0.05 * Math.sin(ms * 0.031 + g.seed * 2);
      g.mesh.scale.setScalar(g.size * f);
      if (g.light) g.light.intensity = 7 * f;
    }
  }

  dispose() {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      for (const mat of [m.material].flat()) (mat as THREE.Material | undefined)?.dispose();
    });
    for (const t of this.textures) t.dispose();
    this.root.removeFromParent();
  }
}

// downloads the models of this map's surroundings (in parallel with the scene's) and assembles everything
export async function loadAmbience(grid: Grid): Promise<Ambience> {
  const mood = MOODS[kindOf(grid)];
  const names = [...new Set([...mood.props.map((p) => p.model), ...(mood.walls ? [...WALL, TORCH] : [])])];
  const loader = new GLTFLoader();
  const models = new Map(
    await Promise.all(names.map(async (n) => [n, (await loader.loadAsync(`/models/${n}.gltf`)).scene] as const)),
  );
  // outside the crypts, the outside trees and bushes are the ones built in code (trees.ts), like the board's
  if (!mood.walls) {
    await loadPaint();
    swapTrees(models, true);
    swapProps(models);
  }
  return new Ambience(grid, mood, models);
}
