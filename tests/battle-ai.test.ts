import { describe, expect, it } from 'vitest';
import { chooseRetreat, chooseTurn, GUARD_RADIUS } from '../src/shared/battle/ai.ts';
import { previewAbility } from '../src/shared/battle/combat.ts';
import { pendingCounters } from '../src/shared/battle/counter.ts';
import { dist } from '../src/shared/battle/grid.ts';
import { reachable } from '../src/shared/battle/pathing.ts';
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
    // no mana for the Gust that reaches the archer: since Nov 25 an attack in reach always wins over hiding
    state.units[0].vars = { ...state.units[0].vars, mana: 0 };
    const free = chooseTurn(grid, state, 'e');
    expect(lands(state, free.moveTo ?? start)).toBe(true); // with no charge it walks into the line
    state.charges = [{ unit: 'h', ability: 'aimed_shot', target: start, follow: 'e', ticks: 2 }];
    const plan = chooseTurn(grid, state, 'e');
    expect(lands(state, plan.moveTo ?? start)).toBe(false);
  });

  // a counter is drawn by walking out of the reach of a unit struck this turn (Nov 15): the retreat prices it like the rule
  it('after striking, a unit a counter would kill does not walk out of its reach', () => {
    // a step up toward the Beacon, out of the soldier's reach: worth the walk for a unit owed nothing
    const grid = gridOf(Array(5).fill('..........'), [
      '0000000000',
      '0000000000',
      '0000000000',
      '0000000100',
      '0000000000',
    ]);
    const state = stateOf([
      { id: 'e', def: 'skeleton_archer', team: 'enemy', x: 6, y: 3, hp: 3 },
      { id: 'h', def: 'soldier', team: 'hero', x: 5, y: 3 },
      { id: 'f', def: 'beacon', team: 'hero', x: 9, y: 3 },
    ]);
    state.turn.main = 'dagger'; // it stabbed the soldier: walking out of its reach draws a counter that kills it
    const struck = { ...state, turn: { ...state.turn, engaged: ['h'] } };
    const counter = (to: Pos | null) => !!to && pendingCounters(grid, struck, 'e', to).length > 0;
    expect(counter(chooseRetreat(grid, state, 'e', reachable(grid, state, 'e')))).toBe(true); // owed nothing: it walks off
    expect(counter(chooseRetreat(grid, struck, 'e', reachable(grid, struck, 'e')))).toBe(false);
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

// Nov 15 review: the threat of a nearby enemy is what it would deal by the rule (power, resistances), not its ability table
describe('AI threat', () => {
  it('keeps away from the enemy whose real hit is the bigger one, not the one with the bigger table', () => {
    const base = { ...UNIT_DEFS.soldier, resist: undefined, dodge: undefined, move: 3 };
    UNIT_DEFS.t_axe = { ...base, id: 't_axe', abilities: ['cleave'] }; // 90 to 120 on the table, no power
    UNIT_DEFS.t_knife = { ...base, id: 't_knife', abilities: ['dagger'], physPower: 500 }; // 25 to 35 on the table, +500
    // a corridor: every tile is within reach of one of them (move 3 + range 1), the middle of both
    const state = stateOf([
      { id: 'a', def: 'archer', team: 'enemy', x: 4, y: 0 },
      { id: 'axe', def: 't_axe', team: 'hero', x: 0, y: 0 },
      { id: 'knife', def: 't_knife', team: 'hero', x: 8, y: 0 },
    ]);
    const plan = chooseTurn(flat(9, 1), state, 'a');
    expect(plan.moveTo!.x).toBeLessThan(4); // beside the axe: the knife's real hit is 525 to 535
  });
});
