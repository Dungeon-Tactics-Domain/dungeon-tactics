// The smooth terrain's vertex grid (terrain.ts): each vertex from the sub-tiles round it, the normals, and the box of
// sub-tiles a map builder edit changed, so its redraw works out and uploads only that part (Nov 25). Plain arrays in
// small functions: the browser keeps them compiled from one redraw to the next (inside buildTerrain a 24x24 map's
// vertices were compiled again on every call, 140 ms instead of 25).
import { quads } from './three-util.ts';

// the sub-tiles' height, tone and paint (5 per sub-tile), NX x NZ
export interface Cells {
  raw: Float32Array;
  tone: Float32Array;
  paint: Float32Array;
  NX: number;
  NZ: number;
}
export interface Verts {
  pos: Float32Array;
  col: Float32Array;
  w4: Float32Array;
  st: Float32Array;
  normal: Float32Array;
}
// vertices a0..a1 across and b0..b1 down, inclusive (a grid of NX x NZ sub-tiles has NX + 1 x NZ + 1 vertices)
export interface Box {
  a0: number;
  a1: number;
  b0: number;
  b1: number;
}

export function newVerts(NX: number, NZ: number): Verts {
  const n = (NX + 1) * (NZ + 1);
  return {
    pos: new Float32Array(n * 3),
    col: new Float32Array(n * 3),
    w4: new Float32Array(n * 4),
    st: new Float32Array(n),
    normal: new Float32Array(n * 3),
  };
}

// The vertices two builds of the same size differ on: each changed sub-tile moves its four corners; null when none
export function changed(was: Cells, now: Cells): Box | null {
  let a0 = Number.POSITIVE_INFINITY,
    a1 = -1,
    b0 = Number.POSITIVE_INFINITY,
    b1 = -1;
  for (let b = 0; b < now.NZ; b++)
    for (let a = 0; a < now.NX; a++) {
      const c = b * now.NX + a;
      let diff = was.raw[c] !== now.raw[c] || was.tone[c] !== now.tone[c];
      for (let n = 0; n < 5 && !diff; n++) diff = was.paint[c * 5 + n] !== now.paint[c * 5 + n];
      if (!diff) continue;
      a0 = Math.min(a0, a);
      a1 = Math.max(a1, a + 1);
      b0 = Math.min(b0, b);
      b1 = Math.max(b1, b + 1);
    }
  return a1 < 0 ? null : { a0, a1, b0, b1 };
}

// The box grown by one vertex, kept on the grid: a moved vertex turns its neighbours' normals too
export const grow = (b: Box, NX: number, NZ: number): Box => ({
  a0: Math.max(0, b.a0 - 1),
  a1: Math.min(NX, b.a1 + 1),
  b0: Math.max(0, b.b0 - 1),
  b1: Math.min(NZ, b.b1 + 1),
});

// Each vertex in the box: the average of up to 4 surrounding sub-tiles, so the edge between two heights becomes a slope
// and the middle of the tile stays flat. x0, z0: the grid's corner in the world; `sub` sub-tiles per tile
export function fillVertices(c: Cells, v: Verts, box: Box, x0: number, z0: number, sub: number) {
  const { raw, tone, paint, NX, NZ } = c,
    VX = NX + 1,
    p = new Float32Array(5);
  for (let b = box.b0; b <= box.b1; b++)
    for (let a = box.a0; a <= box.a1; a++) {
      let y = 0,
        k = 0,
        t = 0;
      p.fill(0);
      for (let db = -1; db <= 0; db++)
        for (let da = -1; da <= 0; da++) {
          const ca = a + da,
            cb = b + db;
          if (ca < 0 || cb < 0 || ca >= NX || cb >= NZ) continue;
          const s = cb * NX + ca;
          y += raw[s];
          t += tone[s];
          k++;
          for (let n = 0; n < 5; n++) p[n] += paint[s * 5 + n];
        }
      const i = b * VX + a;
      v.pos[i * 3] = a / sub + x0;
      v.pos[i * 3 + 1] = y / k;
      v.pos[i * 3 + 2] = b / sub + z0;
      v.col[i * 3] = v.col[i * 3 + 1] = v.col[i * 3 + 2] = t / k;
      for (let n = 0; n < 4; n++) v.w4[i * 4 + n] = p[n] / k;
      v.st[i] = p[4] / k;
    }
}

// Three's computeVertexNormals (each triangle's normal added to its corners, then normalised) for the vertices in the
// box, from the triangles round them, laid as gridIndex lays them. Three's own made a Vector3 per corner and took a
// third of a 24x24 map's redraw
export function fillNormals(pos: Float32Array, normal: Float32Array, NX: number, NZ: number, box: Box) {
  const VX = NX + 1;
  for (let b = box.b0; b <= box.b1; b++) normal.fill(0, (b * VX + box.a0) * 3, (b * VX + box.a1 + 1) * 3);
  const add = (A: number, B: number, C: number) => {
    const a = A * 3,
      b = B * 3,
      c = C * 3;
    const cx = pos[c] - pos[b],
      cy = pos[c + 1] - pos[b + 1],
      cz = pos[c + 2] - pos[b + 2],
      ax = pos[a] - pos[b],
      ay = pos[a + 1] - pos[b + 1],
      az = pos[a + 2] - pos[b + 2];
    const x = cy * az - cz * ay,
      y = cz * ax - cx * az,
      z = cx * ay - cy * ax;
    put(A, x, y, z);
    put(B, x, y, z);
    put(C, x, y, z);
  };
  const put = (i: number, x: number, y: number, z: number) => {
    const va = i % VX,
      vb = (i - va) / VX;
    if (va < box.a0 || va > box.a1 || vb < box.b0 || vb > box.b1) return;
    normal[i * 3] += x;
    normal[i * 3 + 1] += y;
    normal[i * 3 + 2] += z;
  };
  for (let qb = Math.max(0, box.b0 - 1); qb <= Math.min(NZ - 1, box.b1); qb++)
    for (let qa = Math.max(0, box.a0 - 1); qa <= Math.min(NX - 1, box.a1); qa++) {
      const v = qb * VX + qa,
        n = v + VX;
      add(v, n, v + 1);
      add(v + 1, n, n + 1);
    }
  for (let b = box.b0; b <= box.b1; b++)
    for (let a = box.a0; a <= box.a1; a++) {
      const i = (b * VX + a) * 3,
        l = Math.hypot(normal[i], normal[i + 1], normal[i + 2]) || 1;
      normal[i] /= l;
      normal[i + 1] /= l;
      normal[i + 2] /= l;
    }
}

// the triangles of an NX x NZ grid, kept per size: the map builder redraws the same size on every edit
const indexes = new Map<string, Uint32Array>();
export function gridIndex(NX: number, NZ: number) {
  const key = `${NX}x${NZ}`;
  let idx = indexes.get(key);
  if (!idx) indexes.set(key, (idx = Uint32Array.from(quads([], 0, NX, NZ))));
  return idx;
}
