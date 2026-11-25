// One unit's drawing: its model with its own copies of the materials, the team ring, facing arrow and health bar with
// the turn-order number beside it, the animation clips, the flash and glow of its materials and the bar's drain.
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Team, UnitState } from '../../shared/battle/types.ts';
import { baseDef, UNIT_DEFS } from '../../shared/battle/units.ts';
import { bodies, sexOf } from '../bodies.ts';
import { WEIGHT } from '../hit-weight.ts';
import { barYOf, MARKER, unitHeight } from '../markers.ts';
import { prepare } from '../three-util.ts';
import type { Board } from './board.ts';
import { shapeWoman } from './body-shape.ts';
import { circle, litPaint, litStyle, piece, square } from './mark-kit.ts';
import { SHARP_LAYER } from './pixel-pass.ts';
import type { Timeline } from './timeline.ts';

const TEAM_COLOR = { hero: '#3d9bff', enemy: '#ff4d4d' };
// the turn-order number: its side's colour, gold for the one acting now (the turn list's own colours)
const ORDER = { hero: '#7cc4ff', enemy: '#ff7fb6', now: '#ffd75e' };
const TINT_GLOW = 0.45; // strength of the own glow (UnitDef.tint): visible on the dark unit without erasing the texture
// near-black swarm models lit from within so they read on dark stone (Fernando, Nov 20: "rato e aranha mais visíveis");
// drawing only, so here and not on the UnitDef, whose tint also recolours the portraits
const LIFT: Record<string, { color: string; intensity: number }> = {
  rat: { color: '#c9a37a', intensity: 0.35 },
  spider: { color: '#a98ee0', intensity: 0.35 },
};

export interface UnitView {
  holder: THREE.Group;
  mixer: THREE.AnimationMixer | null;
  clips: THREE.AnimationClip[];
  current: THREE.AnimationAction | null;
  bar: THREE.Mesh; // filled part of the health bar
  hp: number;
  def: string;
  team: Team; // for the death slow motion: only the last of a side gets it
  aura: THREE.Mesh | null; // glow on the ground while charging an ability
  body: THREE.Object3D | null;
  // between the holder and the body: the recoil, bounce and wall rebound move it, so the holder (the unit's tile for
  // posOf, the push's start and the water's splashes) stays put, and the body's own tremble, dodge and hop add up
  sway: THREE.Group;
  mats: THREE.MeshStandardMaterial[]; // materials only for this unit (copies): flashing one does not flash the others of the same model
  flash: number; // counts the flashes: only the last one gives the glow back (a strike and a thorn in a row do not cut the second)
  ground: THREE.Group; // ring and front arrow, lying on the ramp (tiltGround)
  facing: boolean; // the map counts direction: the ground carries the front arrow
}

