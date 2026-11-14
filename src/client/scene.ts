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
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { ABILITIES } from '../shared/battle/abilities.ts';
import {
  dist,
  FACING,
  type Grid,
  inBounds,
  neighbors,
  posKey,
  samePos,
  standH,
  type Tile,
  tileAt,
} from '../shared/battle/grid.ts';
import { footprint } from '../shared/battle/pathing.ts';
import type { BattleEvent, BattleState, Pos, UnitState } from '../shared/battle/types.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';
import { type Ambience, EXTEND, kindOf, loadAmbience } from './ambience.ts';
import { buildBridges } from './bridge.ts';
import { addDetail } from './detail.ts';
import { chargeAura, lookOf, playFx } from './fx.ts';
import { t } from './i18n.ts';
import { el } from './icons.ts';
import { chargeDanger, type Highlights, type TileKind } from './interaction.ts';
import { barYOf, MARKER, modelOf, unitHeight } from './markers.ts';
import { loadPaint, boxOf as pieceBox, variant } from './painted.ts';
import type { PixelSettings } from './pixel-settings.ts';
import { DEBRIS, LITTER, swapProps } from './props.ts';
import { rampLink, STEP, TileSpace } from './scene/space.ts';
import { param } from './store.ts';
import {
  buildStream,
  buildTerrain,
  loadTerrainTextures,
  PAINT,
  pickTiles,
  riverOf,
  riverOutside,
  type TerrainTextures,
} from './terrain.ts';
import { isJump, jumpAirMs, speed, TIMING } from './timing.ts';
import { swapTrees } from './trees.ts';
import { Water } from './water.ts';
import type { WaterLevel } from './water-levels.ts';

const PITCH = THREE.MathUtils.degToRad(32); // FFT's angle
// Action cameras to compare (Nov 13, Fernando's request: "test several action cam options like over the shoulder,
// from behind the enemy, etc"): `?camera=<name>` picks one; without the parameter `hero` applies (his pick on Nov 13,
// after seeing the prints of all of them), which alternates `shoulder` and `behind` to stay always on the heroes' side.
// turn: rotation around the target from the strike line (0 = behind the attacker, π = behind the target); pitch: tilt
// in degrees (32 = the game's; low = camera near the ground); zoom: view height, base + per tile of distance; aim: where
// the camera aims between the attacker (0) and the target (1); lift: how much the focus rises off the ground, so the unit is not at the edge;
// clip: with the camera low, whatever sits between it and the units (outside forest, ravine, tree) would cover the strike, so everything
// more than `clip` tiles in front of the focus stops being drawn (the camera's clipping plane) while it lasts
interface ActionCam {
  turn: number;
  pitch: number;
  zoom: [base: number, perTile: number];
  aim: number;
  lift: number;
  clip?: number;
}
const ACTION_CAMS: Record<string, ActionCam | null> = {
  xcom: { turn: 0.35, pitch: 32, zoom: [4, 0.9], aim: 0.5, lift: 0 },
  shoulder: { turn: 0.45, pitch: 20, zoom: [2.6, 0.7], aim: 0.6, lift: 0.45, clip: 3.2 }, // over the shoulder of the attacker
  behind: { turn: Math.PI - 0.45, pitch: 20, zoom: [2.6, 0.7], aim: 0.4, lift: 0.45, clip: 3.2 }, // from behind the enemy
  side: { turn: Math.PI / 2, pitch: 16, zoom: [2.6, 0.95], aim: 0.5, lift: 0.4, clip: 3 }, // the two in profile
  top: { turn: 0.35, pitch: 60, zoom: [4.2, 0.9], aim: 0.5, lift: 0 }, // from above, tactical
  none: null, // no action camera
}; // and `hero`, which alternates between `shoulder` and `behind` (actionCam)
const CAM_DIST = 30; // camera distance to the focus (orthographic: it only decides what sits in front of the clipping plane)
const camAsked = param('camera');
const CAM_NAME = camAsked !== null && camAsked in ACTION_CAMS ? camAsked : 'hero';
const ZOOM = { min: 4, max: 16 };
const ZOOM_START = 1.5;
// portrait phone: at most ~9.5 tiles wide when opening. On the 20x20 the whole map left the tile at ~20 px, small
// for a finger (touch target ≥ 44 px); the camera follows the hero of the turn and the recenter button shows everything
const PORTRAIT_START = 8.3;
// PC: opens with ~10 of view height (before up to 16, almost the whole map and the unit at ~30 px at 1280x720). FFT shows
// few tiles and big units; the camera follows the cursor and whoever acts, and F still shows the whole map (Nov 12)
const PC_START = 10;

// marker colors; the meaning also goes in HUD text (never color alone)
// Veil purple: the area of a spell being charged stays lit until it goes off (the text goes on the tile under the cursor, hud.ts)
const DANGER: [string, number] = ['#9b4dff', 0.4];
// Stylized marker (Nov 13, Fernando's request: "this preview is too white... something more stylized and less washed-out"; the
// flat white square became a carpet in Ash Wood): thin frame in the type's color with a dark thread outside (reads on
// grass, dirt and water: the Nov 12 blue vanished in water for being a full square), faint core and a drawing per
// type, because color is never the only signal: smooth (walk), full (chosen tile, whoever acts, strike area), stripes
// (strike range, threat) and cross (blocked shot)
type MarkPattern = 'frame' | 'solid' | 'hatch' | 'cross';
const MARK: Record<TileKind | 'path', [color: string, opacity: number, pattern?: MarkPattern]> = {
  actor: ['#ffd479', 0.95, 'solid'],
  move: ['#6fc0ff', 0.95, 'frame'],
  range: ['#ff7a3c', 0.95, 'hatch'],
  blocked: ['#b07ae0', 0.95, 'cross'],
  threat: ['#ff2d55', 0.6, 'hatch'],
  area: ['#ffb020', 1, 'solid'],
  target: ['#fff2a0', 1, 'solid'],
  path: ['#1e6fff', 0.95],
};
const markTextures = new Map<MarkPattern, THREE.CanvasTexture>();
// white texture (the color comes from the material) with the marker drawing; one per drawing, made the first time
function markTexture(p: MarkPattern): THREE.CanvasTexture {
  let t = markTextures.get(p);
  if (t) return t;
  const S = 64,
    c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = `rgba(255,255,255,${p === 'solid' ? 0.42 : 0.08})`; // core
  g.fillRect(4, 4, S - 8, S - 8);
  if (p === 'hatch' || p === 'cross') {
    g.save();
    g.beginPath();
    g.rect(7, 7, S - 14, S - 14);
    g.clip();
    g.strokeStyle = 'rgba(255,255,255,0.6)';
    g.lineWidth = 4;
    g.beginPath();
    if (p === 'hatch')
      for (let k = -S; k < S; k += 16) {
        g.moveTo(k, S);
        g.lineTo(k + S, 0);
      }
    else {
      g.moveTo(10, 10);
      g.lineTo(S - 10, S - 10);
      g.moveTo(S - 10, 10);
      g.lineTo(10, S - 10);
    }
    g.stroke();
    g.restore();
  }
  g.strokeStyle = 'rgba(0,0,0,0.6)'; // dark thread outside
  g.lineWidth = 2;
  g.strokeRect(1, 1, S - 2, S - 2);
  g.strokeStyle = '#ffffff'; // frame
  g.lineWidth = 5;
  g.strokeRect(4.5, 4.5, S - 9, S - 9);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  // no mipmap: the tile shows up flat (half the height) and the mipmap blurred the frame inward, leaving the core milky
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  markTextures.set(p, t);
  return t;
}
const TEAM_COLOR = { hero: '#3d9bff', enemy: '#ff4d4d' };
// Pieces for each tile look (Tile.look), in public/models: top cube and column cube below. A bridge has no
// column (water underneath); a tree puts the forest model on top. Mapping by the orchestrator on Nov 12 (assembly
// of Gariland from the map file's surface_type), approved by Fernando to go into the game.
// `canopy`: the tile height on the map is the crown's (a Gariland tree), and the ground comes from the lowest neighbor.
// `stairs`: on a ramp tile the top stays flat and the dungeon stairs (STAIRS) climb over it (crypts, Nov 13)
const LOOK: Record<
  string,
  { top: string; side: string | null; prop?: string; propH?: number; propW?: number; canopy?: true; stairs?: true }
