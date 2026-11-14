// Painted objects, built in code (Nov 13, Fernando's request: barrels, crates, bottles and rocks in the same painted
// style as the trees and the ground, replacing KayKit's cartoon pieces). On open maps each KayKit piece
// becomes a set of variations assembled here: plank crate stack, stave barrel with iron hoops, faceted rocks
// with moss, and the caravan remains (bottles, sack, broken plank) to place next to bodies. Same material
// and same convention as the trees (painted.ts): y = 0 is the ground, one mesh per piece, the box in `userData.box`.
import * as THREE from 'three';
import { V, lump, piece, ramp, rng, slab, tones, tube } from './painted.ts';

const WOOD = tones('#3b2814', '#614224', '#8a6034', '#b08248', '#d2a765');
const IRON = tones('#1e2126', '#353a41', '#525962', '#767e88');
const STONE = tones('#2f322b', '#474b40', '#62665a', '#7f8270', '#9c9d86');
const GLASS = tones('#16361f', '#2c6a3a', '#4f9a5a', '#b4e8b0');
const SACK = tones('#4a3c26', '#75633f', '#9c8758', '#bfab7c');
const MOSS = new THREE.Color('#42562a');
type Rnd = () => number;
type Parts = THREE.BufferGeometry[];
export const LITTER = 'pintado/restos'; // new piece (no KayKit counterpart): the caravan remains next to the bodies
export const DEBRIS = 'pintado/entulho'; // walkable debris on top of the bridge: low and scattered around the middle of the tile, where the unit stands

const at = (x: number, y: number, z: number, turn = 0, tilt = 0) => new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationY(turn)).multiply(new THREE.Matrix4().makeRotationZ(tilt));

// Crate of side `s`: dark core (shows in the gaps), 4 planks per face, corner brackets and lid (without it, open)
function crate(parts: Parts, m: THREE.Matrix4, s: number, rnd: Rnd, lid = true) {
  const add = (g: THREE.BufferGeometry) => parts.push(g.applyMatrix4(m));
  const plank = () => ramp(WOOD, 0.34 + rnd() * 0.5).clone(), dark = ramp(WOOD, 0.08).clone(), post = ramp(WOOD, 0.26).clone();
  add(slab(s * 0.9, s * 0.9, s * 0.9, V(0, s * 0.46, 0), dark, dark));
  const ph = (s * 0.96) / 4;
  for (let side = 0; side < 4; side++) for (let k = 0; k < 4; k++) {
    const c = plank();
    add(slab(s * 0.9, ph * 0.88, s * 0.05, V(0, s * 0.02 + ph * (k + 0.5), s * 0.455), c, c).rotateY((side * Math.PI) / 2));
  }
  for (let k = 0; lid && k < 4; k++) { const c = plank(); add(slab(ph * 0.88, s * 0.05, s * 0.9, V((k - 1.5) * ph, s * 0.975, 0), c, c)); }
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) add(slab(s * 0.13, s, s * 0.13, V(x * s * 0.45, s * 0.5, z * s * 0.45), post, post));
}

// Upright barrel (height h): bellied staves, three iron hoops and a recessed lid
function barrel(parts: Parts, m: THREE.Matrix4, h: number, rnd: Rnd) {
  const add = (g: THREE.BufferGeometry) => parts.push(g.applyMatrix4(m));
  const R = h * 0.4, prof: [number, number][] = [[0, 0.78], [0.05, 0.86], [0.25, 0.97], [0.5, 1], [0.75, 0.97], [0.95, 0.86], [1, 0.78]];
  const stave = Array.from({ length: 12 }, () => 0.3 + rnd() * 0.5);
  const tone = (a: number) => stave[Math.round((a / (Math.PI * 2)) * 12) % 12];
  add(tube(prof.map(([y, r]) => ({ p: V(0, y * h, 0), r: r * R })), 12, (p, _i, a) => ramp(WOOD, tone(a) - 0.12 + 0.2 * (p.y / h)), { flat: true, v: 1.5 }));
  for (const y of [0.16, 0.5, 0.84]) {
    const r = R * (1 - 0.9 * (y - 0.5) ** 2) + h * 0.012;
    add(tube([{ p: V(0, (y - 0.035) * h, 0), r }, { p: V(0, (y + 0.035) * h, 0), r }], 12, (_p, i, a) => ramp(IRON, 0.35 + 0.3 * i + 0.25 * Math.sin(a * 2 + 1)), { flat: true }));
  }
  add(tube([{ p: V(0, h, 0), r: R * 0.78 }, { p: V(0, h * 0.965, 0), r: R * 0.72 }, { p: V(0, h * 0.965, 0), r: 0.001 }], 12, (_p, i, a) => ramp(WOOD, i ? 0.55 + 0.2 * Math.sin(a * 3) : 0.25), { flat: true }));
}

