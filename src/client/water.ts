// Water with volume and physics (Nov 13, Fernando's request: "truly volumetric water, with physics? this one still looks odd"). The water
// tile is the bed (the scene ground, where the unit steps) plus the volume drawn here:
// - physics: a height field on a fine grid (FIELD cells per tile, damped wave equation on the CPU). A unit that enters,
//   walks, jumps or is pushed sinks the water at that point; the wave spreads, hits the bank and comes back. In the river the current drags
//   the field and the drawing in the direction of the water. The field sleeps when the water calms (nothing runs or goes up to the GPU);
// - surface: a single subdivided mesh, with vertices rising and falling by the field plus a light sway; neighboring tiles
//   of the same height read the same field, so they become one continuous surface;
// - volume: color in bands by depth (shallow light and transparent, shows the bed; deep dark), foam on the bank and
//   on the crests; water steps become an arcing waterfall (the water leaves the edge and falls), the map edge shows the cut of the water.
// Draws only: it reads the units' position from the scene, never the rules.
// Pixel art: the normal pass redraws the scene with MeshNormalMaterial, which ignores the shader here. The mesh keeps an upward normal
// and flat position, so in that pass the water stays a smooth plane (no outline on the waves); the displacement and the
// wave normal only exist in the color pass.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { inBounds, posKey, tileAt, type Grid } from '../shared/battle/grid.ts';
import type { Pos } from '../shared/battle/types.ts';
import { pickTiles, type River } from './terrain.ts';
import type { WaterLevel } from './water-levels.ts';

const FIELD = 8; // cells of the field per tile: a wave of ~0.5 tile still has 4 cells (8 already reads at the 3 px pixel size)
const SUB = 8; // squares of the mesh per tile (one vertex per cell)
const HZ = 60; // physics steps per second of the battle clock (fixed step: the wave does not change with fps)
// wave speed² in cells per step: √0.05 × 60 / 8 ≈ 1.7 tiles/s (the old ring moved 1.5). Stable below 0.5
const C2 = 0.05;
const DAMP = 0.982; // per step: the wave loses 90% in ~2 s
const RELAX = 0.995; // per step: the level returns to normal in ~5 s
const AMP = 0.1; // m of height that fit in the 8-bit texture (±): 1 step ≈ 0.8 mm
const SWELL = 0.008; // m of constant sway (sum of 3 sines ≈ ±2.5 × this)
const FLOW = { deep: 0.45, shallow: 0.3 }; // tiles/s of the river current inside the map (the outside one, terrain.ts, is similar)
const BODIES = 8; // units in the water with a foam collar
const IDLE_MS = 1300; // standing in the water: a little nudge from time to time (it breathes)
const WAKE_MS = 110; // walking in the water: wake
// colors (sRGB; they become linear in the uniform): three depth bands, almost white foam
const COLOR = {
  shallow: '#3aa6c4',
  mid: '#1f6fa3',
  deep: '#173d72',
  foam: '#eaf8ff',
  side: '#2a6ea3',
  drop: '#e8f8ff',
};
const ALPHA = { shallow: 0.42, mid: 0.72, deep: 0.93 };

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