> = {
  grass: { top: 'blocks/grass', side: 'blocks/dirt' },
  stone: { top: 'blocks/gravel', side: 'blocks/stone' },
  // water: the top piece is the gravel bed (where the unit steps), seen through the water.ts surface (Nov 13)
  water: { top: 'blocks/gravel', side: 'blocks/stone_dark' },
  roof: { top: 'blocks/bricks_B', side: 'blocks/bricks_A' },
  chimney: { top: 'blocks/stone_dark', side: 'blocks/bricks_A' },
  wood: { top: 'blocks/wood', side: 'blocks/wood' },
  bridge: { top: 'blocks/wood', side: null },
  box: { top: 'dungeon/box_large', side: 'blocks/stone' },
  tree: { top: 'blocks/grass', side: 'blocks/dirt', prop: 'forest/Tree_1_A_Color1', canopy: true },
  // Beacon Hill (Nov 12, proposal approved by Fernando): rock on the hill, sand and gold on the Beacon mound, brick
  // walls, four varied trees and the enemies' side in the snow (read from afar which side each team starts on)
  rock: { top: 'blocks/stone', side: 'blocks/stone' },
  summit: { top: 'blocks/stone_dark', side: 'blocks/stone' },
  sand: { top: 'blocks/sand_with_grass', side: 'blocks/dirt' },
  gold: { top: 'blocks/stone_with_gold', side: 'blocks/stone' },
  brick: { top: 'blocks/bricks_B', side: 'blocks/bricks_A' },
  snow: { top: 'blocks/dirt_with_snow', side: 'blocks/dirt' },
  snow_rock: { top: 'blocks/snow', side: 'blocks/stone' },
  tree2: { top: 'blocks/grass', side: 'blocks/dirt', prop: 'forest/Tree_2_A_Color1' },
  tree3: { top: 'blocks/grass', side: 'blocks/dirt', prop: 'forest/Tree_3_A_Color1' },
  tree4: { top: 'blocks/grass', side: 'blocks/dirt', prop: 'forest/Tree_4_A_Color1' },
  bare1: { top: 'blocks/dirt_with_snow', side: 'blocks/dirt', prop: 'forest/Tree_Bare_1_A_Color1' },
  bare2: { top: 'blocks/dirt_with_snow', side: 'blocks/dirt', prop: 'forest/Tree_Bare_2_A_Color1' },
  // Flooded Crypt (Nov 12, closed map with the dungeon pieces): gravel floor, dark altar, and tiles that block
  // with a column, crates, barrel or chest on top; the debris is walkable cover. propH = piece height in tiles.
  crypt: { top: 'blocks/gravel', side: 'blocks/stone_dark', stairs: true },
  altar: { top: 'blocks/stone_dark', side: 'blocks/stone_dark', stairs: true },
  pillar: { top: 'blocks/gravel', side: 'blocks/stone_dark', prop: 'dungeon/pillar', propH: 2 },
  crates: { top: 'blocks/gravel', side: 'blocks/stone_dark', prop: 'dungeon/crates_stacked', propH: 1 },
  barrel: { top: 'blocks/gravel', side: 'blocks/stone_dark', prop: 'dungeon/barrel_large', propH: 0.8 },
  chest: { top: 'blocks/stone_dark', side: 'blocks/stone_dark', prop: 'dungeon/chest_gold', propH: 0.6 },
  rubble: { top: 'blocks/gravel', side: 'blocks/stone_dark', prop: 'dungeon/rubble_half', propH: 0.4 },
  spikes: { top: 'blocks/gravel', side: 'blocks/stone_dark', prop: 'dungeon/floor_tile_big_spikes', propW: 0.95 },
  // fallen body: the ground is the terrain's and the body is a unit at the end of the death animation (buildCorpses)
  corpse: { top: 'blocks/dirt', side: 'blocks/dirt' },
};
// caravan body units (knight and rogue, the ones guarding the cargo)
const CORPSE_MODELS = ['knight', 'rogue'];
// dungeon stairs: 2 wide, 4 deep and 4 high, climbing toward -z (checked on the file's vertices)
const STAIRS = 'dungeon/stairs_modular_center';
const PLAIN_UNITS = param('units') === 'plain';
// walls without a piece that the smooth terrain draws as a stone hill (brick stays as blocks: it is construction)
const MOUND = new Set(['rock', 'snow_rock', 'summit', 'snow']);
const UNDER = 'blocks/stone_dark'; // column under the bridge water and the map skirt

// Map base as a block (Fernando's requests, Nov 12, looking at FFT's board): all columns end on the same
// ground (y = 0), and the edge sides, from each tile's floor down, are a flat color pulled from the floor above that
// darkens until it vanishes into the background ("the floors at the map edges have no texture and it looks better that way"). The tops keep their texture.
const BASE_DEPTH = 2; // in tiles, below the ground; with 1 the gradient ended before fully darkening
const BACKGROUND = '#1b1626'; // the scene background: the gradient ends in it
// side color by the floor above (Tile.look) or by the terrain on maps without a per-tile look
const WALL_COLOR: Record<string, string> = {
  grass: '#4f8f3a',
  tree: '#4f8f3a',
  floor: '#4f8f3a',
  forest: '#3f7a34',
  stone: '#7a7d86',
  box: '#7a7d86',
  wall: '#7a7d86',
  water: '#2f6fae',
  bridge: '#2f6fae',
  roof: '#8a4b32',
  chimney: '#4a4a52',
  wood: '#8a6238',
  rock: '#7a7d86',
  summit: '#4a4a52',
  sand: '#b8a06a',
  gold: '#7a7d86',
  brick: '#8a4b32',
  snow: '#c9d2dc',
  snow_rock: '#c9d2dc',
  tree2: '#4f8f3a',
  tree3: '#4f8f3a',
  tree4: '#4f8f3a',
  bare1: '#c9d2dc',
  bare2: '#c9d2dc',
  crypt: '#5a5d66',
  altar: '#4a4a52',
  pillar: '#5a5d66',
  crates: '#5a5d66',
  barrel: '#5a5d66',
  chest: '#4a4a52',
  rubble: '#5a5d66',
  spikes: '#5a5d66',
};
const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const EDGES = { depthEdgeStrength: 0.5, normalEdgeStrength: 0.35 }; // outline from the approved POC
const TINT_GLOW = 0.45; // strength of the own glow (UnitDef.tint): visible on the dark unit without erasing the texture
// Trees (Nov 13, Fernando's request: "bigger trees... some can even take up more than 1 tile"): maximum height and width,
// in tiles, of the 1-tile tree (the unit is 0.85: the crown goes past the tile) and of the one covering 2 or 4 tree tiles
// together at the same height. Each model fits the smaller of the two limits, so the round crown does not get too wide.
const TREE_SIZE: Record<number, { h: number; w: number }> = {
  1: { h: 2.4, w: 1.9 },
  2: { h: 2.8, w: 2.3 },
  4: { h: 3.4, w: 2.9 },
};
// Crown cutout (same request: the crown must not hide a unit, the cursor or a marked tile): each one opens a hole in the
// tree in front of it. Cap of points per frame (9 units, the cursor and the marked tiles)
const CUT_MAX = 64;
// Details that break the grid (Nov 13, "it's not Minecraft"): rocks at the foot of ravines, tufts and pebbles at the corners of
// tiles, away from the unit's ring (0.44 from the center). Pieces from KayKit's forest pack (same texture as the trees)
const DETAIL = {
  rock: 'forest/Rock_1_A_Color1',
  boulder: 'forest/Rock_3_A_Color1',
  pebble: 'forest/Rock_2_A_Color1',
  tuft: 'forest/Grass_1_A_Color1',
};
const GREEN = new Set(['grass', 'sand', 'tree', 'tree2', 'tree3', 'tree4']); // ground that gets a grass tuft
const ROCKY = new Set(['rock', 'summit', 'snow', 'snow_rock', 'bare1', 'bare2']); // ground that gets a pebble
// fixed draw by position (the same map always draws the same), from 0 to 1
const hash = (x: number, y: number, k = 0) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453;
  return s - Math.floor(s);
};
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

interface Anim {
  start: number;
  dur: number;
  step: (k: number) => void;
  done: () => void;
}

// KayKit textures are palettes: with mipmap the low-resolution render blends neighboring colors (learned in the POC)
function prepare(o: THREE.Object3D) {
  o.traverse((m) => {
    const mesh = m as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = mesh.receiveShadow = true;
    const mat = mesh.material as THREE.MeshStandardMaterial,
      map = mat.map;
    if (map?.generateMipmaps && !mat.userData.procedural)
      Object.assign(map, {
        generateMipmaps: false,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        needsUpdate: true,
      });
  });
  return o;
}

