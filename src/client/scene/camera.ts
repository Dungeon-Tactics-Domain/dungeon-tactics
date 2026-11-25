// Battle camera: orthographic, orbiting a focus point on the ground at FFT's tilt. Owns the zoom, the rotation in 45° steps, the
// slide to whoever acts, the finger pan, the title spin and the action camera on the strike. It only moves the camera: the
// scene renders and calls update/place every frame.
import * as THREE from 'three';
import { posKey, subOf } from '../../shared/battle/grid.ts';
import type { Pos } from '../../shared/battle/types.ts';
import { type Body, fitBoth, frameBounds, hiddenAt, type Insets, revealYaw } from '../camera-aim.ts';
import { reducedMotion } from '../motion.ts';
import { snapQuarter, TOP_MS, TOP_PITCH, topFit, turnStep } from '../top-view.ts';
import { ACTION_CAMS, CAM_NAME } from './action-cams.ts';
import { STEP, type TileSpace } from './space.ts';

export { frameBounds, type Insets }; // their tests and top-view.ts read them here

const PITCH = THREE.MathUtils.degToRad(32); // FFT's angle
const CAM_DIST = 30; // camera distance to the focus (orthographic: it only decides what sits in front of the clipping plane)
const ZOOM = { min: 4, max: 16 };
const CLOSE_UP = 2; // the death close-up's tightest view height, in whole tiles: the body about half the screen
const ZOOM_START = 1.5;
// portrait phone: at most ~9.5 tiles wide when opening. On the 20x20 the whole map left the tile at ~20 px, small
// for a finger (touch target ≥ 44 px); the camera follows the hero of the turn and the recenter button shows everything
const PORTRAIT_START = 8.3;
// PC: opens with ~10 of view height (before up to 16, almost the whole map and the unit at ~30 px at 1280x720). FFT shows
// few tiles and big units; the camera follows the cursor and whoever acts, and F still shows the whole map (Nov 12)
const PC_START = 10;
// a phone on its side (under 500 px tall; Nov 18): 6 of view height, so a half tile is about 32 px wide for the finger
// instead of 20; the pinch and the whole-map button still show more
const SHORT_START = 6;

export class CameraRig {
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  private readonly focus = new THREE.Vector3();
  private focusGoal: THREE.Vector3 | null = null; // where the camera slides to (hero of the turn, recenter)
  private viewH: number;
  private viewGoal: number | null = null; // where the aim's zoom eases to (aim, endAim)
  private readonly fitView: number; // zoom at which the whole map fits the width
  // world units per whole tile: 2 on the split map (half.ts), where every distance in this file is twice as long
  private readonly k: number;
  private insets: Insets = { top: 0, bottom: 0, left: 0, right: 0 }; // px covered by the HUD on each side
  private yaw = Math.PI / 4;
  private pitch = PITCH; // only the action camera changes it (ACTION_CAMS)
  private pitchTarget = PITCH;
  private yawTarget = Math.PI / 4;
  // top view (top-view.ts): on, its whole-map view height, and the view height to go back to
  private top = false;
  private topH = 0;
  private topEasing = false; // a toggle mid-ease would save a half-way zoom as the one to go back to
  // what leaving the top view goes back to; yaw null once R turned the map from above (the new side stays)
  private topBack = { viewH: 0, yaw: null as number | null, focus: new THREE.Vector3() };

  // `animate` runs on the scene's battle clock, so the action camera speeds up with the rest of the battle
  constructor(
    private readonly host: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
    private readonly space: TileSpace,
    private readonly animate: (dur: number, step: (k: number) => void) => Promise<void>,
  ) {
    const grid = space.grid;
    this.k = subOf(grid);
    // fitView: the map diagonal (it shows as a diamond) plus half a tile on each side fits the portrait phone width.
    // Starts 1.5x closer: with the whole map the tile was ~45x24 px, small for a finger (mobile audit of Oct 25);
    // the camera goes to the hero of the turn, and the recenter button goes back to the whole map
    this.fitView = ((grid.width + grid.height) / Math.SQRT2 + 1) / 1.15;
    this.viewH =
      innerWidth < innerHeight
        ? Math.min(this.fitView / ZOOM_START, PORTRAIT_START * this.k)
        : Math.min(this.fitView, (innerHeight < 500 ? SHORT_START : PC_START) * this.k);
    this.focus.set(0, STEP, 0);
  }

