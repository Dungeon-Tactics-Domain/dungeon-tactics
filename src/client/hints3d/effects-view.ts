// Pure side of the 3D effects over the battle (effects3d.ts): what a floating number looks like and where it is along
// its 1.5 s, how the objective banner stretches in, and where each piece of confetti is as it falls. No DOM or Three
// here; tested in tests/effects3d.test.ts.
import type { NumberKind } from '../hit-weight.ts';
import { lu } from '../ui3d/layout.ts';

// What the number's classes say (scene/unit-hits.ts: "phys crit", "magic", "heal", "miss"): the kind picks the colour,
// magic also gets its star (colour is never the only signal), a strong strike the gold ring
export function numberLook(cls: string): { kind: NumberKind; crit: boolean } {
  const words = cls.split(' ');
  return {
    kind: (['magic', 'heal', 'miss'] as const).find((k) => words.includes(k)) ?? 'phys',
    crit: words.includes('crit'),
  };
}

// FFT's rhythm (Nov 12; the CSS `pop` keyframes): it jumps out of the chest, bounces, holds still to be read and leaves
// upwards. [share of its time, rise in its own heights, scale, opacity]
const POP = [
  [0, 0, 0.6, 0],
  [0.08, 0.9, 1.15, 1],
  [0.16, 0.4, 1, 1],
  [0.22, 0.6, 1, 1],
  [0.28, 0.5, 1, 1],
  [0.75, 0.5, 1, 1],
  [1, 0.8, 1, 0],
];
export interface Pose {
  rise: number;
  scale: number;
  alpha: number;
}
// `k`: 0 to 1 of the number's time. Reduced motion: it stands where it is read, the whole time
export function numberPose(k: number, still: boolean): Pose {
  if (still) return { rise: 0.5, scale: 1, alpha: 1 };
  const t = Math.max(0, Math.min(1, k));
  const i = Math.max(
    1,
    POP.findIndex((f) => f[0] >= t),
  );
  const [a, b] = [POP[i - 1], POP[i]];
  const u = (t - a[0]) / (b[0] - a[0]);
  const mix = (n: number) => a[n] + (b[n] - a[n]) * u;
  return { rise: mix(1), scale: mix(2), alpha: mix(3) };
}

// The objective banner (2.2 s): it comes in stretching sideways over its first 12%, holds, and fades over its last 20%
export const ANNOUNCE = { ms: 2200, out: 0.8 };
export function announceStretch(k: number, still: boolean): number {
  if (still) return 1;
  const u = Math.max(0, Math.min(1, k / 0.12));
  return 0.3 + 0.7 * (1 - (1 - u) ** 2);
}

// Victory confetti: 60 slips of paper, each falling at its own pace from above the screen and tumbling; 3.4 s for the
// slowest to land (0.8 s of delay and 2.6 s of fall)
export const CONFETTI = { count: 60, ms: 3400, colors: ['#f2c14e', '#4aa3ff', '#ff6b6b', '#7dffa8', '#ffffff'] };
export interface Slip {
  x: number; // 0 to 1 of the screen's width
  delay: number; // s
  fall: number; // s to cross the screen
  color: number; // index in CONFETTI.colors
  spin: [number, number, number]; // rad/s around x, y and z
  sway: number; // px side to side
}
// `rand`: Math.random in the game (cosmetic), a fixed one in the tests
export const confettiSlips = (rand: () => number, n = CONFETTI.count): Slip[] =>
  Array.from({ length: n }, (_, i) => ({
    x: rand(),
    delay: rand() * 0.8,
    fall: 1.6 + rand(),
    color: i % CONFETTI.colors.length,
    spin: [4 + rand() * 6, 3 + rand() * 5, (rand() - 0.5) * 6],
    sway: 8 + rand() * 18,
  }));
// Where a slip is `t` s after the victory on a screen of w by h px, y down; null before it starts and once it is past
// the foot of the screen
export function slipAt(c: Slip, t: number, w: number, h: number) {
  const k = (t - c.delay) / c.fall;
  if (k < 0 || k > 1) return null;
  const a = t - c.delay;
  return {
    x: c.x * w + Math.sin(a * 3 + c.x * 40) * c.sway,
    y: -12 + k * (h * 1.05 + 12),
    rx: a * c.spin[0],
    ry: a * c.spin[1],
    rz: a * c.spin[2],
  };
}

// The performance counter's plate (fps.ts), with no DOM: on the page's right edge under the corner menu, as wide as its
// widest line. `safe`: the notch (ui3d/safe-area.ts); the counter keeps the page's corner in the `frame` layout too
export const FPS = { size: 16, font: 'ui-monospace, Consolas, monospace' };
export function fpsBox(pageW: number, safe: { top: number; right: number }, widths: number[]) {
  const line = lu(FPS.size * 1.35),
    w = Math.max(...widths) + 16;
  return { x: pageW - 12 - safe.right - w, y: 72 + safe.top, w, h: 8 + widths.length * line, line };
}
