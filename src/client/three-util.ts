// Small Three helpers the board and its surroundings share: fixed draws by position, noise, grid triangles and the
// KayKit palette textures without mipmap.
import * as THREE from 'three';

// seeded draw: the same map always builds the same surroundings
export const seeded = (seed: number) => () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
// fixed draw by position (the same map always draws the same), from 0 to 1
export const hash = (x: number, y: number, k = 0) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453;
  return s - Math.floor(s);
};
export function noise(x: number, z: number) {
  const ix = Math.floor(x),
    iz = Math.floor(z),
    fx = x - ix,
    fz = z - iz,
    u = fx * fx * (3 - 2 * fx),
    v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz),
    b = hash(ix + 1, iz),
    c = hash(ix, iz + 1),
    d = hash(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export const smooth = (a: number, b: number, x: number) => {
  const k = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return k * k * (3 - 2 * k);
};

// two triangles per square of a grid of cols x rows squares whose vertices start at `base`, cols + 1 per row;
// `flip` turns the faces over (a strip laid out toward -x)
export function quads(idx: number[], base: number, cols: number, rows: number, flip = false) {
  for (let b = 0; b < rows; b++)
    for (let a = 0; a < cols; a++) {
      const v = base + b * (cols + 1) + a,
        n = v + cols + 1;
      if (flip) idx.push(v, v + 1, n, v + 1, n + 1, n);
      else idx.push(v, n, v + 1, v + 1, n, n + 1);
    }
  return idx;
}

// KayKit textures are palettes: with mipmap the low-resolution render blends neighboring colors (learned in the POC)
export const nearestPixels = (map: THREE.Texture) =>
  Object.assign(map, {
    generateMipmaps: false,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    needsUpdate: true,
  });

// a board piece: casts and takes shadows, palette without mipmap (a painted piece keeps its own filtering)
export function prepare(o: THREE.Object3D) {
  o.traverse((m) => {
    const mesh = m as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = mesh.receiveShadow = true;
    const mat = mesh.material as THREE.MeshStandardMaterial,
      map = mat.map;
    if (map?.generateMipmaps && !mat.userData.procedural) nearestPixels(map);
  });
  return o;
}
