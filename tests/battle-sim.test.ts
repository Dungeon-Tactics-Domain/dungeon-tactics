import { describe, expect, it } from 'vitest';
import { chooseTurn } from '../src/shared/battle/ai.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { FIRST_BATTLE, SCENARIOS } from '../src/shared/battle/scenarios.ts';
import { simulate } from '../src/shared/battle/simulate.ts';

const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);
const MAX_TURNS = 300;

describe('AI vs AI', () => {
  const runs = SEEDS.map((seed) => simulate(SCENARIOS.skirmish, seed, MAX_TURNS));

  it('every battle ends before the turn cap (never hangs)', () => {
    for (const r of runs) expect(r.outcome, `semente com ${r.turns} turnos`).not.toBe('timeout');
  });

  // Measured on Nov 11 with `npm run sim -- skirmish 1000`: heroes win 62.8% in ~44 turns (on Oct 25 it was 66.5% in ~51,
  // before the AI advanced without a target and the beacon went to 50 HP). Here we only require that it is winnable and the enemy deals damage.
  it('is winnable and the enemy hurts', () => {
    expect(runs.some((r) => r.outcome === 'victory')).toBe(true);
    expect(runs.some((r) => r.events.some((e) => e.k === 'hit' && e.dmg > 0))).toBe(true);
    expect(runs.some((r) => r.heroesAlive < 4)).toBe(true);
  });

  it('the same seed gives exactly the same battle', () => {
    expect(simulate(SCENARIOS.skirmish, 7).events).toEqual(simulate(SCENARIOS.skirmish, 7).events);
  });
});

// Measured on Nov 11 with `npm run sim -- beacon_hill 1000`: heroes win 53.3% in ~64 turns (~35 by heroes), no hangs
describe('AI vs AI in the 1st battle (20x20)', () => {
  const runs = SEEDS.map((seed) => simulate(FIRST_BATTLE, seed, MAX_TURNS));

  it('ends before the cap, with wins and losses', () => {
    for (const r of runs) expect(r.outcome, `semente com ${r.turns} turnos`).not.toBe('timeout');
    expect(runs.some((r) => r.outcome === 'victory')).toBe(true);
    expect(runs.some((r) => r.outcome === 'defeat')).toBe(true);
  });

  it("counts the heroes' turns separately", () => {
    for (const r of runs) {
      expect(r.heroTurns).toBeGreaterThan(0);
      expect(r.heroTurns).toBeLessThan(r.turns);
    }
  });
});

describe('AI choice', () => {
  it('does not change the state when deciding', () => {
    const b = Battle.start(SCENARIOS.skirmish, 3);
    const before = JSON.stringify(b.state);
    chooseTurn(b.grid, b.state, b.actor.id);
    expect(JSON.stringify(b.state)).toBe(before);
  });
});