// The unit `u` drawn from its model (`gltf`; none for the Beacon), added to the scene and standing in Idle; `markers`
// false leaves its ring, arrow and bar hidden (the town)
export function makeView(
  scene: THREE.Scene,
  board: Board,
  gltf: GLTF | undefined,
  packClips: THREE.AnimationClip[],
  u: UnitState,
  markers: boolean,
): UnitView {
  const holder = new THREE.Group();
  const sway = new THREE.Group();
  holder.add(sway);
  let mixer: THREE.AnimationMixer | null = null;
  let clips: THREE.AnimationClip[] = [];
  let body: THREE.Object3D | null = null;
  let lay: THREE.Group | null = null,
    own = false;
  const mats: THREE.MeshStandardMaterial[] = [];
  const long = UNIT_DEFS[u.def].halfLength ?? 1;
  if (gltf) {
    body = prepare(cloneSkinned(gltf.scene));
    if (sexOf(bodies(), u.id, u.def) === 'f') shapeWoman(body); // Debug › Models (bodies.ts), at rest before any clip
    body.traverse((m) => {
      const mesh = m as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
      // factory glow (yellow eyes on the skeletons): the strike and heal flash touches the emissive and must return to it
      mat.userData.glow = { color: mat.emissive.clone(), intensity: mat.emissiveIntensity };
      mesh.material = board.shaded(mat); // ?units=plain compares without the shading
      mats.push(mat);
    });
    glowBack(mats, u.def);
    // a skinned box is measured through its bones: their world matrices first (the snake's armature is scaled 100x)
    body.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(body);
    // a lying body (the snake, own rig) is fitted to its length in cells (halfLength: 2 half tiles, one whole tile);
    // a standing one to its height
    own = gltf.animations.some((c) => c.name.includes('|'));
    const fit = own ? long / Math.max(b.max.x - b.min.x, b.max.z - b.min.z) : unitHeight(u.def) / (b.max.y - b.min.y);
    body.scale.setScalar(fit);
    // on a group of its own: the dodge and the tremble set the body's own x and z; an own-rig creature is seated on it
    // by its posed body once Idle plays (seat)
    lay = new THREE.Group().add(body);
    sway.add(lay);
    mixer = new THREE.AnimationMixer(body);
    // the pack's clips only with the bone tracks this unit has (without it Three warns every frame)
    const has = (track: THREE.KeyframeTrack) => !!body!.getObjectByName(track.name.split('.')[0]);
    // the pack is KayKit's rig: a model with its own rig keeps only its own clips
    clips = [
      ...gltf.animations,
      ...(own ? [] : packClips).map((c) => new THREE.AnimationClip(c.name, c.duration, c.tracks.filter(has))),
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
  const ground = new THREE.Group().add(...groundMarks(u.team, u.def, u.facing !== undefined));
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
  for (const m of [barBg, bar]) m.layers.set(SHARP_LAYER);
  ground.visible = barHolder.visible = markers;
  holder.add(ground, barHolder);
  scene.add(holder);
  const view: UnitView = {
    holder,
    mixer,
    clips,
    current: null,
    bar,
    hp: u.hp,
    def: u.def,
    team: u.team,
    aura: null,
    body,
    sway,
    mats,
    flash: 0,
    ground,
    facing: u.facing !== undefined,
  };
  playClip(view, 'Idle');
  if (own && lay) seat(view, lay, long);
  return view;
}

// An own-rig creature (rat, snake, spider, bat) sits by its posed body, not its file origin or its head bone (Fernando,
// Nov 25: "rato deve ficar no meio do tile dele"; the coiled snake stood 2.3 tall, 2.1 wide on its 1-wide cells and
// centred on its head's cell): Idle's first frame is measured, shrunk until it fits its cells and centred on them, the
// tail's cells behind the head's (pathing.ts bodyOf). KayKit units keep their origin: their weapons and cloaks put a
// box's middle up to 0.34 of a cell forward (measured Nov 25), so centring them would slide them off their feet
function seat(v: UnitView, lay: THREE.Group, long: number) {
  const posed = () => {
    v.mixer!.update(0);
    v.holder.updateMatrixWorld(true);
    v.body!.traverse((m) => (m as THREE.SkinnedMesh).isSkinnedMesh && (m as THREE.SkinnedMesh).computeBoundingBox());
    return new THREE.Box3().setFromObject(v.body!).applyMatrix4(v.sway.matrixWorld.clone().invert());
  };
  const s = posed().getSize(new THREE.Vector3());
  // and no taller than a little over its sheet's height: the coiled snake reared to 2.2, above the 1.7 heroes
  v.body!.scale.multiplyScalar(Math.min(1, 0.95 / s.x, (0.95 * long) / s.z, (1.2 * unitHeight(v.def)) / s.y));
  const c = posed().getCenter(new THREE.Vector3());
  lay.position.set(-c.x, 0, -c.z - (long - 1) / 2);
}

// What lies on the ground under a unit: the front arrow and the team ring, flat or in a lit mark style (mark-kit.ts)
function groundMarks(team: Team, def: string, facing: boolean): THREE.Object3D[] {
  const style = litStyle(),
    out: THREE.Object3D[] = [];
  // white arrow on the ground for the unit's front (white: the team color vanished on marked tiles), only on maps where direction counts: from above the unit's face is hardly readable
  if (facing) {
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.3, 3).rotateX(Math.PI / 2),
      style ? litPaint(style, '#ffffff') : new THREE.MeshBasicMaterial({ color: '#ffffff' }),
    );
    arrow.position.set(0, 0.05, 0.5);
    arrow.scale.y = 0.3;
    out.push(arrow);
  }
  // team-colored ring on the ground: the side reads even when the model looks alike. Lit, the shape tells the side too
  // (colour is never the only signal): the heroes' ring is whole, the enemies' is broken in four
  // a long body (the snake, Nov 20) gets a rectangle over all its cells, from the head's cell back over the tail
  const long = UNIT_DEFS[def].halfLength ?? 1,
    rect = square(0.39).map((p) => p.setZ(p.z > 0 ? 0.39 : -0.39 - (long - 1)));
  const ring = style
    ? piece(
        style,
        team === 'hero'
          ? [{ pts: long > 1 ? rect : circle(0.39, 32), closed: true }]
          : [0, 1, 2, 3].map((k) => ({
              pts:
                long > 1
                  ? [0.2, 0.8].map((f) => rect[k].clone().lerp(rect[(k + 1) % 4], f))
                  : circle(0.39, 8, (k * Math.PI) / 2 + 0.17, ((k + 1) * Math.PI) / 2 - 0.17),
              closed: false,
            })),
        0.05,
        TEAM_COLOR[team],
      )
    : new THREE.Mesh(
        long > 1
          ? new THREE.RingGeometry(0.48, 0.62, 4, 1, Math.PI / 4).rotateX(-Math.PI / 2).scale(1, 1, long)
          : new THREE.RingGeometry(0.34, 0.44, 24).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: TEAM_COLOR[team], depthWrite: false, transparent: true, opacity: 0.9 }),
      );
  ring.position.set(0, 0.04, long > 1 && !style ? -(long - 1) / 2 : 0);
  ring.scale.setScalar(UNIT_DEFS[def].size ?? 1); // big unit: the ring surrounds the whole square
  out.push(ring);
  return out;
}

