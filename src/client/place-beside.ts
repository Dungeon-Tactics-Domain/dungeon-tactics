// Where a menu goes beside the acting character on screen (FFT's menu): pure geometry for the HUD, tested.
import { lu } from './ui3d/layout.ts';
import { wrapLines } from './wrap-lines.ts';

// Where the help line ends on a page `pageW` wide, in px from the page's top (0 while it says nothing): the menus
// beside the unit start below it. `top`: a panel's margin to the page's top. The line hangs from the page's middle, so
// it is never wider than half the page, nor than 760 px: 16 px words on 20.8 px rows, in 8 px of padding (12 px at the
// sides) and a 2 px frame. `measure`: the width of a text at that size. With no HTML to measure (Nov 18)
export const helpEnd = (text: string, pageW: number, top: number, measure: (s: string) => number) =>
  text ? top + 20 + lu(20.8) * wrapLines(text, Math.min(760, pageW / 2) - 28, measure).length : 0;

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
  // no side has room at all (a phone, the 460 px "Execute?" on a 768 px tablet): beside it the panel sat on the character.
  // It goes below the character (which spans 1.5 half widths up and down), or above, clear of `avoid` when one of them is
  if (!fits('right') && !fits('left')) {
    const left = clamp(a.x - w / 2, area.left, area.right - w);
    const rows = [a.y + 1.5 * a.r + gap, a.y - 1.5 * a.r - gap - h].filter(
      (t) => t >= area.top && t + h <= area.bottom,
    );
    const top = rows.find((t) => !covers(left, t)) ?? rows[0];
    if (top !== undefined) return { left, top, side, free: false };
  }
  return { left: clamp(xs[side], area.left, area.right - w), top: tops[0], side, free: false };
}
