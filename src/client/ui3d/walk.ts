// Where the cursor goes on a 3D screen (Fernando, Nov 17: the keys and the pad follow what is seen): from the box in
// focus, an arrow takes the nearest box in that direction, never one to the side of it; with nothing that way the
// cursor stays where it is (no wrap, no jump). Pure and tested (tests/flow3d.test.ts): boxes in, an index out.
import type { Box } from './layout.ts';

export type Way = 'up' | 'down' | 'left' | 'right';

// `at`: the box in focus (-1: none, the cursor stays out). A box counts as "that way" when its middle is past the
// current one's along the arrow and it is aligned with it: their spans across the arrow overlap, or it lies no
// farther to the side than ahead. The nearest ahead wins; between equals, the one less to the side
export function neighbour(boxes: readonly Box[], at: number, way: Way): number {
  const from = boxes[at];
  if (!from) return at;
  const flat = way === 'left' || way === 'right',
    sign = way === 'down' || way === 'right' ? 1 : -1;
  const mid = (b: Box, along: boolean) => (along === flat ? b.x + b.w / 2 : b.y + b.h / 2);
  const span = (b: Box): [number, number] => (flat ? [b.y, b.y + b.h] : [b.x, b.x + b.w]);
  const [f0, f1] = span(from);
  let best = at,
    score = Infinity;
  boxes.forEach((b, i) => {
    if (i === at) return;
    const ahead = (mid(b, true) - mid(from, true)) * sign;
    if (ahead <= 0) return;
    const [b0, b1] = span(b),
      aside = Math.abs(mid(b, false) - mid(from, false));
    if (Math.min(f1, b1) - Math.max(f0, b0) <= 0 && aside > ahead) return;
    const s = ahead + aside / 1000;
    if (s < score) {
      score = s;
      best = i;
    }
  });
  return best;
}
