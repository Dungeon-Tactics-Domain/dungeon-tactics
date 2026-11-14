// Real bridge (Nov 13, Fernando's request: "a well-made bridge, with textures, little stairs, proper wood with wooden boards
// and little ropes on the sides"): on open maps, each group of bridge tiles (Tile.look 'bridge') becomes loose planks
// with gaps, two beams underneath, posts at the corners and in the middle, rope on both sides and little stairs at the ends that
// go down to the bank. Our own painted textures (public/tex/wood.jpg, bark.jpg; scripts/assets/paint-textures.py). Visuals only: the bridge tile keeps
// its height in the rules, and the top of the planks sits exactly at that height (the unit steps on them).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type Grid, inBounds, neighbors, posKey, tileAt } from '../shared/battle/grid.ts';
import type { Pos } from '../shared/battle/types.ts';

const PLANK = 0.19; // depth of each plank, with a 0.03 gap
const DECK = 0.07; // plank thickness
const RAIL = 0.55; // height of the top rope above the planks

// box with the UV on a strip of the texture (one plank from the photo), so the plank does not get the whole photo squeezed in
function plankBox(w: number, h: number, d: number, shift: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w * 0.5 + shift, uv.getY(i) * 0.11 + (shift % 1));
  return g;
}

// sagging rope between two posts
function rope(a: THREE.Vector3, b: THREE.Vector3, sag: number) {
  const mid = a
    .clone()
    .lerp(b, 0.5)
    .add(new THREE.Vector3(0, -sag, 0));
  return new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 12, 0.018, 5);
}