  // rotation to where the camera is going (not the mid-animation one): WASD already walks right after R
  get heading(): number {
    return this.yawTarget;
  }

  // The map builder draws a new scene after each edit (mapedit/builder.ts): the view goes on from the last one's.
  // A map of another size is framed again from above, where the whole map is what the view shows
  carry(from: CameraRig) {
    const { focus, focusGoal, viewH, yaw, yawTarget, pitch, pitchTarget, top, topH, topBack } = from;
    Object.assign(this, {
      viewH,
      yaw,
      yawTarget,
      pitch,
      pitchTarget,
      top,
      topH,
      focusGoal: focusGoal?.clone() ?? null,
    });
    this.focus.copy(focus);
    this.topBack = { ...topBack, focus: topBack.focus.clone() };
    const g = this.space.grid,
      was = from.space.grid;
    if (top && (g.width !== was.width || g.height !== was.height)) this.viewH = this.topH = this.fitTop(yawTarget);
    this.frameView();
  }

  // slides the camera to the tile (the hero of the turn), without changing the zoom
  focusOn(p: Pos, also?: Pos) {
    // from above with the whole map in view, the turn's hero is already seen: the map stays centred
    if (this.wholeTop && !this.camSaved) return;
    // with `also`, centers between the two (attacker and target): the strike never happens off-screen or behind the HUD
    const w = also ? this.space.world(p).lerp(this.space.world(also), 0.5) : this.space.world(p);
    // held (bench): at the body's height on that ground, since a low camera shows height almost as it is
    this.focusGoal = new THREE.Vector3(w.x, this.held ? w.y + 0.5 * this.k : STEP, w.z);
  }

  // Turn start (main.ts; Fernando, Nov 25: "em cada turno deve selecionar o protagonista do turno"): the aim's zoom
  // given back, turned to the nearest angle that shows the unit when taller ground hides it, and the unit in the middle
  turnFocus(u: Body) {
    if (this.held) return; // the bench's fixed camera stays where its spec put it
    this.endAim();
    this.reveal([u]);
    this.centre([u]);
  }

  // Aiming at a target (act-turn.ts; Fernando, Nov 25): the middle between the actor and the target, turned so both are
  // seen, and zoomed out just enough that both fit (never in); the zoom from before comes back on endAim or after the strike
  private aimSaved: number | null = null;
  aim(from: Body, to: Body) {
    if (this.held) return;
    this.reveal([from, to]);
    this.centre([from, to]);
    if (this.wholeTop) return;
    this.aimSaved ??= this.viewH;
    const [a, b] = [from, to].map((u) => this.space.squareTop(u.p, u.size)),
      page = { w: this.host.clientWidth, h: this.host.clientHeight },
      need = fitBoth(a, b, this.yawTarget, PITCH, page, this.insets, this.k, Math.max(from.h, to.h));
    this.viewGoal = Math.min(Math.max(this.aimSaved, need), this.maxView);
  }
  endAim() {
    if (this.aimSaved === null) return;
    this.viewGoal = this.aimSaved;
    this.aimSaved = null;
  }

  // the middle of the bodies at their middle height: a unit on a high tile sat above the middle with the focus on the
  // lowest ground (Nov 25)
  private centre(bs: Body[]) {
    if (this.wholeTop && !this.camSaved) return;
    const w = bs.map((u) => this.space.squareTop(u.p, u.size)).reduce((a, b) => a.lerp(b, 0.5));
    this.focusGoal = new THREE.Vector3(w.x, w.y + Math.max(...bs.map((u) => u.h)) / 2, w.z);
  }

