import { describe, expect, it } from 'vitest';
import { DEEP_DROP, raisedDeep, WADE, waterLevels } from '../src/client/water-levels.ts';
import { SCENARIOS } from '../src/shared/battle/scenarios.ts';

// Water drawing (Nov 13): the shallow bed sits where stand() puts the feet, and the bridge only carries water underneath when there is a gap
describe('water levels', () => {
  const STEP = 0.5;

  it('in shallow water the bed is WADE below the surface (feet step on it); in deep water the surface is well below the bank', () => {
    const crypt = waterLevels(SCENARIOS.flooded_crypt.grid, STEP);
    const canal = crypt.get('6,6')!;
    expect(canal.deep).toBe(false);
    expect(canal.surface - canal.bed).toBeCloseTo(WADE * STEP);
    const moat = waterLevels(SCENARIOS.crypt_heart.grid, STEP).get('0,3')!;
    expect(moat.deep).toBe(true);
    expect(moat.bed).toBeGreaterThan(0); // the bed does not go below the map base
    expect(moat.bed).toBeLessThan(moat.surface);
    expect(
      (SCENARIOS.crypt_heart.grid.tiles[3 * SCENARIOS.crypt_heart.grid.width].h + 1) * STEP - moat.surface,
    ).toBeCloseTo(DEEP_DROP * STEP);
  });

  it('bridge flush with the water has no water underneath; high bridge over the moat carries the neighbors water', () => {
    expect(waterLevels(SCENARIOS.flooded_crypt.grid, STEP).has('3,6')).toBe(false);
    const heart = waterLevels(SCENARIOS.crypt_heart.grid, STEP);
    expect(heart.get('3,3')).toMatchObject({ under: true, deep: true, surface: heart.get('2,3')!.surface });
  });

  it('wide bridge: the middle tile, which only touches land and bridge, carries the neighboring bridge water (Grove, 3 tiles)', () => {
    const wood = waterLevels(SCENARIOS.ash_wood.grid, STEP);
    for (const k of ['2,4', '3,4', '4,4', '2,5', '3,5', '4,5'])
      expect(wood.get(k)).toMatchObject({ under: true, surface: wood.get('1,4')!.surface });
  });

  it('river without rise and drop: the small deep stretch after the Grove ford sits at shallow height; the larger one stays low', () => {
    const r = raisedDeep(SCENARIOS.ash_wood.grid);
    expect(r.has('11,4') && r.has('11,5')).toBe(true);
    expect(r.has('6,4') || r.has('0,4')).toBe(false);
  });
});
