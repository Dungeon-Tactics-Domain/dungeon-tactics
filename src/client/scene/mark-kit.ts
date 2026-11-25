// The lit mark styles (mark-style.ts: luz, pedra, neon): the pieces every mark is built from. A strip swept along a path
// with a bevelled, blocky or tube profile (`sweep`, `piece`), bent over the drawn ground (`groundOf` reads the smooth
// terrain's own heights, so a strip follows the slope between two levels), and the materials that take the scene's sun,
// sky and shadows (`litPaint`), with their relief and reflection drawn by code (mark-textures.ts). `simples` never comes here.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { posKey } from '../../shared/battle/grid.ts';
import type { Pos } from '../../shared/battle/types.ts';
import { getMarkStyle, type MarkStyle } from '../mark-style.ts';
import type { MarkPattern } from './mark-looks.ts';
import { cliff, grain, plate, sky, stone } from './mark-textures.ts';
import type { TileSpace } from './space.ts';

export type Lit = Exclude<MarkStyle, 'simples'>;
// the lit style in use, or null for the flat marks
export const litStyle = (): Lit | null => {
  const s = getMarkStyle();
  return s === 'simples' ? null : s;
};

const BEND = 0.12; // how far a mark leaves its tile's plane to follow the ground, in metres
const LIFT = 0.022; // above the ground: the bent strip and the terrain's triangles differ by under 1 cm

// ---- shape -------------------------------------------------------------------------------------------------------

// a strip's cross-section, left to right: [across, up] from the path
type Profile = [number, number][];
const chamfer = (w: number, h: number): Profile => [
  [-w, 0],
  [-w * 0.5, h],
  [w * 0.5, h],
  [w, 0],
];
const block = (w: number, h: number): Profile => [
  [-w, 0],
  [-w, h * 0.6],
  [-w * 0.6, h],
  [w * 0.6, h],
  [w, h * 0.6],
  [w, 0],
];
const tube = (r: number, n = 6): Profile =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = Math.PI * (1 - i / n);
    return [r * Math.cos(a), r * 0.35 + r * Math.sin(a)];
  });
// luz: a low glass strip with chamfered edges; pedra: a stone curb, tall enough to cast a shadow (the sun's shadow map
// has 2 cm texels); neon: a tube
const profile = (style: Lit, w: number): Profile =>
  style === 'luz' ? chamfer(w * 1.25, w * 0.9) : style === 'pedra' ? block(w * 1.2, w * 1.9) : tube(w * 0.6);

export interface Path {
  pts: THREE.Vector3[];
  closed: boolean;
}

// The profile carried along the path (mitred at the corners), faces up and outward. `smooth` rounds the shading across
// the profile (a tube); without it each face is flat, which is what shows a chamfer
export function sweep(path: Path, prof: Profile, smooth = false): THREE.BufferGeometry {
  const { pts, closed } = path,
    n = pts.length,
    m = prof.length;
  const rings: THREE.Vector3[][] = [],
    along = [0];
  for (let i = 0; i < n; i++) {
    const c = pts[i],
      a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)],
      b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const d0 = new THREE.Vector2(c.x - a.x, c.z - a.z),
      d1 = new THREE.Vector2(b.x - c.x, b.z - c.z);
    if (!d0.lengthSq()) d0.copy(d1);
    if (!d1.lengthSq()) d1.copy(d0);
    d0.normalize();
    d1.normalize();
    const t = d0.clone().add(d1).normalize();
    const sx = t.y,
      sz = -t.x;
    const k = 1 / Math.max(0.5, sx * d1.y - sz * d1.x); // mitre: the strip keeps its width round a corner
    rings.push(prof.map(([u, h]) => new THREE.Vector3(c.x + sx * u * k, c.y + h, c.z + sz * u * k)));
    if (i) along.push(along[i - 1] + c.distanceTo(pts[i - 1]));
  }
  if (closed) along.push(along[n - 1] + pts[n - 1].distanceTo(pts[0]));
  const pos: number[] = [],
    uv: number[] = [];
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const r0 = rings[i],
      r1 = rings[(i + 1) % n],
      u0 = along[i],
      u1 = along[i + 1];
    for (let j = 0; j < m - 1; j++) {
      const v0 = j / (m - 1),
        v1 = (j + 1) / (m - 1);
      for (const [p, u, v] of [
        [r0[j], u0, v0],
        [r1[j], u1, v0],
        [r1[j + 1], u1, v1],
        [r0[j], u0, v0],
        [r1[j + 1], u1, v1],
        [r0[j + 1], u0, v1],
      ] as const) {
        pos.push(p.x, p.y, p.z);
        uv.push(u, v);
      }
    }
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (smooth) {
    const merged = mergeVertices(g);
    merged.computeVertexNormals();
    g.dispose();
    g = merged.toNonIndexed();
    merged.dispose();
  } else g.computeVertexNormals();
  return g;
}

