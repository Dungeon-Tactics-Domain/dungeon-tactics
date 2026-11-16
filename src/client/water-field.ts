// The water's physics: a height field on a fine grid with a damped wave equation, pure and without Three (tested in
// tests/water-field.test.ts). water.ts pokes it from the units and uploads it as a texture for the shaders.

export const FIELD = 8; // cells of the field per tile: a wave of ~0.5 tile still has 4 cells (8 already reads at the 3 px pixel size)
export const AMP = 0.1; // m of height that fit in the 8-bit texture (±): 1 step ≈ 0.8 mm
// wave speed² in cells per step: √0.05 × 60 / 8 ≈ 1.7 tiles/s (the old ring moved 1.5). Stable below 0.5
const C2 = 0.05;
const DAMP = 0.982; // per step: the wave loses 90% in ~2 s
const RELAX = 0.995; // per step: the level returns to normal in ~5 s

// Water height field on a fine grid (FIELD x FIELD per tile), pure and without Three: only the water cells run. A neighboring cell
// of another height (bank, waterfall step) reflects the wave; the current (fx, in cells per step) drags height and
// velocity along with the water (upwind: the mixing it causes vanishes in the damping).
export class WaveField {
  readonly h: Float32Array;
  private readonly v: Float32Array;
  private readonly tmp: Float32Array;
  private readonly cells: Int32Array;
  awake = false;
  constructor(
    readonly nx: number,
    readonly nz: number,
    private readonly lvl: Int32Array,
    private readonly fx: Float32Array,
  ) {
    this.h = new Float32Array(nx * nz);
    this.v = new Float32Array(nx * nz);
    this.tmp = new Float32Array(nx * nz);
    this.cells = Int32Array.from(lvl.keys()).filter((i) => lvl[i] >= 0);
  }

  // sinks a disc of radius r (cells) at (cx, cz) (cells) by `depth` m, more in the middle
  poke(cx: number, cz: number, depth: number, r = 2) {
    for (let z = Math.floor(cz - r); z <= cz + r; z++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        if (x < 0 || z < 0 || x >= this.nx || z >= this.nz || this.lvl[z * this.nx + x] < 0) continue;
        const d2 = ((x + 0.5 - cx) ** 2 + (z + 0.5 - cz) ** 2) / (r * r);
        if (d2 < 1) this.h[z * this.nx + x] -= depth * (1 - d2);
      }
    this.awake = true;
  }

  step() {
    const { h, v, lvl, nx } = this;
    let energy = 0;
    for (const i of this.cells) {
      const l = lvl[i],
        x = i % nx,
        hi = h[i];
      let lap = 0;
      if (x > 0 && lvl[i - 1] === l) lap += h[i - 1] - hi;
      if (x < nx - 1 && lvl[i + 1] === l) lap += h[i + 1] - hi;
      if (i >= nx && lvl[i - nx] === l) lap += h[i - nx] - hi;
      if (i + nx < lvl.length && lvl[i + nx] === l) lap += h[i + nx] - hi;
      v[i] = (v[i] + C2 * lap) * DAMP;
    }
    // RELAX: the touch only sinks (does not give back the water around) and the closed bank keeps the volume; without this the water stayed
    // lower forever and the field never slept
    for (const i of this.cells) {
      h[i] = (h[i] + v[i]) * RELAX;
      energy = Math.max(energy, Math.abs(h[i]) + Math.abs(v[i]));
    }
    this.advect(h);
    this.advect(v);
    // below 0.2 mm nobody sees it: zero it and sleep until the next touch
    if (energy < 2e-4) {
      h.fill(0);
      v.fill(0);
      this.awake = false;
    }
  }

  private advect(a: Float32Array) {
    const { fx, lvl, tmp } = this;
    tmp.set(a);
    for (const i of this.cells) {
      const f = fx[i];
      if (!f) continue;
      const up = i - Math.sign(f); // cell the water comes from (same row: the river runs along x)
      if (lvl[up] === lvl[i] && Math.floor(up / this.nx) === Math.floor(i / this.nx))
        a[i] = tmp[i] + Math.abs(f) * (tmp[up] - tmp[i]);
    }
  }
}
