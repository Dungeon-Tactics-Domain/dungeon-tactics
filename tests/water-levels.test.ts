import { describe, expect, it } from 'vitest';
import { DEEP_DROP, WADE, raisedDeep, waterLevels } from '../src/client/water-levels.ts';
import { SCENARIOS } from '../src/shared/battle/scenarios.ts';

// Desenho da água (13/11): o leito da rasa fica onde stand() põe os pés, e a ponte só leva água por baixo quando há vão
describe('níveis da água', () => {
  const STEP = 0.5;

  it('na rasa o leito fica WADE abaixo da superfície (os pés pisam nele); na funda a superfície fica bem abaixo da margem', () => {
    const crypt = waterLevels(SCENARIOS.flooded_crypt.grid, STEP);
    const canal = crypt.get('6,6')!;
    expect(canal.deep).toBe(false);
    expect(canal.surface - canal.bed).toBeCloseTo(WADE * STEP);
    const moat = waterLevels(SCENARIOS.crypt_heart.grid, STEP).get('0,3')!;
    expect(moat.deep).toBe(true);
    expect(moat.bed).toBeGreaterThan(0); // o leito não desce abaixo da base do mapa
    expect(moat.bed).toBeLessThan(moat.surface);
    expect((SCENARIOS.crypt_heart.grid.tiles[3 * SCENARIOS.crypt_heart.grid.width].h + 1) * STEP - moat.surface).toBeCloseTo(DEEP_DROP * STEP);
  });

  it('ponte rente à água fica sem água por baixo; ponte alta sobre o fosso leva a água das vizinhas', () => {
    expect(waterLevels(SCENARIOS.flooded_crypt.grid, STEP).has('3,6')).toBe(false);
    const heart = waterLevels(SCENARIOS.crypt_heart.grid, STEP);
    expect(heart.get('3,3')).toMatchObject({ under: true, deep: true, surface: heart.get('2,3')!.surface });
  });

  it('rio sem sobe e desce: o trecho fundo pequeno depois do vau do Bosque fica na altura da rasa; o maior fica baixo', () => {
    const r = raisedDeep(SCENARIOS.ash_wood.grid);
    expect(r.has('11,4') && r.has('11,5')).toBe(true);
    expect(r.has('6,4') || r.has('0,4')).toBe(false);
  });
});
