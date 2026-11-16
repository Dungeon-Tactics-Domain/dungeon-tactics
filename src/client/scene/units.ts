// The battle's characters: loading each model with its own materials, the team ring, facing arrow, health bar, the
// animation clips, and playing the battle events on them (walk, jump, strike, hit, heal, push, charge, death).
// Bodies of the fallen stay on the ground until the end of the battle.
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { ABILITIES } from '../../shared/battle/abilities.ts';
import { canStand, dist, inBounds, isDeep, samePos, standH, subOf, tileAt } from '../../shared/battle/grid.ts';
import { cellsOf, squareH, unitAt } from '../../shared/battle/pathing.ts';
import type { BattleEvent, BattleState, Pos, Team, UnitState } from '../../shared/battle/types.ts';
import { baseDef, UNIT_DEFS } from '../../shared/battle/units.ts';
import { chargeAura, dust, lookOf, playFx, sparks } from '../fx.ts';
import {
  fatal,
  isBig,
  lastOfSide,
  liftOver,
  type NumberBox,
  numberKind,
  numberPx,
  parseSlowmo,
  SLOWMO_KEY,
  shoved,
  WEIGHT,
} from '../hit-weight.ts';
import { t } from '../i18n.ts';
import { el } from '../icons.ts';
import { barYOf, MARKER, modelOf, unitHeight } from '../markers.ts';
import { store } from '../store.ts';
import { prepare } from '../three-util.ts';
import { isJump, jumpAirMs, stepMs, TIMING } from '../timing.ts';
import type { Board } from './board.ts';
import type { CameraRig } from './camera.ts';
import { rampLink, type TileSpace } from './space.ts';
import type { Timeline } from './timeline.ts';

const TEAM_COLOR = { hero: '#3d9bff', enemy: '#ff4d4d' };
const TINT_GLOW = 0.45; // strength of the own glow (UnitDef.tint): visible on the dark unit without erasing the texture
const UP = new THREE.Vector3(0, 1, 0);
const TMP = new THREE.Vector3(); // per-frame math without creating objects
// reduced motion: no recoil, bounce, camera shake or death slow motion; the hit-stop is a pause and stays
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

interface UnitView {
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

export class Units {
  private readonly views = new Map<string, UnitView>();
  private readonly fallen = new Map<string, THREE.Group>(); // bodies of those who died, on the ground until the end of the battle
  private frozenUntil = 0; // hit-stop: units stay still until here
  private quaking = { amp: 0, ms: 1, until: 0 }; // camera shake: strength in world units, fading until `until`
  private slowUntil = 0; // death slow motion: the battle clock runs at WEIGHT.slow until here
  private readonly numbers: { node: HTMLElement; at: THREE.Vector3; box: NumberBox }[] = []; // floating numbers, kept on their chest
  private markers = true; // team ring, facing arrow and health bar; the town has none (hideMarkers)
  private readonly camera: THREE.OrthographicCamera;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly space: TileSpace,
    private readonly board: Board,
    private readonly cam: CameraRig,
    private readonly time: Timeline,
    private readonly models: Map<string, GLTF>,
    private readonly packClips: THREE.AnimationClip[],
    private readonly canvas: HTMLCanvasElement,
    private readonly floats: HTMLElement,
  ) {
    this.camera = cam.camera;
  }

  all(): Iterable<UnitView> {
    return this.views.values();
  }

  // how far the camera shakes at battle time `t` (0 = still), fading out
  shake(t: number): number {
    const q = this.quaking;
    return t < q.until ? q.amp * ((q.until - t) / q.ms) : 0;
  }
  private quake(amp: number, ms: number) {
    if (!still()) this.quaking = { amp: amp * subOf(this.space.grid), ms, until: this.time.t + ms };
  }

  // the battle clock's rate at `t`: WEIGHT.slow during a death's slow motion
  slow(t: number): number {
    return t < this.slowUntil ? WEIGHT.slow : 1;
  }

