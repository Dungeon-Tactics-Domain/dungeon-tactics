import { describe, expect, it } from 'vitest';
import { chooseTurn } from '../src/shared/battle/ai.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { FIRST_BATTLE, SCENARIOS } from '../src/shared/battle/scenarios.ts';
import { simulate } from '../src/shared/battle/simulate.ts';

const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);
const MAX_TURNS = 300;

describe('IA contra IA', () => {
  const runs = SEEDS.map((seed) => simulate(SCENARIOS.skirmish, seed, MAX_TURNS));

  it('toda batalha termina antes do teto de turnos (nunca trava)', () => {
    for (const r of runs) expect(r.outcome, `semente com ${r.turns} turnos`).not.toBe('timeout');
  });

  // Medido em 11/11 com `npm run sim -- skirmish 1000`: heróis vencem 62,8% em ~44 turnos (em 25/10 eram 66,5% em ~51,
  // antes de a IA avançar sem alvo e de o farol ir a 50 de vida). Aqui só se exige que seja vencível e que o inimigo cause dano.
  it('é vencível e o inimigo machuca', () => {
    expect(runs.some((r) => r.outcome === 'victory')).toBe(true);
    expect(runs.some((r) => r.events.some((e) => e.k === 'hit' && e.dmg > 0))).toBe(true);
    expect(runs.some((r) => r.heroesAlive < 4)).toBe(true);
  });

  it('a mesma semente dá exatamente a mesma batalha', () => {
    expect(simulate(SCENARIOS.skirmish, 7).events).toEqual(simulate(SCENARIOS.skirmish, 7).events);
  });
});

// Medido em 11/11 com `npm run sim -- beacon_hill 1000`: heróis vencem 53,3% em ~64 turnos (~35 dos heróis), sem travar
describe('IA contra IA na 1ª batalha (20x20)', () => {
  const runs = SEEDS.map((seed) => simulate(FIRST_BATTLE, seed, MAX_TURNS));

  it('termina antes do teto, com vitórias e derrotas', () => {
    for (const r of runs) expect(r.outcome, `semente com ${r.turns} turnos`).not.toBe('timeout');
    expect(runs.some((r) => r.outcome === 'victory')).toBe(true);
    expect(runs.some((r) => r.outcome === 'defeat')).toBe(true);
  });

  it('conta os turnos dos heróis à parte', () => {
    for (const r of runs) {
      expect(r.heroTurns).toBeGreaterThan(0);
      expect(r.heroTurns).toBeLessThan(r.turns);
    }
  });
});

describe('escolha da IA', () => {
  it('não muda o estado ao decidir', () => {
    const b = Battle.start(SCENARIOS.skirmish, 3);
    const before = JSON.stringify(b.state);
    chooseTurn(b.grid, b.state, b.actor.id);
    expect(JSON.stringify(b.state)).toBe(before);
  });
});