// Green glass bottle with a cork (height h)
function bottle(parts: Parts, m: THREE.Matrix4, h: number, rnd: Rnd) {
  const prof: [number, number][] = [[0, 0.17], [0.03, 0.2], [0.5, 0.2], [0.66, 0.13], [0.76, 0.07], [0.94, 0.07], [0.96, 0.09], [1, 0.07]], s = rnd() * 6;
  parts.push(tube(prof.map(([y, r]) => ({ p: V(0, y * h, 0), r: r * h })), 7, (p, _i, a) => (p.y > h * 0.95 ? ramp(SACK, 0.7) : ramp(GLASS, 0.3 + 0.55 * Math.max(0, Math.sin(a + s)) ** 3 + 0.15 * (p.y / h))), { flat: true }).applyMatrix4(m));
}

// Cloth sack tied at the mouth
function sack(parts: Parts, m: THREE.Matrix4, s: number, rnd: Rnd) {
  const tint = (p: THREE.Vector3) => ramp(SACK, 0.15 + 2.6 * (p.y / s) + 0.1 * Math.sin(p.x * 60));
  parts.push(lump(V(0, s * 0.3, 0), s * 0.42, s * 0.36, s * 0.34, rnd() * 99, tint, { rough: 0.22, under: 0.75 }).applyMatrix4(m));
  parts.push(lump(V(s * 0.06, s * 0.66, 0), s * 0.13, s * 0.1, s * 0.12, rnd() * 99, tint, { rough: 0.3 }).applyMatrix4(m));
}

// Faceted rock, settled into the ground (a quarter of it buried), with moss on top on some
function stone(parts: Parts, c: THREE.Vector3, rx: number, ry: number, rz: number, rnd: Rnd) {
  const seed = rnd() * 99, moss = rnd() < 0.55;
  parts.push(lump(V(c.x, c.y + ry * 0.3, c.z), rx, ry, rz, seed, (p, d) => {
    const t = ramp(STONE, 0.18 + 0.5 * Math.max(0, d.y) + 0.22 * (p.y / (ry * 1.3)) + 0.12 * Math.sin(d.x * 5 + d.z * 4 + seed));
    return moss ? t.lerp(MOSS, 0.8 * THREE.MathUtils.smoothstep(d.y + 0.25 * Math.sin(d.x * 6 + seed), 0.45, 0.8)) : t;
  }, { rough: 0.42, under: 0.6, facet: true, uv: 1.4 }));
}