  // mixers (frozen during the hit-stop), ring on the ramp and health bar facing the camera; after the camera is placed
  update(dt: number, fast: number) {
    const t = this.time.t;
    // the numbers follow their chest while the camera slides or closes in
    for (const n of this.numbers) {
      const p = TMP.copy(n.at).project(this.camera);
      n.box.x = ((p.x + 1) / 2) * this.canvas.clientWidth;
      n.box.y = ((1 - p.y) / 2) * this.canvas.clientHeight - n.box.h / 2;
      n.node.style.left = `${n.box.x}px`;
      n.node.style.top = `${n.box.y + n.box.h / 2 - n.box.lift}px`;
    }
    for (const v of this.views.values()) {
      if (t >= this.frozenUntil) v.mixer?.update(dt * fast);
      this.tiltGround(v);
      // health bar always facing the camera
      v.holder
        .getObjectByName('bar')!
        .quaternion.copy(v.holder.quaternion.clone().invert().multiply(this.camera.quaternion));
    }
  }

  // cutout points the tree crowns must not cover: each visible unit's body
  protect(add: (x: number, y: number, z: number, r: number) => void) {
    for (const v of this.views.values()) {
      const h = unitHeight(v.def),
        p = v.holder.position;
      if (v.holder.visible) add(p.x, p.y + h * 0.6, p.z, Math.max(0.75, h * 0.75));
    }
  }

