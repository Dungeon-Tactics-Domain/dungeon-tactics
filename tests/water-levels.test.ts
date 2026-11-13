import { describe, expect, it } from 'vitest';
import { WADE, waterLevels } from '../src/client/water-levels.ts';
import { SCENARIOS } from '../src/shared/battle/scenarios.ts';

// Desenho da água (13/11): o leito da rasa fica onde stand() põe os pés, e a ponte só leva água por baixo quando há vão
describe('níveis da água', () => {
  const STEP = 0.5;

  it('na rasa o leito fica WADE abaixo da superfície (os pés pisam nele) e na funda bem mais fundo', () => {
    const crypt = waterLevels(SCENARIOS.flooded_crypt.grid, STEP);
    const canal = crypt.get('6,6')!;
    expect(canal.deep).toBe(false);
    expect(canal.surface - canal.bed).toBeCloseTo(WADE * STEP);
    const moat = waterLevels(SCENARIOS.crypt_heart.grid, STEP).get('0,3')!;
    expect(moat.deep).toBe(true);
    expect(moat.surface - moat.bed).toBeGreaterThan(WADE * STEP);
  });

  it('ponte rente à água fica sem água por baixo; ponte alta sobre o fosso leva a água das vizinhas', () => {
    expect(waterLevels(SCENARIOS.flooded_crypt.grid, STEP).has('3,6')).toBe(false);
    const heart = waterLevels(SCENARIOS.crypt_heart.grid, STEP);
    expect(heart.get('3,3')).toMatchObject({ under: true, deep: true, surface: heart.get('2,3')!.surface });
  });
});