export const circle = (r: number, n = 32, from = 0, to = Math.PI * 2): THREE.Vector3[] =>
  Array.from({ length: n + (to - from < Math.PI * 2 ? 1 : 0) }, (_, i) => {
    const a = from + ((to - from) * i) / n;
    return new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
  });
// a square of half side `h`, `cuts` points a side (more than 1 to bend over the ground)
export const square = (h: number, cuts = 1): THREE.Vector3[] => {
  const corners = [
    [-h, -h],
    [h, -h],
    [h, h],
    [-h, h],
  ];
  return corners.flatMap(([x, z], i) => {
    const [nx, nz] = corners[(i + 1) % 4];
    return Array.from(
      { length: cuts },
      (_, k) => new THREE.Vector3(x + ((nx - x) * k) / cuts, 0, z + ((nz - z) * k) / cuts),
    );
  });
};

// ---- ground ------------------------------------------------------------------------------------------------------

// height of the drawn ground at world (x, z), for a mark of tile p
export type Ground = (p: Pos, x: number, z: number) => number;

// On the smooth terrain (terrain.ts) the ground slopes for a third of a tile round every change of level, so a mark's
// rim reads the terrain's own vertices (a regular grid); a tile the terrain does not draw at its own height (water,
// bridge, block maps) keeps the tile's plane, like the flat marks
export function groundOf(scene: THREE.Object3D, space: TileSpace): Ground {
  const flat: Ground = (p, x, z) => space.surfaceY(p, x, z) + LIFT;
  const pos = (scene.getObjectByName('terrain') as THREE.Mesh | undefined)?.geometry.getAttribute('position');
  if (!pos) return flat;
  const x0 = pos.getX(0),
    z0 = pos.getZ(0),
    d = pos.getX(1) - x0;
  let vx = 1;
  while (vx < pos.count && pos.getZ(vx) === z0) vx++;
  const vz = pos.count / vx;
  const at = (a: number, b: number) =>
    pos.getY(THREE.MathUtils.clamp(b, 0, vz - 1) * vx + THREE.MathUtils.clamp(a, 0, vx - 1));
  const terrain = (x: number, z: number) => {
    const u = (x - x0) / d,
      v = (z - z0) / d,
      a = Math.floor(u),
      b = Math.floor(v),
      fu = u - a,
      fv = v - b;
    const top = at(a, b) + (at(a + 1, b) - at(a, b)) * fu,
      low = at(a, b + 1) + (at(a + 1, b + 1) - at(a, b + 1)) * fu;
    return top + (low - top) * fv;
  };
  const soft = new Map<string, boolean>();
  return (p, x, z) => {
    const k = posKey(p);
    let s = soft.get(k);
    if (s === undefined) {
      const w = space.world(p);
      s = !space.levels.has(k) && Math.abs(terrain(w.x, w.z) - w.y) < 0.02;
      soft.set(k, s);
    }
    if (!s) return flat(p, x, z);
    // up to BEND off the tile's own plane: the rim rolls over a soft edge, and at a cliff it sinks into the wall that
    // rises or stops short of the drop, instead of climbing it like a fence (seen on Beacon Hill's middle hill)
    const plane = space.surfaceY(p, x, z);
    return plane + THREE.MathUtils.clamp(terrain(x, z) - plane, -BEND, BEND) + LIFT;
  };
}

