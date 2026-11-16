import { describe, expect, it } from 'vitest';
import { Battle, parseBattleState } from '../src/shared/battle/battle.ts';
import { pendingCounters } from '../src/shared/battle/counter.ts';
import { halve } from '../src/shared/battle/half.ts';
import { SCENARIOS } from '../src/shared/battle/scenarios.ts';
import type { BattleEvent } from '../src/shared/battle/types.ts';
import { HALF } from '../src/shared/battle/units.ts';
import { flat, HIT_SEED, stateOf } from './battle-helpers.ts';

// Counters redefined (Nov 15, Fernando, after a unit he had not attacked that turn struck him for walking in its range): a
// unit struck this turn strikes back at half each time its attacker walks out of the reach of its basic attack; a shooter
// it stood too close to fires at the stop once the attacker walks out of that contact (Fernando's choice, same day)
const strikes = (ev: BattleEvent[], by: string) => ev.filter((e) => e.k === 'attack' && e.unit === by).length;
const order = (ev: BattleEvent[], by: string) =>
  ev.filter((e) => e.k === 'move' || (e.k === 'attack' && e.unit === by)).map((e) => e.k);

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

  it('each walk out of the reach in that turn draws the counter again', () => {
    const s = stateOf([
      { id: 'a', def: 'warrior', team: 'hero', x: 1, y: 1 },
      { id: 'b', def: 'soldier', team: 'enemy', x: 2, y: 1 },
      { id: 'f', def: 'beacon', team: 'hero', x: 9, y: 3 },
    ]);
    s.rng = HIT_SEED;
    const b = new Battle(flat(10, 4), s);
    b.act('strike', { x: 2, y: 1 });
    const out = [b.move({ x: 0, y: 1 }), b.move({ x: 1, y: 1 }), b.move({ x: 0, y: 1 })];
    expect(out.map((ev) => strikes(ev, 'b'))).toEqual([1, 0, 1]); // out, back in, out again
  });

  it('a ranged counter fires only when the attacker leaves its reach, once', () => {
    const s = stateOf([
      { id: 'a', def: 'archer', team: 'hero', x: 3, y: 1 },
      { id: 'b', def: 'skeleton_archer', team: 'enemy', x: 8, y: 1 },
      { id: 'f', def: 'beacon', team: 'hero', x: 11, y: 3 },
    ]);
    const b = new Battle(flat(12, 4), s);
    b.act('shot', { x: 8, y: 1 });
    expect(strikes(b.move({ x: 3, y: 0 }), 'b')).toBe(0); // 6 tiles: still in its reach of 7 (the bow's +1, Nov 15)
    expect(strikes(b.move({ x: 1, y: 0 }), 'b')).toBe(1); // 8 tiles: out of it
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

  it('an ally struck by friendly fire owes no counter', () => {
    const s = stateOf([
      { id: 'a', def: 'warrior', team: 'hero', x: 1, y: 1 },
      { id: 'w', def: 'warrior', team: 'hero', x: 2, y: 1 },
      { id: 'e', def: 'soldier', team: 'enemy', x: 7, y: 3 },
      { id: 'f', def: 'beacon', team: 'hero', x: 0, y: 3 },
    ]);
    s.rng = HIT_SEED;
    const b = new Battle(flat(8, 4), s);
    expect(b.act('strike', { x: 2, y: 1 })).toContainEqual(expect.objectContaining({ k: 'hit', unit: 'w' }));
    expect(b.state.turn.engaged).toBeUndefined();
    expect(strikes(b.move({ x: 0, y: 1 }), 'w')).toBe(0);
  });

  it('a shooter struck up close fires where the attacker stops, once out of its contact', () => {
    for (const [stop, away] of [
      [{ x: 0, y: 1 }, 2],
      [{ x: 0, y: 2 }, 3],
      [{ x: 0, y: 3 }, 4],
    ] as const) {
      const s = stateOf([
        { id: 'a', def: 'warrior', team: 'hero', x: 1, y: 1 },
        { id: 'r', def: 'archer', team: 'enemy', x: 2, y: 1 },
        { id: 'f', def: 'beacon', team: 'hero', x: 9, y: 3 },
      ]);
      s.rng = HIT_SEED;
      const b = new Battle(flat(10, 4), s);
      b.act('strike', { x: 2, y: 1 });
      const ev = b.move(stop);
      expect([away, ...order(ev, 'r')]).toEqual([away, 'move', 'attack']); // the walk, then the shot
      expect(ev.find((e) => e.k === 'attack')).toMatchObject({ unit: 'r', target: stop });
      expect(b.lastFree).toBe(false); // it took the shot: the move cannot be undone
    }
  });

  it('a shooter does not fire while the attacker stays in its contact or stops past its range', () => {
    const s = stateOf([
      { id: 'a', def: 'warrior', team: 'hero', x: 1, y: 1 },
      { id: 'r', def: 'archer', team: 'enemy', x: 2, y: 1 },
      { id: 'f', def: 'beacon', team: 'hero', x: 11, y: 3 },
    ]);
    s.rng = HIT_SEED;
    const b = new Battle(flat(12, 4), s);
    b.act('strike', { x: 2, y: 1 });
    expect(pendingCounters(b.grid, b.state, 'a', { x: 10, y: 1 })).toEqual([]); // 8 tiles: past its range of 7
    expect(strikes(b.move({ x: 2, y: 2 }), 'r')).toBe(0); // still beside it
    expect(b.lastFree).toBe(true);
  });

  it('against a shooter, out of contact, back in and out again draws 3 shots', () => {
    const s = stateOf([
      { id: 'a', def: 'warrior', team: 'hero', x: 1, y: 1 },
      { id: 'r', def: 'archer', team: 'enemy', x: 2, y: 1 },
      { id: 'f', def: 'beacon', team: 'hero', x: 9, y: 3 },
    ]);
    s.rng = HIT_SEED;
    s.units[0].hp = 500; // survives the three
    const b = new Battle(flat(10, 4), s);
    b.act('strike', { x: 2, y: 1 });
    // out: at the stop; back in: walking closer than its minimum leaves its reach, shot before it leaves; out again
    const out = [b.move({ x: 0, y: 1 }), b.move({ x: 1, y: 1 }), b.move({ x: 0, y: 1 })];
    expect(out.map((ev) => order(ev, 'r'))).toEqual([
      ['move', 'attack'],
      ['attack', 'move'],
      ['move', 'attack'],
    ]);
  });

  it('on half tiles the contact is measured like the aim, from a token half a tile off', () => {
    const spawns = [
      { id: 'a', def: 'warrior', team: 'hero' as const, x: 1, y: 1 },
      { id: 'r', def: 'archer', team: 'enemy' as const, x: 2, y: 1 },
      { id: 'f', def: 'beacon', team: 'hero' as const, x: 9, y: 4 },
    ];
    const sc = halve({ id: 't-contact', name: 't', en: 't', grid: flat(10, 5), spawns });
    // the warrior half a tile below the archer's row, their squares still side by side
    const at = { a: { x: 2, y: 3 }, r: { x: 4, y: 2 }, f: { x: 18, y: 8 } };
    const s = stateOf(spawns.map((u) => ({ ...u, def: u.def + HALF, ...at[u.id as keyof typeof at] })));
    s.rng = HIT_SEED;
    const b = new Battle(sc.grid, s);
    b.act('strike', at.r);
    expect(strikes(b.move({ x: 2, y: 2 }), 'r')).toBe(0); // half a tile up: still side by side
    expect(order(b.move({ x: 0, y: 3 }), 'r')).toEqual(['move', 'attack']); // a tile off: it shoots where it stops
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
      // straight bolts: since the trajectory grill of Nov 15 a bow's curve flies over a body in its way on flat ground
      { id: 'b', def: 'dark_mage', team: 'enemy', x: 12, y: 1 },
      { id: 'c', def: 'dark_mage', team: 'enemy', x: 10, y: 1, hp: 1 },
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
    // an edited save: a repeated unit and one on the actor's side drop, and so does one no longer in the battle
    expect(load({ engaged: [foe, foe, ally] })).toEqual([foe]);
    expect(load({ engaged: ['nobody', foe] })).toEqual([foe]);
  });

  it('a unit killed mid-move leaves the owed list, and the battle saves and loads', () => {
    // Spin (an area strike) hit two dark mages; walking off, the first one's bolt kills the second (friendly fire). Bolts,
    // not arrows: since the trajectory grill of Nov 15 a bow's curve flies over a body in its way on flat ground
    const s = stateOf([
      { id: 'a', def: 'warrior', team: 'hero', x: 2, y: 2 },
      { id: 's1', def: 'dark_mage', team: 'enemy', x: 3, y: 2 },
      { id: 's2', def: 'dark_mage', team: 'enemy', x: 1, y: 2, hp: 1 },
      { id: 'f', def: 'beacon', team: 'hero', x: 9, y: 4 },
    ]);
    s.turn.usedAbility = 'spin';
    s.turn.engaged = ['s1', 's2'];
    const grid = flat(10, 5);
    SCENARIOS['t-dead'] = { id: 't-dead', name: 't', en: 't', grid, spawns: [] }; // a save names a known map
    s.scenario = 't-dead';
    const b = new Battle(grid, s);
    expect(b.move({ x: 0, y: 2 })).toContainEqual({ k: 'die', unit: 's2' });
    expect(b.state.turn.engaged).toEqual(['s1']);
    expect(Battle.load(b.save())?.state.turn.engaged).toEqual(['s1']);
  });

  it('the last hero killed by a counter ends the battle, and the dead actor has nowhere to walk', () => {
    const s = stateOf([
      { id: 'a', def: 'warrior', team: 'hero', x: 1, y: 1, hp: 1 },
      { id: 'b', def: 'soldier', team: 'enemy', x: 2, y: 1 },
    ]);
    s.rng = HIT_SEED;
    s.turn.usedAbility = 'strike';
    s.turn.engaged = ['b'];
    const b = new Battle(flat(8, 4), s);
    expect(b.move({ x: 0, y: 2 })).toContainEqual({ k: 'die', unit: 'a' });
    expect(b.state.outcome).toBe('defeat');
    expect(b.reach()).toEqual(new Map()); // the end-of-battle menu asks it (startScreen)
  });
});
