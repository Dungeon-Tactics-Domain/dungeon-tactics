import { describe, expect, it } from 'vitest';
import { Battle, parseBattleState } from '../src/shared/battle/battle.ts';
import { pendingCounters } from '../src/shared/battle/combat.ts';
import { SCENARIOS } from '../src/shared/battle/scenarios.ts';
import type { BattleEvent } from '../src/shared/battle/types.ts';
import { flat, HIT_SEED, stateOf } from './battle-helpers.ts';

// Counters redefined (Nov 15, Fernando, after a unit he had not attacked that turn struck him for walking in its range): a
// unit struck this turn strikes back once, at half, when its attacker walks out of the reach of its basic attack
const strikes = (ev: BattleEvent[], by: string) => ev.filter((e) => e.k === 'attack' && e.unit === by).length;

describe('counters (Nov 15)', () => {
  it('the counter lasts only the turn of the strike', () => {
    const s = stateOf([
      { id: 'a', def: 'warrior', team: 'hero', x: 1, y: 1 },
      { id: 'b', def: 'soldier', team: 'enemy', x: 2, y: 1 },
      { id: 'f', def: 'beacon', team: 'hero', x: 0, y: 0 },
    ]);
    s.rng = HIT_SEED;
    const b = new Battle(flat(8, 4), s);
    b.act('strike', { x: 2, y: 1 });
    expect(b.state.turn.engaged).toEqual(['b']);
    b.endTurn();
    for (let i = 0; i < 20 && b.state.turn.actor !== 'a'; i++) b.endTurn(); // the soldier only waits
    expect(b.state.turn.engaged).toBeUndefined();
    expect(strikes(b.move({ x: 0, y: 2 }), 'b')).toBe(0); // leaves its reach the next turn: no counter
  });

  it('a ranged counter fires only when the attacker leaves its reach, once', () => {
    const s = stateOf([
      { id: 'a', def: 'archer', team: 'hero', x: 3, y: 1 },
      { id: 'b', def: 'skeleton_archer', team: 'enemy', x: 7, y: 1 },
      { id: 'f', def: 'beacon', team: 'hero', x: 11, y: 3 },
    ]);
    const b = new Battle(flat(12, 4), s);
    b.act('shot', { x: 7, y: 1 });
    expect(strikes(b.move({ x: 3, y: 0 }), 'b')).toBe(0); // 5 tiles: still in its reach of 6
    expect(strikes(b.move({ x: 1, y: 0 }), 'b')).toBe(1); // 7 tiles: out of it
  });

  it('a unit answers whatever struck it, melee or ranged', () => {
    // the Lancer's basic attack reaches 2 tiles (ranged by the old same-kind rule), struck by a melee Strike
    const s = stateOf([
      { id: 'a', def: 'warrior', team: 'hero', x: 1, y: 1 },
      { id: 'l', def: 'lancer', team: 'enemy', x: 2, y: 1 },
      { id: 'f', def: 'beacon', team: 'hero', x: 7, y: 3 },
    ]);
    s.rng = HIT_SEED;
    const b = new Battle(flat(8, 4), s);
    b.act('strike', { x: 2, y: 1 });
    expect(strikes(b.move({ x: 0, y: 1 }), 'l')).toBe(0); // 2 tiles: still in its reach
    expect(strikes(b.move({ x: 0, y: 2 }), 'l')).toBe(1);
  });

  it('a counter strikes from the front: the attacker turns to face it', () => {
    const s = stateOf([
      { id: 'a', def: 'warrior', team: 'hero', x: 1, y: 1 },
      { id: 'b', def: 'soldier', team: 'enemy', x: 2, y: 1 },
      { id: 'f', def: 'beacon', team: 'hero', x: 0, y: 0 },
    ]);
    s.units[0].facing = 3; // looking away from the soldier: a strike from behind
    s.turn.engaged = ['b'];
    const b = new Battle(flat(8, 4), s);
    const [front] = pendingCounters(b.grid, b.state, 'a', { x: 0, y: 2 })[0].preview.targets;
    expect(front.side).toBe('front');
    const roll = b.move({ x: 0, y: 2 }).find((e) => (e.k === 'hit' || e.k === 'miss') && e.unit === 'a');
    expect(roll?.k === 'hit' || roll?.k === 'miss' ? roll.chance : null).toBe(front.chance); // the strike rolls the same
  });

  it('a counter whose unit fell to an earlier counter is skipped', () => {
    const s = stateOf([
      { id: 'a', def: 'archer', team: 'hero', x: 7, y: 1 },
      { id: 'b', def: 'skeleton_archer', team: 'enemy', x: 13, y: 1 },
      { id: 'c', def: 'skeleton_archer', team: 'enemy', x: 10, y: 1, hp: 1 },
      { id: 'f', def: 'beacon', team: 'hero', x: 0, y: 3 },
    ]);
    s.turn.engaged = ['b', 'c'];
    s.rng = HIT_SEED;
    const b = new Battle(flat(16, 4), s);
    b.move({ x: 3, y: 1 }); // out of both reaches: b's shot meets c first (friendly fire) and kills it
    expect(b.state.units.some((u) => u.id === 'c')).toBe(false);
  });

  it('a unit whose basic attack hits an area never counters (Nov 15)', () => {
    const s = stateOf([
      { id: 'a', def: 'archer', team: 'hero', x: 3, y: 1 },
      { id: 'c', def: 'colossus', team: 'enemy', x: 8, y: 1 },
      { id: 'f', def: 'beacon', team: 'hero', x: 11, y: 3 },
    ]);
    const b = new Battle(flat(12, 4), s);
    b.act('shot', { x: 8, y: 1 });
    expect(b.state.turn.engaged).toBeUndefined(); // the Shadow Wave (radius 2) is its basic attack
    // nor from a counter owed in an older save, walking out of its reach of 5
    b.state.turn.engaged = ['c'];
    expect(pendingCounters(b.grid, b.state, 'a', { x: 1, y: 1 })).toEqual([]);
  });

  it("a save keeps this turn's counters; older ones load as this turn's or drop", () => {
    const s = Battle.start(SCENARIOS.skirmish, 1).state;
    const a = s.turn.actor;
    const side = s.units.find((u) => u.id === a)!.team;
    const foe = s.units.find((u) => u.team !== side)!.id;
    const ally = s.units.find((u) => u.id !== a && u.team === side)!.id;
    const load = (turn: object, engaged?: unknown) =>
      parseBattleState({ ...structuredClone(s), turn: { ...s.turn, ...turn }, engaged })?.turn.engaged;
    expect(load({ engaged: [foe] })).toEqual([foe]);
    // Nov 13: objects in the turn
    expect(load({ engaged: [{ unit: foe, ranged: false }] })).toEqual([foe]);
    // the 2-turn window of Nov 15: only the actor's strike of this turn (turns 2) still counts, the old `turns` ignored
    expect(load({}, [{ unit: foe, by: a, ranged: true, turns: 2 }])).toEqual([foe]);
    expect(load({}, [{ unit: foe, by: a, ranged: true, turns: 1 }])).toBeUndefined();
    expect(load({}, [{ unit: a, by: foe, ranged: true, turns: 2 }])).toBeUndefined();
    // an edited save: a repeated unit and one on the actor's side drop; an unknown one breaks it
    expect(load({ engaged: [foe, foe, ally] })).toEqual([foe]);
    expect(parseBattleState({ ...structuredClone(s), turn: { ...s.turn, engaged: ['nobody'] } })).toBeNull();
  });
});
