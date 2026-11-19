// Pure motion of the 3D UI kit (ui3d/): the damped spring every 3D screen moves on, the ease for what must not
// overshoot, and the short way around a ring of pages. No DOM or Three here; tested in tests/ui3d.test.ts.

export interface Spring {
  x: number;
  v: number;
  to: number;
}
export const spring = (x = 0): Spring => ({ x, v: 0, to: x });

// Damped spring toward `to`. `k` is the stiffness and `c` the damping: c below 2·√k overshoots and comes back (the
// "spring" Fernando asked for, Nov 16), c at 2·√k lands without passing. Stepped in slices of 1/120 s so a slow frame
// cannot blow it up; a frame longer than 0.1 s (a tab coming back) counts as 0.1 s
export function stepSpring(s: Spring, dt: number, k = 260, c = 22): void {
  for (let left = Math.min(dt, 0.1); left > 1e-6; left -= 1 / 120) {
    const h = Math.min(left, 1 / 120);
    s.v += (k * (s.to - s.x) - c * s.v) * h;
    s.x += s.v * h;
  }
}
export const settled = (s: Spring) => Math.abs(s.to - s.x) < 0.002 && Math.abs(s.v) < 0.02;
// already where it is going (reduced motion, a first placement): no flight
export function land(s: Spring, to = s.to): void {
  s.x = s.to = to;
  s.v = 0;
}

// A value that eases to `to` without overshooting (glow, lift, fade): `rate` per second
export const ease = (x: number, to: number, dt: number, rate: number) => to + (x - to) * Math.exp(-rate * dt);

// Shortest way from one page to another on a ring of `count` pages: a sheet slides one step forward from the last page
// to the first instead of running back through the middle one
export function pageStep(from: number, to: number, count: number): number {
  const d = (((to - from) % count) + count) % count;
  return d > count / 2 ? d - count : d;
}
