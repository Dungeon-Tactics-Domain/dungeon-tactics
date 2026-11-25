// Ambience around the board (Nov 13, Fernando's request: "more realistic scenery... fog, lighting, godrays,
// volumetric; in the forest, more forest-like surroundings"): ground that continues past the edge, forest, rocks and walls in
// rings, fog, light rays, torches and particles. It only draws, like the scene, and with no post-processing: BattleScene
// creates it (create), updates it on the battle clock (frame), follows the phase light (setDaylight) and releases it (dispose).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { type Grid, tileAt } from '../shared/battle/grid.ts';
import { buildCrypt, TORCH, WALL } from './ambience-crypt.ts';
import { AirEffects } from './ambience-effects.ts';
import { fogMaterial } from './ambience-fog.ts';
import {
  DARK_FALLBACK,
  DARK_TONE,
  EDGE,
  EXTEND,
  FADE,
  kindOf,
  MOODS,
  type Mood,
  type Pair,
  type Prop,
  TEST_RING,
} from './ambience-moods.ts';
import { boxOf, loadPaint, variant } from './painted.ts';
import { isPainted, swapProps } from './props.ts';
import { EXT_RING, extH, outerTop, riverOf, riverOutside } from './terrain.ts';
import { hash, noise, seeded, smooth } from './three-util.ts';
import { swapTrees } from './trees.ts';
import { waterLevels } from './water-levels.ts';

// Nothing in the surroundings rises above this line: with the camera at 32° (tan = 0.625), whatever sits d tiles from the edge up to
// 0.5 + 0.55·d in height never covers a tile or unit, from any angle of the rotation (the lowest tile has its top at 0.5).
// Caps of 8 (models) and 5.5 (ground): higher than that, far away, it gets close to the camera's front plane and little would be seen
export const LIMIT = (d: number) => Math.min(0.5 + 0.55 * d, 8);
const GROUND_MAX = 5.5;

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
  readonly air: AirEffects;
  private readonly textures: THREE.Texture[] = [];
  readonly hw: number;
  readonly hh: number;
  // ground of the smooth outside terrain (terrain.ts), where it exists: nearby trees and rocks land on it
  private readonly outer: { step: number; river: ReturnType<typeof riverOf>; water: Set<string> } | null;

  constructor(
    private readonly grid: Grid,
    private readonly mood: Mood,
    private readonly models: Map<string, THREE.Object3D>,
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
    // after the swap above: the rays take the same ambHalf, ambNear and ambFar as the fog
    this.air = new AirEffects(this.root, u, mood, this.hw, this.hh, (x, z) => this.height(x, z), this.textures);
    if (mood.walls) buildCrypt(this, models, rand);
    this.air.buildMist();
    this.air.buildBeams(rand);
    this.air.buildMotes(rand);
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
  height(x: number, z: number) {
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

  material(src: THREE.Material | null, opts: THREE.MeshLambertMaterialParameters = {}) {
    return fogMaterial(src, opts, this.u, this.mood.shade, this.textures);
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
  instances(src: THREE.Object3D, at: THREE.Matrix4[]) {
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
    this.air.setDaylight(k, mix);
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

  update(ms: number, camera: THREE.Camera) {
    this.air.update(ms, camera);
  }

  // the same surroundings round a map of another size (BattleScene.setGrid), from the models already loaded
  again(grid: Grid): Ambience {
    this.dispose();
    return new Ambience(grid, this.mood, this.models);
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
    await Promise.all(
      names.map(
        async (n) =>
          [
            n,
            !mood.walls && isPainted(n) ? new THREE.Group() : (await loader.loadAsync(`/models/${n}.gltf`)).scene,
          ] as const,
      ),
    ),
  );
  // outside the crypts, the outside trees and bushes are the ones built in code (trees.ts), like the board's
  if (!mood.walls) {
    await loadPaint();
    swapTrees(models, true);
    swapProps(models);
  }
  return new Ambience(grid, mood, models);
}
