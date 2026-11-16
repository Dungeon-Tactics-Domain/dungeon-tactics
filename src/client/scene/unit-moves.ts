// A unit travelling in battle: the walk step by step with its jumps, and a push, which off a drop falls a gravity arc
// and lands with dust, a bounce and a light camera shake.
import type * as THREE from 'three';
import { dist, subOf, tileAt } from '../../shared/battle/grid.ts';
import { squareH } from '../../shared/battle/pathing.ts';
import type { Pos } from '../../shared/battle/types.ts';
import { UNIT_DEFS } from '../../shared/battle/units.ts';
import { dust } from '../fx.ts';
import { WEIGHT } from '../hit-weight.ts';
import { isJump, jumpAirMs, stepMs, TIMING } from '../timing.ts';
import { rampLink } from './space.ts';
import { still } from './unit-hits.ts';
import { playClip, type UnitView, walk } from './unit-view.ts';
import type { Units } from './units.ts';

// by step (Nov 13, Fernando's request: slow walking and realistic jump)
export async function walkPath(u: Units, v: UnitView, path: Pos[]) {
  walk(v);
  const n = path.length - 1,
    size = UNIT_DEFS[v.def].size ?? 1;
  for (let i = 1; i <= n; i++) {
    const a = u.squareAt(v.def, path[i - 1]),
      b = u.squareAt(v.def, path[i]);
    v.holder.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
    // jumps when the standing height changes or flies a gap (the same math as the Jump and the footstep sound, stepMs); a study ramp is flat
    const dh = rampLink(u.space.grid, path[i - 1], path[i])
      ? 0
      : squareH(u.space.grid, path[i], size) - squareH(u.space.grid, path[i - 1], size);
    const tiles = dist(path[i - 1], path[i]) / subOf(u.space.grid);
    if (isJump(dh, tiles)) {
      await jump(u, v, a, b, Math.max(Math.abs(dh), tiles));
      if (i < n) walk(v);
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
    const from = path[i - 1],
      to = path[i];
    // the ramp's ground line is a 1-tile unit's; a square goes straight between its middles
    const ramp = size === 1 && !!(tileAt(u.space.grid, from).ramp || tileAt(u.space.grid, to).ramp);
    await u.time.animate(stepMs(0, tiles), (k) => {
      v.holder.position.lerpVectors(a, b, ease(k));
      if (ramp) v.holder.position.y = u.space.walkY(from, to, ease(k));
    });
  }
  playClip(v, 'Idle');
}

// Jump of one step, like FFT's leap: crouches still, flies in an arc to the tile and lands. The top of the arc passes 0.4
// levels above the highest tile, so climbing looks like a push and descending like a fall; `levels` lengthens the flight
async function jump(u: Units, v: UnitView, a: THREE.Vector3, b: THREE.Vector3, levels: number) {
  playClip(v, 'Jump_Start', true, 0.6 / (TIMING.jumpCrouch / 1000));
  await u.time.wait(TIMING.jumpCrouch);
  playClip(v, 'Jump_Idle');
  const c = Math.max(a.y, b.y) + 0.4 * u.space.step - (a.y + b.y) / 2;
  await u.time.animate(jumpAirMs(levels), (k) =>
    v.holder.position.lerpVectors(a, b, k).setY(a.y + (b.y - a.y) * k + 4 * c * k * (1 - k)),
  );
  playClip(v, 'Jump_Land', true, 0.67 / (TIMING.jumpLand / 1000));
  await u.time.wait(TIMING.jumpLand);
}

// pushed to `to`; returns the push's flat direction (the way a bump meets what stopped it)
export async function push(u: Units, v: UnitView, to: Pos): Promise<THREE.Vector3> {
  const a = v.holder.position.clone(),
    b = u.squareAt(v.def, to);
  const d = b.clone().sub(a).setY(0).normalize();
  // a drop by the rule's heights, as the walk reads them: shallow water and a ramp are drawn lower without being one
  const size = UNIT_DEFS[v.def].size ?? 1,
    from = { x: to.x - Math.round(d.x), y: to.y - Math.round(d.z) };
  const grid = u.space.grid;
  if (!rampLink(grid, from, to) && squareH(grid, from, size) > squareH(grid, to, size)) await fall(u, v, a, b);
  else await u.time.animate(TIMING.push, (s) => v.holder.position.lerpVectors(a, b, s));
  return d;
}

// a push off a drop: a real gravity arc, then dust, a short bounce and a light camera shake where it lands (the fall's
// number comes with the next event)
async function fall(u: Units, v: UnitView, a: THREE.Vector3, b: THREE.Vector3) {
  const k = subOf(u.space.grid),
    g = WEIGHT.gravity * k,
    up = WEIGHT.hop * k;
  const T = (up + Math.sqrt(up * up + 2 * g * Math.max(0, a.y - b.y))) / g; // seconds until it touches b's ground
  await u.time.animate(T * 1000, (s) =>
    v.holder.position.lerpVectors(a, b, s).setY(a.y + up * s * T - (g * (s * T) ** 2) / 2),
  );
  v.holder.position.copy(b);
  if (still()) return; // reduced motion: no dust, bounce or shake
  void dust(u.scene, u.animate, b.clone());
  void u.time.animate(TIMING.bounce, (s) => (v.sway.position.y = WEIGHT.bounce * k * 4 * s * (1 - s)));
  u.quake(WEIGHT.quakeLand, TIMING.quakeLand);
}
