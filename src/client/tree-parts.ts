// The parts every painted tree is built from: the palettes, the trunk with its flare and roots, the branches, the crown
// light and the closing of the piece at height 1. The species are assembled in trees.ts.
import * as THREE from 'three';
import { piece, type Ring, ramp, tones, tube, V } from './painted.ts';

export const BARK = tones('#2e2016', '#523b27', '#77593c', '#9c8059');
export const ASH = tones('#2a2622', '#4d4740', '#746c62', '#9a9287'); // dry wood
const MOSS = new THREE.Color('#3d4f24');
export const LEAF = {
  green: tones('#0f2616', '#1c4020', '#2c5c24', '#44792b', '#6f9c3a'),
  olive: tones('#18250f', '#2e3d1b', '#4a5a22', '#6f7a2e', '#9a9a48'),
  teal: tones('#0c211c', '#163a2a', '#245438', '#3c7446', '#679a5c'),
  fir: tones('#091a14', '#122e20', '#1c432d', '#2f603c', '#568756'),
};
export const LEAF_UV = 2.2; // tiny paint patches on the crown: they read as leaf tufts
export type Pal = THREE.Color[];
export type Rnd = () => number;

interface TrunkOpts {
  r: number;
  th: number;
  roots: number;
  lean: number;
  bark: Pal;
  taper?: number;
  lite?: boolean;
  reach?: number;
}
// Upright trunk with a wide flare at the ground and one buttress per root; each root leaves the buttress, runs along the ground and
// dives into the soil. Returns the trunk center at each height (branches and crown start from it)
export function trunk(parts: THREE.BufferGeometry[], rnd: Rnd, o: TrunkOpts) {
  const dir = rnd() * Math.PI * 2,
    bend = (rnd() - 0.5) * 0.05,
    seed = rnd() * 50,
    moss = rnd() < 0.6 ? rnd() * 6 : -1;
  const center = (y: number) => {
    const t = Math.max(0, y) / o.th,
      lean = o.lean * t ** 1.6,
      s = Math.sin(t * Math.PI) * bend;
    return V(Math.cos(dir) * lean + s, y, Math.sin(dir) * lean - s);
  };
  const roots = Array.from({ length: o.roots }, (_, k) => (k / o.roots) * Math.PI * 2 + rnd() * 0.9);
  const flare = Math.max(0.035, o.r * 0.7); // height at which the flare fades out
  const ys = o.lite
    ? [-0.12, 0, flare * 1.4, o.th * 0.55, o.th]
    : [-0.12, 0, flare * 0.5, flare * 1.2, flare * 2.2, o.th * 0.45, o.th * 0.75, o.th];
  const radius = (y: number) =>
    o.r *
    (1 - (o.taper ?? 0.26) * (Math.max(0, y) / o.th)) *
    (1 + 0.5 * Math.exp(-Math.max(0, y) / flare)) *
    (y < 0 ? 1.12 : 1);
  const bark = (p: THREE.Vector3, _i: number, a: number) => {
    // tone bands along the trunk (the brushstroke), lighter going up, dark at the foot; moss on one side, near the ground
    const c = ramp(
      o.bark,
      0.3 +
        0.2 * Math.sin(a * 3 + seed) +
        0.12 * Math.sin(a * 7 + seed * 1.7 + p.y * 14) +
        0.28 * Math.min(1, p.y / 0.35) -
        (p.y < 0.02 ? 0.12 : 0),
    );
    return moss < 0
      ? c
      : c.lerp(MOSS, 0.75 * THREE.MathUtils.clamp(1 - p.y / (flare * 3), 0, 1) * Math.max(0, Math.sin(a + moss)));
  };
  parts.push(
    tube(
      ys.map((y) => ({ p: center(y), r: radius(y) })),
      o.lite ? 6 : 12,
      bark,
      {
        flat: true,
        v: 0.9,
        shape: (a, i) =>
          1 +
          (o.lite ? 0 : 0.45) *
            Math.exp(-Math.max(0, ys[i]) / flare) *
            Math.max(0, ...roots.map((r) => Math.max(0, Math.cos(a - r)) ** 4)),
      },
    ),
  );
  for (const a of o.lite ? [] : roots) {
    if (rnd() < 0.2) continue; // not every buttress becomes a visible root
    const reach = Math.min(o.reach ?? 0.17, o.r * (2.6 + rnd() * 1.4)),
      side = (rnd() - 0.5) * o.r * 1.6;
    const at = (d: number, s: number, y: number) =>
      V(Math.cos(a) * d - Math.sin(a) * s, y, Math.sin(a) * d + Math.cos(a) * s);
    const rings: Ring[] = [
      { p: at(o.r * 0.9, 0, flare * 1.1), r: o.r * 0.62 },
      { p: at(o.r * 1.9, side * 0.2, flare * 0.6), r: o.r * 0.5 },
      { p: at(reach * 0.72, side * 0.7, 0.014), r: o.r * 0.34 },
      { p: at(reach, side * 1.3, -0.04), r: o.r * 0.18 },
      { p: at(reach * 1.15, side * 1.5, -0.13), r: 0.004 },
    ];
    parts.push(tube(rings, 5, (p, i) => bark(p, i, a + i * 0.4).multiplyScalar(1 - i * 0.09), { v: 2 }));
  }
  return center;
}

