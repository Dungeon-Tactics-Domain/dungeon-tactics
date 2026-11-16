// The crypt around the board: walls, torches, the lit corner posts and the crystals.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { M } from './ambience-moods.ts';

export const WALL = [`${M}wall`, `${M}wall_arched`, `${M}wall_broken`],
  TORCH = `${M}torch_mounted`;

// what the crypt takes from the Ambience: its root, its half size, its ground, and how it draws models and glows
interface CryptHost {
  root: THREE.Group;
  hw: number;
  hh: number;
  height(x: number, z: number): number;
  instances(src: THREE.Object3D, at: THREE.Matrix4[]): void;
  material(src: THREE.Material | null, opts?: THREE.MeshLambertMaterialParameters): THREE.Material;
  air: { glow(p: THREE.Vector3, color: string, size: number, seed: number, light?: THREE.PointLight): void };
}

// Crypt: walls in a rectangle around (facing the board), torches on them, lit torches near the edge
// (with real light) and blue crystals on the floor
export function buildCrypt(a: CryptHost, models: Map<string, THREE.Object3D>, rand: () => number) {
  const gap = 5.5,
    H = 3.4; // wall 5.5 tiles from the edge, 3.4 high: below LIMIT (5.5) with the ground at -1
  const walls = WALL.map(() => [] as THREE.Matrix4[]),
    torches: THREE.Matrix4[] = [];
  const k = H / 4; // the KayKit wall is 4 x 4
  const up = new THREE.Vector3(0, 1, 0);
  const sides = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ] as const;
  sides.forEach(([sx, sz], side) => {
    const along = sx ? a.hh + gap : a.hw + gap; // half width of the side
    const n = Math.ceil((along * 2) / (4 * k));
    const rot = new THREE.Quaternion().setFromAxisAngle(up, -side * (Math.PI / 2));
    for (let i = 0; i < n; i++) {
      const t = -along + (i + 0.5) * ((along * 2) / n);
      const x = sx ? sx * (a.hw + gap) : t,
        z = sz ? sz * (a.hh + gap) : t;
      const y = a.height(x * 0.97, z * 0.97);
      walls[Math.floor(rand() * walls.length)].push(
        new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), rot, new THREE.Vector3((along * 2) / n / 4, k, k)),
      );
      if (i % 2 === 1) {
        // torch on the inner face of the wall, at half height
        const p = new THREE.Vector3(x - sx * 0.55, y + H * 0.55, z - sz * 0.55);
        torches.push(new THREE.Matrix4().compose(p, rot, new THREE.Vector3(1.1, 1.1, 1.1)));
        a.air.glow(p.clone().setY(p.y + 0.55), '#ffa040', 1.4, rand());
      }
    }
  });
  WALL.forEach((name, i) => a.instances(models.get(name)!, walls[i]));
  a.instances(models.get(TORCH)!, torches);
  // standing torches at the four corners, near the edge: their warm light reaches the board (only 4 lights: each one costs on every pixel)
  const posts: THREE.BufferGeometry[] = [],
    crystals: THREE.BufferGeometry[] = [];
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]) {
    const p = new THREE.Vector3(sx * (a.hw + 1.2), 0, sz * (a.hh + 1.2));
    p.y = a.height(p.x, p.z) + 1.6;
    const light = new THREE.PointLight('#ff9a3c', 7, 9, 1.6);
    light.position.copy(p);
    a.root.add(light);
    a.air.glow(p, '#ffa040', 1.8, rand(), light);
    posts.push(new THREE.CylinderGeometry(0.06, 0.08, 1.6, 6).translate(p.x, p.y - 0.8, p.z));
  }
  // crystals: stretched octahedra that glow on their own (MeshBasic, no light), in groups of 3. Posts and crystals in a
  // single drawing each (they were 16 draw calls, double with pixel art)
  for (let i = 0; i < 4; i++) {
    // one side of the rectangle and a point along it: always d tiles from the edge (never on top of the board)
    const d = 1.5 + rand() * 3,
      along = rand() * 2 - 1,
      sign = rand() < 0.5 ? -1 : 1;
    const [x, z] = i % 2 ? [along * (a.hw + d), sign * (a.hh + d)] : [sign * (a.hw + d), along * (a.hh + d)];
    const y = a.height(x, z);
    for (let j = 0; j < 3; j++) {
      const at = new THREE.Vector3(x + (rand() - 0.5) * 0.6, y + 0.3, z + (rand() - 0.5) * 0.6);
      const turn = new THREE.Quaternion().setFromEuler(
        new THREE.Euler((rand() - 0.5) * 0.6, rand() * 3, (rand() - 0.5) * 0.6),
      );
      crystals.push(
        new THREE.OctahedronGeometry(0.18 + rand() * 0.12)
          .scale(1, 2.2, 1)
          .applyMatrix4(new THREE.Matrix4().compose(at, turn, new THREE.Vector3(1, 1, 1))),
      );
    }
    a.air.glow(new THREE.Vector3(x, y + 0.5, z), '#4fd8ff', 1.4, rand());
  }
  a.root.add(
    new THREE.Mesh(mergeGeometries(posts), a.material(null, { color: '#3a2a20' })),
    new THREE.Mesh(mergeGeometries(crystals), new THREE.MeshBasicMaterial({ color: '#7ff3ff' })),
  );
  for (const g of [...posts, ...crystals]) g.dispose();
}
