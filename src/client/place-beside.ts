// Where a menu goes beside the acting character on screen (FFT's menu): pure geometry for the HUD, tested.

// Panel beside the character, like FFT's menu: to its right; with no room, to its left; always inside `area` (the part
// of the screen free of the HUD). Centered on the character's height; if it would cover something in `avoid` (the turn list, the target of
// "Execute?"), it moves down or up beside it until clear, as close as possible. `prefer` 'left' tries the left
// first ("Execute?" avoids the target's side). Pure for the test.
export interface Anchor {
  x: number;
  y: number;
  r: number;
} // character's center on screen and its half width, in px
export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
export function placeBeside(
  a: Anchor,
  w: number,
  h: number,
  area: Rect,
  prefer: 'right' | 'left' = 'right',
  avoid: Rect[] = [],
  gap = 12,
) {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const xs = { right: a.x + a.r + gap, left: a.x - a.r - gap - w };
  const fits = (s: 'right' | 'left') => xs[s] >= area.left && xs[s] + w <= area.right;
  const sides: ('right' | 'left')[] = prefer === 'right' ? ['right', 'left'] : ['left', 'right'];
  const covers = (l: number, t: number) =>
    avoid.some((o) => l < o.right && l + w > o.left && t < o.bottom && t + h > o.top);
  const mid = a.y - h / 2;
  const tops = [mid, ...avoid.flatMap((o) => [o.bottom + gap, o.top - gap - h])]
    .map((t) => clamp(t, area.top, area.bottom - h))
    .sort((p, q) => Math.abs(p - mid) - Math.abs(q - mid));
  for (const side of sides.filter(fits)) {
    const top = tops.find((t) => !covers(xs[side], t));
    if (top !== undefined) return { left: xs[side], top, side, free: true };
  }
  // nothing free (narrow screen, character off screen): the side that fits, clamped inside the area
  const side = fits(sides[0]) || !fits(sides[1]) ? sides[0] : sides[1];
  return { left: clamp(xs[side], area.left, area.right - w), top: tops[0], side, free: false };
}
