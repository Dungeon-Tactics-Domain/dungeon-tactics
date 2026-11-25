// Three.js battle scene: the renderer (smooth 3D; the pixel art pass left on Nov 18), the lights, the frame loop and
// the public API the game and the HUD use. It only draws: it knows no rules, it receives state, highlights and events.
// The parts live in scene/: board (terrain and pieces), marks (tile marks and cursor), units (characters and events),
// camera (orbit and action camera), space (tile to world) and timeline (the battle clock).
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import type { Grid } from '../shared/battle/grid.ts';
import type { BattleEvent, BattleState, Pos } from '../shared/battle/types.ts';
import type { Ambience } from './ambience.ts';
import { type ChargeLine, type Counters, chargeLines } from './charge-lines.ts';
import { el } from './icons.ts';
import { chargeDanger, type Highlights } from './interaction.ts';
import { no3d } from './no3d.ts';
import { Board } from './scene/board.ts';
import { CameraRig } from './scene/camera.ts';
import { ChargeLines } from './scene/charge-lines.ts';
import { CursorNote } from './scene/float-numbers.ts';
import { loadBattleAssets } from './scene/load.ts';
import { Marks } from './scene/marks.ts';
import { PerfCounter } from './scene/perf.ts';
import { squareUnder, TileSpace } from './scene/space.ts';
import { Timeline } from './scene/timeline.ts';
import { Units } from './scene/units.ts';
import type { TerrainTextures } from './terrain.ts';
import { letGo } from './three-util.ts';
import { speed } from './timing.ts';

// the map's context lost: the warning, as the layer's; not a disposed scene's, which is off the page (and holds
// nothing of its scene: no closure of the constructor)
const contextLost = (e: Event) => (e.target as Element).isConnected && no3d();

