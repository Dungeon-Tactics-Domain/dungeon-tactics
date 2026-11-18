// The town's touch pad (Fernando, Nov 18, on his phone): a virtual joystick on one side and the action button on the
// other, only on a touch device. Which side is each is the player's (Options › Game › Joystick and button, dt:town-pad):
// the joystick on the left by default, a left-hander swaps them. Pure rules and the saved side here; the drawing is
// town3d/pad3d.ts over town3d/pad-layout.ts, the unseen skeleton and its pointers game/town-hud.ts.
import { store } from './store.ts';

export type PadSide = 'left' | 'right'; // where the joystick sits; the button takes the other
export const PAD_KEY = 'dt:town-pad';
export const parsePadSide = (raw: unknown): PadSide => (raw === 'right' ? 'right' : 'left');
export const padSide = () => parsePadSide(store.get(PAD_KEY));

const heard = new Set<() => void>();
export function setPadSide(side: PadSide) {
  store.set(PAD_KEY, side);
  for (const fn of heard) fn();
}
// the open town redraws its pad under the Options window; returns how to stop listening
export function onPadSide(fn: () => void): () => void {
  heard.add(fn);
  return () => heard.delete(fn);
}

// The stick's full tilt is the knob at `travel` px from the base's middle (pad-layout.ts); a finger dragged further is
// held at length 1. A screen vector, x right and y down, as town-map.ts `stick` takes it (it adds the dead zone)
export function stickVector(dx: number, dy: number, travel: number) {
  const m = Math.hypot(dx, dy);
  if (!(m > 0) || !(travel > 0)) return { x: 0, y: 0 };
  const k = Math.min(1, m / travel) / m;
  return { x: dx * k, y: dy * k };
}
