// Water with volume and physics (Nov 13, Fernando's request: "truly volumetric water, with physics? this one still looks odd"). The water
// tile is the bed (the scene ground, where the unit steps) plus the volume drawn here:
// - physics: a height field on a fine grid (FIELD cells per tile, damped wave equation on the CPU). A unit that enters,
//   walks, jumps or is pushed sinks the water at that point; the wave spreads, hits the bank and comes back. In the river the current drags
//   the field and the drawing in the direction of the water. The field sleeps when the water calms (nothing runs or goes up to the GPU);
// - surface: a single subdivided mesh, with vertices rising and falling by the field plus a light sway; neighboring tiles
//   of the same height read the same field, so they become one continuous surface;
// - volume: color in bands by depth (shallow light and transparent, shows the bed; deep dark), foam on the bank and
//   on the crests; water steps become an arcing waterfall (the water leaves the edge and falls), the map edge shows the cut of the water.
// Draws only: it reads the units' position from the scene, never the rules.
// Pixel art: the normal pass redraws the scene with MeshNormalMaterial, which ignores the shader here. The mesh keeps an upward normal
// and flat position, so in that pass the water stays a smooth plane (no outline on the waves); the displacement and the
// wave normal only exist in the color pass.
// This file wires the parts and reacts to the units: physics in water-field.ts, geometry in water-mesh.ts, shaders in
// water-shaders.ts.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Grid } from '../shared/battle/grid.ts';
import { pickTiles } from './terrain.ts';
import type { River } from './terrain-outer.ts';
import { AMP, FIELD, WaveField } from './water-field.ts';
import type { WaterLevel } from './water-levels.ts';
import { flowOf, sideGeometries, surfaceGeometry, tileCenter } from './water-mesh.ts';
import { BODIES, COLOR, fallMaterial, surfaceMaterial } from './water-shaders.ts';

const HZ = 60; // physics steps per second of the battle clock (fixed step: the wave does not change with fps)
const IDLE_MS = 1300; // standing in the water: a little nudge from time to time (it breathes)
const WAKE_MS = 110; // walking in the water: wake

interface Body {
  pos: THREE.Vector3;
  wet: boolean;
  rippled: number;
  phase: number;
}
interface Drop {
  p: THREE.Vector3;
  v: THREE.Vector3;
  floor: number;
}

export class Water {
  readonly surface: THREE.InstancedMesh; // water tile on touch (userData.tiles, like the scene tops): invisible plane on the surface
  private readonly drops: THREE.InstancedMesh;
  private readonly live: Drop[] = [];
  private readonly bodies = Array.from({ length: BODIES }, () => new THREE.Vector4());
  private readonly time = { value: 0 };
  private readonly field: WaveField;
  private readonly tex: THREE.DataTexture;
  private readonly seen = new WeakMap<THREE.Object3D, Body>();
  private last = 0;
  private acc = 0;
  private readonly m = new THREE.Matrix4();

