// Two fingers on the map (Fernando, Nov 18: one finger drags the camera, two turn and zoom it): what their twist asks
// of the camera, which turns in eighths. Pure and tested (tests/gesture.test.ts); touch-input.ts feeds it.

// the twist that turns the camera one of its 8 angles: 30°, past what a pinch wobbles and short of a wrist's reach
export const TWIST_STEP = Math.PI / 6;

// the angle of the line from finger a to finger b, on screen (y down: it grows clockwise)
export const angleOf = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.atan2(b.y - a.y, b.x - a.x);

// `acc`: the twist kept since the last turn; `from`, `to`: the fingers' angle before and after a move. Returns the turn to
// make now (1 clockwise on screen, -1 the other way, 0 none) and the twist left over
export function twist(acc: number, from: number, to: number): { acc: number; turn: -1 | 0 | 1 } {
  let d = to - from;
  // the short way round: atan2 jumps from π to -π
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  const sum = acc + d;
  if (sum >= TWIST_STEP) return { acc: sum - TWIST_STEP, turn: 1 };
  if (sum <= -TWIST_STEP) return { acc: sum + TWIST_STEP, turn: -1 };
  return { acc: sum, turn: 0 };
}