  // the nearest of the 8 angles that shows every body when taller ground or a wall hides one from here
  // (camera-aim.ts); never from above, under the strike camera or behind the title
  private reveal(bs: Body[]) {
    if (this.top || this.camSaved || this.spinning) return;
    const pts = bs.map((u) => this.space.squareTop(u.p, u.size).addScaledVector(THREE.Object3D.DEFAULT_UP, u.h * 0.6));
    const hidden = (yaw: number) => pts.some((p) => hiddenAt(this.space.grid, this.space.step, p, yaw, PITCH));
    this.yawTarget = revealYaw(this.yawTarget, turnStep(false), hidden);
  }

  // the same slide to a point between tiles (the town's fluid walk); the lerp in update is its smoothing
  focusAt(w: THREE.Vector3) {
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
    // reduced motion: no swing and zoom around the strike (Nov 16 audit); the strike plays from the usual view
    if (!cam || this.held || reducedMotion()) return;
    // the strike gives back the zoom from before the aim, not the aim's zoomed-out one
    this.camSaved = {
      viewH: this.camSaved?.viewH ?? this.aimSaved ?? this.viewH,
      yaw: this.camSaved?.yaw ?? this.yawTarget,
      pair: `${posKey(from)}>${posKey(to)}`,
    };
    this.aimSaved = this.viewGoal = null;
    const a = this.space.world(from),
      b = this.space.world(to);
    // the camera turns around the strike by the option's `turn`, always a little to the side, so the close unit does not cover the other
    let goal = Math.atan2(a.x - b.x, a.z - b.z) + cam.turn;
    while (goal - this.yawTarget > Math.PI) goal -= Math.PI * 2;
    while (goal - this.yawTarget < -Math.PI) goal += Math.PI * 2;
    this.yawTarget = goal;
    this.pitchTarget = THREE.MathUtils.degToRad(cam.pitch);
    // the close unit stays at half distance in front of the focus: the cut retreats with it, otherwise it vanished on the long shot
    this.camera.near = cam.clip ? CAM_DIST - cam.clip * this.k - 0.5 * a.distanceTo(b) : 0.1;
    // `xcom` aims at the middle of the two at the usual height; the low-camera ones aim at the units' height, otherwise the
    // highest tile fell out of frame
    this.focusGoal = cam.lift
      ? a
          .clone()
          .lerp(b, cam.aim)
          .setY(Math.max(a.y, b.y) + cam.lift * this.k)
      : this.focusGoal;
    if (!cam.lift) this.focusOn(from, to);
    const h0 = this.viewH,
      base = cam.zoom[0] * this.k,
      h1 = Math.max(Math.min(ZOOM.min * this.k, base), Math.min(h0, base + a.distanceTo(b) * cam.zoom[1]));
    await this.animate(420, (k) => {
      this.viewH = h0 + (h1 - h0) * k * k * (3 - 2 * k);
      this.frameView();
    });
  }
  async endActionCam() {
    const s = this.camSaved;
    if (!s) return;
    this.camSaved = null;
    this.yawTarget = s.yaw;
    this.pitchTarget = this.basePitch;
    this.camera.near = 0.1;
    if (this.focusGoal) this.focusGoal.y = STEP;
    if (this.top && s.viewH >= this.topH * 0.99) this.focusGoal = new THREE.Vector3(0, STEP, 0);
    const h0 = this.viewH;
    await this.animate(380, (k) => {
      this.viewH = h0 + (s.viewH - h0) * k * k * (3 - 2 * k);
      this.frameView();
    });
  }