  constructor(
    scene: THREE.Scene,
    private readonly grid: Grid,
    private readonly levels: Map<string, WaterLevel>,
    step: number,
    river: River | null = null,
  ) {
    const W = grid.width,
      H = grid.height;
    const tiles = [...levels].map(([k, lv]) => {
      const [x, y] = k.split(',').map(Number);
      return { p: { x, y }, lv };
    });

    // physics field: level of each cell (surface mm; -1 without water) and current in cells per step
    const nx = W * FIELD,
      nz = H * FIELD;
    const lvl = new Int32Array(nx * nz).fill(-1),
      fx = new Float32Array(nx * nz);
    for (const { p, lv } of tiles) {
      for (let b = 0; b < FIELD; b++)
        for (let a = 0; a < FIELD; a++) {
          const i = (p.y * FIELD + b) * nx + p.x * FIELD + a;
          lvl[i] = Math.round(lv.surface * 1000);
          fx[i] = (flowOf(river, p, lv) * FIELD) / HZ;
        }
    }
    this.field = new WaveField(nx, nz, lvl, fx);
    this.tex = new THREE.DataTexture(
      new Uint8Array(nx * nz).fill(128),
      nx,
      nz,
      THREE.RedFormat,
      THREE.UnsignedByteType,
    );
    this.tex.magFilter = this.tex.minFilter = THREE.LinearFilter; // the wave between two cells comes out interpolated, with no steps
    this.tex.needsUpdate = true;

    const shared = () => this.uniforms();
    const water = new THREE.Mesh(surfaceGeometry(grid, levels, tiles, river), surfaceMaterial(shared, this.bodies));
    water.receiveShadow = true;
    // drawn before the other transparent ones: markers, path, cursor and the team ring always stay on top of the water
    water.renderOrder = -1;
    water.name = 'water';
    scene.add(water);
    this.surface = pickTiles(tiles.map(({ p, lv }) => ({ p, at: tileCenter(grid, p, lv.surface) })));
    scene.add(this.surface);
    const sides = sideGeometries(grid, levels, tiles, step);
    if (sides.length) {
      const wall = new THREE.Mesh(mergeGeometries(sides), fallMaterial(shared));
      for (const s of sides) s.dispose();
      wall.renderOrder = -1;
      wall.name = 'waterfalls';
      scene.add(wall);
    }
    // splash drops: little cubes (pixels, like the bits in fx.ts) in a single InstancedMesh, up to 64 in the air
    this.drops = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.07, 0.07, 0.07),
      new THREE.MeshLambertMaterial({ color: COLOR.drop, emissive: '#3d7fa6' }),
      64,
    );
    this.drops.count = 0;
    this.drops.frustumCulled = false; // the drops move: the culling sphere computed once would go stale
    scene.add(this.drops);
  }

  private uniforms() {
    return {
      uTime: this.time,
      uField: { value: this.tex },
      uMap: { value: new THREE.Vector2(this.grid.width, this.grid.height) },
    };
  }

  private spray(at: THREE.Vector3, floor: number, n: number, power: number) {
    for (let i = 0; i < n && this.live.length < this.drops.instanceMatrix.count; i++) {
      const a = Math.random() * Math.PI * 2,
        out = (0.4 + Math.random() * 0.8) * power;
      this.live.push({
        p: at.clone().setY(floor),
        v: new THREE.Vector3(Math.cos(a) * out, (1.4 + Math.random() * 1.4) * power, Math.sin(a) * out),
        floor,
      });
    }
  }

  private levelAt(p: THREE.Vector3) {
    return this.levels.get(`${Math.floor(p.x + this.grid.width / 2)},${Math.floor(p.z + this.grid.height / 2)}`);
  }

  // sinks the water at world (x, z) by `depth` m, in a disc of `r` tiles
  private poke(x: number, z: number, depth: number, r = 0.28) {
    this.field.poke((x + this.grid.width / 2) * FIELD, (z + this.grid.height / 2) * FIELD, depth, r * FIELD);
  }

  // Every frame, on the battle clock (`t` in ms): whoever crossed the surface going down sinks the water and splashes by
  // speed (the push is faster than the jump, so it moves it more), whoever walks leaves a wake, whoever stands still breathes and
  // gets the foam collar. Then the physics runs in fixed steps of 1/HZ s. All of it comes from the units' position, with no hook into the
  // events.
  update(t: number, units: Iterable<{ holder: THREE.Object3D }>) {
    const dt = Math.min(0.1, Math.max(0, t - this.last) / 1000);
    this.last = t;
    this.time.value = t / 1000;
    let n = 0;
    for (const { holder } of units) {
      const pos = holder.position;
      const lv = this.levelAt(pos);
      const wet = holder.visible && !!lv && pos.y < lv.surface - 0.01;
      const b = this.seen.get(holder);
      if (!b) {
        // idle ones out of phase: two units in the water do not breathe together
        this.seen.set(holder, {
          pos: pos.clone(),
          wet,
          rippled: t - Math.random() * IDLE_MS,
          phase: Math.random() * 6,
        });
        continue;
      }
      // ground speed (m/s of the battle clock): jump down a step ~2.2, walk ~1.7, push ~3.8. The vertical does not
      // work to tell them apart: the jump crosses the surface at ~3 m/s in total, almost the same as the push
      const speed = dt ? Math.hypot(pos.x - b.pos.x, pos.z - b.pos.z) / dt : 0;
      // far above the push is sync or undo putting the unit in place in one frame: no wave
      const snap = speed > 8 || Math.abs(pos.y - b.pos.y) / Math.max(dt, 0.001) > 8;
      const walking = speed > 0.3 && !snap;
      if (wet && !b.wet && !snap && (speed || pos.y !== b.pos.y)) {
        const k = THREE.MathUtils.clamp((speed - 1.5) / 2.3, 0, 1); // jump ~0.3, push 1
        this.poke(pos.x, pos.z, 0.07 + 0.07 * k, 0.3 + 0.1 * k);
        this.spray(pos, lv!.surface, 6 + Math.round(14 * k), 0.7 + 0.6 * k);
        b.rippled = t;
      } else if (!wet && b.wet && !snap)
        this.poke(b.pos.x, b.pos.z, -0.04); // left: the water returns to the hole
      else if (wet && t - b.rippled >= (walking ? WAKE_MS : IDLE_MS)) {
        this.poke(pos.x, pos.z, walking ? 0.03 : 0.012, walking ? 0.25 : 0.22);
        b.rippled = t;
      }
      if (wet && n < BODIES) this.bodies[n++].set(pos.x, pos.z, 1, b.phase);
      b.pos.copy(pos);
      b.wet = wet;
    }
    for (let i = n; i < BODIES; i++) this.bodies[i].z = 0;
    this.simulate(dt);
    this.fall(dt);
  }

  private simulate(dt: number) {
    if (!this.field.awake) {
      this.acc = 0;
      return;
    }
    // at most 6 steps per frame: a stalled frame does not become an avalanche of steps
    this.acc = Math.min(this.acc + dt * HZ, 6);
    for (; this.acc >= 1; this.acc--) this.field.step();
    const data = this.tex.image.data as Uint8Array,
      h = this.field.h;
    for (let i = 0; i < h.length; i++) data[i] = Math.max(0, Math.min(255, Math.round(128 + (h[i] / AMP) * 127)));
    this.tex.needsUpdate = true;
  }

  private fall(dt: number) {
    if (!this.live.length && !this.drops.count) return;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const d = this.live[i];
      d.v.y -= 9 * dt;
      d.p.addScaledVector(d.v, dt);
      if (d.p.y < d.floor && d.v.y < 0) {
        this.live.splice(i, 1);
        this.poke(d.p.x, d.p.z, 0.004, 0.12); // the returning drop makes its own little ring
      }
    }
    this.live.forEach((d, i) => this.drops.setMatrixAt(i, this.m.makeTranslation(d.p.x, d.p.y, d.p.z)));
    this.drops.count = this.live.length;
    this.drops.instanceMatrix.needsUpdate = true;
  }
}