type Make = (rnd: Rnd) => THREE.Group;
const rocks = (big: boolean): Make[] => [0, 1, 2].map((v) => (rnd: Rnd) => {
  const parts: Parts = [], r = big ? 0.5 : 0.42;
  stone(parts, V(0, 0, 0), r * (0.9 + rnd() * 0.3), r * (0.55 + rnd() * 0.5), r * (0.75 + rnd() * 0.3), rnd);
  // the variations get one or two smaller rocks leaning on them
  for (let k = 0; k < v; k++) { const a = rnd() * 6, s = r * (0.35 + rnd() * 0.2); stone(parts, V(Math.cos(a) * r * 0.9, 0, Math.sin(a) * r * 0.9), s, s * 0.8, s, rnd); }
  return piece(parts, r * 2.4, r * 1.1);
});
const CRATES: Make[] = [
  (rnd) => { // stack: a big one, a medium on top, a small on the ground and a bottle
    const p: Parts = [];
    crate(p, at(-0.1, 0, 0.08, 0.2), 0.58, rnd);
    crate(p, at(-0.12, 0.58, 0.06, 0.65), 0.42, rnd);
    crate(p, at(0.3, 0, -0.24, -0.4), 0.34, rnd);
    bottle(p, at(0.32, 0, 0.3), 0.2, rnd);
    return piece(p, 0.95, 1);
  },
  (rnd) => { // two side by side, a third tipped over on top of them and a sack
    const p: Parts = [];
    crate(p, at(-0.22, 0, -0.1, -0.15), 0.5, rnd);
    crate(p, at(0.25, 0, 0.12, 0.3), 0.44, rnd);
    crate(p, at(0.02, 0.52, 0, 0.9, 0.2), 0.36, rnd);
    sack(p, at(-0.14, 0, 0.36, 0.5), 0.28, rnd);
    return piece(p, 0.95, 1);
  },
  (rnd) => { // a big open one, lid planks on the ground, sack and fallen bottles
    const p: Parts = [];
    crate(p, at(-0.08, 0, -0.08, 0.4), 0.64, rnd, false);
    for (const [x, z, t] of [[0.34, 0.1, 0.3], [0.28, -0.3, 1.2]]) { const c = ramp(WOOD, 0.4 + rnd() * 0.4).clone(); p.push(slab(0.36, 0.03, 0.1, V(0, 0.015, 0), c, c).applyMatrix4(at(x, 0, z, t))); }
    sack(p, at(-0.32, 0, 0.34, 2), 0.28, rnd);
    bottle(p, at(0.14, 0.04, 0.38, 0.8, Math.PI / 2), 0.2, rnd);
    return piece(p, 0.95, 1);
  },
];
const BARRELS: Make[] = [
  (rnd) => { const p: Parts = []; barrel(p, at(0, 0, 0, rnd() * 6), 0.78, rnd); bottle(p, at(0.36, 0, 0.2), 0.2, rnd); return piece(p, 0.8, 0.8); },
  (rnd) => { const p: Parts = []; barrel(p, at(-0.06, 0, -0.04, rnd() * 6), 0.78, rnd); sack(p, at(0.3, 0, 0.24, 1), 0.26, rnd); return piece(p, 0.8, 0.8); },
  // tipped over, mouth to the side
  (rnd) => { const p: Parts = []; barrel(p, at(0.34, 0.29, 0, 0.5, Math.PI / 2), 0.74, rnd); bottle(p, at(-0.2, 0.04, 0.32, 2.2, Math.PI / 2), 0.2, rnd); return piece(p, 0.8, 0.8); },
];
const LITTERS: Make[] = [
  (rnd) => { const p: Parts = []; bottle(p, at(0.05, 0, 0.02), 0.2, rnd); bottle(p, at(-0.1, 0.04, -0.06, 1.1, Math.PI / 2), 0.2, rnd); return piece(p, 0.4, 0.2); },
  (rnd) => { const p: Parts = []; sack(p, at(0, 0, 0, rnd() * 6), 0.24, rnd); bottle(p, at(0.2, 0.04, 0.08, 0.4, Math.PI / 2), 0.2, rnd); return piece(p, 0.5, 0.2); },
  (rnd) => { const p: Parts = [], c = ramp(WOOD, 0.5).clone(); p.push(slab(0.34, 0.03, 0.09, V(0, 0.015, 0), c, c).applyMatrix4(at(0, 0, 0, rnd() * 6))); bottle(p, at(0.14, 0, -0.12), 0.2, rnd); return piece(p, 0.45, 0.2); },
];
const plankAt = (p: Parts, x: number, z: number, turn: number, len: number, rnd: Rnd, tilt = 0) => { const c = ramp(WOOD, 0.35 + rnd() * 0.45).clone(); p.push(slab(len, 0.035, 0.11, V(0, 0.02, 0), c, c).applyMatrix4(at(x, 0, z, turn, tilt))); };
const DEBRISES: Make[] = [
  (rnd) => { // rocks, broken planks and a sack
    const p: Parts = [];
    stone(p, V(-0.3, 0, -0.24), 0.16, 0.13, 0.14, rnd); stone(p, V(0.32, 0, 0.2), 0.13, 0.1, 0.12, rnd); stone(p, V(-0.12, 0, 0.36), 0.09, 0.07, 0.09, rnd);
    plankAt(p, 0.24, -0.3, 0.5, 0.5, rnd); plankAt(p, -0.34, 0.14, 1.9, 0.42, rnd, 0.12); plankAt(p, 0.1, 0.38, -0.3, 0.36, rnd);
    sack(p, at(0.36, 0, -0.08, 1.2), 0.24, rnd);
    return piece(p, 0.95, 0.35);
  },
  (rnd) => { // smashed crate, planks, rock and bottle
    const p: Parts = [];
    crate(p, at(-0.28, 0.02, -0.26, 0.6, 0.3), 0.32, rnd, false);
    plankAt(p, 0.3, -0.22, 1.1, 0.46, rnd); plankAt(p, 0.2, 0.34, 0.2, 0.5, rnd, 0.1); plankAt(p, -0.32, 0.26, 2.4, 0.34, rnd);
    stone(p, V(0.36, 0, 0.06), 0.13, 0.11, 0.12, rnd);
    bottle(p, at(-0.1, 0.04, 0.4, 0.3, Math.PI / 2), 0.2, rnd);
    return piece(p, 0.95, 0.35);
  },
];
const SETS: [RegExp, Make[]][] = [
  [/Rock_3/, rocks(true)], [/Rock_/, rocks(false)], [/crates_stacked/, CRATES], [/barrel_large/, BARRELS],
];

// swaps the KayKit pieces for the painted ones (`name`, `name~1`, `name~2`..., painted.ts variant) and adds the caravan remains
export function swapProps(pieces: Map<string, THREE.Object3D>, litter = false) {
  const put = (name: string, set: Make[]) => {
    const seed = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
    set.forEach((make, i) => pieces.set(i ? `${name}~${i}` : name, make(rng(seed + i * 131))));
  };
  for (const name of [...pieces.keys()]) {
    const set = SETS.find(([re]) => re.test(name))?.[1];
    if (set) put(name, set);
  }
  if (litter) { put(LITTER, LITTERS); put(DEBRIS, DEBRISES); }
}