// a change of mark style: the ring and the arrow are drawn again
export function restyleGround(v: UnitView) {
  v.ground.traverse((o) => {
    (o as THREE.Mesh).geometry?.dispose();
    ((o as THREE.Mesh).material as THREE.Material | undefined)?.dispose();
  });
  v.ground.clear().add(...groundMarks(v.team, v.def, v.facing));
}

// The turn-order number as a picture: big digits in the side's colour with a dark edge, lighter at the top so they read
// as raised. One texture per number and colour, kept for the page (ponytail: at most a few dozen small canvases)
const orderTextures = new Map<string, THREE.CanvasTexture>();
function orderTexture(n: number, tone: keyof typeof ORDER): THREE.CanvasTexture {
  const font = '800 108px "Alegreya Sans", sans-serif';
  // before the game's font loads the digits come in the fallback, under their own key, and are drawn again after
  const key = `${n}|${tone}|${document.fonts.check(font)}`;
  let t = orderTextures.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  g.font = font;
  c.width = Math.ceil(g.measureText(String(n)).width) + 28;
  c.height = 128;
  g.font = font; // sizing the canvas reset it
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 18;
  g.strokeStyle = '#0c1020';
  g.strokeText(String(n), c.width / 2, 70);
  const fill = g.createLinearGradient(0, 22, 0, 112);
  fill.addColorStop(0, '#ffffff');
  fill.addColorStop(0.45, ORDER[tone]);
  fill.addColorStop(1, new THREE.Color(ORDER[tone]).multiplyScalar(0.7).getStyle());
  g.fillStyle = fill;
  g.fillText(String(n), c.width / 2, 70);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  orderTextures.set(key, t);
  return t;
}

// The unit's place in the turn list, glued to the left of its health bar and facing the camera with it (so the town and
// the fallen, which have no bar, have no number); `n` undefined hides it, `now` paints it gold
export function setOrder(v: UnitView, n: number | undefined, now: boolean) {
  const bar = v.holder.getObjectByName('bar');
  let tag = bar?.getObjectByName('order') as THREE.Mesh | undefined;
  if (!bar || n === undefined) {
    if (tag) tag.visible = false;
    return;
  }
  if (!tag) {
    tag = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ transparent: true, depthTest: false }),
    );
    tag.name = 'order';
    tag.renderOrder = 10;
    tag.layers.set(SHARP_LAYER);
    bar.add(tag);
  }
  const tex = orderTexture(n, now ? 'now' : v.team);
  (tag.material as THREE.MeshBasicMaterial).map = tex;
  const w = (MARKER.orderH * tex.image.width) / tex.image.height;
  tag.scale.set(w, MARKER.orderH, 1);
  tag.position.set(-(MARKER.barHalfW + MARKER.orderGap + w / 2), 0, 0.002);
  tag.visible = true;
}

