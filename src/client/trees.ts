// Painted trees, built in code (Nov 13, Fernando's requests: "trees in the vibe of the terrain", then "matching the
// painted ground, fitting into the terrain, many types and sizes, including tall pines and big trunks" as in the
// FFT forests; our own design, nothing copied). On open maps each KayKit tree model becomes a set of
// variations assembled here: tufted-crown broadleaf, old thick-trunked tree, skirted pine, tall bare-trunk pine, dead tree
// and bush. The trunk opens into a flare with buttresses and roots that dive into the ground (the piece goes down
// below y = 0). Piece of height 1, one mesh and one material (painted.ts); the caller scales and picks the variation.
import * as THREE from 'three';
import { lump, piece, type Ring, ramp, rng, tones, tube, V } from './painted.ts';

const BARK = tones('#2e2016', '#523b27', '#77593c', '#9c8059');
const ASH = tones('#2a2622', '#4d4740', '#746c62', '#9a9287'); // dry wood
const MOSS = new THREE.Color('#3d4f24');
const LEAF = {
  green: tones('#0f2616', '#1c4020', '#2c5c24', '#44792b', '#6f9c3a'),
  olive: tones('#18250f', '#2e3d1b', '#4a5a22', '#6f7a2e', '#9a9a48'),
  teal: tones('#0c211c', '#163a2a', '#245438', '#3c7446', '#679a5c'),
  fir: tones('#091a14', '#122e20', '#1c432d', '#2f603c', '#568756'),
};
const LEAF_UV = 2.2; // tiny paint patches on the crown: they read as leaf tufts
type Pal = THREE.Color[];
type Rnd = () => number;

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
function trunk(parts: THREE.BufferGeometry[], rnd: Rnd, o: TrunkOpts) {
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
function limb(
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
const leafTint =
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
function finish(parts: THREE.BufferGeometry[], extra: Record<string, unknown> = {}): THREE.Group {
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
  return piece(parts, w * 2, 1, { foot, ...extra });
}

interface LeafOpts {
  r: number;
  th: number;
  spread: number;
  pal: Pal;
  top?: number;
  squash?: number;
  limbs?: number;
  roots?: number;
  stubs?: number;
  tall?: number;
  lite?: boolean;
  reach?: number;
}
// Broadleaf: trunk, branches fanning out, a big crown core and a tuft at the end of each branch, with a smaller one on the
// outside and at the top. `lite` (the surrounding forest, hundreds of trees): fewer tufts, no visible branches or roots
function broadleaf(seed: number, o: LeafOpts): THREE.Group {
  const rnd = rng(seed),
    parts: THREE.BufferGeometry[] = [],
    lite = !!o.lite;
  const center = trunk(parts, rnd, {
    r: o.r,
    th: o.th,
    roots: o.roots ?? 3 + Math.floor(rnd() * 3),
    lean: 0.03 + rnd() * 0.05,
    bark: BARK,
    lite,
    reach: o.reach,
  });
  const top = center(o.th),
    n = lite ? 3 : (o.limbs ?? 4 + Math.floor(rnd() * 2)),
    squash = o.squash ?? 0.78,
    crown = o.top ?? 0.5;
  const tuft = (c: THREE.Vector3, r: number, detail = 1) =>
    parts.push(
      lump(
        c,
        r,
        r * squash,
        r,
        rnd() * 99,
        leafTint(o.pal, c, r * squash, o.th - 0.02, o.th + crown, (rnd() - 0.5) * 0.14),
        { detail, rough: detail > 1 ? 0.36 : 0.28, uv: LEAF_UV },
      ),
    );
  tuft(V(top.x, o.th + crown * 0.5, top.z), o.spread * 0.74, lite ? 1 : 2); // the core
  const a0 = rnd() * Math.PI * 2;
  for (let k = 0; k < n; k++) {
    const a = a0 + (k / n) * Math.PI * 2 + (rnd() - 0.5) * 0.7,
      reach = o.spread * (0.55 + rnd() * 0.25);
    const end = V(top.x + Math.cos(a) * reach, o.th + crown * (0.16 + rnd() * 0.3), top.z + Math.sin(a) * reach);
    const r = o.spread * (0.4 + rnd() * 0.14);
    tuft(end.clone().add(V(0, r * 0.2, 0)), r);
    if (lite) continue;
    limb(parts, center(o.th * 0.86), end, o.r * 0.55, o.r * 0.2, BARK, rnd);
    // smaller tuft on the outside and lower: the crown does not become a single ball
    const b = a + (rnd() - 0.5) * 1.2;
    tuft(
      V(end.x + Math.cos(b) * r * 0.8, end.y - r * 0.25 + rnd() * r * 0.3, end.z + Math.sin(b) * r * 0.8),
      r * (0.5 + rnd() * 0.2),
    );
  }
  if (!lite) {
    const tip = V(top.x + (rnd() - 0.5) * 0.08, o.th + crown * 0.84, top.z + (rnd() - 0.5) * 0.08);
    tuft(tip, o.spread * (0.44 + rnd() * 0.1));
    tuft(V(tip.x + (rnd() - 0.5) * 0.16, tip.y + o.spread * 0.26, tip.z + (rnd() - 0.5) * 0.16), o.spread * 0.3);
    // little tufts at the crown edge: the outline gets ragged, leafy, not smooth
    for (let k = 0; k < 5; k++) {
      const a = rnd() * Math.PI * 2,
        d = o.spread * (0.85 + rnd() * 0.3);
      tuft(
        V(top.x + Math.cos(a) * d, o.th + crown * (0.2 + rnd() * 0.5), top.z + Math.sin(a) * d),
        o.spread * (0.2 + rnd() * 0.08),
      );
    }
  }
  // broken branch stubs on the bare trunk (tall pine)
  for (let k = 0; k < (lite ? 0 : (o.stubs ?? 0)); k++) {
    const y = o.th * (0.35 + 0.5 * rnd()),
      a = rnd() * Math.PI * 2,
      from = center(y);
    limb(
      parts,
      from,
      from.clone().add(V(Math.cos(a) * 0.09, 0.03, Math.sin(a) * 0.09)),
      o.r * 0.4,
      o.r * 0.12,
      ASH,
      rnd,
    );
  }
  return finish(parts, o.tall ? { tall: o.tall } : {});
}

interface FirOpts {
  r: number;
  R: number;
  tiers: number;
  base: number;
  pal: Pal;
  tall?: number;
  lite?: boolean;
}
// Pine: straight trunk and skirts of boughs, each with drooping, ragged tips, lighter at the tip and dark underneath
function fir(seed: number, o: FirOpts): THREE.Group {
  const rnd = rng(seed),
    parts: THREE.BufferGeometry[] = [],
    tiers = o.lite ? Math.ceil(o.tiers * 0.7) : o.tiers;
  const center = trunk(parts, rnd, {
    r: o.r,
    th: 0.93,
    roots: 3 + Math.floor(rnd() * 2),
    lean: rnd() * 0.04,
    bark: BARK,
    taper: 0.9,
    lite: o.lite,
    reach: 0.12,
  });
  const gap = (0.9 - o.base) / tiers;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers,
      y = o.base + gap * i,
      hh = gap * 1.9,
      r = o.R * (1 - t) ** 0.85 + 0.035,
      sides = o.lite ? 6 : t < 0.6 ? 10 : 8;
    const jag = Array.from({ length: sides }, (_, j) => (j % 2 ? 1 : 0.68) * (0.88 + 0.24 * rnd())),
      turn = rnd() * 6;
    const j = (a: number) => jag[Math.round((a / (Math.PI * 2)) * sides) % sides];
    const c = (dy: number) => center(y + dy);
    const rings: Ring[] = [
      { p: c(hh), r: 0.012 },
      { p: c(hh * 0.5), r: r * 0.5 },
      { p: c(0), r },
      { p: c(hh * 0.2), r: r * 0.3 },
    ];
    const tone = [0.3, 0.45, 0.72, 0.02];
    const g = tube(rings, sides, (_p, k, a) => ramp(o.pal, tone[k] + 0.2 * t + (k === 2 ? 0.25 * (j(a) - 0.68) : 0)), {
      flat: true,
      v: 3,
      shape: (a, k) => (k === 2 ? j(a) : 1),
      lift: (a, k) => (k === 2 ? -hh * 0.5 * (j(a) - 0.6) : 0),
    });
    parts.push(g.rotateY(turn));
  }
  parts.push(
    tube(
      [
        { p: center(0.86), r: 0.04 },
        { p: center(1), r: 0.003 },
      ],
      6,
      () => ramp(o.pal, 0.6),
      { flat: true },
    ),
  );
  return finish(parts, o.tall ? { tall: o.tall } : {});
}

// Dead tree: just trunk and forking branches
function dead(seed: number, lite: boolean): THREE.Group {
  const rnd = rng(seed),
    parts: THREE.BufferGeometry[] = [];
  const th = 0.42 + rnd() * 0.1,
    r = 0.05 + rnd() * 0.02;
  const center = trunk(parts, rnd, {
    r,
    th,
    roots: 3 + Math.floor(rnd() * 2),
    lean: 0.05 + rnd() * 0.06,
    bark: ASH,
    taper: 0.4,
    lite,
  });
  const top = center(th),
    n = 3 + Math.floor(rnd() * 2),
    a0 = rnd() * 6;
  for (let k = 0; k <= n; k++) {
    const lead = k === n,
      a = a0 + (k / n) * Math.PI * 2 + (rnd() - 0.5) * 0.6,
      reach = lead ? 0.04 : 0.16 + rnd() * 0.14;
    const end = V(top.x + Math.cos(a) * reach, th + (lead ? 0.34 : 0.14 + rnd() * 0.2), top.z + Math.sin(a) * reach);
    limb(parts, center(th * (lead ? 0.92 : 0.7 + rnd() * 0.2)), end, r * 0.55, r * 0.22, ASH, rnd);
    for (let f = 0; f < (lite ? 1 : 2); f++) {
      const b = a + (f ? 0.9 : -0.7) + (rnd() - 0.5) * 0.5,
        len = 0.1 + rnd() * 0.1;
      limb(
        parts,
        end,
        end.clone().add(V(Math.cos(b) * len, 0.08 + rnd() * 0.12, Math.sin(b) * len)),
        r * 0.22,
        0.006,
        ASH,
        rnd,
      );
    }
  }
  return finish(parts);
}

// Bush: low tufts, no trunk
function shrub(seed: number, pal: Pal, lite: boolean): THREE.Group {
  const rnd = rng(seed),
    parts: THREE.BufferGeometry[] = [],
    n = lite ? 3 : 4 + Math.floor(rnd() * 3);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rnd(),
      d = k ? 0.14 + rnd() * 0.2 : 0,
      r = 0.26 + rnd() * 0.14,
      c = V(Math.cos(a) * d, r * 0.5 + (k ? 0 : 0.12), Math.sin(a) * d);
    parts.push(
      lump(c, r, r * 0.8, r, rnd() * 99, leafTint(pal, c, r * 0.8, 0, 0.75, (rnd() - 0.5) * 0.14), { uv: LEAF_UV }),
    );
  }
  return finish(parts);
}