// curved branch from `from` to `to`, tapering
export function limb(
  parts: THREE.BufferGeometry[],
  from: THREE.Vector3,
  to: THREE.Vector3,
  r0: number,
  r1: number,
  bark: Pal,
  rnd: Rnd,
) {
  const mid = from
    .clone()
    .lerp(to, 0.5)
    .add(V((rnd() - 0.5) * 0.05, 0.035, (rnd() - 0.5) * 0.05));
  const curve = new THREE.QuadraticBezierCurve3(from, mid, to),
    s = rnd() * 9;
  const rings = [0, 0.4, 0.75, 1].map((t) => ({ p: curve.getPoint(t), r: r0 + (r1 - r0) * t }));
  parts.push(tube(rings, 5, (_p, i, a) => ramp(bark, 0.42 + 0.2 * Math.sin(a * 2 + s) + i * 0.05), { v: 2 }));
}

// painted crown light: each tuft is light on top and dark below, and the whole crown brightens toward the top
export const leafTint =
  (pal: Pal, c: THREE.Vector3, ry: number, lo: number, hi: number, jit: number) =>
  (p: THREE.Vector3, d: THREE.Vector3) =>
    ramp(
      pal,
      0.12 +
        0.52 * THREE.MathUtils.clamp(((p.y - c.y) / ry) * 0.5 + 0.5, 0, 1) ** 1.6 +
        0.28 * THREE.MathUtils.clamp((p.y - lo) / (hi - lo), 0, 1) +
        jit +
        0.05 * Math.sin(d.x * 9 + d.z * 7 + jit * 40),
    );

// closes the piece at height 1; the width is the crown's (the flare and roots are left out of the measure)
export function finish(parts: THREE.BufferGeometry[], tall?: number): THREE.Group {
  let top = 0;
  for (const g of parts) {
    g.computeBoundingBox();
    top = Math.max(top, g.boundingBox!.max.y);
  }
  let w = 0,
    foot = 0;
  for (const g of parts) {
    g.scale(1 / top, 1 / top, 1 / top);
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) > 0.2) w = Math.max(w, Math.abs(p.getX(i)), Math.abs(p.getZ(i)));
      else if (p.getY(i) > -0.06) foot = Math.max(foot, Math.hypot(p.getX(i), p.getZ(i)));
    }
  }
  // foot: radius of the foot (the flare and roots down to where they dive); the scene does not let it exceed the flat core of the tree's tile
  return piece(parts, w * 2, 1, { foot, ...(tall ? { tall } : {}) });
}