// wave height at world (x, z): physics field (texture) + sway; used by the surface and by the top of the waterfall,
// so both rise together
const WAVE_GLSL = /* glsl */ `
uniform float uTime;
uniform sampler2D uField;
uniform vec2 uMap; // map width and height, in tiles
float fieldH(vec2 p) { return (texture2D(uField, (p + 0.5 * uMap) / uMap).r - 0.5) * ${(2 * AMP).toFixed(3)}; }
float swellH(vec2 p) { return ${SWELL.toFixed(4)} * (sin(p.x * 2.1 + uTime * 1.3) + sin(p.y * 1.7 - uTime * 1.1) + 0.5 * sin((p.x - p.y) * 3.3 + uTime * 2.0)); }
vec2 swellD(vec2 p) {
  float c = 0.5 * 3.3 * cos((p.x - p.y) * 3.3 + uTime * 2.0);
  return ${SWELL.toFixed(4)} * vec2(2.1 * cos(p.x * 2.1 + uTime * 1.3) + c, 1.7 * cos(p.y * 1.7 - uTime * 1.1) - c);
}
`;
const VERT_HEAD = /* glsl */ `
${WAVE_GLSL}
attribute vec2 aLocal;
attribute vec4 aEdge;
attribute vec4 aCorner;
attribute float aDepth;
attribute vec2 aFlow;
varying vec2 vWaterXZ;
varying vec2 vLocal;
varying vec4 vEdge;
varying vec4 vCorner;
varying float vDepth;
varying vec2 vFlow;
`;
const VERT_BODY = /* glsl */ `
vWaterXZ = (modelMatrix * vec4(transformed, 1.0)).xz;
// the sway moves with the current; still outside the river
transformed.y += fieldH(vWaterXZ) + swellH(vWaterXZ - aFlow * uTime);
vLocal = aLocal;
vEdge = aEdge;
vCorner = aCorner;
vDepth = aDepth;
vFlow = aFlow;
`;
const FRAG_HEAD = /* glsl */ `
${WAVE_GLSL}
uniform vec4 uBodies[${BODIES}];
uniform vec3 uShallow;
uniform vec3 uMid;
uniform vec3 uDeepColor;
uniform vec3 uFoam;
varying vec2 vWaterXZ;
varying vec2 vLocal;
varying vec4 vEdge;
varying vec4 vCorner;
varying float vDepth;
varying vec2 vFlow;
`;
const FRAG_COLOR = /* glsl */ `
vec2 pf = vWaterXZ - vFlow * uTime; // point dragged by the current (the drawing flows with the water)
float hw = fieldH(vWaterXZ);
const float CELL = ${(1 / FIELD).toFixed(4)};
vec2 slope = vec2(fieldH(vWaterXZ + vec2(CELL, 0.0)) - fieldH(vWaterXZ - vec2(CELL, 0.0)),
                  fieldH(vWaterXZ + vec2(0.0, CELL)) - fieldH(vWaterXZ - vec2(0.0, CELL))) / (2.0 * CELL) + swellD(pf);
// foam collar around the legs of whoever is in the water, trembling slightly
float collar = 0.0;
for (int i = 0; i < ${BODIES}; i++) {
  vec4 b = uBodies[i];
  if (b.z <= 0.0) continue;
  float d = length(vWaterXZ - b.xy);
  collar = max(collar, step(abs(d - 0.25 - 0.025 * sin(uTime * 5.0 + b.w)), 0.04));
}
// bank foam: distance to the side (or corner) with land, waving slowly and growing when the wave arrives
float e = 1.0;
e = min(e, mix(1.0, vLocal.y, vEdge.x));
e = min(e, mix(1.0, 1.0 - vLocal.x, vEdge.y));
e = min(e, mix(1.0, 1.0 - vLocal.y, vEdge.z));
e = min(e, mix(1.0, vLocal.x, vEdge.w));
e = min(e, mix(1.0, length(vec2(1.0 - vLocal.x, vLocal.y)), vCorner.x));
e = min(e, mix(1.0, length(vec2(1.0 - vLocal.x, 1.0 - vLocal.y)), vCorner.y));
e = min(e, mix(1.0, length(vec2(vLocal.x, 1.0 - vLocal.y)), vCorner.z));
e = min(e, mix(1.0, length(vLocal), vCorner.w));
e += 0.035 * sin(uTime * 1.6 + (vWaterXZ.x + vWaterXZ.y) * 7.0) - 2.0 * max(hw, 0.0);
// steps instead of a gradient (painted style; in pixel art the gradient turns into speckle)
float foam = max(step(e, 0.08), 0.35 * step(e, 0.15));
// depth bands with the edge waving, like brushstrokes: shallow (the bed shows), medium, deep
float dq = vDepth + 0.05 * sin(pf.x * 5.0 + pf.y * 3.0) + 0.6 * hw;
float midB = step(0.42, dq), deepB = step(0.78, dq);
vec3 waterCol = mix(mix(uShallow, uMid, midB), uDeepColor, deepB);
float alpha = mix(mix(${ALPHA.shallow.toFixed(2)}, ${ALPHA.mid.toFixed(2)}, midB), ${ALPHA.deep.toFixed(2)}, deepB);
// moving shine: little light dots; in the river, threads stretched along the water
vec2 q = pf * 4.0;
float c = sin(q.x + uTime * 0.8) + sin(q.y * 1.3 - uTime * 0.6) + sin((q.x + q.y) * 0.7 + uTime * 1.1);
float glint = step(2.45, c) * (1.0 - 0.6 * deepB);
float fl = length(vFlow);
if (fl > 0.0) {
  vec2 fd = vFlow / fl, side = vec2(-fd.y, fd.x);
  float lane = fract(dot(pf, fd) * 0.9 + 0.35 * sin(dot(vWaterXZ, side) * 6.0));
  glint = max(glint, step(0.93, lane) * step(0.2, fract(dot(vWaterXZ, side) * 3.0 + 0.5 * sin(dot(pf, fd) * 2.0))));
}
// light crest and dark trough: the physics wave reads like paint, not depending only on light
// (low thresholds: a wave worth seeing is 1 to 3 cm; with a 2 cm threshold it only showed up in the first instant)
float crest = 0.35 * step(0.007, hw) + 0.5 * step(0.022, hw);
float trough = step(hw, -0.007) + step(hw, -0.025);
waterCol *= 1.0 - 0.18 * trough;
waterCol = mix(waterCol, uFoam, 0.4 * glint);
float white = max(max(foam, collar), crest);
diffuseColor.rgb = mix(waterCol, uFoam, white);
diffuseColor.a = max(alpha + 0.15 * glint + 0.08 * trough, 0.92 * white);
`;
const FRAG_NORMAL = /* glsl */ `
// sun light and shine follow the wave slope (field + sway)
// (×2.5: from above and in pixel art the real slope of a few cm barely changes the light)
normal = normalize((viewMatrix * vec4(normalize(vec3(-2.5 * slope.x, 1.0, -2.5 * slope.y)), 0.0)).xyz);
`;