// A number the turn list would cover goes to the bar's right side (Nov 17: the left edge's number sat under the list).
// `cover`: the list's right edge across the screen, -1 to 1. Every frame, since the camera moves the unit under the list.
// ponytail: only the list's right edge counts, not its height; pass its box when a number below it must stay at the left
const EDGE = new THREE.Vector3();
export function sideOrder(bar: THREE.Object3D, camera: THREE.Camera, cover: number) {
  const tag = bar.getObjectByName('order');
  if (!tag?.visible) return;
  const x = Math.abs(tag.position.x);
  const left = bar.localToWorld(EDGE.set(-x - tag.scale.x / 2, 0, 0)).project(camera).x;
  tag.position.x = left < cover ? x : -x;
}

// A model with its own rig (the Quaternius snake and swarm creatures: Blender's `Armature|Action` clip names) has none
// of the KayKit gestures: each one plays the first of its own clips it has (the bat flies in place of idle and walk);
// without a Death clip (the snake) unit-events lays the body on its side
const STAND_IN: [RegExp, string[]][] = [
  [/^Death/, ['Death']],
  [/^Walking|^Running/, ['Walk', 'Flying']],
  [/^Hit/, ['Hit', 'Jump']],
  [/^Jump/, ['Jump', 'Flying']],
  [/^Idle|^Cheer/, ['Idle', 'Flying']],
  [/./, ['Attack']], // every other gesture is acting
];
export const standIn = (v: UnitView, name: string): THREE.AnimationClip | undefined => {
  const own = v.clips.filter((c) => c.name.includes('|'));
  for (const k of STAND_IN.find(([re]) => re.test(name))![1]) {
    const clip = own.find((c) => c.name.endsWith(`_${k}`));
    if (clip) return clip;
  }
  return undefined;
};

export function playClip(v: UnitView, name: string, once = false, rate = 1) {
  const clip = v.clips.find((c) => c.name === name) ?? standIn(v, name);
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

// Walking_A has 2 strides in 1.07 s: 1.25x gives ~1.4 strides per 0.6 s tile, the foot barely slides
export function walk(v: UnitView) {
  playClip(v, 'Walking_A', false, 1.25);
}

// The unit's own glow (UnitDef.tint, the Acolyte over the mage): emissive, because the material color multiplies the
// texture and on a dark unit it did not show (tested on Nov 13). Strike and heal use the same emissive to flash, so
// they return to it at the end; without tint, to the material's factory glow (before it zeroed and put out the skeletons' eyes)
export function glowBack(mats: THREE.MeshStandardMaterial[], def: string) {
  const tint = UNIT_DEFS[def]?.tint;
  const lift = LIFT[baseDef(def)]; // battles run on the split map's half defs (rat~half)
  for (const m of mats) {
    const glow = m.userData.glow as { color: THREE.Color; intensity: number } | undefined;
    if (tint) m.emissive.set(tint);
    else if (lift) m.emissive.set(lift.color);
    else if (glow) m.emissive.copy(glow.color);
    m.emissiveIntensity = tint ? TINT_GLOW : lift ? lift.intensity : (glow?.intensity ?? 0);
  }
}

// the body lights up in `color` at `peak` and fades over `ms` back to its own glow (glowBack); white on a strike,
// green on a heal
export function flash(v: UnitView, time: Timeline, color: string, peak: number, ms: number) {
  for (const m of v.mats) m.emissive.set(color);
  const n = ++v.flash;
  void time
    .animate(ms, (k) => v.mats.forEach((m) => (m.emissiveIntensity = peak * (1 - k))))
    .then(() => n === v.flash && glowBack(v.mats, v.def));
}

// ms > 0: the bar goes down (or up) gradually, as in FFT, without holding up the sequence
export function setBar(v: UnitView, time: Timeline, ms = 0) {
  const k = Math.max(0, v.hp / UNIT_DEFS[v.def].hp);
  const apply = (x: number) => {
    v.bar.scale.x = Math.max(0.001, x);
    v.bar.position.x = -0.33 * (1 - x);
  };
  if (!ms) return apply(k);
  const from = v.bar.scale.x;
  void time.animate(ms, (s) => apply(from + (k - from) * s));
}

// where the numbers pop from and the death close-up aims
export function chestOf(v: UnitView): THREE.Vector3 {
  return v.holder.position.clone().setY(v.holder.position.y + unitHeight(v.def) * WEIGHT.chest);
}
