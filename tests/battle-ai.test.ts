import { describe, expect, it } from 'vitest';
import { chooseTurn, GUARD_RADIUS } from '../src/shared/battle/ai.ts';
import { dist } from '../src/shared/battle/grid.ts';
import { flat, stateOf } from './battle-helpers.ts';

// Milestone 3 (Nov 11): on the 20x20 map the enemy fled the threat instead of advancing (28 of 40 turns without attacking)
describe('AI with no target in range', () => {
  const grid = flat(20, 20);
  const beacon = { id: 'beacon', def: 'beacon', team: 'hero' as const, x: 2, y: 17 };

  it('the enemy advances toward the beacon even when entering a hero\'s range', () => {
    const soldier = { id: 'e', def: 'soldier', team: 'enemy' as const, x: 14, y: 4 };
    const state = stateOf([soldier, beacon, { id: 'h', def: 'rogue', team: 'hero', x: 10, y: 9 }]);
    const plan = chooseTurn(grid, state, 'e');
    expect(plan.ability).toBeNull();
    expect(dist(plan.moveTo!, beacon)).toBeLessThan(dist(soldier, beacon));
    expect(dist(plan.moveTo!, soldier)).toBe(4); // moves as far as it can
  });

  it('the hero goes to meet the enemy, but does not leave the beacon', () => {
    const state = stateOf([{ id: 'h', def: 'rogue', team: 'hero', x: 4, y: 15 }, beacon, { id: 'e', def: 'soldier', team: 'enemy', x: 16, y: 2 }]);
    const plan = chooseTurn(grid, state, 'h');
    const at = plan.moveTo ?? { x: 4, y: 15 };
    expect(dist(at, beacon)).toBeLessThanOrEqual(GUARD_RADIUS);
    expect(dist(at, { x: 16, y: 2 })).toBeLessThan(dist({ x: 4, y: 15 }, { x: 16, y: 2 }));
  });
});
