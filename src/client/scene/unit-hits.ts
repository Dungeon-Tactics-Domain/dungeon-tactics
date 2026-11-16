// How damage lands on a unit (hit, bump, fall, spikes): the hit-stop and flash, the recoil or the slide into rock, the
// camera shake, the number and the death slow motion; also the reduced-motion check every gesture reads.
import * as THREE from 'three';
import { canStand, inBounds, isDeep, standH, subOf, tileAt } from '../../shared/battle/grid.ts';
import { cellsOf, squareH, unitAt } from '../../shared/battle/pathing.ts';
import type { BattleEvent, BattleState, Pos } from '../../shared/battle/types.ts';
import { baseDef, UNIT_DEFS } from '../../shared/battle/units.ts';
import { sparks } from '../fx.ts';
import {
  fatal,
  isBig,
  lastOfSide,
  numberKind,
  numberPx,
  parseSlowmo,
  SLOWMO_KEY,
  shoved,
  WEIGHT,
} from '../hit-weight.ts';
import { store } from '../store.ts';
import { TIMING } from '../timing.ts';
import { chestOf, flash, playClip, setBar, type UnitView } from './unit-view.ts';
import type { Units } from './units.ts';

const UP = new THREE.Vector3(0, 1, 0);
// reduced motion: no recoil, bounce, camera shake or death slow motion; the hit-stop is a pause and stays
export const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// what one sequence of events carries from event to event
export interface Sequence {
  // a hit names neither the ability nor who struck: the last attack says both (the number's colour, the recoil's way)
  striker: string | null;
  center: Pos | null; // the attack's aimed tile: an area pushes away from it
  magic: boolean;
  slowed: boolean;
  pushed: Map<string, THREE.Vector3>; // each unit's last push, the way a bump meets what stopped it
}

// the damage event `events[i]` on the unit `v`
export async function takeDamage(
  u: Units,
  v: UnitView,
  events: BattleEvent[],
  i: number,
  state: BattleState,
  s: Sequence,
) {
  const e = events[i] as Extract<BattleEvent, { k: 'hit' | 'bump' | 'fall' | 'spike' }>;
  const k = subOf(u.space.grid);
  v.hp -= e.dmg;
  const max = UNIT_DEFS[v.def].hp,
    dies = fatal(events, i);
  // a strong strike (25% of life or more, only from an attack: a fall, a bump or spikes are not one, or a 2-level
  // fall would always be): double pause, the camera shakes, the number bigger with a gold edge. With 30%, none of
  // 10 strikes in a Skirmish went through (measured Nov 12): the effect must show up now and then
  const big = e.k === 'hit' && isBig(e.dmg, max);
  // one slow motion per sequence: an area strike that downs three would hold the battle ~10 s
  if (
    dies &&
    !s.slowed &&
    lastOfSide(
      events,
      i,
      v.team,
      state.units.filter((x) => x.team === v.team).length,
      (id) => u.views.get(id)?.team ?? v.team,
    )
  )
    s.slowed = deathCam(u, v);
  // a bump into rock: the body slides to it and stops dead, with sparks; against a unit, the map's edge, deep water
  // or on the way back to where it last rested it only trembles
  const way = e.k === 'bump' ? (s.pushed.get(e.unit) ?? pushWay(u, v, s.center, s.striker)) : null;
  const wall = way && behind(u, v, e.unit, axis(way), state) === 'wall' ? axis(way) : null;
  if (wall) await sway(u, v, wall.clone().multiplyScalar(WEIGHT.wall * k), TIMING.wallSlide);
  // magic also gets a ✦ after the number (style.css): the colour is never the only signal
  const kind = numberKind(e, s.magic);
  u.float(e.unit, `-${e.dmg}`, `${kind}${big ? ' crit' : ''}`, numberPx(e.dmg, max, big));
  if (wall && !still()) void sparks(u.scene, u.animate, chestOf(v).addScaledVector(wall, 0.5 * k));
  if (big) u.quake(WEIGHT.quake, TIMING.quake);
  else if (wall) u.quake(WEIGHT.quakeLand, TIMING.quakeLand);
  await impact(u, v, big);
  setBar(v, u.time, TIMING.hpDrain);
  // the recoil steps half a tile back along the push's axis, only onto level open ground and only for a unit a push
  // can move (simulatePush: a large one does not), and not when the strike's own push moves it
  const from = e.k === 'hit' && !shoved(events, i) ? away(u, s.striker, v) : null;
  const back =
    from && (UNIT_DEFS[baseDef(v.def)].size ?? 1) === 1 && behind(u, v, e.unit, axis(from), state) === 'free'
      ? axis(from)
      : null;
  if (wall) void sway(u, v, new THREE.Vector3(), TIMING.wallBack);
  else if (back)
    void sway(u, v, back.multiplyScalar(WEIGHT.recoil * k), TIMING.recoil).then(() =>
      sway(u, v, new THREE.Vector3(), TIMING.recoilBack),
    );
  if (v.hp > 0) playClip(v, 'Hit_A', true);
  // the blow that kills goes straight into the fall (Death_A), still in the slow motion
  if (!dies) await u.time.wait(e.k === 'hit' ? TIMING.hit : TIMING.crash);
  else await u.time.wait(TIMING.recoil);
  if (v.hp > 0) playClip(v, 'Idle');
}

