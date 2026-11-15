// Three.js battle scene: the renderer with RenderPixelatedPass (the spec's SNES pixel art), the lights, the frame loop and
// the public API the game and the HUD use. It only draws: it knows no rules, it receives state, highlights and events.
// The parts live in scene/: board (terrain and pieces), marks (tile marks and cursor), units (characters and events),
// camera (orbit and action camera), space (tile to world) and timeline (the battle clock).
import * as THREE from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { type GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { RenderPixelatedPass } from 'three/examples/jsm/postprocessing/RenderPixelatedPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import type { Grid } from '../shared/battle/grid.ts';
import type { BattleEvent, BattleState, Pos } from '../shared/battle/types.ts';
import { type Ambience, kindOf, loadAmbience } from './ambience.ts';
import { type ChargeLine, chargeLines } from './charge-lines.ts';
import { el } from './icons.ts';
import { chargeDanger, type Highlights } from './interaction.ts';
import { modelOf } from './markers.ts';
import { loadPaint } from './painted.ts';
import type { PixelSettings } from './pixel-settings.ts';
import { swapProps } from './props.ts';
import { Board, CORPSE_MODELS, lookPieceNames } from './scene/board.ts';
import { CameraRig } from './scene/camera.ts';
import { ChargeLines } from './scene/charge-lines.ts';
import { Marks } from './scene/marks.ts';
import { squareUnder, TileSpace } from './scene/space.ts';
import { Timeline } from './scene/timeline.ts';
import { Units } from './scene/units.ts';
import { loadTerrainTextures, type TerrainTextures } from './terrain.ts';
import { speed } from './timing.ts';
import { swapTrees } from './trees.ts';

const EDGES = { depthEdgeStrength: 0.5, normalEdgeStrength: 0.35 }; // outline from the approved POC

// Reduced palette: each channel in a few steps, after the sRGB conversion (steps equal to the eye). 6 levels
// recall the SNES's 15 bits without becoming a poster; the option exists for Fernando to compare.
const PALETTE_SHADER = {
  uniforms: { tDiffuse: { value: null }, levels: { value: 6 } },
  vertexShader:
    'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader:
    'uniform sampler2D tDiffuse; uniform float levels; varying vec2 vUv; void main() { vec4 c = texture2D(tDiffuse, vUv); gl_FragColor = vec4(floor(c.rgb * levels + 0.5) / levels, c.a); }',
};

export class BattleScene {
  private readonly renderer = new THREE.WebGLRenderer({ antialias: false });
  private readonly scene = new THREE.Scene();
  private readonly cam: CameraRig;
  private readonly camera: THREE.OrthographicCamera;
  private readonly composer = new EffectComposer(this.renderer);
  private readonly renderPass: RenderPass; // no pixel art
  private readonly pixelPass: RenderPixelatedPass;
  private readonly palettePass = new ShaderPass(PALETTE_SHADER);
  private pixel: PixelSettings;
  private readonly board: Board;
  private readonly marks: Marks;
  private readonly chargeLines: ChargeLines;
  private readonly units: Units;
  private readonly floats: HTMLElement;
  private readonly clock = new THREE.Clock();
  private readonly time = new Timeline();
  private readonly onResize = () => this.resize();
  private readonly space: TileSpace;
  private readonly sky = new THREE.HemisphereLight('#fff1d6', '#3a3050', 1.15);
  private readonly sun = new THREE.DirectionalLight('#ffffff', 1.6);
  private ambience: Ambience | null = null; // surroundings, fog, light rays and particles (ambience.ts)

  private constructor(
    private readonly host: HTMLElement,
    private readonly grid: Grid,
    models: Map<string, GLTF>,
    pieces: Record<'top' | 'side' | 'stone' | 'tree', THREE.Object3D>,
    pixel: PixelSettings,
    lookPieces: Map<string, THREE.Object3D>,
    packClips: THREE.AnimationClip[],
    terrainTex: TerrainTextures | null = null,
  ) {
    this.pixel = pixel;
    this.space = new TileSpace(grid);
    this.renderer.shadowMap.enabled = true;
    this.renderer.info.autoReset = false; // zeroed by hand at the start of each frame (performance counter)
    // pixel art draws the scene twice per frame (color and normals); the shadow only needs the first (requested in frame)
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.domElement.className = 'board';
    host.append(this.renderer.domElement);
    this.floats = el('div', { class: 'floats', 'aria-hidden': 'true' });
    host.append(this.floats);
    this.cam = new CameraRig(host, this.renderer.domElement, this.space, (ms, step) => this.time.animate(ms, step));
    this.camera = this.cam.camera;
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.pixelPass = new RenderPixelatedPass(Math.max(2, pixel.size), this.scene, this.camera, EDGES);
    // the palette comes after the sRGB output; it toggles without rebuilding the chain
    for (const pass of [this.renderPass, this.pixelPass, new OutputPass(), this.palettePass])
      this.composer.addPass(pass);
    this.scene.background = new THREE.Color('#1b1626');
    this.scene.add(this.sky);
    const sun = this.sun;
    sun.position.set(-6, 12, 4);
    sun.castShadow = true;
    Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10 });
    sun.shadow.mapSize.set(1024, 1024);
    this.scene.add(sun);
    this.board = new Board(this.scene, this.space, models, pieces, lookPieces, packClips, terrainTex);
    this.marks = new Marks(this.scene, this.space, this.camera, this.board.hasTrees);
    this.chargeLines = new ChargeLines(this.scene, this.space, this.camera);
    this.units = new Units(
      this.scene,
      this.space,
      this.board,
      this.cam,
      this.time,
      models,
      packClips,
      this.renderer.domElement,
      this.floats,
    );
    addEventListener('resize', this.onResize);
    this.setPixel(pixel);
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // `all`: sheets for the whole scenario, not just the ones alive in the save (Nov 13, review): without this, reopening a save where a model
  // had already died and pressing "Play again" brought the unit back as the Beacon crystal
  static async create(
    host: HTMLElement,
    grid: Grid,
    state: BattleState,
    pixel: PixelSettings,
    all: string[] = [],
  ): Promise<BattleScene> {
    const ambience = loadAmbience(grid); // downloads along with the map pieces
    // smooth terrain on open maps (terrain.ts); crypts stay block-based
    const terrainTex = grid.tiles.some((t) => t.look) && kindOf(grid) !== 'crypt' ? loadTerrainTextures() : null;
    // units compressed with meshopt (Nov 13, Fernando's request: the game downloaded 11 MB to open); Three's decoder
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const corpses = grid.tiles.some((t) => t.look === 'corpse') ? CORPSE_MODELS : [];
    const defs = [
      ...new Set([...[...state.units.map((u) => u.def), ...all].map((d) => modelOf(d)), ...corpses].filter(Boolean)),
    ];
    const [top, side, stone, tree, ...loaded] = await Promise.all([
      ...['dirt_with_grass', 'dirt', 'stone'].map((n) => loader.loadAsync(`/models/poc/square/${n}.gltf`)),
      loader.loadAsync('/models/poc/hex/tree_single_A.gltf'), // the tree in the block pack is a cube of leaves
      ...defs.map((d) => loader.loadAsync(`/models/${d}.glb`)),
    ]);
    const models = new Map(defs.map((d, i) => [d, loaded[i]]));
    // only the map that brings a per-tile look downloads these pieces (~630 KB with the textures)
    const names = lookPieceNames(grid);
    const looks = new Map(
      await Promise.all(names.map(async (n) => [n, (await loader.loadAsync(`/models/${n}.gltf`)).scene] as const)),
    );
    // open maps: painted trees built in code (trees.ts), with variations, in place of KayKit's
    if (terrainTex) {
      await loadPaint();
      swapTrees(looks);
      swapProps(looks, true);
    } // and the painted objects (props.ts)
    // extra ability gestures (KayKit Rig_Medium, same bones as the units): scripts/assets/anim-pack.mjs
    const pack = (await loader.loadAsync('/models/animations.glb')).animations;
    const s = new BattleScene(
      host,
      grid,
      models,
      { top: top.scene, side: side.scene, stone: stone.scene, tree: tree.scene },
      pixel,
      looks,
      pack,
      await terrainTex,
    );
    s.ambience = (await ambience).mount(s.scene);
    s.sync(state);
    return s;
  }

  setRangeRing(r: { from: Pos[]; range: number } | null) {
    this.marks.setRangeRing(r);
  }

  setTrajectory(t: { from: Pos; to: Pos; block: Pos | null } | null) {
    this.marks.setTrajectory(t);
  }

  // every charge's line (sync keeps them, Nov 15); a method so the sandbox's `hide: marks` can hold it like the other marks
  setChargeLines(lines: ChargeLine[] | null) {
    this.chargeLines.set(lines);
  }

  // the acting unit's own charge as fired from the destination it is picking (charge-lines.ts chargeFrom)
  setChargePreview(line: ChargeLine | null) {
    this.chargeLines.setPreview(line);
  }

  setCursor(p: Pos | null, size = 1, fits = true) {
    this.marks.setCursor(p, size, fits);
  }

  // rotation to where the camera is going (not the mid-animation one): WASD already walks right after R
  get heading(): number {
    return this.cam.heading;
  }

  // Puts each unit where the state says (creates whoever is missing, removes whoever died). Called on open, after each animation and on undo.
  sync(state: BattleState) {
    const hot = chargeDanger(this.grid, state);
    this.marks.showDanger(hot);
    this.setChargeLines(chargeLines(this.grid, state));
    this.units.sync(state);
  }

  setHighlights(h: Highlights | null) {
    this.marks.setHighlights(h);
  }

  pop(unitId: string) {
    this.units.pop(unitId);
  }

  wait(ms: number): Promise<void> {
    return this.time.wait(ms);
  }

  // the battle clock in ms (speeds up with the battle): the HUD faces' expressions time out on it
  get now(): number {
    return this.time.t;
  }

  // plays the events on the units (Units.playEvents), then the camera comes back and the state is drawn as it ended
  async playEvents(events: BattleEvent[], state: BattleState, before?: (e: BattleEvent) => Promise<void>) {
    await this.units.playEvents(events, state, before);
    await this.cam.endActionCam();
    this.sync(state);
  }

  celebrate(team: 'hero' | 'enemy', state: BattleState) {
    this.units.celebrate(team, state);
  }

  // Tile under the finger. The unit's body counts before the ground: the drawn unit covers the tile behind, and whoever touches it
  // wants the unit (mobile audit of Oct 25: tapping the enemy picked the tile behind it). `size`: on the ground, the corner
  // of the square of that many cells centred under the finger (choosing where a 2x2 token stops)
  pick(clientX: number, clientY: number, size = 1): Pos | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(
      new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1),
      this.camera,
    );
    const unit = this.units.pick(ray);
    if (unit) return unit;
    const hit = ray.intersectObjects(this.board.tileTops, false)[0];
    if (!hit) return null;
    const p = (hit.object.userData.tiles as Pos[])[hit.instanceId!];
    const w = this.space.world(p);
    return squareUnder(this.grid, p, hit.point.x - w.x, hit.point.z - w.z, size);
  }

  // where the unit is on screen, for the HUD's command menu beside it
  screenOf(unitId: string): { x: number; y: number; r: number } | null {
    return this.units.screenOf(unitId);
  }

  // slides the camera to the tile (the hero of the turn), without changing the zoom
  focusOn(p: Pos, also?: Pos) {
    this.cam.focusOn(p, also);
  }

  // the strike camera with no strike, for the sandbox (dev/sandbox.ts)
  actionCam(from: Pos, to: Pos, enemy = false) {
    return this.cam.actionCam(from, to, enemy);
  }

  // sandbox bench: a fixed tilt and no action camera (CameraRig.hold)
  hold(pitch: number | null, clip?: number) {
    this.cam.hold(pitch, clip);
  }

  // sandbox arena: no surroundings, fog or particles, only the board on a plain background
  bare() {
    this.ambience?.dispose();
    this.ambience = null;
    (this.scene.background as THREE.Color).set('#4a4a52');
  }

  // back to the whole-map framing
  resetView() {
    this.cam.resetView();
    this.resize();
  }

  // dragging moves the focus on the ground, in the finger's direction (the map follows the finger)
  pan(dx: number, dy: number) {
    this.cam.pan(dx, dy);
  }

  zoom(factor: number) {
    this.cam.zoom(factor);
    this.resize();
  }

  // Applies the pixel art options right away, without reloading the page
  setPixel(p: PixelSettings) {
    this.pixel = p;
    const on = p.size > 0;
    this.renderPass.enabled = !on;
    this.pixelPass.enabled = on;
    if (on) this.pixelPass.setPixelSize(p.size);
    this.pixelPass.depthEdgeStrength = p.outline ? EDGES.depthEdgeStrength : 0;
    this.pixelPass.normalEdgeStrength = p.outline ? EDGES.normalEdgeStrength : 0;
    this.palettePass.enabled = p.palette;
    // pixel art draws at 1x even on a 3x screen (the blocks are already bigger than the device pixel and the phone is grateful);
    // without it, screen sharpness up to 2x
    const ratio = on ? 1 : Math.min(devicePixelRatio, 2);
    this.renderer.setPixelRatio(ratio);
    this.composer.setPixelRatio(ratio);
    this.resize();
  }

  setInsets(top: number, bottom: number) {
    if (this.cam.setInsets(top, bottom)) this.resize();
  }

  // 8 angles, every 45° (Nov 13, Fernando's request: "the camera must have 8 angles"); gridStep finds the closest axis
  // to each key at any rotation, so the arrows keep walking on the grid
  rotate(dir: 1 | -1) {
    this.cam.rotate(dir);
  }

  // Light of the Until Dawn mode (survival.ts): k = 0 is moonlit night (blue and weak), k = 1 is the rising sun (warm, at
  // normal strength). The player sees the end coming without reading the number; the other maps never call it and stay on the usual light.
  setDaylight(k: number) {
    const mix = (night: string, day: string) => new THREE.Color(night).lerp(new THREE.Color(day), k);
    this.sky.color.copy(mix('#7d8fd8', '#ffe2c0'));
    this.sky.groundColor.copy(mix('#141226', '#3a3050'));
    this.sky.intensity = 0.55 + 0.6 * k;
    this.sun.color.copy(mix('#a9bcff', '#ffcf9a'));
    this.sun.intensity = 0.45 + 1.15 * k;
    (this.scene.background as THREE.Color).copy(mix('#0a0c1c', '#3b2638'));
    this.ambience?.setDaylight(k); // last: the surroundings fog rules the background color
  }

  // title screen background: the camera slowly rotates around the map
  setSpin(on: boolean) {
    this.cam.setSpin(on);
  }

  private resize() {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.cam.frameView();
  }

  // Performance counter numbers (Fernando's request, Nov 12): frames and average time since the last reading, and Three's
  // resources. Pixel art draws the scene more than once per frame: info sums everything and zeroes only at the start of the frame.
  private perf = { frames: 0, since: performance.now() };
  stats() {
    const now = performance.now(),
      ms = now - this.perf.since,
      frames = this.perf.frames;
    this.perf = { frames: 0, since: now };
    const info = this.renderer.info;
    return {
      fps: (frames * 1000) / ms,
      ms: frames ? ms / frames : 0,
      calls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
    };
  }

  private frame() {
    this.perf.frames++;
    this.renderer.info.reset();
    const dt = this.clock.getDelta();
    const fast = speed();
    this.time.tick(dt * 1000 * fast);
    this.cam.update(dt);
    this.marks.update(dt);
    this.cam.place(this.pixel, this.units.shake(this.time.t), this.time.t);
    if (this.board.hasTrees)
      this.board.updateCuts(this.camera.matrixWorldInverse, (add) => {
        this.units.protect(add);
        this.marks.protect(add);
      });
    this.units.update(dt, fast);
    this.board.update(this.time.t, this.units.all());
    this.ambience?.update(this.time.t, this.camera);
    this.renderer.shadowMap.needsUpdate = true;
    this.composer.render();
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    removeEventListener('resize', this.onResize);
    this.ambience?.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      for (const mat of [m.material].flat()) (mat as THREE.Material | undefined)?.dispose();
    });
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.floats.remove();
  }
}
