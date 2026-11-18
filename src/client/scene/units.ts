// The battle's characters: each unit's drawing (unit-view.ts) kept where the state says, the camera shake, hit-stop and
// death slow motion clocks, picking and the town's walk. The battle events play in unit-events.ts.
// Bodies of the fallen stay on the ground until the end of the battle; a resumed battle lays its saved corpses.
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ABILITIES } from '../../shared/battle/abilities.ts';
import { posKey, subOf } from '../../shared/battle/grid.ts';
import { cellsOf } from '../../shared/battle/pathing.ts';
import type { BattleEvent, BattleState, Pos, UnitState } from '../../shared/battle/types.ts';
import { UNIT_DEFS } from '../../shared/battle/units.ts';
import { corpseSquares } from '../corpse-squares.ts';
import { chargeAura, lookOf } from '../fx.ts';
import { WEIGHT } from '../hit-weight.ts';
import { modelOf, unitHeight } from '../markers.ts';
import { TIMING } from '../timing.ts';
import type { Board } from './board.ts';
import { layBody } from './board-extras.ts';
import type { CameraRig } from './camera.ts';
import { FloatNumbers, onScreen } from './float-numbers.ts';
import type { TileSpace } from './space.ts';
import type { Timeline } from './timeline.ts';
import { playEvents } from './unit-events.ts';
import { still } from './unit-hits.ts';
import {
  chestOf,
  makeView,
  playClip,
  restyleGround,
  setBar,
  setOrder,
  sideOrder,
  type UnitView,
  walk,
} from './unit-view.ts';

const UP = new THREE.Vector3(0, 1, 0);
const TMP = new THREE.Vector3(); // per-frame math without creating objects

export class Units {
  readonly views = new Map<string, UnitView>();
  private readonly fallen = new Map<string, THREE.Group>(); // bodies of those who died, on the ground until the end of the battle
  // bodies of the corpses the state already had on the first sync (a save resumed); null until then
  private restored: { cells: string[]; parts: THREE.Object3D[] }[] | null = null;
  frozenUntil = 0; // hit-stop: units stay still until here
  private quaking = { amp: 0, ms: 1, until: 0 }; // camera shake: strength in world units, fading until `until`
  slowUntil = 0; // death slow motion: the battle clock runs at WEIGHT.slow until here
  private readonly numbers: FloatNumbers; // floating numbers, kept on their chest
  private markers = true; // team ring, facing arrow and health bar; the town has none (hideMarkers)
  private order: { rank: Map<string, number>; now: string | null } | null = null; // the turn-order numbers (setOrder)
  private cover = -1; // the turn list's right edge across the screen, -1 to 1: a number under it changes side (sideOrder)
  private readonly camera: THREE.OrthographicCamera;
  // an animation on the battle clock, in the shape the gestures of fx.ts take
  readonly animate = (ms: number, step: (k: number) => void) => this.time.animate(ms, step);

  constructor(
    readonly scene: THREE.Scene,
    readonly space: TileSpace,
    private readonly board: Board,
    readonly cam: CameraRig,
    readonly time: Timeline,
    private readonly models: Map<string, GLTF>,
    private readonly packClips: THREE.AnimationClip[],
    private readonly canvas: HTMLCanvasElement,
  ) {
    this.camera = cam.camera;
    this.numbers = new FloatNumbers(this.camera, canvas);
  }

  all(): Iterable<UnitView> {
    return this.views.values();
  }

  // each unit's place in the turn list, drawn beside its health bar (turn-list.ts turnOrder); `now`: who acts, in gold.
  // Kept for the units a later sync creates
  setOrder(rank: Map<string, number> | null, now: string | null, cover = this.cover) {
    this.order = rank && { rank, now };
    this.cover = cover;
    for (const [id, v] of this.views) setOrder(v, rank?.get(id), id === now);
  }

  // a change of mark style: every ring and arrow is drawn again
  restyle() {
    for (const v of this.views.values()) restyleGround(v);
  }

  // how far the camera shakes at battle time `t` (0 = still), fading out
  shake(t: number): number {
    const q = this.quaking;
    return t < q.until ? q.amp * ((q.until - t) / q.ms) : 0;
  }
  quake(amp: number, ms: number) {
    if (!still()) this.quaking = { amp: amp * subOf(this.space.grid), ms, until: this.time.t + ms };
  }

  // the battle clock's rate at `t`: WEIGHT.slow during a death's slow motion
  slow(t: number): number {
    return t < this.slowUntil ? WEIGHT.slow : 1;
  }

