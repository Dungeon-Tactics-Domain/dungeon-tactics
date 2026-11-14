// Three.js battle scene: block map, units, tile markers, floating numbers and an orthographic camera with
// RenderPixelatedPass (the spec's SNES pixel art). It only draws: it knows no rules, it receives state, highlights and events.
import * as THREE from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { type GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { RenderPixelatedPass } from 'three/examples/jsm/postprocessing/RenderPixelatedPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { ABILITIES } from '../shared/battle/abilities.ts';
import { dist, type Grid, samePos, standH, tileAt } from '../shared/battle/grid.ts';
import { footprint } from '../shared/battle/pathing.ts';
import type { BattleEvent, BattleState, Pos, UnitState } from '../shared/battle/types.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';
import { type Ambience, kindOf, loadAmbience } from './ambience.ts';
import { chargeAura, lookOf, playFx } from './fx.ts';
import { t } from './i18n.ts';
import { el } from './icons.ts';
import { chargeDanger, type Highlights } from './interaction.ts';
import { barYOf, MARKER, modelOf, unitHeight } from './markers.ts';
import { loadPaint } from './painted.ts';
import type { PixelSettings } from './pixel-settings.ts';
import { swapProps } from './props.ts';
import { Board, CORPSE_MODELS, lookPieceNames, prepare } from './scene/board.ts';
import { CameraRig } from './scene/camera.ts';
import { Marks } from './scene/marks.ts';
import { rampLink, TileSpace } from './scene/space.ts';
import { Timeline } from './scene/timeline.ts';
import { loadTerrainTextures, type TerrainTextures } from './terrain.ts';
import { isJump, jumpAirMs, speed, TIMING } from './timing.ts';
import { swapTrees } from './trees.ts';

const TEAM_COLOR = { hero: '#3d9bff', enemy: '#ff4d4d' };
const EDGES = { depthEdgeStrength: 0.5, normalEdgeStrength: 0.35 }; // outline from the approved POC
const TINT_GLOW = 0.45; // strength of the own glow (UnitDef.tint): visible on the dark unit without erasing the texture
const UP = new THREE.Vector3(0, 1, 0);
const TMP = new THREE.Vector3(); // per-frame math without creating objects

// Reduced palette: each channel in a few steps, after the sRGB conversion (steps equal to the eye). 6 levels
// recall the SNES's 15 bits without becoming a poster; the option exists for Fernando to compare.
const PALETTE_SHADER = {
  uniforms: { tDiffuse: { value: null }, levels: { value: 6 } },
  vertexShader:
    'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader:
    'uniform sampler2D tDiffuse; uniform float levels; varying vec2 vUv; void main() { vec4 c = texture2D(tDiffuse, vUv); gl_FragColor = vec4(floor(c.rgb * levels + 0.5) / levels, c.a); }',
};

interface UnitView {
  holder: THREE.Group;
  mixer: THREE.AnimationMixer | null;
  clips: THREE.AnimationClip[];
  current: THREE.AnimationAction | null;
  bar: THREE.Mesh; // filled part of the health bar
  hp: number;
  def: string;
  aura: THREE.Mesh | null; // glow on the ground while charging an ability
  body: THREE.Object3D | null;
  mats: THREE.MeshStandardMaterial[]; // materials only for this unit (copies): flashing one does not flash the others of the same model
  flash: number; // counts the flashes: only the last one gives the glow back (a strike and a thorn in a row do not cut the second)
  ground: THREE.Group; // ring and front arrow, lying on the ramp (tiltGround)
}

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
  private readonly units = new Map<string, UnitView>();
  private readonly floats: HTMLElement;
  private readonly clock = new THREE.Clock();
  private readonly time = new Timeline();
  private frozenUntil = 0; // hit-stop: units stay still until here
  private shakeUntil = 0; // strong strike: the camera shakes until here
  private readonly onResize = () => this.resize();
  private readonly space: TileSpace;
  private readonly sky = new THREE.HemisphereLight('#fff1d6', '#3a3050', 1.15);
  private readonly sun = new THREE.DirectionalLight('#ffffff', 1.6);
  private readonly fallen = new Map<string, THREE.Group>(); // bodies of those who died, on the ground until the end of the battle
  private ambience: Ambience | null = null; // surroundings, fog, light rays and particles (ambience.ts)

  private constructor(
    private readonly host: HTMLElement,
    private readonly grid: Grid,
    private readonly models: Map<string, GLTF>,
    pieces: Record<'top' | 'side' | 'stone' | 'tree', THREE.Object3D>,
    pixel: PixelSettings,
    lookPieces: Map<string, THREE.Object3D>,
    private readonly packClips: THREE.AnimationClip[],
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
    this.cam = new CameraRig(host, this.renderer.domElement, this.space, (ms, step) => this.animate(ms, step));
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

  setRangeRing(r: { center: Pos; range: number } | null) {
    this.marks.setRangeRing(r);
  }

  setTrajectory(t: { from: Pos; to: Pos; block: Pos | null } | null) {
    this.marks.setTrajectory(t);
  }

  setCursor(p: Pos | null) {
    this.marks.setCursor(p);
  }

  // ring and arrow of the unit lying on the ramp of the tile it is on; the holder turns with the unit's direction, so the
  // tilt goes into its rotation. A big unit (2x2) does not stop on a ramp
  private tiltGround(v: UnitView) {
    const ground = v.ground;
    const s = (UNIT_DEFS[v.def].size ?? 1) === 1 ? this.space.slope(this.posOf(v)) : null;
    if (!s) return void ground.quaternion.identity();
    TMP.set(-s.x, 1, -s.z).normalize().applyAxisAngle(UP, -v.holder.rotation.y);
    ground.quaternion.setFromUnitVectors(UP, TMP);
  }

  // rotation to where the camera is going (not the mid-animation one): WASD already walks right after R
  get heading(): number {
    return this.cam.heading;
  }

  private makeUnit(u: UnitState): UnitView {
    const holder = new THREE.Group();
    let mixer: THREE.AnimationMixer | null = null;
    let clips: THREE.AnimationClip[] = [];
    let body: THREE.Object3D | null = null;
    const mats: THREE.MeshStandardMaterial[] = [];
    const gltf = this.models.get(modelOf(u.def));
    if (gltf) {
      body = prepare(cloneSkinned(gltf.scene));
      body.traverse((m) => {
        const mesh = m as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
        // factory glow (yellow eyes on the skeletons): the strike and heal flash touches the emissive and must return to it
        mat.userData.glow = { color: mat.emissive.clone(), intensity: mat.emissiveIntensity };
        mesh.material = this.board.shaded(mat); // ?units=plain compares without the shading
        mats.push(mat);
      });
      this.glowBack(mats, u.def);
      const b = new THREE.Box3().setFromObject(body);
      body.scale.setScalar(unitHeight(u.def) / (b.max.y - b.min.y));
      holder.add(body);
      mixer = new THREE.AnimationMixer(body);
      // the pack's clips only with the bone tracks this unit has (without it Three warns every frame)
      const has = (track: THREE.KeyframeTrack) => !!body!.getObjectByName(track.name.split('.')[0]);
      clips = [
        ...gltf.animations,
        ...this.packClips.map((c) => new THREE.AnimationClip(c.name, c.duration, c.tracks.filter(has))),
      ];
    } else {
      // the Beacon has no model: a glowing crystal, to read from afar which is the target to protect
      const crystal = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.32),
        new THREE.MeshStandardMaterial({ color: '#7ff3ff', emissive: '#2bb8d6', emissiveIntensity: 1.2 }),
      );
      crystal.position.y = 0.55;
      crystal.castShadow = true;
      holder.add(crystal, new THREE.PointLight('#7ff3ff', 2, 3));
    }
    // ring and front arrow together, to lie on the ramp where the unit is (tiltGround)
    const ground = new THREE.Group();
    // white arrow on the ground for the unit's front (white: the team color vanished on marked tiles), only on maps where direction counts: from above the unit's face is hardly readable
    if (u.facing !== undefined) {
      const arrow = new THREE.Mesh(
        new THREE.ConeGeometry(0.16, 0.3, 3).rotateX(Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: '#ffffff' }),
      );
      arrow.position.set(0, 0.05, 0.5);
      arrow.scale.y = 0.3;
      ground.add(arrow);
    }
    // team-colored ring on the ground: the side reads even when the model looks alike
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.34, 0.44, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: TEAM_COLOR[u.team], depthWrite: false, transparent: true, opacity: 0.9 }),
    );
    ring.position.y = 0.04;
    ring.scale.setScalar(UNIT_DEFS[u.def].size ?? 1); // big unit: the ring surrounds the whole square
    // bar of 0.12 height (full 0.08): with 0.06 it partly vanished in the 2 px pixel art
    const barBg = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, MARKER.barHalf * 2),
      new THREE.MeshBasicMaterial({ color: '#1a1020', depthTest: false }),
    );
    const bar = new THREE.Mesh(
      new THREE.PlaneGeometry(0.66, 0.08),
      new THREE.MeshBasicMaterial({ color: TEAM_COLOR[u.team], depthTest: false }),
    );
    bar.position.z = 0.001;
    const barHolder = new THREE.Group().add(barBg, bar);
    barHolder.position.y = barYOf(u.def);
    barHolder.name = 'bar';
    barBg.renderOrder = bar.renderOrder = 10;
    ground.add(ring);
    holder.add(ground, barHolder);
    // stage boss: golden crown above the bar, so the "take down the boss" objective shows on the map
    if (UNIT_DEFS[u.def].boss) {
      const crown = new THREE.Mesh(
        new THREE.ConeGeometry(0.14, 0.2, 5),
        new THREE.MeshBasicMaterial({ color: '#f2c14e' }),
      );
      crown.position.y = barYOf(u.def) + 0.22;
      holder.add(crown);
    }
    this.scene.add(holder);
    const view: UnitView = {
      holder,
      mixer,
      clips,
      current: null,
      bar,
      hp: u.hp,
      def: u.def,
      aura: null,
      body,
      mats,
      flash: 0,
      ground,
    };
    this.play(view, 'Idle');
    return view;
  }

  // Jump of one step, like FFT's leap: crouches still, flies in an arc to the tile and lands. The top of the arc passes 0.4
  // levels above the highest tile, so climbing looks like a push and descending like a fall; `levels` lengthens the flight
  private async jump(v: UnitView, a: THREE.Vector3, b: THREE.Vector3, levels: number) {
    this.play(v, 'Jump_Start', true, 0.6 / (TIMING.jumpCrouch / 1000));
    await this.wait(TIMING.jumpCrouch);
    this.play(v, 'Jump_Idle');
    const c = Math.max(a.y, b.y) + 0.4 * this.space.step - (a.y + b.y) / 2;
    await this.animate(jumpAirMs(levels), (k) =>
      v.holder.position.lerpVectors(a, b, k).setY(a.y + (b.y - a.y) * k + 4 * c * k * (1 - k)),
    );
    this.play(v, 'Jump_Land', true, 0.67 / (TIMING.jumpLand / 1000));
    await this.wait(TIMING.jumpLand);
  }

  private play(v: UnitView, name: string, once = false, rate = 1) {
    const clip = v.clips.find((c) => c.name === name);
    if (!v.mixer || !clip) return;
    const action = v.mixer.clipAction(clip);
    action.reset();
    action.setEffectiveTimeScale(rate);
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = once;
    if (v.current && v.current !== action) action.crossFadeFrom(v.current, 0.15, false);
    action.play();
    v.current = action;
  }

  // ms > 0: the bar goes down (or up) gradually, as in FFT, without holding up the sequence
  private setBar(v: UnitView, ms = 0) {
    const k = Math.max(0, v.hp / UNIT_DEFS[v.def].hp);
    const apply = (x: number) => {
      v.bar.scale.x = Math.max(0.001, x);
      v.bar.position.x = -0.33 * (1 - x);
    };
    if (!ms) return apply(k);
    const from = v.bar.scale.x;
    void this.animate(ms, (s) => apply(from + (k - from) * s));
  }

  // center of the tiles the unit occupies, at the height of the highest (big unit: the middle of the 2x2 square)
  private unitWorld(u: UnitState): THREE.Vector3 {
    const tiles = footprint(u).map((p) => this.space.stand(p));
    const c = tiles.reduce((a, b) => a.add(b), new THREE.Vector3()).divideScalar(tiles.length);
    return c.setY(Math.max(...tiles.map((w) => w.y)));
  }

  private face(v: UnitView, to: Pos) {
    const d = this.space.world(to).sub(v.holder.position);
    if (d.lengthSq() > 0.001) v.holder.rotation.y = Math.atan2(d.x, d.z);
  }

  // Puts each unit where the state says (creates whoever is missing, removes whoever died). Called on open, after each animation and on undo.
  sync(state: BattleState) {
    const hot = chargeDanger(state, this.grid.width, this.grid.height);
    this.marks.showDanger(hot);
    const alive = new Set(state.units.map((u) => u.id));
    // whoever died becomes a body on the ground: no bar, no ring, darker; the undo that brings the unit back removes the body
    for (const [id, v] of this.units) {
      if (alive.has(id)) continue;
      this.units.delete(id);
      v.mixer?.update(10); // closes the death animation on the last frame
      v.holder.getObjectByName('bar')?.removeFromParent();
      v.ground.visible = false;
      if (v.aura) v.aura.visible = false;
      for (const m of v.mats) {
        m.color.multiplyScalar(0.55);
        m.emissive.setScalar(0);
      }
      this.fallen.set(id, v.holder);
    }
    for (const [id, h] of this.fallen)
      if (alive.has(id)) {
        this.scene.remove(h);
        this.fallen.delete(id);
      }
    const enemies = state.units.filter((u) => u.team === 'enemy');
    for (const u of state.units) {
      let v = this.units.get(u.id);
      if (!v) {
        v = this.makeUnit(u);
        this.units.set(u.id, v);
        // spawns looking to the far side
        const foe = u.team === 'hero' ? enemies[0] : state.units.find((x) => x.team === 'hero');
        if (foe) {
          v.holder.position.copy(this.unitWorld(u));
          this.face(v, foe.pos);
        }
      }
      v.holder.position.copy(this.unitWorld(u));
      // map with direction (FFT study): the model looks where the state says, after each animation and undo
      if (u.facing !== undefined) v.holder.rotation.y = (u.facing * Math.PI) / 2;
      v.hp = u.hp;
      this.setBar(v);
      // aura and looping gesture while the charge is in the queue; they vanish when it goes off or is undone
      const charge = state.charges.find((c) => c.unit === u.id);
      if (charge && !v.aura) {
        v.aura = chargeAura(!!ABILITIES[charge.ability].magic);
        v.holder.add(v.aura);
        const loop = lookOf(charge.ability).charge;
        if (loop) this.play(v, loop);
      } else if (!charge && v.aura) {
        v.holder.remove(v.aura);
        v.aura = null;
        this.play(v, 'Idle');
      }
    }
  }

  setHighlights(h: Highlights | null) {
    this.marks.setHighlights(h);
  }

  // The unit's own glow (UnitDef.tint, the Acolyte over the mage): emissive, because the material color multiplies the
  // texture and on a dark unit it did not show (tested on Nov 13). Strike and heal use the same emissive to flash, so
  // they return to it at the end; without tint, to the material's factory glow (before it zeroed and put out the skeletons' eyes)
  private glowBack(mats: THREE.MeshStandardMaterial[], def: string) {
    const tint = UNIT_DEFS[def]?.tint;
    for (const m of mats) {
      const glow = m.userData.glow as { color: THREE.Color; intensity: number } | undefined;
      if (tint) m.emissive.set(tint);
      else if (glow) m.emissive.copy(glow.color);
      m.emissiveIntensity = tint ? TINT_GLOW : (glow?.intensity ?? 0);
    }
  }

  private animate(dur: number, step: (k: number) => void): Promise<void> {
    return this.time.animate(dur, step);
  }

  // start of the turn: the unit hops (rises and stretches a little), so the eye finds whoever is playing
  pop(unitId: string) {
    const v = this.units.get(unitId);
    if (!v?.body) return;
    const body = v.body,
      base = body.scale.y;
    void this.animate(TIMING.pop, (k) => {
      const s = Math.sin(Math.PI * k);
      body.position.y = s * 0.18;
      body.scale.y = base * (1 + s * 0.08);
    });
  }

  wait(ms: number): Promise<void> {
    return this.time.wait(ms);
  }

  // Impact: everything stops for an instant (hit-stop), the target flashes white and then shakes, with the shake fading
  private async impact(v: UnitView) {
    this.frozenUntil = this.time.t + TIMING.hitStop;
    for (const m of v.mats) m.emissive.set('#ffffff');
    const flash = ++v.flash;
    void this.animate(TIMING.hitStop * 1.6, (k) => v.mats.forEach((m) => (m.emissiveIntensity = 1 - k))).then(
      () => flash === v.flash && this.glowBack(v.mats, v.def),
    );
    await this.wait(TIMING.hitStop);
    if (v.body)
      void this.animate(TIMING.shake, (k) => (v.body!.position.x = Math.sin(k * Math.PI * 6) * 0.07 * (1 - k)));
  }

  private float(unitId: string, text: string, cls: string) {
    const v = this.units.get(unitId);
    if (!v) return;
    const p = v.holder.position
      .clone()
      .setY(v.holder.position.y + 1.3)
      .project(this.camera);
    const node = el(
      'div',
      { class: `float ${cls}`, style: `left:${((p.x + 1) / 2) * 100}%;top:${((1 - p.y) / 2) * 100}%` },
      text,
    );
    this.floats.append(node);
    setTimeout(() => node.remove(), TIMING.float);
  }

  // Plays the events in sequence; the rule is already applied to the state, here it is just reading what happened.
  // `before` runs before each event (the game uses it for the banner with the ability name and the enemy's destination).
  async playEvents(events: BattleEvent[], state: BattleState, before?: (e: BattleEvent) => Promise<void>) {
    for (const e of events) {
      const v = this.units.get(e.unit);
      if (!v) continue;
      await before?.(e);
      if (e.k === 'move') {
        // by step (Nov 13, Fernando's request: slow walking and realistic jump). Walking_A has 2 strides in 1.07 s: 1.25x gives
        // ~1.4 strides per 0.6 s tile, the foot barely slides
        this.play(v, 'Walking_A', false, 1.25);
        const n = e.path.length - 1;
        for (let i = 1; i <= n; i++) {
          const a = this.space.stand(e.path[i - 1]),
            b = this.space.stand(e.path[i]);
          this.face(v, e.path[i]);
          // jumps when the standing height changes or flies a gap (the same math as the Jump and the footstep sound, stepMs); a study ramp is flat
          const dh = rampLink(this.grid, e.path[i - 1], e.path[i])
            ? 0
            : standH(tileAt(this.grid, e.path[i])) - standH(tileAt(this.grid, e.path[i - 1]));
          const tiles = dist(e.path[i - 1], e.path[i]);
          if (isJump(dh, tiles)) {
            await this.jump(v, a, b, Math.max(Math.abs(dh), tiles));
            if (i < n) this.play(v, 'Walking_A', false, 1.25);
            continue;
          }
          // starts on the 1st tile and brakes on the last (sine curve), constant step in the middle: leaves like a unit on rails
          const ease = (k: number) =>
            n === 1
              ? (1 - Math.cos(Math.PI * k)) / 2
              : i === 1
                ? 1 - Math.cos((Math.PI / 2) * k)
                : i === n
                  ? Math.sin((Math.PI / 2) * k)
                  : k;
          const from = e.path[i - 1],
            to = e.path[i];
          const ramp = !!(tileAt(this.grid, from).ramp || tileAt(this.grid, to).ramp);
          await this.animate(TIMING.step, (k) => {
            v.holder.position.lerpVectors(a, b, ease(k));
            if (ramp) v.holder.position.y = this.space.walkY(from, to, ease(k));
          });
        }
        this.play(v, 'Idle');
      } else if (e.k === 'attack') {
        const target = state.units.find((u) => u.pos.x === e.target.x && u.pos.y === e.target.y);
        if (!samePos(this.posOf(v), e.target))
          await this.cam.actionCam(this.posOf(v), e.target, state.units.find((u) => u.id === e.unit)?.team === 'enemy');
        if (ABILITIES[e.ability].range[1] > 0) this.face(v, target?.pos ?? e.target);
        const look = lookOf(e.ability);
        this.play(v, look.clip, true);
        await this.wait(TIMING.windup);
        const from = v.holder.position.clone().setY(v.holder.position.y + 0.55);
        const to = this.space.world(e.target).setY(this.space.world(e.target).y + 0.4);
        if (look.fx === 'dash') {
          // charge: advances half a tile and returns, like FFT's quick lunge
          const a = v.holder.position.clone(),
            b = a.clone().lerp(this.space.world(e.target), 0.5);
          await this.animate(TIMING.lunge, (k) => v.holder.position.lerpVectors(a, b, Math.sin(Math.PI * k)));
        }
        await playFx(
          this.scene,
          (ms, step) => this.animate(ms, step),
          look.fx,
          from,
          to,
          ABILITIES[e.ability].radius,
          TIMING.projectile,
        );
        this.play(v, 'Idle'); // the gesture plays once and stuck on the last frame until the unit acted again (Nov 13 review)
      } else if (e.k === 'hit' || e.k === 'bump' || e.k === 'fall' || e.k === 'spike') {
        v.hp -= e.dmg;
        // strong strike (25% of health or more): the screen shakes and the number comes out bigger. With 30%, none of 10 strikes in a
        // Skirmish went through (measured Nov 12): the effect must show up now and then, not never
        const big = e.dmg >= UNIT_DEFS[v.def].hp * 0.25;
        if (big) this.shakeUntil = this.time.t + TIMING.hitStop + TIMING.shake;
        await this.impact(v);
        this.setBar(v, TIMING.hpDrain);
        this.float(e.unit, `-${e.dmg}`, big ? 'dmg big' : 'dmg');
        if (v.hp > 0) this.play(v, 'Hit_A', true);
        await this.wait(e.k === 'hit' ? TIMING.hit : TIMING.crash);
        if (v.hp > 0) this.play(v, 'Idle');
      } else if (e.k === 'miss') {
        this.float(e.unit, t('Errou', 'Miss'), 'miss');
        // dodge: the target takes a little step back and returns, so the miss shows on the unit and not only in the text
        if (v.body) void this.animate(TIMING.hit * 0.8, (k) => (v.body!.position.z = -Math.sin(Math.PI * k) * 0.25));
        await this.wait(TIMING.hit);
      } else if (e.k === 'heal') {
        v.hp += e.amount;
        // heal flashes green, without the strike's pause or shake: the same signal, with another meaning
        for (const m of v.mats) m.emissive.set('#5dff8a');
        const flash = ++v.flash;
        void this.animate(TIMING.hit, (k) => v.mats.forEach((m) => (m.emissiveIntensity = 0.8 * (1 - k)))).then(
          () => flash === v.flash && this.glowBack(v.mats, v.def),
        );
        this.setBar(v, TIMING.hpDrain);
        this.float(e.unit, `+${e.amount}`, 'heal');
        await this.wait(TIMING.hit);
      } else if (e.k === 'push') {
        const a = v.holder.position.clone(),
          b = this.space.stand(e.to);
        await this.animate(TIMING.push, (k) => v.holder.position.lerpVectors(a, b, k));
      } else if (e.k === 'charge') {
        // starts charging: the long spell gesture (each ability's own effect comes in the animation block)
        this.face(v, e.target);
        this.play(v, lookOf(e.ability).charge ?? 'Spellcast_Long');
        this.float(e.unit, t('Carregando', 'Charging'), 'miss');
        await this.wait(TIMING.hit);
      } else if (e.k === 'fizzle') {
        this.float(e.unit, t('Sem alvo', 'No target'), 'miss');
        await this.wait(TIMING.hit);
      } else if (e.k === 'die') {
        // falls and stays down (Nov 13, Fernando's request: "the enemies' bodies must stay on the ground and not vanish"); the
        // sync removes the bar and the ring and darkens the body (fallen)
        this.play(v, 'Death_A', true);
        await this.wait(TIMING.die);
      }
    }
    await this.cam.endActionCam();
    this.sync(state);
  }

  celebrate(team: 'hero' | 'enemy', state: BattleState) {
    for (const u of state.units) if (u.team === team) this.play(this.units.get(u.id)!, 'Cheer');
  }

  // Tile under the finger. The unit's body counts before the ground: the drawn unit covers the tile behind, and whoever touches it
  // wants the unit (mobile audit of Oct 25: tapping the enemy picked the tile behind it)
  pick(clientX: number, clientY: number): Pos | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(
      new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1),
      this.camera,
    );
    const holders = [...this.units.values()];
    for (const hit of ray.intersectObjects(
      holders.map((v) => v.holder),
      true,
    )) {
      for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) {
        const unit = holders.find((v) => v.holder === o);
        if (unit) return this.posOf(unit);
      }
    }
    const hit = ray.intersectObjects(this.board.tileTops, false)[0];
    return hit ? (hit.object.userData.tiles as Pos[])[hit.instanceId!] : null;
  }

  // Middle of the unit's body on screen (canvas px, which fills the whole host) and its half width in px: the HUD puts the command
  // menu beside the unit, as in FFT. Orthographic camera: px per world unit = canvas height / view height
  screenOf(unitId: string): { x: number; y: number; r: number } | null {
    const v = this.units.get(unitId);
    if (!v) return null;
    const c = this.renderer.domElement;
    const p = v.holder.position
      .clone()
      .setY(v.holder.position.y + unitHeight(v.def) / 2)
      .project(this.camera);
    // 0.5 tile per occupied tile: covers the team ring on the ground (radius 0.44) and the body from any angle
    const r = (0.5 * (UNIT_DEFS[v.def].size ?? 1) * c.clientHeight) / (this.camera.top - this.camera.bottom);
    return { x: ((p.x + 1) / 2) * c.clientWidth, y: ((1 - p.y) / 2) * c.clientHeight, r };
  }

  // slides the camera to the tile (the hero of the turn), without changing the zoom
  focusOn(p: Pos, also?: Pos) {
    this.cam.focusOn(p, also);
  }

  // back to the whole-map framing
  resetView() {
    this.cam.resetView();
    this.resize();
  }

  private posOf(v: UnitView): Pos {
    const p = v.holder.position;
    return { x: Math.round(p.x + this.grid.width / 2 - 0.5), y: Math.round(p.z + this.grid.height / 2 - 0.5) };
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
    const s = this.time.t < this.shakeUntil ? 0.12 * ((this.shakeUntil - this.time.t) / TIMING.shake) : 0;
    this.cam.place(this.pixel, s, this.time.t);
    if (this.board.hasTrees)
      this.board.updateCuts(this.camera.matrixWorldInverse, (add) => {
        for (const v of this.units.values()) {
          const h = unitHeight(v.def),
            p = v.holder.position;
          if (v.holder.visible) add(p.x, p.y + h * 0.6, p.z, Math.max(0.75, h * 0.75));
        }
        this.marks.protect(add);
      });
    for (const v of this.units.values()) {
      if (this.time.t >= this.frozenUntil) v.mixer?.update(dt * fast);
      this.tiltGround(v);
      // health bar always facing the camera
      v.holder
        .getObjectByName('bar')!
        .quaternion.copy(v.holder.quaternion.clone().invert().multiply(this.camera.quaternion));
    }
    this.board.update(this.time.t, this.units.values());
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