interface Body {
  pos: THREE.Vector3;
  wet: boolean;
  rippled: number;
  phase: number;
}
interface Drop {
  p: THREE.Vector3;
  v: THREE.Vector3;
  floor: number;
}

// Water height field on a fine grid (FIELD x FIELD per tile), pure and without Three: only the water cells run. A neighboring cell
// of another height (bank, waterfall step) reflects the wave; the current (fx, in cells per step) drags height and
// velocity along with the water (upwind: the mixing it causes vanishes in the damping).
export class WaveField {
  readonly h: Float32Array;
  private readonly v: Float32Array;
  private readonly tmp: Float32Array;
  private readonly cells: Int32Array;
  awake = false;
  constructor(
    readonly nx: number,
    readonly nz: number,
    private readonly lvl: Int32Array,
    private readonly fx: Float32Array,
  ) {
    this.h = new Float32Array(nx * nz);
    this.v = new Float32Array(nx * nz);
    this.tmp = new Float32Array(nx * nz);
    this.cells = Int32Array.from(lvl.keys()).filter((i) => lvl[i] >= 0);
  }

  // sinks a disc of radius r (cells) at (cx, cz) (cells) by `depth` m, more in the middle
  poke(cx: number, cz: number, depth: number, r = 2) {
    for (let z = Math.floor(cz - r); z <= cz + r; z++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        if (x < 0 || z < 0 || x >= this.nx || z >= this.nz || this.lvl[z * this.nx + x] < 0) continue;
        const d2 = ((x + 0.5 - cx) ** 2 + (z + 0.5 - cz) ** 2) / (r * r);
        if (d2 < 1) this.h[z * this.nx + x] -= depth * (1 - d2);
      }
    this.awake = true;
  }

  step() {
    const { h, v, lvl, nx } = this;
    let energy = 0;
    for (const i of this.cells) {
      const l = lvl[i],
        x = i % nx,
        hi = h[i];
      let lap = 0;
      if (x > 0 && lvl[i - 1] === l) lap += h[i - 1] - hi;
      if (x < nx - 1 && lvl[i + 1] === l) lap += h[i + 1] - hi;
      if (i >= nx && lvl[i - nx] === l) lap += h[i - nx] - hi;
      if (i + nx < lvl.length && lvl[i + nx] === l) lap += h[i + nx] - hi;
      v[i] = (v[i] + C2 * lap) * DAMP;
    }
    // RELAX: the touch only sinks (does not give back the water around) and the closed bank keeps the volume; without this the water stayed
    // lower forever and the field never slept
    for (const i of this.cells) {
      h[i] = (h[i] + v[i]) * RELAX;
      energy = Math.max(energy, Math.abs(h[i]) + Math.abs(v[i]));
    }
    this.advect(h);
    this.advect(v);
    // below 0.2 mm nobody sees it: zero it and sleep until the next touch
    if (energy < 2e-4) {
      h.fill(0);
      v.fill(0);
      this.awake = false;
    }
  }

