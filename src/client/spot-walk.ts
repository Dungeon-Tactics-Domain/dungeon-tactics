// The cursor that walks by where things are on screen (Fernando, Nov 17: down goes to what is straight below, sideways
// to what is beside, never by the order of a list and never on a slant): from one box, the nearest box in a direction.
// Pure, tested in tests/spot-walk.test.ts; dialog.ts walks a `.spot-walk` window with it (the 3D expedition map), keys
// and pad alike.
export type WalkDir = 'up' | 'down' | 'left' | 'right';
interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

// The index of the box to go to, `from` itself when nothing lies that way (an edge: the cursor stays, it never wraps).
// A box counts when its middle is past `from`'s in the direction and the two are in line: they overlap across the
// direction (the same column going up or down, the same row going sideways; a wide plaque is in line with every place
// level with it). The nearest of those wins, and of two as near the one whose middle is less off
export function nextSpot(boxes: readonly Box[], from: number, dir: WalkDir): number {
  const a = boxes[from];
  if (!a) return from;
  const upright = dir === 'up' || dir === 'down',
    sign = dir === 'down' || dir === 'right' ? 1 : -1;
  const mid = (b: Box) => [b.x + b.width / 2, b.y + b.height / 2];
  const span = (b: Box) => (upright ? [b.x, b.x + b.width] : [b.y, b.y + b.height]);
  const [ax, ay] = mid(a),
    [a0, a1] = span(a);
  let best = from,
    least = Infinity;
  boxes.forEach((b, i) => {
    if (i === from) return;
    const [bx, by] = mid(b),
      [b0, b1] = span(b);
    const ahead = sign * (upright ? by - ay : bx - ax);
    if (ahead <= 1 || b0 >= a1 || a0 >= b1) return;
    const cost = ahead + Math.abs(upright ? bx - ax : by - ay) / 1000;
    if (cost < least) {
      least = cost;
      best = i;
    }
  });
  return best;
}