  // the unit whose drawn body the ray hits first, as its tile
  pick(ray: THREE.Raycaster): Pos | null {
    const holders = [...this.views.values()];
    for (const hit of ray.intersectObjects(
      holders.map((v) => v.holder),
      true,
    )) {
      for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) {
        const unit = holders.find((v) => v.holder === o);
        if (unit) return this.posOf(unit);
      }
    }
    return null;
  }

  // Middle of the unit's body on screen (canvas px, which fills the whole host) and its half width in px: the HUD puts the command
  // menu beside the unit, as in FFT. Orthographic camera: px per world unit = canvas height / view height
  screenOf(unitId: string): { x: number; y: number; r: number } | null {
    const v = this.views.get(unitId);
    if (!v) return null;
    const c = this.canvas;
    const p = v.holder.position
      .clone()
      .setY(v.holder.position.y + unitHeight(v.def) / 2)
      .project(this.camera);
    // 0.5 tile per occupied tile: covers the team ring on the ground (radius 0.44) and the body from any angle
    const r = (0.5 * (UNIT_DEFS[v.def].size ?? 1) * c.clientHeight) / (this.camera.top - this.camera.bottom);
    return { x: ((p.x + 1) / 2) * c.clientWidth, y: ((1 - p.y) / 2) * c.clientHeight, r };
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

  private makeUnit(u: UnitState): UnitView {
    const holder = new THREE.Group();
    const sway = new THREE.Group();
    holder.add(sway);
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
      sway.add(body);
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
    ground.visible = barHolder.visible = this.markers;
    holder.add(ground, barHolder);
    this.scene.add(holder);
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
    this.play(view, 'Idle');
    return view;
  }

  // Jump of one step, like FFT's leap: crouches still, flies in an arc to the tile and lands. The top of the arc passes 0.4
  // levels above the highest tile, so climbing looks like a push and descending like a fall; `levels` lengthens the flight
  private async jump(v: UnitView, a: THREE.Vector3, b: THREE.Vector3, levels: number) {
    this.play(v, 'Jump_Start', true, 0.6 / (TIMING.jumpCrouch / 1000));
    await this.time.wait(TIMING.jumpCrouch);
    this.play(v, 'Jump_Idle');
    const c = Math.max(a.y, b.y) + 0.4 * this.space.step - (a.y + b.y) / 2;
    await this.time.animate(jumpAirMs(levels), (k) =>
      v.holder.position.lerpVectors(a, b, k).setY(a.y + (b.y - a.y) * k + 4 * c * k * (1 - k)),
    );
    this.play(v, 'Jump_Land', true, 0.67 / (TIMING.jumpLand / 1000));
    await this.time.wait(TIMING.jumpLand);
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
    void this.time.animate(ms, (s) => apply(from + (k - from) * s));
  }

  // center of the tiles the unit occupies, at the height of the highest (big unit and half-tile token: the middle of the
  // square, also on each step of a walk or a push)
  private squareAt(def: string, p: Pos): THREE.Vector3 {
    const tiles = cellsOf(p, UNIT_DEFS[def].size ?? 1).map((c) => this.space.stand(c));
    const c = tiles.reduce((a, b) => a.add(b), new THREE.Vector3()).divideScalar(tiles.length);
    return c.setY(Math.max(...tiles.map((w) => w.y)));
  }
  private unitWorld(u: UnitState): THREE.Vector3 {
    return this.squareAt(u.def, u.pos);
  }

  private face(v: UnitView, to: Pos) {
    const d = this.space.world(to).sub(v.holder.position);
    if (d.lengthSq() > 0.001) v.holder.rotation.y = Math.atan2(d.x, d.z);
  }

  // Puts each unit where the state says (creates whoever is missing, removes whoever died)
  sync(state: BattleState) {
    const alive = new Set(state.units.map((u) => u.id));
    // whoever died becomes a body on the ground: no bar, no ring, darker; the undo that brings the unit back removes the body
    for (const [id, v] of this.views) {
      if (alive.has(id)) continue;
      this.views.delete(id);
      v.mixer?.update(10); // closes the death animation on the last frame
      v.sway.position.set(0, 0, 0); // a recoil cut short by the end of the sequence leaves no body off its tile
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
      let v = this.views.get(u.id);
      if (!v) {
        v = this.makeUnit(u);
        this.views.set(u.id, v);
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

  // start of the turn: the unit hops (rises and stretches a little), so the eye finds whoever is playing
  pop(unitId: string) {
    const v = this.views.get(unitId);
    if (!v?.body) return;
    const body = v.body,
      base = body.scale.y;
    void this.time.animate(TIMING.pop, (k) => {
      const s = Math.sin(Math.PI * k);
      body.position.y = s * 0.18;
      body.scale.y = base * (1 + s * 0.08);
    });
  }

  // Impact: everything stops for an instant (hit-stop, doubled on a strong strike), the target flashes white and then
  // trembles, the trembling fading
  private async impact(v: UnitView, big: boolean) {
    const stop = big ? TIMING.hitStopBig : TIMING.hitStop;
    this.frozenUntil = this.time.t + stop;
    for (const m of v.mats) m.emissive.set('#ffffff');
    const flash = ++v.flash;
    void this.time
      .animate(stop * 1.6, (k) => v.mats.forEach((m) => (m.emissiveIntensity = 1 - k)))
      .then(() => flash === v.flash && this.glowBack(v.mats, v.def));
    await this.time.wait(stop);
    const amp = WEIGHT.tremble * subOf(this.space.grid);
    if (v.body && !still())
      void this.time.animate(TIMING.shake, (k) => (v.body!.position.x = Math.sin(k * Math.PI * 6) * amp * (1 - k)));
  }

  // the body's offset from its tile (world units), eased out over `ms`; reduced motion keeps it on its tile
  private sway(v: UnitView, to: THREE.Vector3, ms: number): Promise<void> {
    if (still()) return Promise.resolve();
    const a = v.sway.position.clone(),
      b = to.clone().applyAxisAngle(UP, -v.holder.rotation.y);
    return this.time.animate(ms, (k) => v.sway.position.lerpVectors(a, b, 1 - (1 - k) * (1 - k)));
  }

  // flat direction from the unit `from` to `v`; null when there is none (no attacker, its own spikes)
  private away(from: string | null, v: UnitView): THREE.Vector3 | null {
    const a = from ? this.views.get(from) : undefined;
    if (!a) return null;
    const d = v.holder.position.clone().sub(a.holder.position).setY(0);
    return d.lengthSq() > 0.01 ? d.normalize() : null;
  }

  // flat direction a push takes: away from the area's centre, or from the one who struck when the unit stands on it (as
  // simulatePush reads it)
  private pushWay(v: UnitView, center: Pos | null, striker: string | null): THREE.Vector3 | null {
    if (!center) return this.away(striker, v);
    const d = v.holder.position.clone().sub(this.space.world(center)).setY(0),
      half = (UNIT_DEFS[v.def].size ?? 1) / 2;
    if (Math.abs(d.x) < half && Math.abs(d.z) < half) return this.away(striker, v);
    return d.lengthSq() > 0.01 ? d.normalize() : null;
  }

  // the push's main axis, as the rule picks it (x when it is at least as long as z)
  private axis(d: THREE.Vector3): THREE.Vector3 {
    return Math.abs(d.x) >= Math.abs(d.z) ? new THREE.Vector3(Math.sign(d.x)) : new THREE.Vector3(0, 0, Math.sign(d.z));
  }

  // What the unit's square meets one cell along `axis`, read with the rule's heights (standH, so the body wading in
  // shallow water is not taken for a step): 'free' (level open ground, no one there), 'wall' (wall terrain or a step up:
  // rock the body hits) or 'other' (the map's edge, deep water, a unit, a drop)
  private behind(v: UnitView, id: string, axis: THREE.Vector3, state: BattleState): 'free' | 'wall' | 'other' {
    const g = this.space.grid,
      n = UNIT_DEFS[v.def].size ?? 1,
      p = v.holder.position;
    // the square's corner cell from its drawn middle (squareAt)
    const at = { x: Math.round(p.x + g.width / 2 - n / 2), y: Math.round(p.z + g.height / 2 - n / 2) };
    const next = { x: at.x + axis.x, y: at.y + axis.z },
      cells = cellsOf(next, n),
      h = squareH(g, at, n);
    if (cells.some((c) => !inBounds(g, c))) return 'other';
    if (cells.some((c) => !canStand(tileAt(g, c)) || standH(tileAt(g, c)) > h)) return 'wall';
    if (cells.some((c) => isDeep(tileAt(g, c)) || (unitAt(state, c) && unitAt(state, c)!.id !== id))) return 'other';
    return squareH(g, next, n) === h ? 'free' : 'other';
  }

  private chest(v: UnitView): THREE.Vector3 {
    return v.holder.position.clone().setY(v.holder.position.y + unitHeight(v.def) * WEIGHT.chest);
  }

  // The number pops from the chest on the impact frame and follows it (update), lifted over any number still on screen
  // (liftOver); `px` sizes it by the share of life. It leaves on the wall clock with its CSS animation (TIMING.float),
  // so a slow motion, a camera that goes back or a death never leaves one hanging
  private float(unitId: string, text: string, cls: string, px = 26) {
    const v = this.views.get(unitId);
    if (!v) return;
    const at = this.chest(v),
      p = at.clone().project(this.camera),
      c = this.canvas;
    const node = el('div', { class: `float ${cls}`, style: `font-size:${px}px` }, text);
    this.floats.append(node);
    // measured once on screen, so a wider number (a ✦, a "Miss") keeps its real room; `y` is where it is drawn while
    // it holds: `pop` raises it by its own height from the chest, so a big number sits higher than a small one
    const box = {
      x: ((p.x + 1) / 2) * c.clientWidth,
      y: ((1 - p.y) / 2) * c.clientHeight - px / 2,
      w: node.offsetWidth,
      h: px,
    };
    const lift = liftOver(
      this.numbers.map((o) => o.box),
      box,
    );
    // placed now, not on the next frame, so it never flashes in the corner
    node.style.left = `${box.x}px`;
    node.style.top = `${box.y + px / 2 - lift}px`;
    const n = { node, at, box: { ...box, lift } };
    this.numbers.push(n);
    setTimeout(() => {
      node.remove();
      this.numbers.splice(this.numbers.indexOf(n), 1);
    }, TIMING.float);
  }

  // a push off a drop: a real gravity arc, then dust, a short bounce and a light camera shake where it lands (the fall's
  // number comes with the next event)
  private async fall(v: UnitView, a: THREE.Vector3, b: THREE.Vector3) {
    const k = subOf(this.space.grid),
      g = WEIGHT.gravity * k,
      up = WEIGHT.hop * k;
    const T = (up + Math.sqrt(up * up + 2 * g * Math.max(0, a.y - b.y))) / g; // seconds until it touches b's ground
    await this.time.animate(T * 1000, (s) =>
      v.holder.position.lerpVectors(a, b, s).setY(a.y + up * s * T - (g * (s * T) ** 2) / 2),
    );
    v.holder.position.copy(b);
    if (still()) return; // reduced motion: no dust, bounce or shake
    void dust(this.scene, (ms, step) => this.time.animate(ms, step), b.clone());
    void this.time.animate(TIMING.bounce, (s) => (v.sway.position.y = WEIGHT.bounce * k * 4 * s * (1 - s)));
    this.quake(WEIGHT.quakeLand, TIMING.quakeLand);
  }

  // the blow that downs the last of a side: slow motion and the camera closes in on it, unless Options turns it off
  private deathCam(v: UnitView): boolean {
    if (still() || !parseSlowmo(store.json(SLOWMO_KEY))) return false;
    this.slowUntil = this.time.t + TIMING.slowmo;
    void this.cam.closeUp(this.chest(v), WEIGHT.zoom, TIMING.closeUp);
    return true;
  }

  // Plays the events in sequence; the rule is already applied to the state, here it is just reading what happened.
  // `before` runs before each event (the game uses it for the banner with the ability name and the enemy's destination).
  async playEvents(events: BattleEvent[], state: BattleState, before?: (e: BattleEvent) => Promise<void>) {
    // a hit names neither the ability nor who struck: the last attack says both (the number's colour, the recoil's way)
    let striker: string | null = null,
      center: Pos | null = null, // the attack's aimed tile: an area pushes away from it
      magic = false,
      slowed = false;
    const pushed = new Map<string, THREE.Vector3>(); // each unit's last push, the way a bump meets what stopped it
    const k = subOf(this.space.grid);
    for (const [i, e] of events.entries()) {
      const v = this.views.get(e.unit);
      if (!v) continue;
      await before?.(e);
      if (e.k === 'move') {
        // by step (Nov 13, Fernando's request: slow walking and realistic jump). Walking_A has 2 strides in 1.07 s: 1.25x gives
        // ~1.4 strides per 0.6 s tile, the foot barely slides
        this.play(v, 'Walking_A', false, 1.25);
        const n = e.path.length - 1,
          size = UNIT_DEFS[v.def].size ?? 1;
        for (let i = 1; i <= n; i++) {
          const a = this.squareAt(v.def, e.path[i - 1]),
            b = this.squareAt(v.def, e.path[i]);
          v.holder.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
          // jumps when the standing height changes or flies a gap (the same math as the Jump and the footstep sound, stepMs); a study ramp is flat
          const dh = rampLink(this.space.grid, e.path[i - 1], e.path[i])
            ? 0
            : squareH(this.space.grid, e.path[i], size) - squareH(this.space.grid, e.path[i - 1], size);
          const tiles = dist(e.path[i - 1], e.path[i]) / subOf(this.space.grid);
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
          // the ramp's ground line is a 1-tile unit's; a square goes straight between its middles
          const ramp = size === 1 && !!(tileAt(this.space.grid, from).ramp || tileAt(this.space.grid, to).ramp);
          await this.time.animate(stepMs(0, tiles), (k) => {
            v.holder.position.lerpVectors(a, b, ease(k));
            if (ramp) v.holder.position.y = this.space.walkY(from, to, ease(k));
          });
        }
        this.play(v, 'Idle');
      } else if (e.k === 'attack') {
        striker = e.unit;
        magic = !!ABILITIES[e.ability].magic;
        center = e.target;
        pushed.clear(); // a bump of this attack must not take an earlier attack's push
        const target = state.units.find((u) => u.pos.x === e.target.x && u.pos.y === e.target.y);
        if (!samePos(this.posOf(v), e.target))
          await this.cam.actionCam(this.posOf(v), e.target, state.units.find((u) => u.id === e.unit)?.team === 'enemy');
        if (ABILITIES[e.ability].range[1] > 0) this.face(v, target?.pos ?? e.target);
        const look = lookOf(e.ability);
        this.play(v, look.clip, true);
        await this.time.wait(TIMING.windup);
        const from = v.holder.position.clone().setY(v.holder.position.y + 0.55);
        const to = this.space.world(e.target).setY(this.space.world(e.target).y + 0.4);
        if (look.fx === 'dash') {
          // charge: advances half a tile and returns, like FFT's quick lunge
          const a = v.holder.position.clone(),
            b = a.clone().lerp(this.space.world(e.target), 0.5);
          await this.time.animate(TIMING.lunge, (k) => v.holder.position.lerpVectors(a, b, Math.sin(Math.PI * k)));
        }
        await playFx(
          this.scene,
          (ms, step) => this.time.animate(ms, step),
          look.fx,
          from,
          to,
          ABILITIES[e.ability].radius,
          TIMING.projectile,
        );
        this.play(v, 'Idle'); // the gesture plays once and stuck on the last frame until the unit acted again (Nov 13 review)
      } else if (e.k === 'hit' || e.k === 'bump' || e.k === 'fall' || e.k === 'spike') {
        v.hp -= e.dmg;
        const max = UNIT_DEFS[v.def].hp,
          dies = fatal(events, i);
        // strong strike (25% of health or more): double pause, the camera shakes, the number bigger with a gold edge. With
        // 30%, none of 10 strikes in a Skirmish went through (measured Nov 12): the effect must show up now and then
        // a strong strike (25% of life or more, only from an attack: a fall, a bump or spikes are not one, or a 2-level
        // fall would always be): double pause, the camera shakes, the number bigger with a gold edge. With 30%, none of
        // 10 strikes in a Skirmish went through (measured Nov 12): the effect must show up now and then
        const big = e.k === 'hit' && isBig(e.dmg, max);
        // one slow motion per sequence: an area strike that downs three would hold the battle ~10 s
        if (
          dies &&
          !slowed &&
          lastOfSide(
            events,
            i,
            v.team,
            state.units.filter((u) => u.team === v.team).length,
            (id) => this.views.get(id)?.team ?? v.team,
          )
        )
          slowed = this.deathCam(v);
        // a bump into rock: the body slides to it and stops dead, with sparks; against a unit, the map's edge, deep water
        // or on the way back to where it last rested it only trembles
        const way = e.k === 'bump' ? (pushed.get(e.unit) ?? this.pushWay(v, center, striker)) : null;
        const wall = way && this.behind(v, e.unit, this.axis(way), state) === 'wall' ? this.axis(way) : null;
        if (wall) await this.sway(v, wall.clone().multiplyScalar(WEIGHT.wall * k), TIMING.wallSlide);
        // magic also gets a ✦ after the number (style.css): the colour is never the only signal
        const kind = numberKind(e, magic);
        this.float(e.unit, `-${e.dmg}`, `${kind}${big ? ' crit' : ''}`, numberPx(e.dmg, max, big));
        if (wall && !still())
          void sparks(
            this.scene,
            (ms, step) => this.time.animate(ms, step),
            this.chest(v).addScaledVector(wall, 0.5 * k),
          );
        if (big) this.quake(WEIGHT.quake, TIMING.quake);
        else if (wall) this.quake(WEIGHT.quakeLand, TIMING.quakeLand);
        await this.impact(v, big);
        this.setBar(v, TIMING.hpDrain);
        // the recoil steps half a tile back along the push's axis, only onto level open ground and only for a unit a push
        // can move (simulatePush: a large one does not), and not when the strike's own push moves it
        const from = e.k === 'hit' && !shoved(events, i) ? this.away(striker, v) : null;
        const back =
          from &&
          (UNIT_DEFS[baseDef(v.def)].size ?? 1) === 1 &&
          this.behind(v, e.unit, this.axis(from), state) === 'free'
            ? this.axis(from)
            : null;
        if (wall) void this.sway(v, new THREE.Vector3(), TIMING.wallBack);
        else if (back)
          void this.sway(v, back.multiplyScalar(WEIGHT.recoil * k), TIMING.recoil).then(() =>
            this.sway(v, new THREE.Vector3(), TIMING.recoilBack),
          );
        if (v.hp > 0) this.play(v, 'Hit_A', true);
        // the blow that kills goes straight into the fall (Death_A), still in the slow motion
        if (!dies) await this.time.wait(e.k === 'hit' ? TIMING.hit : TIMING.crash);
        else await this.time.wait(TIMING.recoil);
        if (v.hp > 0) this.play(v, 'Idle');
      } else if (e.k === 'miss') {
        this.float(e.unit, t('Errou', 'Miss'), 'miss');
        // dodge: the target takes a little step back and returns, so the miss shows on the unit and not only in the text
        if (v.body)
          void this.time.animate(TIMING.hit * 0.8, (k) => (v.body!.position.z = -Math.sin(Math.PI * k) * 0.25));
        await this.time.wait(TIMING.hit);
      } else if (e.k === 'heal') {
        v.hp += e.amount;
        // heal flashes green, without the strike's pause or shake: the same signal, with another meaning
        for (const m of v.mats) m.emissive.set('#5dff8a');
        const flash = ++v.flash;
        void this.time
          .animate(TIMING.hit, (k) => v.mats.forEach((m) => (m.emissiveIntensity = 0.8 * (1 - k))))
          .then(() => flash === v.flash && this.glowBack(v.mats, v.def));
        this.setBar(v, TIMING.hpDrain);
        this.float(e.unit, `+${e.amount}`, 'heal', numberPx(e.amount, UNIT_DEFS[v.def].hp, false));
        await this.time.wait(TIMING.hit);
      } else if (e.k === 'push') {
        const a = v.holder.position.clone(),
          b = this.squareAt(v.def, e.to);
        const d = b.clone().sub(a).setY(0).normalize();
        pushed.set(e.unit, d);
        // a drop by the rule's heights, as the walk reads them: shallow water and a ramp are drawn lower without being one
        const size = UNIT_DEFS[v.def].size ?? 1,
          from = { x: e.to.x - Math.round(d.x), y: e.to.y - Math.round(d.z) };
        const grid = this.space.grid;
        if (!rampLink(grid, from, e.to) && squareH(grid, from, size) > squareH(grid, e.to, size))
          await this.fall(v, a, b);
        else await this.time.animate(TIMING.push, (s) => v.holder.position.lerpVectors(a, b, s));
      } else if (e.k === 'charge') {
        // starts charging: the long spell gesture (each ability's own effect comes in the animation block)
        this.face(v, e.target);
        this.play(v, lookOf(e.ability).charge ?? 'Spellcast_Long');
        this.float(e.unit, t('Carregando', 'Charging'), 'miss');
        await this.time.wait(TIMING.hit);
      } else if (e.k === 'fizzle') {
        this.float(e.unit, t('Sem alvo', 'No target'), 'miss');
        await this.time.wait(TIMING.hit);
      } else if (e.k === 'die') {
        // falls and stays down (Nov 13, Fernando's request: "the enemies' bodies must stay on the ground and not vanish"); the
        // sync removes the bar and the ring and darkens the body (fallen)
        this.play(v, 'Death_A', true);
        await this.time.wait(TIMING.die);
        await this.cam.closeUp(null, WEIGHT.zoom, TIMING.closeUpBack); // back from the death close-up, if there was one
      }
    }
  }

  // The walkable town (game/town.ts): no ring, arrow or bar on anyone, the ones there now and the ones still to come
  hideMarkers() {
    this.markers = false;
    for (const v of this.views.values()) v.ground.visible = v.holder.getObjectByName('bar')!.visible = false;
  }

  // The town's walk, one cell at a time at a steady pace: no start and brake per cell like the battle's walk, so a
  // held key or a long path glides on with the walking clip. The town is flat where people walk, so no jump
  async glide(unitId: string, to: Pos, ms: number) {
    const v = this.views.get(unitId);
    if (!v) return;
    const a = v.holder.position.clone(),
      b = this.squareAt(v.def, to);
    v.holder.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
    if (v.current?.getClip().name !== 'Walking_A') this.play(v, 'Walking_A', false, 1.25);
    await this.time.animate(ms, (k) => v.holder.position.lerpVectors(a, b, k));
  }

  // The town's fluid walk: the unit's square with its corner on `p`, which falls between cells, at the height of the
  // cell under it (the town is flat where people walk). With `dir` it walks that way; without, it only stands there.
  // Returns where it is in the world, for the camera to follow
  slide(unitId: string, p: Pos, dir?: Pos): THREE.Vector3 | undefined {
    const v = this.views.get(unitId);
    if (!v) return;
    const c = { x: Math.round(p.x), y: Math.round(p.y) };
    const w = this.squareAt(v.def, c);
    v.holder.position.set(w.x + p.x - c.x, w.y, w.z + p.y - c.y);
    if (!dir) return;
    v.holder.rotation.y = Math.atan2(dir.x, dir.y);
    if (v.current?.getClip().name !== 'Walking_A') this.play(v, 'Walking_A', false, 1.25);
    return v.holder.position;
  }

  // back to standing, after a glide; turned toward `at` (who it talks to), if given
  rest(unitId: string, at?: Pos) {
    const v = this.views.get(unitId);
    if (!v) return;
    if (at) this.face(v, at);
    if (v.current?.getClip().name !== 'Idle') this.play(v, 'Idle');
  }

  // a unit that leaves without dying (the town's party after a class change or a dismissal): no body stays behind
  drop(unitId: string) {
    const v = this.views.get(unitId);
    if (!v) return;
    this.scene.remove(v.holder);
    this.views.delete(unitId);
  }

  celebrate(team: 'hero' | 'enemy', state: BattleState) {
    for (const u of state.units) if (u.team === team) this.play(this.views.get(u.id)!, 'Cheer');
  }

  private posOf(v: UnitView): Pos {
    const p = v.holder.position;
    return {
      x: Math.round(p.x + this.space.grid.width / 2 - 0.5),
      y: Math.round(p.z + this.space.grid.height / 2 - 0.5),
    };
  }
}
