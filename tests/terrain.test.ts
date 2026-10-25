import { describe, expect, it } from 'vitest';
import { EXT_RING, outerTop, riverOf, riverOutside } from '../src/client/terrain.ts';
import { waterLevels } from '../src/client/water-levels.ts';
import { SCENARIOS } from '../src/shared/battle/scenarios.ts';

// Terreno liso e rio de fora (13/11): o rio do Bosque nasce à direita (o vau, mais alto) e sai à esquerda, mais baixo
describe('terreno de fora e rio', () => {
  const grid = SCENARIOS.ash_wood.grid, step = 0.5;
  const levels = waterLevels(grid, step), river = riverOf(grid, levels)!;

  it('o rio do Bosque cruza o mapa e nasce do lado do vau', () => {
    expect(river.rows).toEqual([4, 5]);
    expect(river.dir).toBe(1);
  });

  it('a água de fora só sobe do lado da nascente e só desce do outro, em cascatas (nunca sobe e desce)', () => {
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

  it('a margem do lado da nascente sobe junto com a água (a água não fica acima do chão em volta)', () => {
    const out = riverOutside(grid, step, levels, river);
    for (let k = 0; k < EXT_RING; k++) expect(outerTop(grid, step, river, grid.width + k, 6)).toBeGreaterThanOrEqual(out.get(`${grid.width + k},5`)!.surface - 1e-6);
  });
});
