// Where the town's touch pad sits (town-pad.ts), in page px with no DOM: the joystick's base and the action button as
// circles in the two bottom corners, inside the margins and the notch (`inset`, ui3d/layer.ts), so they never reach the
// town's name, the gear or ↺ ↻ at the top. A circle is never under a finger's 44 px (design system, section 8), and the
// joystick's touch zone is a square around its base, as big as the page leaves. Pure and tested (tests/town-pad.test.ts).
import type { PadSide } from '../town-pad.ts';
import { type Box, lu } from '../ui3d/layout.ts';

const GAP = 8; // from the margins to a circle
export const STICK_MIN = 96; // the base's diameter, px: a thumb's span
export const USE_MIN = 88; // the button's
export const TRAVEL = 0.6; // the knob's full tilt, of the base's radius
const ZONE = 1.4; // the joystick's touch zone, of the base's radius

export interface Circle {
  cx: number;
  cy: number;
  r: number;
}
export interface PadSpec {
  w: number;
  h: number;
  s: number; // ui3d/layer.ts: one reference px in page px
  inset: { right: number; bottom: number; left: number };
  side: PadSide; // where the joystick sits
}

export function padLayout(q: PadSpec) {
  const d = Math.max(STICK_MIN, lu(160 * q.s)),
    u = Math.max(USE_MIN, lu(120 * q.s)),
    at = (size: number, left: boolean): Circle => ({
      cx: left ? q.inset.left + GAP + size / 2 : q.w - q.inset.right - GAP - size / 2,
      cy: q.h - q.inset.bottom - GAP - size / 2,
      r: size / 2,
    }),
    stick = at(d, q.side === 'left'),
    use = at(u, q.side !== 'left'),
    // the zone keeps inside the page: a corner leaves less room around the base than the zone asks
    half = Math.max(stick.r, Math.min(stick.r * ZONE, stick.cx, q.w - stick.cx, stick.cy, q.h - stick.cy)),
    zone: Box = { x: stick.cx - half, y: stick.cy - half, w: 2 * half, h: 2 * half };
  return { stick, use, zone, travel: stick.r * TRAVEL, useBox: box(use) };
}
export type PadLayout = ReturnType<typeof padLayout>;
export const box = (c: Circle): Box => ({ x: c.cx - c.r, y: c.cy - c.r, w: 2 * c.r, h: 2 * c.r });
