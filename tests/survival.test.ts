import { describe, expect, it } from 'vitest';
import { parseBest, SURVIVE_TURNS, survivalScenario, turnsLeft } from '../src/client/survival.ts';
import { playAiTurn } from '../src/shared/battle/ai.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { simulate } from '../src/shared/battle/simulate.ts';

// MEASURE=300 npx vitest run tests/survival.test.ts shows the heroes win rate (AI vs AI) and how many came from dawn
const RUNS = Number(
  (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.MEASURE ?? 0,
);

describe('Until Dawn mode', () => {
  it('wins on reaching the final turn or with no enemies; loses with no heroes', () => {
    const s = survivalScenario();
    const st = Battle.start(s, 1).state;
    const outcome = s.rules!.outcome!;
    expect(outcome({ ...st, turnsPlayed: SURVIVE_TURNS - 1 })).toBe('ongoing');
    expect(turnsLeft({ ...st, turnsPlayed: SURVIVE_TURNS - 1 })).toBe(1);
    expect(outcome({ ...st, turnsPlayed: SURVIVE_TURNS })).toBe('victory');
    expect(outcome({ ...st, units: st.units.filter((u) => u.team !== 'enemy') })).toBe('victory');
    expect(outcome({ ...st, turnsPlayed: SURVIVE_TURNS, units: st.units.filter((u) => u.team !== 'hero') })).toBe(
      'defeat',
    );
  });

  it('the saved record only accepts valid turns', () => {
    expect(parseBest(String(SURVIVE_TURNS - 1))).toBe(SURVIVE_TURNS - 1);
    expect(parseBest(String(SURVIVE_TURNS))).toBe(SURVIVE_TURNS);
    for (const bad of ['-1', String(SURVIVE_TURNS + 1), 'x', null, '2.5']) expect(parseBest(bad)).toBe(0);
  });

  it('saves and loads with its own rule (without the Lighthouse it does not lose at once)', () => {
    const b = Battle.start(survivalScenario(), 3);
    const loaded = Battle.load(b.save())!;
    expect(loaded).not.toBeNull();
    expect(loaded.state.outcome).toBe('ongoing');
    expect(simulate(survivalScenario(), 5).turns).toBeGreaterThan(1);
  });

  it.skipIf(!RUNS)(
    'measurement',
    () => {
      for (const turns of [SURVIVE_TURNS - 8, SURVIVE_TURNS, SURVIVE_TURNS + 8]) {
        let won = 0,
          dawn = 0;
        for (let seed = 1; seed <= RUNS; seed++) {
          const r = simulate(survivalScenario(turns), seed);
          if (r.outcome === 'victory') won++;
          if (r.outcome === 'victory' && r.turns >= turns) dawn++;
        }
        console.log(
          `Até o amanhecer, ${turns} turnos: heróis ${((won / RUNS) * 100).toFixed(1)}% (amanhecer ${((dawn / RUNS) * 100).toFixed(1)}%)`,
        );
      }
      // idle heroes (they only pass the turn) against the AI: if this wins more than fighting, the mode rewards standing still
      let still = 0;
      for (let seed = 1; seed <= RUNS; seed++) {
        const b = Battle.start(survivalScenario(), seed);
        while (!b.over && b.state.turnsPlayed < 400) b.actor.team === 'hero' ? b.endTurn() : playAiTurn(b);
        if (b.state.outcome === 'victory') still++;
      }
      console.log(`Até o amanhecer, heróis parados: ${((still / RUNS) * 100).toFixed(1)}%`);
    },
    600_000,
  );
});
