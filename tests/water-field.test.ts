import { describe, expect, it } from 'vitest';
import { WaveField } from '../src/client/water.ts';

// 20x5 water strip with land in the last column; optional current
const strip = (flow = 0) => {
  const nx = 21, nz = 5, lvl = new Int32Array(nx * nz).fill(0), fx = new Float32Array(nx * nz).fill(flow);
  for (let z = 0; z < nz; z++) { lvl[z * nx + nx - 1] = -1; fx[z * nx + nx - 1] = 0; }
  return new WaveField(nx, nz, lvl, fx);
};

describe('water wave field', () => {
  it('the touch spreads, does not pass to land, and the water calms and sleeps', () => {
    const f = strip();
    f.poke(5, 2.5, 0.08);
    for (let i = 0; i < 20; i++) f.step();
    expect(Math.abs(f.h[2 * 21 + 10])).toBeGreaterThan(1e-4); // reached 5 cells ahead
    expect(f.h[2 * 21 + 20]).toBe(0); // land
    for (let i = 0; i < 2000 && f.awake; i++) f.step();
    expect(f.awake).toBe(false);
    expect(f.h.every((v) => v === 0)).toBe(true);
  });

  it('the current drags the wave in the water direction', () => {
    const still = strip(), flowing = strip(-0.1); // -x
    for (const f of [still, flowing]) { f.poke(10, 2.5, 0.08); for (let i = 0; i < 30; i++) f.step(); }
    const center = (f: WaveField) => { let s = 0, w = 0; for (let x = 0; x < 20; x++) { const a = Math.abs(f.h[2 * 21 + x]); s += a * x; w += a; } return s / w; };
    expect(center(flowing)).toBeLessThan(center(still) - 1);
  });
});