  // Death close-up (Fernando's grill of Nov 15): eases the view `zoom` times closer onto `at`; null eases back to the
  // framing from before it, which endActionCam then takes back to its own
  private closeSaved: { viewH: number; focus: THREE.Vector3 } | null = null;
  async closeUp(at: THREE.Vector3 | null, zoom: number, ms: number) {
    if (this.held || (!at && !this.closeSaved)) return;
    this.closeSaved ??= { viewH: this.viewH, focus: (this.focusGoal ?? this.focus).clone() };
    const s = this.closeSaved;
    if (!at) this.closeSaved = null;
    this.focusGoal = (at ?? s.focus).clone();
    // never closer than CLOSE_UP tiles of view: over the action camera's close framing 2.2x filled the screen with the body
    const h0 = this.viewH,
      h1 = at ? Math.max(s.viewH / zoom, Math.min(s.viewH, CLOSE_UP * this.k)) : s.viewH;
    await this.animate(ms, (k) => {
      this.viewH = h0 + (h1 - h0) * k * k * (3 - 2 * k);
      this.frameView();
    });
  }

  // Sandbox bench (dev/sandbox.ts): a fixed tilt in degrees and no action camera, so a body is always seen from the same
  // angle; `clip` cuts what stands more than that many tiles in front of the focus, as the low action cameras do. null lets go
  private held = false;
  hold(pitch: number | null, clip?: number) {
    this.held = pitch !== null;
    this.pitchTarget = pitch === null ? this.basePitch : THREE.MathUtils.degToRad(pitch);
    this.camera.near = clip ? CAM_DIST - clip * this.k : 0.1;
    this.frameView();
  }

  // back to the whole-map framing
  resetView() {
    this.aimSaved = this.viewGoal = null; // the player's own framing wins over the aim's
    this.viewH = this.top ? this.topH : this.fitView;
    this.focusGoal = new THREE.Vector3(0, STEP, 0);
  }

  // dragging moves the focus on the ground, in the finger's direction (the map follows the finger)
  pan(dx: number, dy: number) {
    const k = (this.camera.top - this.camera.bottom) / this.canvas.clientHeight;
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.focusGoal = null; // the finger takes over: stops the automatic slide
    this.focus.addScaledVector(right, -dx * k).addScaledVector(fwd, (dy * k) / Math.sin(this.pitch));
    const lim = Math.max(this.space.grid.width, this.space.grid.height) / 2;
    this.focus.x = THREE.MathUtils.clamp(this.focus.x, -lim, lim);
    this.focus.z = THREE.MathUtils.clamp(this.focus.z, -lim, lim);
  }

  zoom(factor: number) {
    this.aimSaved = this.viewGoal = null; // the wheel or the pinch takes over from the aim's zoom
    // the cap follows the map: on the 20x20 the whole map asks for more than the 8x8's 16
    this.viewH = THREE.MathUtils.clamp(this.viewH * factor, ZOOM.min * this.k, this.maxView);
  }
  private get maxView() {
    return Math.max(ZOOM.max * this.k, this.fitView, this.topH);
  }

  // false when nothing changed (the scene skips the resize)
  setInsets(top: number, bottom: number, left = 0, right = 0): boolean {
    const i = this.insets;
    if (top === i.top && bottom === i.bottom && left === i.left && right === i.right) return false;
    this.insets = { top, bottom, left, right };
    return true;
  }

  // 8 angles, every 45° (Nov 13, Fernando's request: "the camera must have 8 angles"); gridStep finds the closest axis
  // to each key at any rotation, so the arrows keep walking on the grid
  rotate(dir: 1 | -1) {
    const whole = this.wholeTop;
    this.yawTarget += dir * turnStep(this.top);
    if (this.top) this.topBack.yaw = null;
    // a long map swaps its sides on screen: refit it if it was whole
    if (whole) this.viewH = this.topH = this.fitTop(this.yawTarget);
    this.frameView();
  }

