import { describe, expect, it } from 'vitest';
import { chooseTurn, GUARD_RADIUS } from '../src/shared/battle/ai.ts';
import { pendingCounters, previewAbility } from '../src/shared/battle/combat.ts';
import { dist } from '../src/shared/battle/grid.ts';
import type { BattleState, Pos } from '../src/shared/battle/types.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';
import { flat, gridOf, stateOf } from './battle-helpers.ts';

// Milestone 3 (Nov 11): on the 20x20 map the enemy fled the threat instead of advancing (28 of 40 turns without attacking)
describe('AI with no target in range', () => {
  const grid = flat(20, 20);
  const beacon = { id: 'beacon', def: 'beacon', team: 'hero' as const, x: 2, y: 17 };

  it("the enemy advances toward the beacon even when entering a hero's range", () => {
    const soldier = { id: 'e', def: 'soldier', team: 'enemy' as const, x: 14, y: 4 };
    const state = stateOf([soldier, beacon, { id: 'h', def: 'rogue', team: 'hero', x: 10, y: 9 }]);
    const plan = chooseTurn(grid, state, 'e');
    expect(plan.ability).toBeNull();
    expect(dist(plan.moveTo!, beacon)).toBeLessThan(dist(soldier, beacon));
    expect(dist(plan.moveTo!, soldier)).toBe(4); // moves as far as it can
  });

  it('the hero goes to meet the enemy, but does not leave the beacon', () => {
    const state = stateOf([
      { id: 'h', def: 'rogue', team: 'hero', x: 4, y: 15 },
      beacon,
      { id: 'e', def: 'soldier', team: 'enemy', x: 16, y: 2 },
    ]);
    const plan = chooseTurn(grid, state, 'h');
    const at = plan.moveTo ?? { x: 4, y: 15 };
    expect(dist(at, beacon)).toBeLessThanOrEqual(GUARD_RADIUS);
    expect(dist(at, { x: 16, y: 2 })).toBeLessThan(dist({ x: 4, y: 15 }, { x: 16, y: 2 }));
  });
});

// Nov 15 (Fernando: the enemies play the charge rules too): a unit under a charge uses its move to leave the line of fire or
// to hide behind cover, the shot being traced when it fires
describe('AI and charges (Nov 15)', () => {
  // the archer on a pillar reaches the whole map; the wall column at x = 5 is the only cover
  const grid = gridOf(
    ['........', '........', '........', '.....#..', '.....#..', '.....#..', '........'],
    ['00000000', '00000000', '00000000', '40000000', '00000000', '00000000', '00000000'],
  );
  const start = { id: 'e', def: 'soldier', team: 'enemy' as const, x: 7, y: 2 };
  const archer = { id: 'h', def: 'archer', team: 'hero' as const, x: 0, y: 3 };
  // the hero's Aimed Shot locked on the soldier: does it land if the soldier ends its turn on `at`?
  const lands = (state: BattleState, at: Pos) => {
    const moved = { ...state, units: state.units.map((u) => (u.id === 'e' ? { ...u, pos: at } : u)) };
    return previewAbility(grid, moved, 'h', 'aimed_shot', at, true).targets.some((t) => t.unit === 'e');
  };

  it('a unit an enemy charge is locked on hides from its line of fire', () => {
    const state = stateOf([start, archer]);
    const free = chooseTurn(grid, state, 'e');
    expect(lands(state, free.moveTo ?? start)).toBe(true); // with no charge it walks into the line
    state.charges = [{ unit: 'h', ability: 'aimed_shot', target: start, follow: 'e', ticks: 2 }];
    const plan = chooseTurn(grid, state, 'e');
    expect(lands(state, plan.moveTo ?? start)).toBe(false);
  });

  // the same rule for a counter owed since its last turn (Nov 15): the move it would make is priced like the rule plays it
  it('a unit a ranged counter would kill does not walk into its line', () => {
    const shooter = { ...start, def: 'skeleton_archer', hp: 3 }; // a counter would kill it
    const state = stateOf([shooter, archer]);
    const struck = (s: BattleState, to: Pos | null) =>
      !!to && pendingCounters(grid, s, 'e', to).some((c) => c.preview.targets.some((t) => t.unit === 'e'));
    const owed = { ...state, engaged: [{ unit: 'h', by: 'e', ranged: true, turns: 1 }] };
    expect(struck(owed, chooseTurn(grid, state, 'e').moveTo)).toBe(true); // not owed: it walks into the line
    expect(struck(owed, chooseTurn(grid, owed, 'e').moveTo)).toBe(false);
  });
});

// Friendly fire (Nov 15): a heal lands on the other side at half and hurts the undead, so the AI must not count either as help
describe('AI and friendly fire (Nov 15)', () => {
  it('a healer heals neither a wounded foe nor its own undead', () => {
    UNIT_DEFS.test_ai_healer = { ...UNIT_DEFS.acolyte, id: 'test_ai_healer', abilities: ['heal'] };
    const state = stateOf([
      { id: 'e', def: 'test_ai_healer', team: 'enemy', x: 0, y: 0 },
      { id: 'h', def: 'soldier', team: 'hero', x: 2, y: 0, hp: 10 },
      { id: 'm', def: 'minion', team: 'enemy', x: 0, y: 2, hp: 5 },
    ]);
    expect(chooseTurn(flat(8, 8), state, 'e').ability).toBeNull();
  });

  it('the same healer heals its wounded living ally', () => {
    UNIT_DEFS.test_ai_healer = { ...UNIT_DEFS.acolyte, id: 'test_ai_healer', abilities: ['heal'] };
    const state = stateOf([
      { id: 'e', def: 'test_ai_healer', team: 'enemy', x: 0, y: 0 },
      { id: 'h', def: 'soldier', team: 'hero', x: 6, y: 6 },
      { id: 's', def: 'soldier', team: 'enemy', x: 0, y: 2, hp: 10 },
    ]);
    expect(chooseTurn(flat(8, 8), state, 'e').ability).toEqual({ id: 'heal', target: { x: 0, y: 2 } });
  });
});
