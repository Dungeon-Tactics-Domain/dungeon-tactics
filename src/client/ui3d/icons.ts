// Low-poly icons of the 3D UI kit (ui3d/; Fernando, Nov 16: low-poly icons, pixel filter on demand): the builder that
// merges boxes, cones and cylinders into one geometry with a colour per part, the counted cache of built models, and the
// material that shades them flat in a few tone steps. The pixel-art look comes from the blocky shapes and the short ramp;
// ?pixel=1 adds the filter on top (pixel.ts). A model fits a cube of side 1 around the origin and faces +z.
import {
  BackSide,
  BoxGeometry,
  BufferAttribute,
  type BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  FrontSide,
  Matrix4,
  OctahedronGeometry,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type V3 = [number, number, number];
export interface Part {
  g: BufferGeometry;
  c: number;
  p: V3;
  r: V3;
  s: V3;
}
export const part = (g: BufferGeometry, c: number, p: V3 = [0, 0, 0], r: V3 = [0, 0, 0], s: V3 = [1, 1, 1]): Part => ({
  g,
  c,
  p,
  r,
  s,
});
export const box = (w: number, h: number, d: number) => new BoxGeometry(w, h, d);
export const cyl = (r: number, h: number, n: number, top = r) => new CylinderGeometry(top, r, h, n);
export const cone = (r: number, h: number, n: number) => new ConeGeometry(r, h, n);
export const gem = (r: number) => new OctahedronGeometry(r);
export const ball = (r: number) => new SphereGeometry(r, 7, 5);
// square pyramid with its base along the axes (a 4-sided cone comes turned 45°)
export const pyramid = (side: number, h: number) => cone(side / Math.SQRT2, h, 4).rotateY(Math.PI / 4);

// Parts merged into one geometry: `tint` carries each part's colour as the sRGB bytes of its hex (the shaders of this
// kit work on screen colours, as measured on the reference, with no colour-space conversion)
export function build(parts: Part[]): BufferGeometry {
  const m = new Matrix4();
  const merged = mergeGeometries(
    parts.map(({ g, c, p, r, s }) => {
      const geo = g.index ? g.toNonIndexed() : g;
      geo.applyMatrix4(m.compose(new Vector3(...p), new Quaternion().setFromEuler(new Euler(...r)), new Vector3(...s)));
      const n = geo.attributes.position.count;
      const tint = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) tint.set([(c >> 16) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255], i * 3);
      geo.setAttribute('tint', new BufferAttribute(tint, 3));
      geo.deleteAttribute('uv');
      return geo;
    }),
  );
  for (const { g } of parts) g.dispose();
  return merged;
}

// One geometry per model for the whole page, counted: a screen takes what it shows and gives it back when it leaves, so
// one screen's dispose never frees a model another still draws
const cache = new Map<string, { g: BufferGeometry; uses: number }>();
export function takeGeometry(key: string, make: () => BufferGeometry): BufferGeometry {
  let e = cache.get(key);
  if (!e) cache.set(key, (e = { g: make(), uses: 0 }));
  e.uses++;
  return e.g;
}
export function dropGeometry(key: string) {
  const e = cache.get(key);
  if (!e || --e.uses > 0) return;
  e.g.dispose();
  cache.delete(key);
}

const VERT = `
attribute vec3 tint;
uniform float uHull;
varying vec3 vTint;
varying vec3 vView;
void main() {
  vTint = tint;
  vec4 mv = modelViewMatrix * vec4(position + normal * uHull, 1.0);
  vView = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;
// Flat faces (the normal comes from the screen derivatives, so the merged parts need no smoothing groups) lit from the
// upper left in four tone steps, warm in the light and cool in the shade like a pixel-art ramp. uGray: a greyed row;
// uFlash: the white of a confirmed row; uInk: the dark hull of the outline
const FRAG = `
precision highp float;
uniform float uGray;
uniform float uFlash;
uniform float uInk;
varying vec3 vTint;
varying vec3 vView;
void main() {
  vec3 n = normalize(cross(dFdx(vView), dFdy(vView)));
  float d = dot(n, normalize(vec3(-0.45, 0.65, 0.62)));
  float tone = d > 0.55 ? 1.12 : d > 0.1 ? 0.93 : d > -0.3 ? 0.72 : 0.54;
  vec3 c = vTint * tone * mix(vec3(0.88, 0.91, 1.04), vec3(1.03, 1.0, 0.95), smoothstep(-0.3, 0.6, d));
  float g = dot(c, vec3(0.3, 0.59, 0.11));
  c = mix(c, vec3(g) * vec3(0.78, 0.76, 0.7) + 0.2, uGray);
  c = mix(c + uFlash, vec3(0.2, 0.17, 0.12), uInk);
  gl_FragColor = vec4(c, 1.0);
}`;

// each mesh gets its own material: grey and flash differ per icon. `hull` (in model units) grows the mesh along its
// normals and draws only its back faces in ink: an outline around the silhouette
export function iconMaterial(hull = 0): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: hull ? BackSide : FrontSide,
    uniforms: {
      uHull: { value: hull },
      uGray: { value: 0 },
      uFlash: { value: 0 },
      uInk: { value: hull ? 1 : 0 },
    },
  });
}
