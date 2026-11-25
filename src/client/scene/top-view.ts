// Top view of the battle (Fernando, Nov 25; math in ../top-view.ts): the API the game and the later map builder use
// (on, off, toggle, isTop) over the camera's straight-down view, and the height reading it needs from above, where the
// steps no longer show: a light shade per cell by height and a small number on every tile above 0. Both are two merged
// meshes, seen only in the top view; the numbers are laid again on each quarter turn so they always read upright.
import * as THREE from 'three';
import { subOf } from '../../shared/battle/grid.ts';
import type { Pos } from '../../shared/battle/types.ts';
import { tileHeight } from '../tile-info.ts';
import type { CameraRig } from './camera.ts';
import type { TileSpace } from './space.ts';

const LOW = new THREE.Color('#14101e'); // the lowest ground darkens a little, the highest lightens
const HIGH = new THREE.Color('#fff4d8');
const CELL = 64; // px of one number in the atlas
const LIFT = 0.03; // over the ground, under the units' feet

interface Label {
  x: number;
  z: number;
  size: number; // half the side, world units
  n: number;
}

export class TopView {
  private readonly shade: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly numbers: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly labels: Label[] = [];
  private quarter = Number.NaN; // the quarter turn the numbers were laid for
  private readonly max: number; // the highest tile: the atlas holds 1 to max

  constructor(
    private readonly cam: CameraRig,
    private readonly scene: THREE.Scene,
    private readonly space: TileSpace,
  ) {
    const grid = space.grid,
      cells: Pos[] = [];
    for (let y = 0; y < grid.height; y++) for (let x = 0; x < grid.width; x++) cells.push({ x, y });
    const max = (this.max = Math.max(1, ...cells.map((p) => tileHeight(grid, p))));
    // shade: one quad per cell on its ground, coloured by its height
    const pos: number[] = [],
      col: number[] = [];
    for (const p of cells) {
      const c = LOW.clone().lerp(HIGH, tileHeight(grid, p) / max);
      for (const v of this.quad(space.world(p).x, space.world(p).z, 0.5, 0)) pos.push(...v);
      for (let i = 0; i < 6; i++) col.push(c.r, c.g, c.b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    this.shade = new THREE.Mesh(
      g,
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.3, depthWrite: false }),
    );
    // numbers: one per whole tile when its half tiles share a height, else one per half tile
    const k = subOf(grid);
    for (let by = 0; by < grid.height; by += k)
      for (let bx = 0; bx < grid.width; bx += k) {
        const block = cells.filter((p) => p.x >= bx && p.x < bx + k && p.y >= by && p.y < by + k);
        const hs = new Set(block.map((p) => tileHeight(grid, p)));
        const whole = block.length === k * k && hs.size === 1;
        const each = whole ? [block[0]] : block;
        for (const p of each) {
          const n = tileHeight(grid, p),
            w = space.world(p),
            mid = whole ? (k - 1) / 2 : 0;
          if (n > 0) this.labels.push({ x: w.x + mid, z: w.z + mid, size: whole ? 0.32 * k : 0.32, n });
        }
      }
    this.numbers = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({ map: atlas(max), transparent: true, depthWrite: false }),
    );
    this.shade.visible = this.numbers.visible = false;
    this.numbers.renderOrder = 1; // over the shade
    scene.add(this.shade, this.numbers);
  }

  // the map builder's edit (BattleScene.setGrid): shade and numbers again on the space's new map
  again(): TopView {
    this.scene.remove(this.shade, this.numbers);
    // the materials stay: disposed, their shaders would be compiled again for the next ones (the scene frees them)
    for (const m of [this.shade, this.numbers]) {
      m.geometry.dispose();
      m.material.map?.dispose();
    }
    return new TopView(this.cam, this.scene, this.space);
  }

  get isTop() {
    return this.cam.isTop;
  }
  on = () => this.cam.setTop(true);
  off = () => this.cam.setTop(false);
  toggle = () => this.cam.setTop(!this.cam.isTop);

  // every frame: seen only from above; the numbers turn with the map
  update() {
    const shown = this.cam.topShown;
    this.shade.visible = this.numbers.visible = shown;
    const q = Math.round(this.cam.heading / (Math.PI / 2));
    if (!shown || q === this.quarter) return;
    this.quarter = q;
    const yaw = q * (Math.PI / 2),
      n = this.max,
      pos: number[] = [],
      uv: number[] = [];
    for (const l of this.labels) {
      for (const v of this.quad(l.x, l.z, l.size, yaw)) pos.push(...v);
      const u0 = (l.n - 1) / n,
        u1 = l.n / n;
      uv.push(u0, 0, u1, 0, u1, 1, u0, 0, u1, 1, u0, 1);
    }
    const g = this.numbers.geometry;
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeBoundingSphere();
  }

  // two triangles on the ground, centred on (x, z), turned so their up is the screen's up at `yaw`; each corner on the
  // ground of the cell it falls in (a hair inside, so a cell's own quad stays on that cell), so a ramp carries it
  private quad(x: number, z: number, size: number, yaw: number): number[][] {
    const r = { x: Math.cos(yaw) * size, z: -Math.sin(yaw) * size },
      u = { x: -Math.sin(yaw) * size, z: -Math.cos(yaw) * size },
      corner = (a: number, b: number) => {
        const cx = x + a * r.x + b * u.x,
          cz = z + a * r.z + b * u.z;
        const { width, height } = this.space.grid,
          at = {
            x: Math.min(width - 1, Math.max(0, Math.floor(x + 0.99 * (cx - x) + width / 2))),
            y: Math.min(height - 1, Math.max(0, Math.floor(z + 0.99 * (cz - z) + height / 2))),
          };
        return [cx, this.space.surfaceY(at, cx, cz) + LIFT, cz];
      };
    const bl = corner(-1, -1),
      br = corner(1, -1),
      tr = corner(1, 1),
      tl = corner(-1, 1);
    return [bl, br, tr, bl, tr, tl];
  }
}

// the numbers 1..max side by side, light with a dark edge so they read on grass and on stone
function atlas(max: number) {
  const c = document.createElement('canvas');
  c.width = CELL * max;
  c.height = CELL;
  const g = c.getContext('2d')!;
  g.font = `bold ${CELL * 0.62}px sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = CELL * 0.12;
  g.strokeStyle = '#14101e';
  g.fillStyle = '#fff4d8';
  for (let n = 1; n <= max; n++) {
    g.strokeText(String(n), CELL * (n - 0.5), CELL / 2);
    g.fillText(String(n), CELL * (n - 0.5), CELL / 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