// `pts` on the ground of tile p, in place
export const onGround = (ground: Ground, p: Pos, pts: THREE.Vector3[], lift = 0) =>
  pts.map((v) => v.setY(ground(p, v.x, v.z) + lift));

// ---- materials ---------------------------------------------------------------------------------------------------

// edge: a marked tile's rim (stone in pedra); trim: rings, cursor, lines and dots (metal in pedra); plate: the glass
// inside a tile; halo: the glow round a neon tube
type Part = 'edge' | 'trim' | 'plate' | 'halo';
export interface PaintOptions {
  part?: Part;
  opacity?: number;
  depthTest?: boolean; // false: drawn over everything (charge lines, shot preview), like the flat ones
  pattern?: MarkPattern; // the plate's drawing
}

const STONE = '#8f887c';
// A material that takes the scene's light. Each keeps `userData.glow`, its resting strength (emissive, or opacity for the
// additive ones), for the pulse. In the transparent queue like the flat marks (after the water, which tinted them);
// the solid parts write depth so a thick piece hides its own far side
export function litPaint(style: Lit, color: string, o: PaintOptions = {}): THREE.Material {
  const part = o.part ?? 'trim',
    over = o.depthTest === false;
  const base = {
    transparent: true,
    opacity: o.opacity ?? 1,
    depthTest: !over,
    depthWrite: !over && part !== 'plate' && part !== 'halo',
  };
  const additive = (opacity: number, map?: THREE.Texture) => {
    const m = new THREE.MeshBasicMaterial({
      ...base,
      color,
      map,
      opacity: opacity * (o.opacity ?? 1),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    m.userData.glow = m.opacity;
    return m;
  };
  if (part === 'halo') return additive(0.16);
  if (style === 'neon' && part === 'plate') return additive(0.2, plate(o.pattern ?? 'frame').map);
  const m = new THREE.MeshStandardMaterial({ ...base, color, emissive: color, envMap: sky() });
  if (part === 'plate') {
    const t = plate(o.pattern ?? 'frame');
    Object.assign(m, { map: t.map, normalMap: t.relief, roughness: 0.16, envMapIntensity: 0.5 });
    m.normalScale.setScalar(0.8);
    m.emissiveIntensity = style === 'luz' ? 0.32 : 0.16;
    m.opacity = (style === 'luz' ? 0.58 : 0.45) * (o.opacity ?? 1);
    if (style === 'luz') m.color.multiplyScalar(0.6); // deep glass under a bright rim
  } else if (style === 'luz') {
    Object.assign(m, { roughness: 0.22, envMapIntensity: 0.9, normalMap: grain(), emissiveIntensity: 0.7 });
    m.normalScale.setScalar(0.35);
  } else if (style === 'neon') {
    m.color.lerp(new THREE.Color('#ffffff'), 0.4); // a hot core in a tube of the mark's colour
    Object.assign(m, { roughness: 0.3, envMapIntensity: 0.4, emissiveIntensity: 1.1 });
  } else if (part === 'edge') {
    m.color.set(STONE).lerp(new THREE.Color(color), 0.4);
    Object.assign(m, { map: cliff(), normalMap: stone(), roughness: 0.92, envMapIntensity: 0.15 });
    m.normalScale.setScalar(1.2);
    m.emissiveIntensity = 0.1;
  } else {
    Object.assign(m, { metalness: 0.85, roughness: 0.34, envMapIntensity: 0.95, normalMap: grain() });
    m.normalScale.setScalar(0.3);
    m.emissiveIntensity = 0.22;
  }
  m.userData.glow = m.emissiveIntensity;
  return m;
}

// the colour of a piece already built (the cursor turns red where the square does not fit)
export function tint(piece: THREE.Object3D, style: Lit, color: string) {
  piece.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial | undefined;
    if (!m) return;
    m.color.set(color);
    if ('emissive' in m) {
      m.emissive.set(color);
      if (style === 'neon') m.color.lerp(new THREE.Color('#ffffff'), 0.4);
    }
  });
}