export class BattleScene {
  private readonly renderer = new THREE.WebGLRenderer({ antialias: false });
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  private readonly composer = new EffectComposer(this.renderer);
  private readonly renderPass: RenderPass; // no pixel art
  private readonly pixelPass: RenderPixelatedPass;
  private readonly palettePass = new ShaderPass(PALETTE_SHADER);
  private pixel: PixelSettings;
  private readonly focus = new THREE.Vector3();
  private focusGoal: THREE.Vector3 | null = null; // where the camera slides to (hero of the turn, recenter)
  private readonly tileTops: THREE.Object3D[] = [];
  private readonly marks = new Map<string, THREE.Mesh>();
  private readonly pathDots = new Map<string, THREE.Mesh>();
  private readonly danger = new Map<string, THREE.Mesh>(); // tiles where a charge will land (chargeDanger)
  // keyboard cursor: frame at the tile height and arrow floating above, to read the level even behind a unit
  private readonly cursor = new THREE.Group();
  private readonly units = new Map<string, UnitView>();
  private readonly anims: Anim[] = [];
  private readonly floats: HTMLElement;
  private readonly clock = new THREE.Clock();
  private t = 0; // battle clock in ms (speeds up with speed())
  private frozenUntil = 0; // hit-stop: units stay still until here
  private shakeUntil = 0; // strong strike: the camera shakes until here
  private readonly cursorGoal = new THREE.Vector3();
  private readonly onResize = () => this.resize();
  private viewH: number;
  private readonly fitView: number; // zoom at which the whole map fits the width
  private readonly space: TileSpace;
  private insets = { top: 0, bottom: 0 }; // px covered by the HUD at the top and bottom
  private yaw = Math.PI / 4;
  private pitch = PITCH; // only the action camera changes it (ACTION_CAMS)
  private pitchTarget = PITCH;
  private yawTarget = Math.PI / 4;
  private readonly sky = new THREE.HemisphereLight('#fff1d6', '#3a3050', 1.15);
  private readonly sun = new THREE.DirectionalLight('#ffffff', 1.6);
  private water: Water | null = null; // only on maps with water
  private stream: { meshes: THREE.Mesh[]; time: { value: number } } | null = null;
  private readonly fallen = new Map<string, THREE.Group>(); // bodies of those who died, on the ground until the end of the battle
  // tile drawn by the smooth terrain (terrain.ts) instead of blocks: paintable look, plus pieceless wall (stone, brick)
  // stone or snow wall (pieceless wall) also becomes terrain: a stone hill two levels above (rock(t))
  private ground = (t: Tile): boolean =>
    !!this.terrainTex &&
    !!t.look &&
    t.look in PAINT &&
    (t.terrain !== 'wall' || !!LOOK[t.look].prop || MOUND.has(t.look) || t.look === 'corpse');
  private rock = (t: Tile) => t.terrain === 'wall' && !LOOK[t.look ?? '']?.prop && MOUND.has(t.look ?? '');
  private ambience: Ambience | null = null; // surroundings, fog, light rays and particles (ambience.ts)