  private advect(a: Float32Array) {
    const { fx, lvl, tmp } = this;
    tmp.set(a);
    for (const i of this.cells) {
      const f = fx[i];
      if (!f) continue;
      const up = i - Math.sign(f); // cell the water comes from (same row: the river runs along x)
      if (lvl[up] === lvl[i] && Math.floor(up / this.nx) === Math.floor(i / this.nx))
        a[i] = tmp[i] + Math.abs(f) * (tmp[up] - tmp[i]);
    }
  }
}

export class Water {
  readonly surface: THREE.InstancedMesh; // water tile on touch (userData.tiles, like the scene tops): invisible plane on the surface
  private readonly drops: THREE.InstancedMesh;
  private readonly live: Drop[] = [];
  private readonly bodies = Array.from({ length: BODIES }, () => new THREE.Vector4());
  private readonly time = { value: 0 };
  private readonly field: WaveField;
  private readonly tex: THREE.DataTexture;
  private readonly seen = new WeakMap<THREE.Object3D, Body>();
  private last = 0;
  private acc = 0;
  private readonly m = new THREE.Matrix4();

  constructor(
    scene: THREE.Scene,
    private readonly grid: Grid,
    private readonly levels: Map<string, WaterLevel>,
    step: number,
    river: River | null = null,
  ) {
    const W = grid.width,
      H = grid.height;
    const tiles = [...levels.keys()].map((k) => {
      const [x, y] = k.split(',').map(Number);
      return { x, y };
    });
    // land = tile without water; a bridge flush with the water (no own level) lets the water through and gets no foam
    const land = (q: Pos) => inBounds(grid, q) && !levels.has(posKey(q)) && tileAt(grid, q).look !== 'bridge';
    // depth of each tile for the color: land 0 (the color lightens toward the bank), shallow 0.3, deep 1; outside the map, the
    // edge tile (the river continues)
    const depthOf = (i: number, j: number) => {
      const lv = levels.get(`${THREE.MathUtils.clamp(i, 0, W - 1)},${THREE.MathUtils.clamp(j, 0, H - 1)}`);
      return lv ? (lv.deep ? 1 : 0.3) : 0;
    };
    // current: only on the rows of the river crossing the map, from the spring (river.dir) to the other side
    const flowOf = (p: Pos, lv: WaterLevel) =>
      river?.rows.includes(p.y) ? -river.dir * (lv.deep ? FLOW.deep : FLOW.shallow) : 0;

    // physics field: level of each cell (surface mm; -1 without water) and current in cells per step
    const nx = W * FIELD,
      nz = H * FIELD;
    const lvl = new Int32Array(nx * nz).fill(-1),
      fx = new Float32Array(nx * nz);
    for (const p of tiles) {
      const lv = levels.get(posKey(p))!;
      for (let b = 0; b < FIELD; b++)
        for (let a = 0; a < FIELD; a++) {
          const i = (p.y * FIELD + b) * nx + p.x * FIELD + a;
          lvl[i] = Math.round(lv.surface * 1000);
          fx[i] = (flowOf(p, lv) * FIELD) / HZ;
        }
    }
    this.field = new WaveField(nx, nz, lvl, fx);
    this.tex = new THREE.DataTexture(
      new Uint8Array(nx * nz).fill(128),
      nx,
      nz,
      THREE.RedFormat,
      THREE.UnsignedByteType,
    );
    this.tex.magFilter = this.tex.minFilter = THREE.LinearFilter; // the wave between two cells comes out interpolated, with no steps
    this.tex.needsUpdate = true;

    // surface: SUB x SUB squares per tile, upward normal (see the top about pixel art)
    const pos: number[] = [],
      nor: number[] = [],
      loc: number[] = [],
      edge: number[] = [],
      corner: number[] = [],
      dep: number[] = [],
      flow: number[] = [],
      idx: number[] = [];
    const sides: THREE.BufferGeometry[] = [];
    for (const p of tiles) {
      const lv = levels.get(posKey(p))!;
      const e = DIRS.map(([dx, dy]) => +land({ x: p.x + dx, y: p.y + dy }));
      const c = CORNERS.map(([dx, dy]) => +land({ x: p.x + dx, y: p.y + dy }));
      const f = flowOf(p, lv),
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
      for (let b = 0; b < SUB; b++)
        for (let a = 0; a < SUB; a++) {
          const v0 = base + b * (SUB + 1) + a;
          idx.push(v0, v0 + SUB + 1, v0 + 1, v0 + 1, v0 + SUB + 1, v0 + SUB + 2);
        }
      this.sides(p, lv, step, sides);
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
    const water = new THREE.Mesh(g, this.material());
    water.receiveShadow = true;
    // drawn before the other transparent ones: markers, path, cursor and the team ring always stay on top of the water
    water.renderOrder = -1;
    water.name = 'agua';
    scene.add(water);
    this.surface = pickTiles(
      tiles.map((p) => ({
        p,
        at: new THREE.Vector3(p.x - W / 2 + 0.5, levels.get(posKey(p))!.surface, p.y - H / 2 + 0.5),
      })),
    );
    scene.add(this.surface);
    if (sides.length) {
      const wall = new THREE.Mesh(mergeGeometries(sides), this.fallMaterial());
      for (const s of sides) s.dispose();
      wall.renderOrder = -1;
      wall.name = 'cachoeiras';
      scene.add(wall);
    }
    // splash drops: little cubes (pixels, like the bits in fx.ts) in a single InstancedMesh, up to 64 in the air
    this.drops = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.07, 0.07, 0.07),
      new THREE.MeshLambertMaterial({ color: COLOR.drop, emissive: '#3d7fa6' }),
      64,
    );
    this.drops.count = 0;
    this.drops.frustumCulled = false; // the drops move: the culling sphere computed once would go stale
    scene.add(this.drops);
  }

  // Visible side of the water (step down to lower water or lower land, map edge): from the surface to the bed or to
  // whatever is in front. A step inside the map becomes an arcing waterfall: the water leaves the edge with speed and falls
  // (x ∝ √drop, like a jet); at the map edge it is the straight cut of the volume (it also goes down through the bed slice, one level, where
  // the scene's smooth side starts). 2 mm outward so it does not fight with the block face
  private sides(p: Pos, lv: WaterLevel, step: number, out: THREE.BufferGeometry[]) {
    const x = p.x - this.grid.width / 2 + 0.5,
      z = p.y - this.grid.height / 2 + 0.5;
    for (const [dx, dy] of DIRS) {
      const q = { x: p.x + dx, y: p.y + dy };
      const inside = inBounds(this.grid, q),
        ql = this.levels.get(posKey(q));
      const front = !inside ? -Infinity : ql ? ql.surface : (tileAt(this.grid, q).h + 1) * step;
      const bottom = inside ? Math.max(front, lv.bed) : lv.bed - step;
      const drop = lv.surface - bottom;
      if (drop < 0.01) continue;
      const rows = inside ? 8 : 1;
      const pos: number[] = [],
        uv: number[] = [],
        fall: number[] = [],
        idx: number[] = [];
      for (let r = 0; r <= rows; r++) {
        const s = r / rows; // 0 at the top, 1 at the foot
        const out = 0.502 + (inside ? 0.22 * Math.sqrt(s) * Math.min(1, drop / step) : 0);
        for (const t of [-0.5, 0.5]) {
          // the side runs along the edge (perpendicular to dx, dy)
          pos.push(x + dx * out - dy * t, lv.surface - s * drop, z + dy * out + dx * t);
          uv.push(t + 0.5, 1 - s);
          fall.push(+inside);
        }
        if (r < rows) {
          const v = r * 2;
          idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute('aFall', new THREE.Float32BufferAttribute(fall, 1));
      g.setIndex(idx);
      g.computeVertexNormals();
      out.push(g);
    }
  }

  private uniforms() {
    return {
      uTime: this.time,
      uField: { value: this.tex },
      uMap: { value: new THREE.Vector2(this.grid.width, this.grid.height) },
    };
  }

  // Phong (lit): the per-phase light (setDaylight) and the units' shadow work on the water with no extra code
  private material() {
    // weak, narrow sun shine: white (the first value) made the whole river white with the camera facing the sun
    const mat = new THREE.MeshPhongMaterial({
      transparent: true,
      depthWrite: false,
      specular: '#2a3a44',
      shininess: 90,
    });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms(), {
        uBodies: { value: this.bodies },
        uShallow: { value: new THREE.Color(COLOR.shallow) },
        uMid: { value: new THREE.Color(COLOR.mid) },
        uDeepColor: { value: new THREE.Color(COLOR.deep) },
        uFoam: { value: new THREE.Color(COLOR.foam) },
      });
      shader.vertexShader =
        VERT_HEAD + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_BODY}`);
      shader.fragmentShader =
        FRAG_HEAD +
        shader.fragmentShader
          .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG_COLOR}`)
          .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>\n${FRAG_NORMAL}`);
    };
    mat.customProgramCacheKey = () => 'agua-volume';
    return mat;
  }

  // waterfall: threads of foam that run down and foam at the foot, where it hits; the map-edge cut darkens toward the bottom. The top
  // rises and falls with the surface (same field), otherwise a gap opened when the wave reached the edge
  private fallMaterial() {
    const mat = new THREE.MeshLambertMaterial({
      color: COLOR.side,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    mat.defines = { USE_UV: '' };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms());
      sh.vertexShader =
        `${WAVE_GLSL}\nattribute float aFall;\nvarying float vFall;\n` +
        sh.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
        vFall = aFall;
        vec2 wxz = (modelMatrix * vec4(transformed, 1.0)).xz;
        transformed.y += step(0.999, uv.y) * (fieldH(wxz) + swellH(wxz));`,
        );
      sh.fragmentShader =
        'uniform float uTime;\nvarying float vFall;\n' +
        sh.fragmentShader.replace(
          '#include <map_fragment>',
          `#include <map_fragment>
        // vertical threads: each with its own phase and strength (drawn by column)
        float col = floor(vUv.x * 14.0), rnd = fract(sin(col * 12.9898) * 43758.5453);
        float streak = fract(vUv.y * 2.0 + uTime * (1.2 + 0.8 * rnd) + rnd);
        float fallFoam = step(0.72, streak) * (0.35 + 0.45 * rnd) + step(0.82, 1.0 - vUv.y) * 0.75 + step(0.94, vUv.y) * 0.5;
        // volume cut: light at the surface line, darkening toward the bottom, in 3 bands like the surface
        vec3 cut = mix(vec3(0.09, 0.24, 0.45), diffuseColor.rgb, step(0.5, vUv.y)) * (1.0 + 0.6 * step(0.92, vUv.y));
        float foam = clamp(fallFoam, 0.0, 1.0) * vFall;
        diffuseColor.rgb = mix(mix(cut, diffuseColor.rgb * 1.15, vFall), vec3(0.92, 0.97, 1.0), foam);
        diffuseColor.a = max(mix(0.85, 0.7, vFall), foam);`,
        );
    };
    mat.customProgramCacheKey = () => 'agua-cachoeira';
    return mat;
  }

  private spray(at: THREE.Vector3, floor: number, n: number, power: number) {
    for (let i = 0; i < n && this.live.length < this.drops.instanceMatrix.count; i++) {
      const a = Math.random() * Math.PI * 2,
        out = (0.4 + Math.random() * 0.8) * power;
      this.live.push({
        p: at.clone().setY(floor),
        v: new THREE.Vector3(Math.cos(a) * out, (1.4 + Math.random() * 1.4) * power, Math.sin(a) * out),
        floor,
      });
    }
  }

  private levelAt(p: THREE.Vector3) {
    return this.levels.get(`${Math.floor(p.x + this.grid.width / 2)},${Math.floor(p.z + this.grid.height / 2)}`);
  }

  // sinks the water at world (x, z) by `depth` m, in a disc of `r` tiles
  private poke(x: number, z: number, depth: number, r = 0.28) {
    this.field.poke((x + this.grid.width / 2) * FIELD, (z + this.grid.height / 2) * FIELD, depth, r * FIELD);
  }

  // Every frame, on the battle clock (`t` in ms): whoever crossed the surface going down sinks the water and splashes by
  // speed (the push is faster than the jump, so it moves it more), whoever walks leaves a wake, whoever stands still breathes and
  // gets the foam collar. Then the physics runs in fixed steps of 1/HZ s. All of it comes from the units' position, with no hook into the
  // events.
  update(t: number, units: Iterable<{ holder: THREE.Object3D }>) {
    const dt = Math.min(0.1, Math.max(0, t - this.last) / 1000);
    this.last = t;
    this.time.value = t / 1000;
    let n = 0;
    for (const { holder } of units) {
      const pos = holder.position;
      const lv = this.levelAt(pos);
      const wet = holder.visible && !!lv && pos.y < lv.surface - 0.01;
      const b = this.seen.get(holder);
      if (!b) {
        // idle ones out of phase: two units in the water do not breathe together
        this.seen.set(holder, {
          pos: pos.clone(),
          wet,
          rippled: t - Math.random() * IDLE_MS,
          phase: Math.random() * 6,
        });
        continue;
      }
      // ground speed (m/s of the battle clock): jump down a step ~2.2, walk ~1.7, push ~3.8. The vertical does not
      // work to tell them apart: the jump crosses the surface at ~3 m/s in total, almost the same as the push
      const speed = dt ? Math.hypot(pos.x - b.pos.x, pos.z - b.pos.z) / dt : 0;
      // far above the push is sync or undo putting the unit in place in one frame: no wave
      const snap = speed > 8 || Math.abs(pos.y - b.pos.y) / Math.max(dt, 0.001) > 8;
      const walking = speed > 0.3 && !snap;
      if (wet && !b.wet && !snap && (speed || pos.y !== b.pos.y)) {
        const k = THREE.MathUtils.clamp((speed - 1.5) / 2.3, 0, 1); // jump ~0.3, push 1
        this.poke(pos.x, pos.z, 0.07 + 0.07 * k, 0.3 + 0.1 * k);
        this.spray(pos, lv!.surface, 6 + Math.round(14 * k), 0.7 + 0.6 * k);
        b.rippled = t;
      } else if (!wet && b.wet && !snap)
        this.poke(b.pos.x, b.pos.z, -0.04); // left: the water returns to the hole
      else if (wet && t - b.rippled >= (walking ? WAKE_MS : IDLE_MS)) {
        this.poke(pos.x, pos.z, walking ? 0.03 : 0.012, walking ? 0.25 : 0.22);
        b.rippled = t;
      }
      if (wet && n < BODIES) this.bodies[n++].set(pos.x, pos.z, 1, b.phase);
      b.pos.copy(pos);
      b.wet = wet;
    }
    for (let i = n; i < BODIES; i++) this.bodies[i].z = 0;
    this.simulate(dt);
    this.fall(dt);
  }

  private simulate(dt: number) {
    if (!this.field.awake) {
      this.acc = 0;
      return;
    }
    // at most 6 steps per frame: a stalled frame does not become an avalanche of steps
    this.acc = Math.min(this.acc + dt * HZ, 6);
    for (; this.acc >= 1; this.acc--) this.field.step();
    const data = this.tex.image.data as Uint8Array,
      h = this.field.h;
    for (let i = 0; i < h.length; i++) data[i] = Math.max(0, Math.min(255, Math.round(128 + (h[i] / AMP) * 127)));
    this.tex.needsUpdate = true;
  }

  private fall(dt: number) {
    if (!this.live.length && !this.drops.count) return;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const d = this.live[i];
      d.v.y -= 9 * dt;
      d.p.addScaledVector(d.v, dt);
      if (d.p.y < d.floor && d.v.y < 0) {
        this.live.splice(i, 1);
        this.poke(d.p.x, d.p.z, 0.004, 0.12); // the returning drop makes its own little ring
      }
    }
    this.live.forEach((d, i) => this.drops.setMatrixAt(i, this.m.makeTranslation(d.p.x, d.p.y, d.p.z)));
    this.drops.count = this.live.length;
    this.drops.instanceMatrix.needsUpdate = true;
  }
}