  // Top view (top-view.ts): eases to straight down at the nearest straight angle, framing the whole map, and back to
  // the tilt and zoom from before. During the strike camera it only changes what that camera returns to
  get isTop() {
    return this.top;
  }
  // what scene/top-view.ts draws the heights for: from above, and not while the strike camera turns away
  get topShown() {
    return this.top && !this.camSaved && this.pitch > THREE.MathUtils.degToRad(80);
  }
  async setTop(on: boolean) {
    if (on === this.top || this.held || this.topEasing) return;
    this.top = on;
    const preAim = this.aimSaved; // what the aim's zoom-out would go back to
    this.aimSaved = this.viewGoal = null;
    const s = this.camSaved,
      now = s?.yaw ?? this.yawTarget,
      back = this.topBack,
      yaw = on ? snapQuarter(now) : (back.yaw ?? now);
    if (on) {
      Object.assign(back, { viewH: s?.viewH ?? preAim ?? this.viewH, yaw: now });
      back.focus.copy(this.focusGoal ?? this.focus);
      this.topH = this.fitTop(yaw);
    }
    const h1 = on ? this.topH : back.viewH;
    if (s) return void Object.assign(s, { yaw, viewH: h1 });
    this.yawTarget = yaw;
    this.pitchTarget = this.basePitch;
    this.focusGoal = on ? new THREE.Vector3(0, STEP, 0) : back.focus.clone();
    const h0 = this.viewH;
    this.topEasing = true;
    await this.animate(reducedMotion() ? 1 : TOP_MS, (k) => {
      this.viewH = h0 + (h1 - h0) * k * k * (3 - 2 * k);
      this.frameView();
    });
    this.topEasing = false;
  }
  private get basePitch() {
    return this.top ? THREE.MathUtils.degToRad(TOP_PITCH) : PITCH;
  }
  private get wholeTop() {
    return this.top && this.viewH >= this.topH * 0.99;
  }
  private fitTop(yaw: number) {
    return topFit(this.space.grid, yaw, this.host.clientWidth, this.host.clientHeight, this.insets);
  }

  // Title screen background: the camera slowly rotates around the map. On stopping, it goes back to the nearest eighth of a turn
  // (one of the rotate's 8 angles).
  private spinning = false;
  setSpin(on: boolean) {
    if (this.spinning && !on) this.yawTarget = Math.round(this.yawTarget / (Math.PI / 4)) * (Math.PI / 4);
    this.spinning = on;
  }

  // camera frame by view height (viewH), without redoing the draw targets: it is what the action camera's zoom
  // calls every frame (it changed viewH and nothing happened, because only the resize applied it)
  frameView() {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    const a = w / h;
    // portrait phone: opens the frame until the width shows the whole map (pinch to adjust)
    const viewH = a < 1 ? (this.viewH * 1.15) / a : this.viewH;
    Object.assign(this.camera, frameBounds(w, h, viewH, this.insets));
    this.camera.updateProjectionMatrix();
  }

  // eases the rotation, tilt and focus toward their goals (real time, not the battle clock)
  update(dt: number) {
    if (this.spinning) this.yawTarget += dt * 0.15; // ~42 s per revolution: you can see the map without getting dizzy
    this.yaw += (this.yawTarget - this.yaw) * Math.min(1, dt * 10);
    this.pitch += (this.pitchTarget - this.pitch) * Math.min(1, dt * 10);
    if (this.focusGoal) this.focus.lerp(this.focusGoal, Math.min(1, dt * 6));
    if (this.viewGoal === null) return;
    this.viewH += (this.viewGoal - this.viewH) * Math.min(1, dt * 6);
    if (Math.abs(this.viewGoal - this.viewH) < 0.01) [this.viewH, this.viewGoal] = [this.viewGoal, null];
    this.frameView();
  }

  // `shake` (0 = none) and `t` (battle clock, ms) come from the scene's strong-strike shake
  place(shake: number, t: number) {
    // strong strike shake: shifts the focus only in this frame, vanishes by itself (nothing accumulates in the real focus)
    const jitter = new THREE.Vector3(Math.sin(t * 0.09) * shake, 0, Math.cos(t * 0.13) * shake);
    this.focus.add(jitter);
    this.placeCamera();
    this.focus.sub(jitter);
  }

  private placeCamera() {
    const off = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    ).multiplyScalar(CAM_DIST);
    this.camera.position.copy(this.focus).add(off);
    // up is the ground's forward, not the sky: straight down the sky is the view's own axis and lookAt loses the turn
    this.camera.up.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.camera.lookAt(this.focus);
    this.camera.updateMatrixWorld();
  }
}