  // mixers (frozen during the hit-stop), ring on the ramp and health bar facing the camera; after the camera is placed
  update(dt: number, fast: number) {
    const t = this.time.t;
    this.numbers.follow();
    for (const v of this.views.values()) {
      if (t >= this.frozenUntil) v.mixer?.update(dt * fast);
      this.tiltGround(v);
      // health bar always facing the camera
      const bar = v.holder.getObjectByName('bar')!;
      bar.quaternion.copy(v.holder.quaternion.clone().invert().multiply(this.camera.quaternion));
      sideOrder(bar, this.camera, this.cover);
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
    const p = onScreen(v.holder.position.clone().setY(v.holder.position.y + unitHeight(v.def) / 2), this.camera, c);
    // 0.5 tile per occupied tile: covers the team ring on the ground (radius 0.44) and the body from any angle
    const r = (0.5 * (UNIT_DEFS[v.def].size ?? 1) * c.clientHeight) / (this.camera.top - this.camera.bottom);
    return { ...p, r };
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

  // center of the tiles the unit occupies, at the height of the highest (big unit and half-tile token: the middle of the
  // square, also on each step of a walk or a push)
  squareAt(def: string, p: Pos): THREE.Vector3 {
    const tiles = cellsOf(p, UNIT_DEFS[def].size ?? 1).map((c) => this.space.stand(c));
    const c = tiles.reduce((a, b) => a.add(b), new THREE.Vector3()).divideScalar(tiles.length);
    return c.setY(Math.max(...tiles.map((w) => w.y)));
  }
  private unitWorld(u: UnitState): THREE.Vector3 {
    return this.squareAt(u.def, u.pos);
  }

  face(v: UnitView, to: Pos) {
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
    this.restoreCorpses(state);
    const enemies = state.units.filter((u) => u.team === 'enemy');
    for (const u of state.units) {
      let v = this.views.get(u.id);
      if (!v) {
        v = makeView(this.scene, this.board, this.models.get(modelOf(u.def)), this.packClips, u, this.markers);
        this.views.set(u.id, v);
        // spawns looking to the far side
        const foe = u.team === 'hero' ? enemies[0] : state.units.find((x) => x.team === 'hero');
        if (foe) {
          v.holder.position.copy(this.unitWorld(u));
          this.face(v, foe.pos);
        }
      }
      v.holder.position.copy(this.unitWorld(u));
      // map with direction: the model looks where the state says, after each animation and undo
      if (u.facing !== undefined) v.holder.rotation.y = (u.facing * Math.PI) / 2;
      v.hp = u.hp;
      setBar(v, this.time);
      // aura and looping gesture while the charge is in the queue; they vanish when it goes off or is undone
      const charge = state.charges.find((c) => c.unit === u.id);
      if (charge && !v.aura) {
        v.aura = chargeAura(!!ABILITIES[charge.ability].magic);
        v.holder.add(v.aura);
        const loop = lookOf(charge.ability).charge;
        if (loop) playClip(v, loop);
      } else if (!charge && v.aura) {
        v.holder.remove(v.aura);
        v.aura = null;
        playClip(v, 'Idle');
      }
    }
    if (this.order) this.setOrder(this.order.rank, this.order.now);
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

  // a number over the unit's chest (FloatNumbers.show)
  float(unitId: string, text: string, cls: string, px = 26) {
    const v = this.views.get(unitId);
    if (v) this.numbers.show(chestOf(v), text, cls, px);
  }

  playEvents(events: BattleEvent[], state: BattleState, before?: (e: BattleEvent) => Promise<void>) {
    return playEvents(this, events, state, before);
  }

  // The walkable town (game/town.ts): no ring, arrow or bar on anyone, the ones there now and the ones still to come
  // `hide` false brings them back: the battle behind the title hides them only while the title shows (main.ts)
  hideMarkers(hide = true) {
    this.markers = !hide;
    for (const v of this.views.values()) {
      v.ground.visible = !hide;
      const bar = v.holder.getObjectByName('bar'); // the fallen have none left
      if (bar) bar.visible = !hide;
    }
  }

  // The town's walk, one cell at a time at a steady pace: no start and brake per cell like the battle's walk, so a
  // held key or a long path glides on with the walking clip. The town is flat where people walk, so no jump
  async glide(unitId: string, to: Pos, ms: number) {
    const v = this.views.get(unitId);
    if (!v) return;
    const a = v.holder.position.clone(),
      b = this.squareAt(v.def, to);
    v.holder.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
    if (v.current?.getClip().name !== 'Walking_A') walk(v);
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
    if (v.current?.getClip().name !== 'Walking_A') walk(v);
    return v.holder.position;
  }

  // back to standing, after a glide; turned toward `at` (who it talks to), if given
  rest(unitId: string, at?: Pos) {
    const v = this.views.get(unitId);
    if (!v) return;
    if (at) this.face(v, at);
    if (v.current?.getClip().name !== 'Idle') playClip(v, 'Idle');
  }

  // a unit that leaves without dying (the town's party after a class change or a dismissal): no body stays behind
  drop(unitId: string) {
    const v = this.views.get(unitId);
    if (!v) return;
    this.scene.remove(v.holder);
    this.views.delete(unitId);
  }

  celebrate(team: 'hero' | 'enemy', state: BattleState) {
    for (const u of state.units) if (u.team === team) playClip(this.views.get(u.id)!, 'Cheer');
  }

  // Only the first sync lays the saved corpses: nobody has died on this page yet, so no body stands there; later deaths
  // fall as views. A body leaves when its cells leave the state (the undo of a kill made before the reload, Play again)
  private restoreCorpses(state: BattleState) {
    const now = new Set((state.corpses ?? []).map(posKey));
    this.restored ??= corpseSquares(state.corpses ?? [], subOf(this.board.grid)).map(({ p, span }) => ({
      cells: cellsOf(p, span).map(posKey),
      parts: layBody(this.board, p, span),
    }));
    this.restored = this.restored.filter((r) => {
      if (r.cells.every((k) => now.has(k))) return true;
      this.scene.remove(...r.parts);
      return false;
    });
  }

  posOf(v: UnitView): Pos {
    const p = v.holder.position;
    return {
      x: Math.round(p.x + this.space.grid.width / 2 - 0.5),
      y: Math.round(p.z + this.space.grid.height / 2 - 0.5),
    };
  }
}
