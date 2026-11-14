import { describe, expect, it } from 'vitest';
import { EXT_RING, outerTop, riverOf, riverOutside } from '../src/client/terrain.ts';
import { waterLevels } from '../src/client/water-levels.ts';
import { SCENARIOS } from '../src/shared/battle/scenarios.ts';

// Smooth terrain and outer river (Nov 13): Ash Wood river starts on the right (the ford, higher) and exits on the left, lower
describe('outer terrain and river', () => {
  const grid = SCENARIOS.ash_wood.grid,
    step = 0.5;
  const levels = waterLevels(grid, step),
    river = riverOf(grid, levels)!;

  it('the Grove river crosses the map and starts on the ford side', () => {
    expect(river.rows).toEqual([4, 5]);
    expect(river.dir).toBe(1);
  });

  it('the outer water only rises on the source side and only drops on the other, in cascades (never rises and drops)', () => {
    const out = riverOutside(grid, step, levels, river);
    const right = Array.from({ length: EXT_RING }, (_, k) => out.get(`${grid.width + k},4`)!.surface);
    const left = Array.from({ length: EXT_RING }, (_, k) => out.get(`${-1 - k},4`)!.surface);
    for (let k = 1; k < EXT_RING; k++) {
      expect(right[k]).toBeGreaterThanOrEqual(right[k - 1]);
      expect(left[k]).toBeLessThanOrEqual(left[k - 1]);
    }
    expect(right.at(-1)!).toBeGreaterThan(right[0]);
    expect(left.at(-1)!).toBeLessThan(left[0]);
  });

  it('the bank on the source side rises with the water (the water is never above the surrounding ground)', () => {
    const out = riverOutside(grid, step, levels, river);
    for (let k = 0; k < EXT_RING; k++)
      expect(outerTop(grid, step, river, grid.width + k, 6)).toBeGreaterThanOrEqual(
        out.get(`${grid.width + k},5`)!.surface - 1e-6,
      );
  });
});
