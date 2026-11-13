import { describe, expect, it } from 'vitest';
import { Battle } from '../src/shared/battle/battle.ts';
import { simulate } from '../src/shared/battle/simulate.ts';
import { SURVIVE_TURNS, survivalScenario, turnsLeft } from '../src/client/survival.ts';

// MEDIR=300 npx vitest run tests/survival.test.ts mostra a vitória dos heróis (IA contra IA) e quantas vieram do amanhecer
const RUNS = Number((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.MEDIR ?? 0);

describe('modo Até o amanhecer', () => {
  it('vence ao chegar no turno final ou sem inimigos; perde sem heróis', () => {
    const s = survivalScenario();
    const st = Battle.start(s, 1).state;
    const outcome = s.rules!.outcome!;
    expect(outcome({ ...st, turnsPlayed: SURVIVE_TURNS - 1 })).toBe('ongoing');
    expect(turnsLeft({ ...st, turnsPlayed: SURVIVE_TURNS - 1 })).toBe(1);
    expect(outcome({ ...st, turnsPlayed: SURVIVE_TURNS })).toBe('victory');
    expect(outcome({ ...st, units: st.units.filter((u) => u.team !== 'enemy') })).toBe('victory');
    expect(outcome({ ...st, turnsPlayed: SURVIVE_TURNS, units: st.units.filter((u) => u.team !== 'hero') })).toBe('defeat');
  });

  it('salva e carrega com a regra própria (sem Farol não perde na hora)', () => {
    const b = Battle.start(survivalScenario(), 3);
    const loaded = Battle.load(b.save())!;
    expect(loaded).not.toBeNull();
    expect(loaded.state.outcome).toBe('ongoing');
    expect(simulate(survivalScenario(), 5).turns).toBeGreaterThan(1);
  });

  it.skipIf(!RUNS)('medição', () => {
    for (const turns of [SURVIVE_TURNS - 4, SURVIVE_TURNS, SURVIVE_TURNS + 4]) {
      let won = 0, dawn = 0;
      for (let seed = 1; seed <= RUNS; seed++) {
        const r = simulate(survivalScenario(turns), seed);
        if (r.outcome === 'victory') won++;
        if (r.outcome === 'victory' && r.turns >= turns) dawn++;
      }
      console.log(`Até o amanhecer, ${turns} turnos: heróis ${((won / RUNS) * 100).toFixed(1)}% (amanhecer ${((dawn / RUNS) * 100).toFixed(1)}%)`);
    }
  }, 600_000);
});
