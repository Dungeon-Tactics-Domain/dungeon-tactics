// The see-through hole: tree crowns, the ground and the block walls open a hole in front of the units, the cursor and the
// marked tiles. One set of points per board, given by the scene every frame, shared by every material that cuts.
import * as THREE from 'three';
import { hiddenAt, viewAngles } from '../camera-aim.ts';
import type { TileSpace } from './space.ts';

// Cap of points per frame (9 units, the cursor and the marked tiles)
const CUT_MAX = 64;
// Ground cut (Fernando, Nov 25: "nesse terreno de elevacao ... tbm deve mostrar transparece ... como eh feito nas
// arvores"): only ground standing this far above the point's own floor is cut, so the floor it stands on stays
const FLOOR_GAP = 0.08;
// Cap of hidden points the ground looks at: bounds its loop, and leaves the crowns room for every unit (a move range in a
// walled crawl room hides 22 to 35 marked cells)
const GROUND_MAX = 32;
const FEET = 0.15; // how high over its floor a point's feet are tested for being hidden
const TMP = new THREE.Vector3(); // per-frame math without creating objects

// a point to open the hole for: its place, radius and the height of the floor under it
export type CutAdd = (x: number, y: number, z: number, r: number, floor: number) => void;
export type Protect = (add: CutAdd) => void;

export class SeeThrough {
  // points in camera coordinates (xyz) with their radius (w); each one's floor height measured along the camera's up
  private readonly points = { value: Array.from({ length: CUT_MAX }, () => new THREE.Vector4()) };
  private readonly floors = { value: new Array<number>(CUT_MAX).fill(0) };
  private readonly count = { value: 0 };
  // the first `hidden` points are the ones taller ground hides from the camera: the ground looks only at those (a move
  // range gave the ground all 64 points: a crawl room's frame went from about 300 to 500 ms in software rendering)
  private readonly hidden = { value: 0 };
  private readonly up = { value: new THREE.Vector3(0, 1, 0) }; // the world's up in camera coordinates

  // `space`: the board's map and level height, read each frame (the map builder swaps the map in place)
  constructor(private readonly space: TileSpace) {}

  // The material discards what stands in front (closer to the camera) of a point and within its radius on screen; the
  // hole's edge comes out checkered, in the 16-bit way. A crown is cut whole; the ground (`ground`) only above the floor
  // of the point. Patches `m` itself, once, after the shader changes it already has (kept in the program's key)
  cut<M extends THREE.Material>(m: M, ground: boolean): M {
    if (m.userData.cut) return m;
    m.userData.cut = true;
    const before = m.onBeforeCompile,
      key = m.customProgramCacheKey();
    m.allowOverride = false;
    m.customProgramCacheKey = () => `cut${CUT_MAX}${ground ? 'g' : 'c'}${key}`;
    m.onBeforeCompile = (s, r) => {
      before.call(m, s, r);
      Object.assign(s.uniforms, {
        cutPoints: this.points,
        cutFloors: this.floors,
        cutCount: ground ? this.hidden : this.count,
        cutUp: this.up,
      });
      const above = ground ? ` && dot(viewPos, cutUp) > cutFloors[i] + ${FLOOR_GAP}` : '';
      // its own varying: the flat look (MeshBasicMaterial, the edge walls) has no vViewPosition
      s.vertexShader = `varying vec3 vCutPos;\n${s.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvCutPos = mvPosition.xyz;')}`;
      s.fragmentShader = s.fragmentShader
        .replace(
          'void main() {',
          `varying vec3 vCutPos;\nuniform vec4 cutPoints[${CUT_MAX}];\nuniform float cutFloors[${CUT_MAX}];\nuniform int cutCount;\nuniform vec3 cutUp;\nvoid main() {`,
        )
        .replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
          vec3 viewPos = vCutPos;
          for (int i = 0; i < ${CUT_MAX}; i++) {
            if (i >= cutCount) break;
            vec4 c = cutPoints[i];
            float d = distance(viewPos.xy, c.xy);
            if (viewPos.z > c.z + 0.3 && d < c.w && (d < c.w * 0.7 || mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0) < 1.0)${above}) discard;
          }`,
        );
    };
    m.needsUpdate = true;
    return m;
  }
  // a copy that cuts the ground, for a material other pieces share (Material.clone leaves the shader changes behind)
  ground(src: THREE.Material): THREE.Material {
    const m = src.clone();
    m.onBeforeCompile = src.onBeforeCompile;
    m.customProgramCacheKey = src.customProgramCacheKey;
    return this.cut(m, true);
  }

  // Points to open a hole for, given by the scene every frame (each unit's body, the cursor and the marked tiles), with
  // the height of the floor under each; `view`: the camera's view matrix
  update(view: THREE.Matrix4, protect: Protect) {
    const pts = this.points.value,
      floors = this.floors.value,
      { yaw, pitch } = viewAngles(view.elements);
    this.up.value.set(0, 1, 0).transformDirection(view);
    // the body or its feet: a ledge in front can hide only the legs
    const hides = (at: { x: number; y: number; z: number }) =>
      hiddenAt(this.space.grid, this.space.step, at, yaw, pitch);
    let n = 0;
    // the hidden points first, then the rest
    for (const want of [true, false]) {
      protect((x, y, z, r, floor) => {
        if (n >= (want ? GROUND_MAX : CUT_MAX) || (hides({ x, y, z }) || hides({ x, y: floor + FEET, z })) !== want)
          return;
        TMP.set(x, y, z).applyMatrix4(view);
        pts[n].set(TMP.x, TMP.y, TMP.z, r);
        floors[n++] = TMP.set(x, floor, z).applyMatrix4(view).dot(this.up.value);
      });
      if (want) this.hidden.value = n;
    }
    this.count.value = n;
  }
}
