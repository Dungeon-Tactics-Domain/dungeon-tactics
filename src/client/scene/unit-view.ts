// One unit's drawing: its model with its own copies of the materials, the team ring, facing arrow and health bar, the
// animation clips, the flash and glow of its materials and the bar's drain.
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Team, UnitState } from '../../shared/battle/types.ts';
import { UNIT_DEFS } from '../../shared/battle/units.ts';
import { WEIGHT } from '../hit-weight.ts';
import { barYOf, MARKER, unitHeight } from '../markers.ts';
import { prepare } from '../three-util.ts';
import type { Board } from './board.ts';
import type { Timeline } from './timeline.ts';

const TEAM_COLOR = { hero: '#3d9bff', enemy: '#ff4d4d' };
const TINT_GLOW = 0.45; // strength of the own glow (UnitDef.tint): visible on the dark unit without erasing the texture

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
  const mats: THREE.MeshStandardMaterial[] = [];
  if (gltf) {
    body = prepare(cloneSkinned(gltf.scene));
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
    const b = new THREE.Box3().setFromObject(body);
    body.scale.setScalar(unitHeight(u.def) / (b.max.y - b.min.y));
    sway.add(body);
    mixer = new THREE.AnimationMixer(body);
    // the pack's clips only with the bone tracks this unit has (without it Three warns every frame)
    const has = (track: THREE.KeyframeTrack) => !!body!.getObjectByName(track.name.split('.')[0]);
    clips = [
      ...gltf.animations,
      ...packClips.map((c) => new THREE.AnimationClip(c.name, c.duration, c.tracks.filter(has))),
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
  };
  playClip(view, 'Idle');
  return view;
}

export function playClip(v: UnitView, name: string, once = false, rate = 1) {
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

// Walking_A has 2 strides in 1.07 s: 1.25x gives ~1.4 strides per 0.6 s tile, the foot barely slides
export function walk(v: UnitView) {
  playClip(v, 'Walking_A', false, 1.25);
}

// The unit's own glow (UnitDef.tint, the Acolyte over the mage): emissive, because the material color multiplies the
// texture and on a dark unit it did not show (tested on Nov 13). Strike and heal use the same emissive to flash, so
// they return to it at the end; without tint, to the material's factory glow (before it zeroed and put out the skeletons' eyes)
export function glowBack(mats: THREE.MeshStandardMaterial[], def: string) {
  const tint = UNIT_DEFS[def]?.tint;
  for (const m of mats) {
    const glow = m.userData.glow as { color: THREE.Color; intensity: number } | undefined;
    if (tint) m.emissive.set(tint);
    else if (glow) m.emissive.copy(glow.color);
    m.emissiveIntensity = tint ? TINT_GLOW : (glow?.intensity ?? 0);
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