// the slow breath of the marks: `k` from 0 to 1 (1 at rest, for Reduce motion)
export function pulse(mats: Iterable<THREE.Material>, k: number) {
  for (const m of mats) {
    const glow = m.userData.glow as number;
    if ('emissiveIntensity' in m) (m as THREE.MeshStandardMaterial).emissiveIntensity = glow * (0.7 + 0.3 * k);
    else m.opacity = glow * (0.7 + 0.3 * k);
  }
}

const dressed = <T extends THREE.Mesh>(m: T, style: Lit, over = false) => {
  m.receiveShadow = !over;
  m.castShadow = style === 'pedra' && !over;
  return m;
};

// A strip of half width `w` along the paths as one mesh; neon carries its halo as a child
export function piece(style: Lit, paths: Path[], w: number, color: string, o: PaintOptions = {}): THREE.Mesh {
  const strips = (prof: Profile, smooth: boolean) => {
    const parts = paths.map((p) => sweep(p, prof, smooth));
    const g = parts.length === 1 ? parts[0] : mergeGeometries(parts);
    if (parts.length > 1) for (const p of parts) p.dispose();
    return g;
  };
  const mesh = dressed(
    new THREE.Mesh(strips(profile(style, w), style === 'neon'), litPaint(style, color, { part: 'trim', ...o })),
    style,
    o.depthTest === false,
  );
  if (style === 'neon')
    mesh.add(new THREE.Mesh(strips(tube(w * 1.9), true), litPaint(style, color, { ...o, part: 'halo' })));
  return mesh;
}

// A marked tile as one geometry bent over the ground of tile p: group 0 the rim, 1 the glass plate, 2 neon's halo
// (materials in that order: tileMaterials)
export function tileGeometry(
  style: Lit,
  space: Pick<TileSpace, 'world'>,
  ground: Ground,
  p: Pos,
): THREE.BufferGeometry {
  // around the tile's own place (the mesh stands there, so the transparent pieces sort by where they are)
  const w = space.world(p);
  const y = (x: number, z: number) => ground(p, x + w.x, z + w.z) - w.y;
  const rim = (h: number) => ({ pts: square(h, 4).map((v) => v.setY(y(v.x, v.z))), closed: true });
  const glass = new THREE.PlaneGeometry(0.84, 0.84, 4, 4).rotateX(-Math.PI / 2).toNonIndexed();
  const gp = glass.getAttribute('position');
  for (let i = 0; i < gp.count; i++) gp.setY(i, y(gp.getX(i), gp.getZ(i)) + 0.006);
  glass.computeVertexNormals();
  const parts = [sweep(rim(0.42), profile(style, 0.04), style === 'neon'), glass];
  if (style === 'neon') parts.push(sweep(rim(0.42), tube(0.07), true));
  const g = mergeGeometries(parts, true);
  for (const part of parts) part.dispose();
  return g;
}
export const tileMaterials = (style: Lit, color: string, pattern: MarkPattern, opacity = 1): THREE.Material[] =>
  (style === 'neon' ? (['edge', 'plate', 'halo'] as const) : (['edge', 'plate'] as const)).map((part) =>
    litPaint(style, color, { part, pattern, opacity }),
  );
// A tile mark and a path stud take the scene's shadows and cast none: a curb a few centimetres tall barely shows in the
// sun's shadow map, and casting cost two more draw calls a marked tile (measured: 901 against 586 on Ash Wood's move)
export const dressTile = (m: THREE.Mesh) => {
  m.receiveShadow = true;
  return m;
};

// a round bar from p to q (charge lines, counters, a spell's line), drawn over everything like the flat ones
export function rod(p: THREE.Vector3, q: THREE.Vector3, width: number, mat: THREE.Material, sides = 8): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(width, width, Math.max(1e-3, p.distanceTo(q)), sides).rotateX(Math.PI / 2),
    mat,
  );
  m.position.copy(p).lerp(q, 0.5);
  m.lookAt(q);
  return m;
}
