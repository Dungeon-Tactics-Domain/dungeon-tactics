import { describe, expect, it } from 'vitest';
import { Battle, parseBattleState } from '../src/shared/battle/battle.ts';
import { pendingCounters } from '../src/shared/battle/combat.ts';
import { SCENARIOS } from '../src/shared/battle/scenarios.ts';
import type { BattleEvent } from '../src/shared/battle/types.ts';
import { flat, gridOf, HIT_SEED, stateOf } from './battle-helpers.ts';

// Opportunity counters (Nov 15, Fernando: "the counter also fires when whoever attacked it moves within its range"): the
// attacked unit strikes back on every move of its attacker, that turn and the attacker's next one, at half
const countered = (ev: BattleEvent[], by: string) => ev.some((e) => e.k === 'attack' && e.unit === by);

describe('opportunity counters (Nov 15)', () => {
  it("the counter waits for the attacker's next turn, then expires", () => {
    const s = stateOf([
      { id: 'a', def: 'warrior', team: 'hero', x: 1, y: 1 },
      { id: 'b', def: 'soldier', team: 'enemy', x: 2, y: 1 },
      { id: 'f', def: 'beacon', team: 'hero', x: 0, y: 0 },
    ]);
    s.rng = HIT_SEED;
    const b = new Battle(flat(8, 4), s);
    b.act('strike', { x: 2, y: 1 });
    const next = () => {
      b.endTurn();
      for (let i = 0; i < 20 && b.state.turn.actor !== 'a'; i++) b.endTurn(); // the soldier only waits
    };
    next();
    expect(b.state.engaged).toEqual([{ unit: 'b', by: 'a', ranged: false, turns: 1 }]);
    expect(countered(b.move({ x: 0, y: 2 }), 'b')).toBe(true); // leaves its reach on the next turn: struck
    next();
    expect(b.state.engaged).toBeUndefined(); // the window closed with that turn
  });

  it('a ranged counter fires once per move, aimed where the attacker stops', () => {
    const s = stateOf([
      { id: 'a', def: 'archer', team: 'hero', x: 0, y: 1 },
      { id: 'b', def: 'skeleton_archer', team: 'enemy', x: 4, y: 1 },
      { id: 'f', def: 'beacon', team: 'hero', x: 7, y: 3 },
    ]);
    const b = new Battle(flat(8, 4), s);
    b.act('shot', { x: 4, y: 1 });
    expect(countered(b.move({ x: 0, y: 2 }), 'b')).toBe(true);
    expect(countered(b.move({ x: 0, y: 3 }), 'b')).toBe(true); // a second move, a second counter
  });

  it('a ranged counter stops on the cover the attacker hides behind', () => {
    const grid = gridOf(['........', '........', '..#.....', '........']);
    const s = stateOf([
      { id: 'a', def: 'archer', team: 'hero', x: 0, y: 1 },
      { id: 'b', def: 'skeleton_archer', team: 'enemy', x: 4, y: 1 },
      { id: 'f', def: 'beacon', team: 'hero', x: 7, y: 0 },
    ]);
    const b = new Battle(grid, s);
    b.act('shot', { x: 4, y: 1 });
    // in the open it would be struck; behind the wall at (2,2) the shot stops on it (before Nov 15 it aimed at the tile left)
    expect(pendingCounters(grid, b.state, 'a', { x: 0, y: 0 })[0].preview.targets.map((t) => t.unit)).toEqual(['a']);
    const ev = b.move({ x: 0, y: 3 });
    expect(countered(ev, 'b')).toBe(true);
    expect(ev.some((e) => (e.k === 'hit' || e.k === 'miss') && e.unit === 'a')).toBe(false);
  });

  it('the counters owed survive a save; an old save keeps its turn ones for that turn', () => {
    const s = Battle.start(SCENARIOS.skirmish, 1).state;
    const a = s.turn.actor;
    const b = s.units.find((u) => u.id !== a)!.id;
    s.engaged = [{ unit: b, by: a, ranged: false, turns: 2 }];
    expect(parseBattleState(structuredClone(s))?.engaged).toEqual(s.engaged);
    const old = {
      ...structuredClone(s),
      engaged: undefined,
      turn: { ...s.turn, engaged: [{ unit: b, ranged: false }] },
    };
    expect(parseBattleState(old)?.engaged).toEqual([{ unit: b, by: a, ranged: false, turns: 1 }]);
    expect(
      parseBattleState({ ...structuredClone(s), engaged: [{ unit: b, by: b, ranged: false, turns: 1 }] }),
    ).toBeNull();
  });
});
