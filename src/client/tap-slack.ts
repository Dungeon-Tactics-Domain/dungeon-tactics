// Tap with slack (Nov 20): a half-tile unit is about 20 px on a phone, under the 44 px touch target, so a tap that misses
// every drawn body still takes the nearest unit whose body centre on screen is within half that target.
export const TAP_SLACK_PX = 22; // half of the design system's 44 px target (section 8)

// the id of the point nearest the tap within `slack` px (canvas px), or null; a tie keeps the first one listed
export function nearestTap<T>(
  tap: { x: number; y: number },
  points: { id: T; x: number; y: number }[],
  slack = TAP_SLACK_PX,
): T | null {
  let best: T | null = null;
  let bestD = slack * slack;
  for (const p of points) {
    const d = (p.x - tap.x) ** 2 + (p.y - tap.y) ** 2;
    if (d <= bestD && (best === null || d < bestD)) {
      best = p.id;
      bestD = d;
    }
  }
  return best;
}