type Make = (seed: number, lite: boolean) => THREE.Group;
const oak =
  (pal: Pal, o: Partial<LeafOpts> = {}): Make =>
  (s, lite) =>
    broadleaf(s, { r: 0.065, th: 0.4, spread: 0.36, pal, lite, ...o });
const old: Make = (s, lite) =>
  broadleaf(s, { r: 0.09, th: 0.36, spread: 0.42, pal: LEAF.green, roots: 5, limbs: 5, lite }); // thick trunk
const pine: Make = (s, lite) =>
  broadleaf(s, {
    r: 0.045,
    th: 0.62,
    spread: 0.2,
    top: 0.36,
    squash: 0.5,
    pal: LEAF.fir,
    limbs: 4,
    stubs: 3,
    tall: 1.6,
    reach: 0.11,
    lite,
  }); // tall, bare trunk
const spruce =
  (o: Partial<FirOpts> = {}): Make =>
  (s, lite) =>
    fir(s, { r: 0.05, R: 0.2, tiers: 7, base: 0.2, pal: LEAF.fir, tall: 1.5, lite, ...o });
const bush =
  (pal: Pal): Make =>
  (s, lite) =>
    shrub(s, pal, lite);
// Variations per KayKit model (the name says where the piece is used: LOOK in scene/board.ts and MOODS in ambience.ts). Every
// set mixes species: Ash Wood forest has broadleaf, old tree and pine side by side
const SETS: [RegExp, Make[]][] = [
  [/Bush/, [bush(LEAF.green), bush(LEAF.olive), bush(LEAF.teal)]],
  [/Tree_Bare/, [dead, dead, dead]],
  [/Tree_4/, [spruce(), spruce({ R: 0.16, tiers: 8, base: 0.26 }), pine]],
  [/Tree_2/, [oak(LEAF.teal, { th: 0.48, spread: 0.27, squash: 0.9, tall: 1.25 }), spruce({ R: 0.18 }), old]],
  [
    /Tree_3/,
    [
      oak(LEAF.olive, { r: 0.045, th: 0.34, spread: 0.3 }),
      oak(LEAF.green, { r: 0.075, th: 0.3, spread: 0.46, squash: 0.62 }),
      spruce({ R: 0.22, tiers: 6, tall: 1.2 }),
    ],
  ],
  [/Tree_/, [oak(LEAF.green), oak(LEAF.teal, { spread: 0.4, th: 0.36 }), old, pine]],
];

// swaps the KayKit tree pieces for the ones built here: `name` and the variations `name~1`, `name~2`... (painted.ts variant).
// `lite`: low-triangle version, for the hundreds of trees in the surroundings
export function swapTrees(pieces: Map<string, THREE.Object3D>, lite = false) {
  for (const name of [...pieces.keys()]) {
    const set = SETS.find(([re]) => re.test(name))?.[1];
    if (!set) continue;
    const seed = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
    set.forEach((make, i) => pieces.set(i ? `${name}~${i}` : name, make(seed + i * 131, lite)));
  }
}