  private constructor(
    private readonly host: HTMLElement,
    private readonly grid: Grid,
    private readonly models: Map<string, GLTF>,
    pieces: Record<'top' | 'side' | 'stone' | 'tree', THREE.Object3D>,
    pixel: PixelSettings,
    private readonly lookPieces: Map<string, THREE.Object3D>,
    private readonly packClips: THREE.AnimationClip[],
    private readonly terrainTex: TerrainTextures | null = null,
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
    // fitView: the map diagonal (it shows as a diamond) plus half a tile on each side fits the portrait phone width.
    // Starts 1.5x closer: with the whole map the tile was ~45x24 px, small for a finger (mobile audit of Oct 25);
    // the camera goes to the hero of the turn, and the recenter button goes back to the whole map
    this.fitView = ((grid.width + grid.height) / Math.SQRT2 + 1) / 1.15;
    this.viewH =
      innerWidth < innerHeight ? Math.min(this.fitView / ZOOM_START, PORTRAIT_START) : Math.min(this.fitView, PC_START);
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
    this.buildBoard(pieces);
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
    const names = [
      ...new Set(
        grid.tiles.flatMap((t) =>
          t.look
            ? [
                LOOK[t.look].top,
                LOOK[t.look].side ?? LOOK.water.top,
                LOOK[t.look].prop ?? '',
                UNDER,
                t.ramp && LOOK[t.look].stairs ? STAIRS : '',
                ...Object.values(DETAIL),
              ]
            : [],
        ),
      ),
    ].filter(Boolean);
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

  private buildBoard(pieces: Record<'top' | 'side' | 'stone' | 'tree', THREE.Object3D>) {
    // normalizes the piece to 1 tile wide and STEP high, with the top at y = 0
    const norm = (src: THREE.Object3D) => {
      const o = src.clone();
      const box = new THREE.Box3().setFromObject(o);
      const size = box.getSize(new THREE.Vector3());
      o.scale.set(1 / size.x, this.space.step / size.y, 1 / size.z);
      o.position.y = -box.max.y * (this.space.step / size.y);
      return prepare(new THREE.Group().add(o));
    };
    const top = norm(pieces.top),
      side = norm(pieces.side),
      stone = norm(pieces.stone);
    const list = () => ({ at: [] as THREE.Vector3[], tiles: [] as Pos[] });
    const batch = { top: list(), stoneTop: list(), side: list(), stone: list() };
    const walls: { x: number; z: number; top: number; color: string }[] = []; // smooth side walls of the edge
    const edge = (p: Pos) => NEIGHBORS.some(([dx, dy]) => columnTop({ x: p.x + dx, y: p.y + dy }) < 0);
    // highest level occupied by the tile's column (-1 outside the map: the edge is left on display)
    const columnTop = (p: Pos) => {
      if (p.x < 0 || p.y < 0 || p.x >= this.grid.width || p.y >= this.grid.height) return -1;
      const t = tileAt(this.grid, p);
      return t.h + (t.terrain === 'wall' ? 2 : 0);
    };
    const markGeo = new THREE.PlaneGeometry(0.92, 0.92).rotateX(-Math.PI / 2);
    const dotGeo = new THREE.PlaneGeometry(0.3, 0.3).rotateX(-Math.PI / 2);
    const levels = this.space.levels;
    const smooth = !!this.terrainTex;
    const river = smooth ? riverOf(this.grid, levels) : null;
    const outside =
      smooth && EXTEND === 'texture'
        ? riverOutside(this.grid, this.space.step, levels, river)
        : new Map<string, WaterLevel>();
    const looks = this.lookBatches(edge, walls, levels);
    for (const [i, tile] of this.grid.tiles.entries()) {
      const p = { x: i % this.grid.width, y: Math.floor(i / this.grid.width) };
      const w = this.space.world(p);
      const wall = tile.terrain === 'wall';
      if (tile.look) looks.add(p);
      // wall: stone stacked two levels above the tile, to read that it blocks passage and sight
      for (let k = 0; !tile.look && k <= tile.h + (wall ? 2 : 0); k++) {
        const at = new THREE.Vector3(w.x, (k + 1) * this.space.step, w.z);
        if (k === tile.h) {
          const b = wall ? batch.stoneTop : batch.top;
          b.at.push(at);
          b.tiles.push(p);
        } else if (wall) batch.stone.at.push(at);
        // a dirt block surrounded on all four sides never shows: out of the scene (they were most of the triangles on the 20x20);
        // at the edge, the smooth side takes the dirt's place
        else if (!edge(p) && !NEIGHBORS.every(([dx, dy]) => columnTop({ x: p.x + dx, y: p.y + dy }) >= k))
          batch.side.at.push(at);
      }
      if (!tile.look && edge(p))
        walls.push({ x: w.x, z: w.z, top: tile.h * this.space.step, color: WALL_COLOR[tile.terrain] });
      const mark = new THREE.Mesh(
        markGeo,
        new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, map: markTexture('frame') }),
      );
      mark.position.set(w.x, w.y + 0.02, w.z);
      mark.visible = false;
      this.scene.add(mark);
      this.marks.set(posKey(p), mark);
      // charge danger: its own layer, under the turn's markers (the player's choice stays on top)
      const danger = new THREE.Mesh(
        markGeo,
        new THREE.MeshBasicMaterial({ color: DANGER[0], transparent: true, opacity: DANGER[1], depthWrite: false }),
      );
      danger.position.set(w.x, w.y + 0.015, w.z);
      danger.visible = false;
      this.scene.add(danger);
      this.danger.set(posKey(p), danger);
      const dot = new THREE.Mesh(
        dotGeo,
        new THREE.MeshBasicMaterial({
          color: MARK.path[0],
          transparent: true,
          opacity: MARK.path[1],
          depthWrite: false,
        }),
      );
      dot.position.set(w.x, w.y + 0.03, w.z);
      dot.visible = false;
      this.scene.add(dot);
      this.pathDots.set(posKey(p), dot);
    }
    this.instanced(top, batch.top.at, batch.top.tiles);
    this.instanced(stone, batch.stoneTop.at, batch.stoneTop.tiles);
    this.instanced(side, batch.side.at);
    this.instanced(stone, batch.stone.at);
    looks.build();
    if (smooth) {
      const inner = (p: Pos, x: number, z: number) => {
        const lv = levels.get(posKey(p)),
          t = tileAt(this.grid, p);
        return lv
          ? lv.bed
          : this.rock(t)
            ? (t.h + 3) * this.space.step
            : this.ground(t)
              ? this.space.surfaceY(p, x, z)
              : (t.h + 1) * this.space.step;
      };
      this.scene.add(
        buildTerrain(this.grid, {
          step: this.space.step,
          inner,
          outside,
          levels,
          river,
          extend: EXTEND === 'texture',
          tex: this.terrainTex!,
        }),
      );
      const picks = this.grid.tiles.flatMap((t, i) => {
        const p = { x: i % this.grid.width, y: Math.floor(i / this.grid.width) };
        if (t.look === 'bridge') return [{ p, at: this.space.world(p) }];
        return this.ground(t) && !levels.has(posKey(p))
          ? [{ p, at: this.rock(t) ? this.space.world(p).setY((t.h + 3) * this.space.step) : this.space.world(p) }]
          : [];
      });
      this.scene.add(buildBridges(this.grid, this.space.step, this.terrainTex!.wood, this.terrainTex!.bark));
      this.buildBorder(levels);
      const pick = pickTiles(picks);
      this.scene.add(pick);
      this.tileTops.push(pick);
    }
    if (levels.size) {
      this.water = new Water(this.scene, this.grid, levels, this.space.step, river);
      // the outside river is a continuous strip with current (terrain.ts buildStream), not stepped water tiles
      if (outside.size) {
        this.stream = buildStream(this.grid, this.space.step, levels, river);
        this.scene.add(...this.stream.meshes);
      }
      this.tileTops.push(this.water.surface); // touching the water picks its tile, not the bed way down below
    }
    this.buildCorpses();
    this.buildTrees(pieces.tree);
    this.buildStairs();
    this.buildDetails();
    // tile markers lying on the ramp: flat, the top half was buried on the climb
    for (const [i, tile] of this.grid.tiles.entries()) {
      if (!tile.ramp) continue;
      const p = { x: i % this.grid.width, y: Math.floor(i / this.grid.width) };
      for (const layer of [this.marks, this.danger, this.pathDots]) this.space.lay(layer.get(posKey(p))!, p);
    }
    this.buildWalls(walls);
    this.focus.set(0, STEP, 0);
    // transparent only to enter the transparent queue, after the water (renderOrder -1): without it the water tinted the frame
    const frame = new THREE.Mesh(
      new THREE.RingGeometry(0.44, 0.64, 4, 1, Math.PI / 4).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: '#ffffff',
        depthTest: MARKER.frameDepthTest,
        depthWrite: false,
        transparent: true,
      }),
    );
    frame.position.y = MARKER.frameY;
    frame.name = 'frame';
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.3, 4).rotateX(Math.PI),
      new THREE.MeshBasicMaterial({ color: '#ffcf4a', depthTest: false }),
    );
    arrow.name = 'arrow';
    arrow.renderOrder = 11; // the arrow stays above everything (even behind a wall it shows where the cursor is); the frame does not
    this.cursor.add(frame, arrow);
    this.cursor.visible = false;
    this.scene.add(this.cursor);
  }

  // Tiles with a look (Tile.look): column of whole 1-tile cubes, from the tile top down, with the top piece
  // and the column piece of each look. Whole cube because the cube flattened to the height of one level (0.25 in Gariland) squeezed the
  // texture into stripes. The ramp tilts the top cube (shear) and stretches it downward, so no gap opens.
  // Smooth edge sides in a single drawing (one draw call): floor color at the top, already darkened, down to the bottom
  private buildWalls(walls: { x: number; z: number; top: number; color: string }[]) {
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
    this.scene.add(mesh);
  }

  private lookBatches(
    edge: (p: Pos) => boolean,
    walls: { x: number; z: number; top: number; color: string }[],
    water: Map<string, WaterLevel>,
  ) {
    const norm = (name: string, height: number) => {
      const o = this.lookPieces.get(name)!.clone();
      const size = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
      const box = new THREE.Box3().setFromObject(o);
      o.scale.set(1 / size.x, height / size.y, 1 / size.z);
      o.position.set(
        -(box.min.x + box.max.x) / 2 / size.x,
        -box.max.y * (height / size.y),
        -(box.min.z + box.max.z) / 2 / size.z,
      );
      return prepare(new THREE.Group().add(o));
    };
    const batches = new Map<string, { piece: THREE.Object3D; at: THREE.Matrix4[]; tiles?: Pos[] }>();
    const put = (name: string, height: number, m: THREE.Matrix4, tile?: Pos) => {
      const key = `${name}@${height}${tile ? '#' : ''}`;
      let b = batches.get(key);
      // height 0: piece as it came (the scale is already in the matrix)
      if (!b)
        batches.set(
          key,
          (b = {
            piece: height ? norm(name, height) : prepare(this.lookPieces.get(name)!.clone()),
            at: [],
            tiles: tile && [],
          }),
        );
      b.at.push(m);
      if (tile) b.tiles!.push(tile);
    };
    const add = (p: Pos) => {
      const tile = tileAt(this.grid, p);
      const look = LOOK[tile.look!];
      const w = this.space.world(p);
      // Gariland tree (non-walkable tile, the file height is the crown's): the ground is the lowest neighbor's. On our
      // maps the height is already the ground's. Pieceless wall on top: two levels above the tile, as without a look; with a piece
      // (column, crate, barrel), the piece is what blocks and the tile stays at ground level.
      const wall = tile.terrain === 'wall';
      const h =
        look.canopy && wall
          ? Math.min(...neighbors(this.grid, p).map((n) => tileAt(this.grid, n).h))
          : tile.h + (wall && !look.prop ? 2 : 0);
      // water: the top block is the bed (waterLevels: on shallow where the feet step, on deep way below); the surface, lower
      // on deep than on shallow (the step at the bank says "it is deep here"), is drawn in water.ts
      const top = tile.look === 'water' ? water.get(posKey(p))!.bed : (h + 1) * this.space.step;
      // the bridge is a one-level plank over the water; a low tile (top below 1) has the cube flattened to the base; at the edge
      // the top is a one-level slice and the smooth side starts right below it
      const onEdge = edge(p);
      const slab = look.side && !onEdge ? Math.min(1, top) : this.space.step;
      const m = new THREE.Matrix4().makeTranslation(w.x, top, w.z);
      if (tile.ramp && !look.stairs) {
        // stairs: flat top, the piece goes in buildStairs
        const rise = tile.ramp[1] * this.space.step,
          f = FACING[tile.ramp[0]];
        // y' = y * (height + rise) / height + rise * (half step toward the ramp + 1/2)
        m.set(1, 0, 0, w.x, f.x * rise, (slab + rise) / slab, f.y * rise, top + rise / 2, 0, 0, 1, w.z, 0, 0, 0, 1);
      }
      const painted = this.ground(tile);
      // the bridge on open maps is bridge.ts's (planks, ropes and little stairs); the wooden block stays only in the crypts
      if (!painted && !(this.terrainTex && tile.look === 'bridge')) put(look.top, slab, m, p);
      // column down to the flat base (y = 0): whole cubes and the last one flattened to what is missing, so the bottom does not have steps
      const column = look.side ?? UNDER;
      let y = top - slab;
      if (!look.side) {
        // bridge: the bed below, if water passes under the plank (the surface comes from water.ts)
        const under = water.get(posKey(p));
        if (under && !this.terrainTex)
          put(
            LOOK.water.top,
            1,
            new THREE.Matrix4().makeTranslation(w.x, under.bed, w.z).scale(new THREE.Vector3(1, under.bed, 1)),
          );
        y = 0;
      }
      if (painted) {
        /* smooth terrain ground */
      } else if (onEdge) walls.push({ x: w.x, z: w.z, top: y, color: WALL_COLOR[tile.look!] });
      else
        for (; y > 0; y -= 1)
          if (!this.buried(p, y))
            put(
              column,
              1,
              new THREE.Matrix4().makeTranslation(w.x, y, w.z).scale(new THREE.Vector3(1, Math.min(1, y), 1)),
            );
      if (look.prop && tile.terrain !== 'forest') {
        // forest tile tree: buildTrees
        // painted object (props.ts): the variation comes from the position, as with the trees
        const prop = variant(this.lookPieces, look.prop, hash(p.x, p.y, 6)),
          box = pieceBox(this.lookPieces.get(prop)!);
        // propW: ground piece (spikes) measured by width, to fit the tile; the others by height (1.1 = the tree)
        const k = look.propW
          ? look.propW / Math.max(box.max.x - box.min.x, box.max.z - box.min.z)
          : (look.propH ?? 1.1) / (box.max.y - box.min.y);
        put(
          prop,
          0,
          new THREE.Matrix4().makeTranslation(w.x, top - box.min.y * k, w.z).scale(new THREE.Vector3(k, k, k)),
        );
      }
      // debris on top of the bridge (walkable cover): the caravan remains over the planks (props.ts), only on open maps
      if (tile.terrain === 'rubble' && tile.look === 'bridge' && this.lookPieces.has(DEBRIS))
        put(variant(this.lookPieces, DEBRIS, hash(p.x, p.y, 6)), 0, new THREE.Matrix4().makeTranslation(w.x, top, w.z));
    };
    const build = () => {
      for (const b of batches.values()) this.instanced(b.piece, b.at, b.tiles);
    };
    return { add, build };
  }

  // One InstancedMesh per piece mesh instead of one object per block: the 20x20 made 2,321 draw calls per frame and fell
  // to 9 fps on the emulated phone (measurement of Nov 11). `tiles` marks the pieces that count as a tile for touch.
  // open-map pieces (crates, barrels, bridge, walls, Gariland trees) with detail.ts's texture and shading;
  // one material per source material, so shader programs do not multiply
  private readonly texturedMats = new Map<THREE.Material, THREE.Material>();
  // unit and body: only detail.ts's shading, without the grain (Nov 13, Fernando found the texture on them "ugly")
  private shaded<M extends THREE.Material>(m: M): M {
    const tex = this.terrainTex;
    if (tex && !PLAIN_UNITS) m.onBeforeCompile = (sh) => addDetail(sh, tex, 2.5, 0);
    return m;
  }

  private textured(m: THREE.Material): THREE.Material {
    const tex = this.terrainTex;
    if (!tex || !(m as THREE.MeshStandardMaterial).isMeshStandardMaterial || m.userData.procedural) return m; // painted piece (painted.ts): no grain
    let out = this.texturedMats.get(m);
    if (!out) {
      out = m.clone();
      out.onBeforeCompile = (sh) => addDetail(sh, tex, 1.5);
      this.texturedMats.set(m, out);
    }
    return out;
  }

  // Caravan bodies: knight and rogue alternating, still on the last frame of the death animation, darkened, with a
  // dark stain on the ground; draw by tile for the rotation
  private buildCorpses() {
    const stain = new THREE.MeshBasicMaterial({
      color: '#2a0f0a',
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    this.grid.tiles.forEach((t, i) => {
      if (t.look !== 'corpse') return;
      const p = { x: i % this.grid.width, y: Math.floor(i / this.grid.width) };
      const gltf = this.models.get(CORPSE_MODELS[(p.x + p.y) % CORPSE_MODELS.length]);
      if (!gltf) return;
      const body = prepare(cloneSkinned(gltf.scene));
      body.traverse((m) => {
        const mesh = m as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
        mat.color.multiplyScalar(0.55); // lifeless: darker and duller than the battle units
        mesh.material = this.shaded(mat);
      });
      const b = new THREE.Box3().setFromObject(body);
      body.scale.setScalar(unitHeight('soldier') / (b.max.y - b.min.y));
      const clip = [...gltf.animations, ...this.packClips].find((c) => c.name === 'Death_A');
      if (clip) {
        const mixer = new THREE.AnimationMixer(body);
        const act = mixer.clipAction(clip);
        act.setLoop(THREE.LoopOnce, 1);
        act.clampWhenFinished = true;
        act.play();
        mixer.update(clip.duration);
      }
      const w = this.space.world(p);
      body.position.copy(w);
      body.rotation.y = hash(p.x, p.y, 3) * Math.PI * 2;
      this.scene.add(body);
      // stain with an irregular edge (brushstroke), not a disc
      const blot = new THREE.CircleGeometry(0.42, 14).rotateX(-Math.PI / 2),
        bp = blot.getAttribute('position');
      for (let k = 1; k < bp.count; k++) {
        const r = 0.7 + 0.5 * hash(p.x + (k % 14) * 0.37, p.y, 9);
        bp.setXYZ(k, bp.getX(k) * r, 0, bp.getZ(k) * r);
      }
      const spot = new THREE.Mesh(blot, stain);
      spot.position.set(w.x + 0.08, w.y + 0.012, w.z - 0.05);
      spot.scale.set(1, 1, 0.7);
      // caravan remains beside the body: bottles, sack, plank (props.ts), only on open maps
      const litter = this.lookPieces.get(variant(this.lookPieces, LITTER, hash(p.x, p.y, 8)))?.clone();
      if (litter) {
        const a = hash(p.x, p.y, 10) * Math.PI * 2;
        litter.position.set(w.x + Math.cos(a) * 0.3, w.y, w.z + Math.sin(a) * 0.3);
        litter.rotation.y = a * 3;
        this.scene.add(litter);
      }
      spot.renderOrder = -2;
      this.scene.add(spot);
    });
  }

  // Discreet dotted line on the edge of the battlefield (Nov 13, Fernando's request): follows the ground height of each
  // edge tile (on water, the surface), with a step where the height changes
  private buildBorder(levels: Map<string, WaterLevel>) {
    const { width: W, height: H } = this.grid,
      pts: THREE.Vector3[] = [];
    const yAt = (p: Pos, x: number, z: number) =>
      (levels.get(posKey(p))?.surface ?? this.space.surfaceY(p, x, z)) + 0.04;
    const side = (cells: Pos[], edge: (p: Pos, k: number) => [number, number]) => {
      const line: THREE.Vector3[] = [];
      for (const p of cells)
        for (let k = 0; k <= 4; k++) {
          const [x, z] = edge(p, k / 4);
          line.push(new THREE.Vector3(x, yAt(p, x, z), z));
        }
      for (let i = 1; i < line.length; i++) pts.push(line[i - 1], line[i]);
    };
    const X = (x: number) => x - W / 2,
      Z = (z: number) => z - H / 2;
    const row = (y: number) => Array.from({ length: W }, (_, x) => ({ x, y }));
    const col = (x: number) => Array.from({ length: H }, (_, y) => ({ x, y }));
    side(row(0), (p, k) => [X(p.x + k), Z(0) + 0.01]);
    side(row(H - 1), (p, k) => [X(p.x + k), Z(H) - 0.01]);
    side(col(0), (p, k) => [X(0) + 0.01, Z(p.y + k)]);
    side(col(W - 1), (p, k) => [X(W) - 0.01, Z(p.y + k)]);
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
    line.renderOrder = 2;
    this.scene.add(line);
  }

  private instanced(
    piece: THREE.Object3D,
    at: (THREE.Vector3 | THREE.Matrix4)[],
    tiles?: Pos[],
  ): THREE.InstancedMesh[] {
    const out: THREE.InstancedMesh[] = [];
    if (!at.length) return out;
    piece.updateMatrixWorld(true);
    const m = new THREE.Matrix4();
    piece.traverse((o) => {
      const src = o as THREE.Mesh;
      if (!src.isMesh) return;
      const inst = new THREE.InstancedMesh(src.geometry, this.textured(src.material as THREE.Material), at.length);
      at.forEach((p, i) =>
        inst.setMatrixAt(
          i,
          (p instanceof THREE.Matrix4 ? m.copy(p) : m.makeTranslation(p.x, p.y, p.z)).multiply(src.matrixWorld),
        ),
      );
      inst.castShadow = inst.receiveShadow = true;
      if (tiles) {
        inst.userData.tiles = tiles;
        this.tileTops.push(inst);
      }
      this.scene.add(inst);
      out.push(inst);
    });
    return out;
  }

  // Forest-tile trees, bigger than the tile (TREE_SIZE). Neighboring tree tiles at the same height become a single
  // tree (2x2 first, then 2x1): drawing only, each tile is still a tree in the rules. The group uses the widest model
  // among its tiles'; rotation and size vary by position. The crown gets the cutout (cutMaterial).
  private buildTrees(legacy: THREE.Object3D) {
    const g = this.grid,
      taken = new Set<string>();
    const free = (x: number, y: number, h: number) =>
      inBounds(g, { x, y }) &&
      !taken.has(posKey({ x, y })) &&
      tileAt(g, { x, y }).terrain === 'forest' &&
      tileAt(g, { x, y }).h === h;
    // map without a per-tile look (Skirmish) uses the POC tree; the rest, the look's piece
    const modelOf = (p: Pos) => {
      const look = tileAt(g, p).look;
      return look ? (LOOK[look].prop ?? null) : '';
    };
    const pieceOf = (name: string) => (name ? this.lookPieces.get(name)! : legacy);
    const boxOf = (name: string) => pieceBox(pieceOf(name));
    const width = (b: THREE.Box3) => Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
    const batches = new Map<string, THREE.Matrix4[]>();
    for (let y = 0; y < g.height; y++) {
      for (let x = 0; x < g.width; x++) {
        const t = tileAt(g, { x, y });
        // big half-tile tree (half.ts): a single tree, the size of its square
        if (t.tree && !taken.has(posKey({ x, y })) && modelOf({ x, y })) {
          const n = t.tree,
            name = modelOf({ x, y })!;
          for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) taken.add(posKey({ x: x + dx, y: y + dy }));
          const box = boxOf(name);
          const k = Math.min((n * (1 + 0.5 * hash(x, y, 4))) / (box.max.y - box.min.y), (n * 0.95) / width(box));
          const c = this.space.world({ x, y }).add(new THREE.Vector3((n - 1) / 2, 0, (n - 1) / 2));
          const m = new THREE.Matrix4()
            .makeRotationY(hash(x, y, 2) * Math.PI * 2)
            .scale(new THREE.Vector3(k, k, k))
            .setPosition(c.x, c.y - box.min.y * k, c.z);
          if (!batches.has(name)) batches.set(name, []);
          batches.get(name)!.push(m);
          continue;
        }
        if (!free(x, y, t.h)) continue;
        const group =
          free(x + 1, y, t.h) && free(x, y + 1, t.h) && free(x + 1, y + 1, t.h)
            ? [
                [0, 0],
                [1, 0],
                [0, 1],
                [1, 1],
              ]
            : free(x + 1, y, t.h)
              ? [
                  [0, 0],
                  [1, 0],
                ]
              : free(x, y + 1, t.h)
                ? [
                    [0, 0],
                    [0, 1],
                  ]
                : [[0, 0]];
        const tiles = group.map(([dx, dy]) => ({ x: x + dx, y: y + dy }));
        for (const p of tiles) taken.add(posKey(p));
        const names = tiles.map(modelOf).filter((n): n is string => n !== null);
        if (!names.length) continue;
        // the tree variation comes from the position (painted.ts variant): different species and sizes side by side. The draw 16
        // was chosen looking at Ash Wood: 2 tall pines, 4 skirted ones and 2 old trees among the 14 (with 5 it came out 1 pine)
        const name = variant(
          this.lookPieces,
          names.reduce((a, b) => (width(boxOf(b)) > width(boxOf(a)) ? b : a)),
          hash(x, y, 16),
        );
        const box = boxOf(name),
          size = TREE_SIZE[tiles.length],
          tall = (pieceOf(name).userData.tall as number | undefined) ?? 1; // pine: taller than the tile's ceiling
        // more varied size (Nov 13, "trees of different sizes"): from 75% to 135% of the tile size
        // the painted tree's foot (flare and roots, userData.foot) stays on the flat core of its tile: on the edge slope
        // (terrain.ts, 1/6 of the tile) the root hung in the air
        const foot = (0.4 * Math.sqrt(tiles.length)) / ((pieceOf(name).userData.foot as number | undefined) ?? 0.01);
        const k = Math.min(
          Math.min((size.h * tall) / (box.max.y - box.min.y), size.w / width(box)) * (0.75 + 0.6 * hash(x, y, 1)),
          foot,
        );
        const c = tiles
          .reduce((s: THREE.Vector3, p) => s.add(this.space.world(p)), new THREE.Vector3())
          .divideScalar(tiles.length);
        const m = new THREE.Matrix4()
          .makeRotationY(hash(x, y, 2) * Math.PI * 2)
          .scale(new THREE.Vector3(k, k, k))
          .setPosition(c.x, c.y - box.min.y * k, c.z);
        if (!batches.has(name)) batches.set(name, []);
        batches.get(name)!.push(m);
      }
    }
    for (const [name, at] of batches) {
      for (const inst of this.instanced(prepare(pieceOf(name).clone()), at)) {
        inst.material = this.cutMaterial(inst.material as THREE.MeshStandardMaterial);
        // the pixel art normal pass swaps everyone's material; the tree uses its own, with the same cutout, and only
        // returns the normal (without this the outline of the cut crown showed up over the unit)
        inst.onBeforeRender = (_r, scene) =>
          void (this.cuts.normals.value = (scene as THREE.Scene).overrideMaterial ? 1 : 0);
        this.hasTrees = true;
      }
    }
  }

  // Crown cutout: discards the piece of the tree that is in front (closer to the camera) of a protected point and
  // within `w` of it on screen; the hole's edge comes out checkered, in the 16-bit way. Points in camera coordinates,
  // updated every frame (updateCuts). With `cutNormals`, it returns the normal like pixel art's MeshNormalMaterial.
  private readonly cuts = {
    points: { value: Array.from({ length: CUT_MAX }, () => new THREE.Vector4()) },
    count: { value: 0 },
    normals: { value: 0 },
  };
  private hasTrees = false;
  private cutMaterial(src: THREE.MeshStandardMaterial) {
    const m = src.clone();
    m.allowOverride = false;
    m.customProgramCacheKey = () => `copa${CUT_MAX}`;
    m.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, {
        cutPoints: this.cuts.points,
        cutCount: this.cuts.count,
        cutNormals: this.cuts.normals,
      });
      s.fragmentShader = s.fragmentShader
        .replace(
          'void main() {',
          `uniform vec4 cutPoints[${CUT_MAX}];\nuniform int cutCount;\nuniform float cutNormals;\nvoid main() {`,
        )
        .replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
          vec3 viewPos = -vViewPosition;
          for (int i = 0; i < ${CUT_MAX}; i++) {
            if (i >= cutCount) break;
            vec4 c = cutPoints[i];
            float d = distance(viewPos.xy, c.xy);
            if (viewPos.z > c.z + 0.3 && d < c.w && (d < c.w * 0.7 || mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0) < 1.0)) discard;
          }`,
        )
        .replace(
          '#include <dithering_fragment>',
          '#include <dithering_fragment>\n  if (cutNormals > 0.5) gl_FragColor = vec4(normalize(normal) * 0.5 + 0.5, 1.0);',
        );
    };
    return m;
  }

  // protected cutout points: each unit's body, the cursor and the marked tiles (Move's and Act's)
  private marked: THREE.Vector3[] = [];
  private updateCuts() {
    const pts = this.cuts.points.value,
      view = this.camera.matrixWorldInverse;
    let n = 0;
    const add = (x: number, y: number, z: number, r: number) => {
      if (n >= CUT_MAX) return;
      TMP.set(x, y, z).applyMatrix4(view);
      pts[n++].set(TMP.x, TMP.y, TMP.z, r);
    };
    for (const v of this.units.values()) {
      const h = unitHeight(v.def),
        p = v.holder.position;
      if (v.holder.visible) add(p.x, p.y + h * 0.6, p.z, Math.max(0.75, h * 0.75));
    }
    if (this.cursor.visible) add(this.cursor.position.x, this.cursor.position.y + 0.3, this.cursor.position.z, 0.8);
    for (const w of this.marked) add(w.x, w.y + 0.05, w.z, 0.55);
    this.cuts.count.value = n;
  }

  // Column cube that never shows: the 4 neighbors are solid ground (no water, bridge or Gariland crown) reaching up to
  // its top, and so is the tile. They were most of the triangles on maps with a per-tile look (1.2 million on Beacon Hill);
  // cutting them pays for the bigger trees and the details (Nov 13). Water is left out: the other front may make it transparent
  private buried(p: Pos, y: number) {
    const solid = (t: Tile) =>
      !t.depth && !!t.look && t.look !== 'water' && t.look !== 'bridge' && !LOOK[t.look].canopy;
    if (!solid(tileAt(this.grid, p))) return false;
    return NEIGHBORS.every(([dx, dy]) => {
      const q = { x: p.x + dx, y: p.y + dy };
      if (!inBounds(this.grid, q)) return false;
      const t = tileAt(this.grid, q);
      return (
        solid(t) && (t.h + 1 + (t.terrain === 'wall' && !LOOK[t.look!].prop ? 2 : 0)) * this.space.step >= y - 1e-6
      );
    });
  }

  // Crypt stairs: on a ramp tile with a dungeon floor (LOOK.stairs) the stairs leave the flat top and climb the whole
  // ramp in its direction, taking up the tile (1 wide and deep); the unit stands in the middle, as on the ramp (world)
  private buildStairs() {
    const at: THREE.Matrix4[] = [];
    for (const [i, t] of this.grid.tiles.entries()) {
      if (!t.ramp || !t.look || !LOOK[t.look].stairs) continue;
      const p = { x: i % this.grid.width, y: Math.floor(i / this.grid.width) },
        w = this.space.world(p),
        f = FACING[t.ramp[0]];
      const rise = t.ramp[1] * this.space.step;
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
    if (at.length) this.instanced(prepare(this.lookPieces.get(STAIRS)!.clone()), at);
  }

  // Rocks at the foot of ravines (the side stops being a smooth wall of cubes), grass tufts and pebbles at the corner of
  // some tiles. Outside the unit's ring and the water; none of this goes into touch (pick) or the rules.
  private buildDetails() {
    if (!this.lookPieces.has(DETAIL.rock)) return; // map without a per-tile look: no detail pieces
    const g = this.grid;
    const at: Record<keyof typeof DETAIL, THREE.Matrix4[]> = { rock: [], boulder: [], pebble: [], tuft: [] };
    const put = (kind: keyof typeof DETAIL, x: number, y: number, z: number, size: number, turn: number) => {
      const box = pieceBox(this.lookPieces.get(DETAIL[kind])!);
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
        w = this.space.world(p);
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
        const low = this.space.surfaceY(p, ex, ez),
          high = u.terrain === 'wall' ? (u.h + 3) * this.space.step : this.space.surfaceY(q, ex, ez);
        if (high - low < this.space.step * 0.9) continue;
        const side = (hash(p.x, p.y, 7 + d) < 0.5 ? -1 : 1) * (0.26 + 0.14 * hash(p.x, p.y, 11 + d));
        const x = ex + f.y * side,
          z = ez + f.x * side;
        put('rock', x, this.space.surfaceY(p, x, z), z, 0.2 + 0.08 * hash(p.x, p.y, 13 + d), hash(p.x, p.y, 17 + d));
        if (high - low >= this.space.step * 1.9)
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
      if (!(green && this.terrainTex))
        put(green ? 'tuft' : 'pebble', cx, this.space.surfaceY(p, cx, cz), cz, green ? 0.2 : 0.13, hash(p.x, p.y, 41));
    }
    for (const kind of Object.keys(at) as (keyof typeof DETAIL)[])
      this.instanced(prepare(this.lookPieces.get(DETAIL[kind])!.clone()), at[kind]);
  }

  // Dotted line of the longest range (Nov 13, Fernando's request: "around the character the range of
  // their longest-hitting skill should show as dotted, and while they see the movement preview too"): outline of the tiles within `range`
  // steps of `center` (the same distance as the rule), at each tile's ground height. Only rebuilds when it changes
  private ring: { key: string; mesh: THREE.Mesh } | null = null;
  setRangeRing(r: { center: Pos; range: number } | null) {
    const key = r ? `${posKey(r.center)}:${r.range}` : '';
    if (this.ring?.key === key) return;
    if (this.ring) {
      this.scene.remove(this.ring.mesh);
      this.ring.mesh.geometry.dispose();
      (this.ring.mesh.material as THREE.Material).dispose();
      this.ring = null;
    }
    if (!r || r.range < 1) return;
    const { width: W, height: H } = this.grid,
      pos: number[] = [];
    const inside = (p: Pos) => inBounds(this.grid, p) && dist(p, r.center) <= r.range;
    const yAt = (p: Pos, x: number, z: number) =>
      (this.space.levels.get(posKey(p))?.surface ?? this.space.surfaceY(p, x, z)) + 0.05;
    // flat little dash lying on the ground (WebGL's 1 px line barely showed): 2 triangles from `a` to `b`, 0.07 wide
    const dash = (p: Pos, ax: number, az: number, bx: number, bz: number) => {
      const nx = -(bz - az),
        nz = bx - ax,
        k = 0.035 / Math.hypot(nx, nz);
      const v = (x: number, z: number, side: number) => [x + nx * k * side, yAt(p, x, z), z + nz * k * side];
      const a1 = v(ax, az, 1),
        a2 = v(ax, az, -1),
        b1 = v(bx, bz, 1),
        b2 = v(bx, bz, -1);
      pos.push(...a1, ...a2, ...b1, ...b1, ...a2, ...b2);
    };
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const p = { x, y };
        if (!inside(p)) continue;
        // each side of the tile that touches an outside tile becomes 3 little dashes (they follow ramp and step)
        for (const [dx, dy, ax, az, bx, bz] of [
          [0, -1, 0, 0, 1, 0],
          [0, 1, 0, 1, 1, 1],
          [-1, 0, 0, 0, 0, 1],
          [1, 0, 1, 0, 1, 1],
        ] as const) {
          if (inside({ x: x + dx, y: y + dy })) continue;
          for (let k = 0; k < 3; k++) {
            const t0 = (k + 0.2) / 3,
              t1 = (k + 0.8) / 3;
            const at = (t: number) => [x + ax + (bx - ax) * t - W / 2, y + az + (bz - az) * t - H / 2];
            const [x0, z0] = at(t0),
              [x1, z1] = at(t1);
            dash(p, x0, z0, x1, z1);
          }
        }
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const mesh = new THREE.Mesh(
      g,
      new THREE.MeshBasicMaterial({
        color: '#ffd27a',
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    mesh.renderOrder = 11;
    this.scene.add(mesh);
    this.ring = { key, mesh };
  }

  // Trajectory preview: thin strip from the shooter's eye to the target's aim, blue where it passes and red after the point
  // where it hits (the blocking tile, sightBlock). Rebuilt on every cursor change; few vertices
  private trajectory: THREE.Group | null = null;
  setTrajectory(t: { from: Pos; to: Pos; block: Pos | null } | null) {
    if (this.trajectory) {
      this.scene.remove(this.trajectory);
      this.trajectory.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      this.trajectory = null;
    }
    if (!t) return;
    const eye = (p: Pos) => this.space.stand(p).add(new THREE.Vector3(0, unitHeight('soldier') * 0.7, 0));
    const a = eye(t.from),
      b = eye(t.to);
    const cut = t.block
      ? (() => {
          const w = this.space.world(t.block);
          const k = Math.hypot(w.x - a.x, w.z - a.z) / Math.max(1e-3, Math.hypot(b.x - a.x, b.z - a.z));
          return a.clone().lerp(b, k);
        })()
      : b;
    const seg = (p: THREE.Vector3, q: THREE.Vector3, color: string) => {
      const len = p.distanceTo(q);
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, len, 6).rotateX(Math.PI / 2),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthTest: false }),
      );
      m.position.copy(p).lerp(q, 0.5);
      m.lookAt(q);
      m.renderOrder = 12;
      return m;
    };
    this.trajectory = new THREE.Group();
    this.trajectory.add(seg(a, cut, '#5fd6ff'));
    if (t.block) {
      this.trajectory.add(seg(cut, b, '#ff4d4d'));
      // red X where the shot hits (Nov 13, Fernando's request: "there should be an X where it will hit")
      const mat = new THREE.MeshBasicMaterial({ color: '#ff3b3b', depthTest: false });
      for (const turn of [Math.PI / 4, -Math.PI / 4]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.07, 0.07), mat);
        bar.position.copy(cut);
        bar.quaternion.copy(this.camera.quaternion);
        bar.rotateZ(turn);
        bar.renderOrder = 13;
        this.trajectory.add(bar);
      }
    }
    this.scene.add(this.trajectory);
  }

  setCursor(p: Pos | null) {
    // appears in place right away; then slides from tile to tile (frame), instead of jumping
    if (p && !this.cursor.visible) this.cursor.position.copy(this.space.world(p));
    this.cursor.visible = !!p;
    if (p) {
      this.cursorGoal.copy(this.space.world(p));
      this.space.lay(this.cursor.getObjectByName('frame')!, p);
    }
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
    return this.yawTarget;
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
        mesh.material = this.shaded(mat); // ?units=plain compares without the shading
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
    for (const [k, m] of this.danger) m.visible = hot.has(k);
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
    for (const m of this.marks.values()) m.visible = false;
    for (const d of this.pathDots.values()) d.visible = false;
    this.marked = h && this.hasTrees ? h.tiles.map(({ pos }) => this.space.world(pos)) : [];
    if (!h) return;
    for (const { pos, kind } of h.tiles) {
      const m = this.marks.get(posKey(pos))!;
      const mat = m.material as THREE.MeshBasicMaterial;
      m.userData.base = MARK[kind][1]; // starting opacity of the pulse (frame)
      mat.color.set(MARK[kind][0]);
      mat.opacity = MARK[kind][1];
      mat.map = markTexture(MARK[kind][2] ?? 'frame');
      m.visible = true;
    }
    for (const p of h.path ?? []) this.pathDots.get(posKey(p))!.visible = true;
  }

  // Everything in the battle runs on the battle clock (`t`), which goes 3 times faster while the speed-up button is held
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
    return new Promise((done) => this.anims.push({ start: this.t, dur, step, done }));
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
    return this.animate(ms, () => {});
  }

  // Impact: everything stops for an instant (hit-stop), the target flashes white and then shakes, with the shake fading
  private async impact(v: UnitView) {
    this.frozenUntil = this.t + TIMING.hitStop;
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
          await this.actionCam(this.posOf(v), e.target, state.units.find((u) => u.id === e.unit)?.team === 'enemy');
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
        if (big) this.shakeUntil = this.t + TIMING.hitStop + TIMING.shake;
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
    await this.endActionCam();
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
    const hit = ray.intersectObjects(this.tileTops, false)[0];
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
    // with `also`, centers between the two (attacker and target): the strike never happens off-screen or behind the HUD
    const w = also ? this.space.world(p).lerp(this.space.world(also), 0.5) : this.space.world(p);
    this.focusGoal = new THREE.Vector3(w.x, STEP, w.z);
  }

  // Action camera (Nov 13, Fernando's request: "when a character is going to attack, an action cam like XCOM"): turns to
  // get behind the attacker, comes close and frames the attacker and the target; goes back to what it was after the sequence
  private camSaved: { viewH: number; yaw: number; pair: string } | null = null;
  async actionCam(from: Pos, to: Pos, enemy = false) {
    // counterattack (the target returns the strike in the same sequence): the camera stays where it is, without turning around mid-strike
    if (this.camSaved?.pair === `${posKey(to)}>${posKey(from)}`) return;
    // `heroi`: the camera always stays on the heroes' side (over the attacker's shoulder; when the enemy attacks, behind the hero)
    const cam = ACTION_CAMS[CAM_NAME === 'hero' ? (enemy ? 'behind' : 'shoulder') : CAM_NAME];
    if (!cam) return;
    this.camSaved = {
      viewH: this.camSaved?.viewH ?? this.viewH,
      yaw: this.camSaved?.yaw ?? this.yawTarget,
      pair: `${posKey(from)}>${posKey(to)}`,
    };
    const a = this.space.world(from),
      b = this.space.world(to);
    // the camera turns around the strike by the option's `turn`, always a little to the side, so the close unit does not cover the other
    let goal = Math.atan2(a.x - b.x, a.z - b.z) + cam.turn;
    while (goal - this.yawTarget > Math.PI) goal -= Math.PI * 2;
    while (goal - this.yawTarget < -Math.PI) goal += Math.PI * 2;
    this.yawTarget = goal;
    this.pitchTarget = THREE.MathUtils.degToRad(cam.pitch);
    // the close unit stays at half distance in front of the focus: the cut retreats with it, otherwise it vanished on the long shot
    this.camera.near = cam.clip ? CAM_DIST - cam.clip - 0.5 * a.distanceTo(b) : 0.1;
    // `xcom` aims at the middle of the two at the usual height; the low-camera ones aim at the units' height, otherwise the
    // highest tile fell out of frame
    this.focusGoal = cam.lift
      ? a
          .clone()
          .lerp(b, cam.aim)
          .setY(Math.max(a.y, b.y) + cam.lift)
      : this.focusGoal;
    if (!cam.lift) this.focusOn(from, to);
    const h0 = this.viewH,
      h1 = Math.max(Math.min(ZOOM.min, cam.zoom[0]), Math.min(h0, cam.zoom[0] + a.distanceTo(b) * cam.zoom[1]));
    await this.animate(420, (k) => {
      this.viewH = h0 + (h1 - h0) * k * k * (3 - 2 * k);
      this.frameView();
    });
  }
  private async endActionCam() {
    const s = this.camSaved;
    if (!s) return;
    this.camSaved = null;
    this.yawTarget = s.yaw;
    this.pitchTarget = PITCH;
    this.camera.near = 0.1;
    if (this.focusGoal) this.focusGoal.y = STEP;
    const h0 = this.viewH;
    await this.animate(380, (k) => {
      this.viewH = h0 + (s.viewH - h0) * k * k * (3 - 2 * k);
      this.frameView();
    });
  }

  // back to the whole-map framing
  resetView() {
    this.viewH = this.fitView;
    this.focusGoal = new THREE.Vector3(0, STEP, 0);
    this.resize();
  }

  private posOf(v: UnitView): Pos {
    const p = v.holder.position;
    return { x: Math.round(p.x + this.grid.width / 2 - 0.5), y: Math.round(p.z + this.grid.height / 2 - 0.5) };
  }

  // dragging moves the focus on the ground, in the finger's direction (the map follows the finger)
  pan(dx: number, dy: number) {
    const k = (this.camera.top - this.camera.bottom) / this.renderer.domElement.clientHeight;
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.focusGoal = null; // the finger takes over: stops the automatic slide
    this.focus.addScaledVector(right, -dx * k).addScaledVector(fwd, (dy * k) / Math.sin(this.pitch));
    const lim = Math.max(this.grid.width, this.grid.height) / 2;
    this.focus.x = THREE.MathUtils.clamp(this.focus.x, -lim, lim);
    this.focus.z = THREE.MathUtils.clamp(this.focus.z, -lim, lim);
  }

  zoom(factor: number) {
    // the cap follows the map: on the 20x20 the whole map asks for more than the 8x8's 16
    this.viewH = THREE.MathUtils.clamp(this.viewH * factor, ZOOM.min, Math.max(ZOOM.max, this.fitView));
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
    if (top === this.insets.top && bottom === this.insets.bottom) return;
    this.insets = { top, bottom };
    this.resize();
  }

  // 8 angles, every 45° (Nov 13, Fernando's request: "the camera must have 8 angles"); gridStep finds the closest axis
  // to each key at any rotation, so the arrows keep walking on the grid
  rotate(dir: 1 | -1) {
    this.yawTarget += (dir * Math.PI) / 4;
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

  // Title screen background: the camera slowly rotates around the map. On stopping, it goes back to the nearest eighth of a turn
  // (one of the rotate's 8 angles).
  private spinning = false;
  setSpin(on: boolean) {
    if (this.spinning && !on) this.yawTarget = Math.round(this.yawTarget / (Math.PI / 4)) * (Math.PI / 4);
    this.spinning = on;
  }

  private resize() {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.frameView();
  }

  // camera frame by view height (viewH), without redoing the draw targets: it is what the action camera's zoom
  // calls every frame (it changed viewH and nothing happened, because only the resize applied it)
  private frameView() {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    const a = w / h;
    // portrait phone: opens the frame until the width shows the whole map (pinch to adjust)
    const viewH = a < 1 ? (this.viewH * 1.15) / a : this.viewH;
    // centers the map in the free space between the top HUD and the bottom one, not in the middle of the screen
    const off = ((this.insets.bottom - this.insets.top) / 2) * (viewH / h);
    Object.assign(this.camera, {
      left: (-viewH * a) / 2,
      right: (viewH * a) / 2,
      top: viewH / 2 - off,
      bottom: -viewH / 2 - off,
    });
    this.camera.updateProjectionMatrix();
  }

  private placeCamera() {
    const off = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    ).multiplyScalar(CAM_DIST);
    this.camera.position.copy(this.focus).add(off);
    this.camera.lookAt(this.focus);
    this.camera.updateMatrixWorld();
    // locks the camera to the pixel grid: without this the ground "boils" when the camera moves (same idea as Warlock)
    if (!this.pixel.snap || !this.pixel.size) return;
    const block = ((this.camera.top - this.camera.bottom) / this.renderer.domElement.height) * this.pixel.size;
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    const px = this.camera.position.dot(right),
      py = this.camera.position.dot(up);
    this.camera.position
      .addScaledVector(right, Math.round(px / block) * block - px)
      .addScaledVector(up, Math.round(py / block) * block - py);
    this.camera.updateMatrixWorld();
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
    this.t += dt * 1000 * fast;
    for (const a of [...this.anims]) {
      const k = Math.min(1, (this.t - a.start) / a.dur);
      a.step(k);
      if (k < 1) continue;
      this.anims.splice(this.anims.indexOf(a), 1);
      a.done();
    }
    if (this.spinning) this.yawTarget += dt * 0.15; // ~42 s per revolution: you can see the map without getting dizzy
    this.yaw += (this.yawTarget - this.yaw) * Math.min(1, dt * 10);
    this.pitch += (this.pitchTarget - this.pitch) * Math.min(1, dt * 10);
    if (this.focusGoal) this.focus.lerp(this.focusGoal, Math.min(1, dt * 6));
    // dt*30: arrives in ~0.1 s, fast so as not to delay whoever holds the arrow, smooth for the eye to follow
    this.cursor.position.lerp(this.cursorGoal, Math.min(1, dt * 30));
    this.cursor.getObjectByName('arrow')!.position.y =
      MARKER.arrowY + Math.sin(performance.now() / 250) * MARKER.arrowBob;
    // marked tiles breathe (±20% of opacity, ~1.9 s cycle): the map looks alive and the area reads without a strong blink
    const breath = 0.8 + 0.2 * Math.sin(performance.now() / 300);
    for (const m of this.marks.values())
      if (m.visible) (m.material as THREE.MeshBasicMaterial).opacity = m.userData.base * breath;
    // strong strike shake: shifts the focus only in this frame, vanishes by itself (nothing accumulates in the real focus)
    const s = this.t < this.shakeUntil ? 0.12 * ((this.shakeUntil - this.t) / TIMING.shake) : 0;
    const jitter = new THREE.Vector3(Math.sin(this.t * 0.09) * s, 0, Math.cos(this.t * 0.13) * s);
    this.focus.add(jitter);
    this.placeCamera();
    this.focus.sub(jitter);
    if (this.hasTrees) this.updateCuts();
    for (const v of this.units.values()) {
      if (this.t >= this.frozenUntil) v.mixer?.update(dt * fast);
      this.tiltGround(v);
      // health bar always facing the camera
      v.holder
        .getObjectByName('bar')!
        .quaternion.copy(v.holder.quaternion.clone().invert().multiply(this.camera.quaternion));
    }
    this.water?.update(this.t, this.units.values());
    if (this.stream) this.stream.time.value = this.t / 1000;
    this.ambience?.update(this.t, this.camera);
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
