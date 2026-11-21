import { describe, expect, it } from 'vitest';
import { checkOutcome, previewAbility, resolveAbility } from '../src/shared/battle/combat.ts';
import { reachable } from '../src/shared/battle/pathing.ts';
import { SCENARIOS } from '../src/shared/battle/scenarios.ts';
import { resistOf, UNIT_DEFS } from '../src/shared/battle/units.ts';
import { BASH, BASHER, flat, gridOf, stateOf } from './battle-helpers.ts';

// Per-scenario rules (Nov 11): a scenario swaps hit chance, jump, fall, damage roll and battle end without touching the
// game rules. A scenario without `rules` (all game ones) works as before; the other tests already cover that.
describe('scenario rules', () => {
  const grid = flat(6, 6);
  const withRules = (rules: object, units: Parameters<typeof stateOf>[0]) => {
    SCENARIOS.test_rules = { id: 'test_rules', name: '', en: '', grid, spawns: [], rules };
    return { ...stateOf(units), scenario: 'test_rules' };
  };
  const duel = [
    { id: 'a', def: 'warrior', team: 'hero' as const, x: 1, y: 1 },
    { id: 'b', def: 'soldier', team: 'enemy' as const, x: 2, y: 1 },
  ];

  it('hit: the scenario rule replaces the distance, height and cover calculation', () => {
    const state = withRules({ hitChance: () => 42 }, duel);
    expect(previewAbility(grid, state, 'a', 'strike', { x: 2, y: 1 }).targets[0].chance).toBe(42);
  });

  it('jump: the rule says how many levels the unit climbs or drops per step', () => {
    const cliff = gridOf(['...', '...', '...'], ['003', '003', '003']);
    const climber = [{ id: 'a', def: 'warrior', team: 'hero' as const, x: 1, y: 1 }];
    SCENARIOS.test_rules = { id: 'test_rules', name: '', en: '', grid: cliff, spawns: [], rules: { jump: () => 3 } };
    expect(reachable(cliff, { ...stateOf(climber), scenario: 'test_rules' }, 'a').has('2,1')).toBe(true);
    expect(reachable(cliff, stateOf(climber), 'a').has('2,1')).toBe(false);
  });

  it('battle end: the rule decides (without a target to protect, defeat only when all heroes are down)', () => {
    const state = withRules({ outcome: () => 'ongoing' as const }, duel);
    expect(checkOutcome(state)).toBe('ongoing');
    expect(checkOutcome(stateOf(duel))).toBe('defeat'); // game rule: without a beacon it is a defeat
  });

  it('fall: the rule says the damage of being pushed off', () => {
    const cliff = gridOf(['....'], ['5500']);
    const pair = [
      { id: 'a', def: BASHER, team: 'hero' as const, x: 0, y: 0 },
      { id: 'b', def: 'soldier', team: 'enemy' as const, x: 1, y: 0 },
    ];
    SCENARIOS.test_rules = {
      id: 'test_rules',
      name: '',
      en: '',
      grid: cliff,
      spawns: [],
      rules: { hitChance: () => 100, fallDamage: (levels: number) => levels * 2 },
    };
    const fall = resolveAbility(cliff, { ...stateOf(pair), scenario: 'test_rules' }, 'a', BASH, {
      x: 1,
      y: 0,
    }).find((e) => e.k === 'fall');
    expect(fall).toMatchObject({ levels: 5, dmg: 10 });
  });

  it('damage: the rule can roll the damage (FFT crit)', () => {
    const state = withRules(
      { hitChance: () => 100, rollDamage: (_s: unknown, _a: unknown, _ab: unknown, rng: number) => [3, rng] },
      duel,
    );
    const hit = resolveAbility(grid, state, 'a', 'strike', { x: 2, y: 1 }).find((e) => e.k === 'hit');
    // then the target's physical resistance, like any roll (Nov 15)
    expect(hit).toMatchObject({ dmg: Math.floor((3 * (100 - resistOf(UNIT_DEFS.soldier, 'phys'))) / 100) });
  });
});