// Impact: everything stops for an instant (hit-stop, doubled on a strong strike), the target flashes white and then
// trembles, the trembling fading
async function impact(u: Units, v: UnitView, big: boolean) {
  const stop = big ? TIMING.hitStopBig : TIMING.hitStop;
  u.frozenUntil = u.time.t + stop;
  flash(v, u.time, '#ffffff', 1, stop * 1.6);
  await u.time.wait(stop);
  const amp = WEIGHT.tremble * subOf(u.space.grid);
  if (v.body && !still())
    void u.time.animate(TIMING.shake, (k) => (v.body!.position.x = Math.sin(k * Math.PI * 6) * amp * (1 - k)));
}

// the body's offset from its tile (world units), eased out over `ms`; reduced motion keeps it on its tile
function sway(u: Units, v: UnitView, to: THREE.Vector3, ms: number): Promise<void> {
  if (still()) return Promise.resolve();
  const a = v.sway.position.clone(),
    b = to.clone().applyAxisAngle(UP, -v.holder.rotation.y);
  return u.time.animate(ms, (k) => v.sway.position.lerpVectors(a, b, 1 - (1 - k) * (1 - k)));
}

// flat direction from the unit `from` to `v`; null when there is none (no attacker, its own spikes)
function away(u: Units, from: string | null, v: UnitView): THREE.Vector3 | null {
  const a = from ? u.views.get(from) : undefined;
  if (!a) return null;
  const d = v.holder.position.clone().sub(a.holder.position).setY(0);
  return d.lengthSq() > 0.01 ? d.normalize() : null;
}

// flat direction a push takes: away from the area's centre, or from the one who struck when the unit stands on it (as
// simulatePush reads it)
function pushWay(u: Units, v: UnitView, center: Pos | null, striker: string | null): THREE.Vector3 | null {
  if (!center) return away(u, striker, v);
  const d = v.holder.position.clone().sub(u.space.world(center)).setY(0),
    half = (UNIT_DEFS[v.def].size ?? 1) / 2;
  if (Math.abs(d.x) < half && Math.abs(d.z) < half) return away(u, striker, v);
  return d.lengthSq() > 0.01 ? d.normalize() : null;
}

// the push's main axis, as the rule picks it (x when it is at least as long as z)
function axis(d: THREE.Vector3): THREE.Vector3 {
  return Math.abs(d.x) >= Math.abs(d.z) ? new THREE.Vector3(Math.sign(d.x)) : new THREE.Vector3(0, 0, Math.sign(d.z));
}

// What the unit's square meets one cell along `axis`, read with the rule's heights (standH, so the body wading in
// shallow water is not taken for a step): 'free' (level open ground, no one there), 'wall' (wall terrain or a step up:
// rock the body hits) or 'other' (the map's edge, deep water, a unit, a drop)
function behind(u: Units, v: UnitView, id: string, axis: THREE.Vector3, state: BattleState): 'free' | 'wall' | 'other' {
  const g = u.space.grid,
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

// the blow that downs the last of a side: slow motion and the camera closes in on it, unless Options turns it off
function deathCam(u: Units, v: UnitView): boolean {
  if (still() || !parseSlowmo(store.json(SLOWMO_KEY))) return false;
  u.slowUntil = u.time.t + TIMING.slowmo;
  void u.cam.closeUp(chestOf(v), WEIGHT.zoom, TIMING.closeUp);
  return true;
}