export function buildBridges(grid: Grid, step: number, wood: THREE.Texture, bark: THREE.Texture): THREE.Group {
  const out = new THREE.Group();
  out.name = 'bridges';
  const isBridge = (p: Pos) => inBounds(grid, p) && tileAt(grid, p).look === 'bridge';
  const seen = new Set<string>();
  const planks: THREE.BufferGeometry[] = [],
    beams: THREE.BufferGeometry[] = [],
    posts: THREE.BufferGeometry[] = [],
    ropes: THREE.BufferGeometry[] = [];
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  grid.tiles.forEach((_, i) => {
    const start = { x: i % grid.width, y: Math.floor(i / grid.width) };
    if (!isBridge(start) || seen.has(posKey(start))) return;
    // group of connected bridge tiles
    const comp: Pos[] = [],
      queue = [start];
    seen.add(posKey(start));
    while (queue.length) {
      const p = queue.pop()!;
      comp.push(p);
      for (const n of neighbors(grid, p))
        if (isBridge(n) && !seen.has(posKey(n))) {
          seen.add(posKey(n));
          queue.push(n);
        }
    }
    const x0 = Math.min(...comp.map((p) => p.x)),
      x1 = Math.max(...comp.map((p) => p.x)) + 1;
    const z0 = Math.min(...comp.map((p) => p.y)),
      z1 = Math.max(...comp.map((p) => p.y)) + 1;
    const top = (tileAt(grid, comp[0]).h + 1) * step;
    // crosses in the direction where the bridge touches dry land at both ends (in Ash Wood, north to south)
    const dry = (p: Pos) => inBounds(grid, p) && !tileAt(grid, p).depth && tileAt(grid, p).look !== 'bridge';
    const alongZ = dry({ x: x0, y: z0 - 1 }) || dry({ x: x0, y: z1 });
    // local axes: `a` along the crossing, `c` sideways; everything in world coordinates (map centered at the origin)
    const [a0, a1, c0, c1] = alongZ ? [z0, z1, x0, x1] : [x0, x1, z0, z1];
    const at = (a: number, c: number, y: number) =>
      alongZ
        ? new THREE.Vector3(c - grid.width / 2, y, a - grid.height / 2)
        : new THREE.Vector3(a - grid.width / 2, y, c - grid.height / 2);
    const put = (g: THREE.BufferGeometry, a: number, c: number, y: number, list: THREE.BufferGeometry[], turn = 0) => {
      g.rotateY((alongZ ? 0 : Math.PI / 2) + turn);
      const p = at(a, c, y);
      list.push(g.translate(p.x, p.y, p.z));
    };
    const width = c1 - c0 - 0.1,
      mid = (c0 + c1) / 2;
    // bank at each end: the neighboring tile and how far it sits below the planks
    const bank = (dir: number) => {
      const nb = alongZ
        ? { x: Math.floor(mid), y: dir < 0 ? z0 - 1 : z1 }
        : { x: dir < 0 ? x0 - 1 : x1, y: Math.floor(mid) };
      return inBounds(grid, nb) ? { nb, drop: top - (tileAt(grid, nb).h + 1) * step } : null;
    };
    // Bank at plank height (Nov 13, Fernando saw the bridge "not connecting right at the top"): the smooth terrain
    // rounds the edge (the slope takes 1/6 of a tile, terrain.ts SUB) and the bridge ended in the air before touching the
    // ground. At this end the planks and beams extend a quarter tile over the bank, up to the flat stretch
    const LAND = 0.26,
      over = (dir: number) => {
        const b = bank(dir);
        return b && dry(b.nb) && Math.abs(b.drop) < 0.08 ? LAND : 0;
      };
    const s0 = a0 - over(-1),
      s1 = a1 + over(1);
    // loose planks, with gaps and each a touch crooked
    for (let a = s0 + 0.02; a + PLANK <= s1; a += PLANK + 0.03) {
      put(
        plankBox(width * (0.96 + 0.04 * rnd()), DECK, PLANK, rnd() * 4),
        a + PLANK / 2,
        mid + (rnd() - 0.5) * 0.06,
        top - DECK / 2 - rnd() * 0.012,
        planks,
        (rnd() - 0.5) * 0.05,
      );
    }
    // two beams underneath, end to end
    for (const c of c1 - c0 >= 3 ? [c0 + 0.25, mid, c1 - 0.25] : [c0 + 0.25, c1 - 0.25])
      put(plankBox(0.14, 0.14, s1 - s0 + 0.3, 0), (s0 + s1) / 2, c, top - DECK - 0.07, beams, Math.PI / 2);
    // little stairs at each end: from plank height down to the bank, outward from the bridge (in the neighboring tile's third)
    for (const [end, dir] of [
      [a0, -1],
      [a1, 1],
    ] as const) {
      const b = bank(dir);
      if (!b || b.drop < 0.08) continue;
      const { nb, drop } = b,
        ground = top - drop;
      // bank as a ramp up to the bridge (Nov 13, Fernando's request: "the bridge stairs must be a ramp taking up one whole
      // tile"): inclined planks covering the whole tile, from plank height down to the ground at the other end
      if (tileAt(grid, nb).ramp) {
        const pitch = Math.atan2(drop, 1);
        for (let a = 0.02; a + PLANK <= 1; a += PLANK + 0.03) {
          const g = plankBox(width * 0.96, DECK, PLANK / Math.cos(pitch), rnd() * 4);
          g.rotateX(dir * (alongZ ? 1 : -1) * pitch);
          put(g, end + dir * (a + PLANK / 2), mid, top - drop * (a + PLANK / 2) - DECK / 2 + 0.01, planks);
        }
        continue;
      }
      const n = Math.max(2, Math.round(drop / 0.13)),
        run = 0.36 / n;
      for (let k = 1; k <= n; k++) {
        const y = top - (drop * k) / (n + 0.5);
        put(plankBox(width * 0.9, DECK, run + 0.02, rnd() * 4), end + dir * (k - 0.5) * run, mid, y - DECK / 2, planks);
        // foot of each step down to the ground
        put(
          plankBox(0.08, y - ground + 0.05, 0.08, 0),
          end + dir * (k - 0.5) * run,
          c0 + 0.2,
          (y + ground) / 2 - 0.03,
          beams,
        );
        put(
          plankBox(0.08, y - ground + 0.05, 0.08, 0),
          end + dir * (k - 0.5) * run,
          c1 - 0.2,
          (y + ground) / 2 - 0.03,
          beams,
        );
      }
    }
    // posts every tile on both sides, going down to the water, and rope on top and in the middle between them
    const stations: number[] = [];
    for (let a = a0; a <= a1 + 1e-6; a += 1) stations.push(a);
    // Destroyed railing (Nov 13, Fernando's request: "one of the side railings destroyed, so you can jump into the river"): on the
    // wide bridge, the c1 side loses the middle posts (a stump remains) and the ropes; the snapped rope hangs
    // from the end posts. Visuals only: the rules never blocked jumping from the bridge into the water
    // ponytail: applies to every bridge 3 or more tiles wide; if another wide bridge needs the full railing, it becomes tile data
    const broken = c1 - c0 >= 3 ? 1 : -1;
    [c0 + 0.04, c1 - 0.04].forEach((c, side) => {
      const tops: THREE.Vector3[] = [],
        mids: THREE.Vector3[] = [];
      stations.forEach((a, k) => {
        const rail = side === broken && k > 0 && k < stations.length - 1 ? 0.16 + 0.1 * rnd() : RAIL,
          len = rail + 1.2;
        const g = new THREE.CylinderGeometry(0.05, 0.06, len, 6);
        const uv = g.getAttribute('uv');
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.5, uv.getY(i) * len * 0.6);
        put(g, a, c, top + rail - len / 2 + 0.05, posts);
        tops.push(at(a, c, top + RAIL));
        mids.push(at(a, c, top + RAIL * 0.5));
      });
      if (side === broken) {
        const out = c + 0.14;
        for (const k of [0, stations.length - 1]) {
          const a = stations[k],
            inward = k ? -1 : 1;
          ropes.push(
            rope(tops[k], at(a + inward * 0.3, out, top - 0.3), 0.2),
            rope(mids[k], at(a + inward * 0.16, out, top - 0.5), 0.1),
          );
        }
        return;
      }
      for (let k = 1; k < tops.length; k++) {
        ropes.push(rope(tops[k - 1], tops[k], 0.08), rope(mids[k - 1], mids[k], 0.06));
      }
    });
  });
  const woodMat = new THREE.MeshLambertMaterial({ map: wood, color: '#c9a37a' });
  const barkMat = new THREE.MeshLambertMaterial({ map: bark, color: '#b08860' });
  const ropeMat = new THREE.MeshLambertMaterial({ color: '#c9b07c' });
  for (const [list, mat] of [
    [planks, woodMat],
    [beams, woodMat],
    [posts, barkMat],
    [ropes, ropeMat],
  ] as const) {
    if (!list.length) continue;
    const m = new THREE.Mesh(mergeGeometries(list), mat);
    m.castShadow = m.receiveShadow = true;
    out.add(m);
    for (const g of list) g.dispose();
  }
  return out;
}