export class BattleScene {
  private readonly renderer = new THREE.WebGLRenderer({ antialias: false });
  private readonly scene = new THREE.Scene();
  private readonly cam: CameraRig;
  private readonly camera: THREE.OrthographicCamera;
  private readonly composer = new EffectComposer(this.renderer);
  private readonly board: Board;
  private marks: Marks; // rebuilt on a change of mark style (restyle)
  private chargeLines: ChargeLines;
  private readonly units: Units;
  private readonly floats: HTMLElement;
  private readonly note: CursorNote; // the counter a Move destination draws, over the cursor
  private readonly clock = new THREE.Clock();
  private readonly perf = new PerfCounter();
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
    lookPieces: Map<string, THREE.Object3D>,
    packClips: THREE.AnimationClip[],
    terrainTex: TerrainTextures | null = null,
  ) {
    this.space = new TileSpace(grid);
    this.renderer.shadowMap.enabled = true;
    this.renderer.info.autoReset = false; // zeroed by hand at the start of each frame (performance counter)
    // the shadow is drawn once per frame, requested in frame
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.domElement.className = 'board';
    this.renderer.domElement.addEventListener('webglcontextlost', contextLost);
    host.append(this.renderer.domElement);
    this.floats = el('div', { class: 'floats', 'aria-hidden': 'true' });
    host.append(this.floats);
    this.cam = new CameraRig(host, this.renderer.domElement, this.space, (ms, step) => this.time.animate(ms, step));
    this.camera = this.cam.camera;
    this.note = new CursorNote(this.camera, this.renderer.domElement, () => this.marks.cursorAt());
    for (const pass of [new RenderPass(this.scene, this.camera), new OutputPass()]) this.composer.addPass(pass);
    // screen sharpness up to 2x: a 3x phone draws at 2x, where the difference does not show and the phone is grateful
    const ratio = Math.min(devicePixelRatio, 2);
    this.renderer.setPixelRatio(ratio);
    this.composer.setPixelRatio(ratio);
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
    );
    addEventListener('resize', this.onResize);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // `all`: sheets for the whole scenario, not just the ones alive in the save (Nov 13, review): without this, reopening a save where a model
  // had already died and pressing "Play again" brought the unit back as the Beacon crystal
  static async create(host: HTMLElement, grid: Grid, state: BattleState, all: string[] = []): Promise<BattleScene> {
    const a = await loadBattleAssets(grid, state, all);
    const s = new BattleScene(host, grid, a.models, a.pieces, a.looks, a.pack, a.terrainTex);
    s.ambience = a.ambience.mount(s.scene);
    s.sync(state);
    return s;
  }

  setRangeRing(r: { from: Pos[]; range: number; walk?: string[] } | null) {
    this.marks.setRangeRing(r);
  }

  setTurnOrder(rank: Map<string, number> | null, now: string | null, cover?: number) {
    this.units.setOrder(rank, now, cover);
  }

  // The mark style changed (mark-style.ts): marks, lines, rings and border built again; Game.update sets the turn's marks
  restyle(state: BattleState) {
    this.marks = this.marks.again();
    this.chargeLines = this.chargeLines.again();
    this.units.restyle();
    this.board.restyle();
    this.sync(state);
  }

  setTrajectory(t: Parameters<Marks['setTrajectory']>[0]) {
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

  // the counters a strike earns or a destination draws (charge-lines.ts countersOwed, countersFrom)
  setCounters(c: Counters | null) {
    this.chargeLines.setCounters(c);
  }

  setCursor(p: Pos | null, size: number | Pos = 1, fits = true) {
    this.marks.setCursor(p, size, fits);
  }

  // a sword and the damage the counters there would deal, over the cursor (Nov 15, Fernando); null hides it
  setCursorNote(text: string | null) {
    this.note.set(text);
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

  // the walkable town's debug grid (Marks.setDebugGrid)
  setDebugGrid(g: { dots: Pos[]; squares: Pos[]; size: number } | null) {
    this.marks.setDebugGrid(g);
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

  // the walkable town (game/town.ts): people without battle markers, walking cell by cell (Units.glide); the title's
  // backdrop battle hides them while the title shows (`hide` false brings them back)
  hideMarkers(hide = true) {
    this.units.hideMarkers(hide);
  }
  glide(unitId: string, to: Pos, ms: number) {
    return this.units.glide(unitId, to, ms);
  }
  // the fluid walk (Units.slide): while it walks toward `dir`, the camera follows
  slide(unitId: string, p: Pos, dir?: Pos) {
    const w = this.units.slide(unitId, p, dir);
    if (w) this.cam.focusAt(w);
  }
  rest(unitId: string, at?: Pos) {
    this.units.rest(unitId, at);
  }
  drop(unitId: string) {
    this.units.drop(unitId);
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
    const unit = this.units.pick(ray, { x: clientX - r.left, y: clientY - r.top });
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

  // where the middle of a square of `size` cells is on the ground on screen, in canvas pixels like screenOf, with no body
  // (r 0): the town's balloon on a building. `flat`: at height 0, the grid's own directions (the aim's arrows, act-turn.ts)
  screenAt(p: Pos, size: number, flat = false): { x: number; y: number; r: number } {
    const top = this.space.squareTop(p, size);
    if (flat) top.y = 0;
    const v = top.project(this.camera);
    const c = this.renderer.domElement;
    return { x: ((v.x + 1) / 2) * c.clientWidth, y: ((1 - v.y) / 2) * c.clientHeight, r: 0 };
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

  setInsets(top: number, bottom: number, left = 0, right = 0) {
    if (this.cam.setInsets(top, bottom, left, right)) this.resize();
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

  // Performance counter numbers (Fernando's request, Nov 12): see PerfCounter
  stats() {
    return this.perf.read(this.renderer.info);
  }

  private frame() {
    this.perf.tick();
    this.renderer.info.reset();
    const dt = this.clock.getDelta();
    const fast = speed() * this.units.slow(this.time.t); // the death slow motion reaches the clock and the mixers
    this.time.tick(dt * 1000 * fast);
    this.cam.update(dt);
    this.marks.update(dt);
    this.cam.place(this.units.shake(this.time.t), this.time.t);
    // the note follows the sliding cursor and the camera every frame, like the menu beside the unit
    this.note.follow();
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
    letGo(this.renderer, this.scene);
    this.ambience?.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    // a browser keeps few WebGL contexts (16 in Chrome, fewer on a phone) and frees a let-go one only when it likes:
    // given back now, off the page already, so the listener above does not take it for a loss (one page, nav.ts)
    this.renderer.forceContextLoss();
    this.floats.remove();
  }
}
