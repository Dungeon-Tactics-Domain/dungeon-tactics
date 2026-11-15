import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../src/shared/battle/abilities.ts';
import { Battle, parseBattleState, UNDO_LIMIT } from '../src/shared/battle/battle.ts';
import { SCENARIOS } from '../src/shared/battle/scenarios.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';
import { flat, HIT_SEED, stateOf } from './battle-helpers.ts';

const at = (x: number, y = 0) => ({ x, y });
// warrior next to a soldier (1 tile above), with room to move; the warrior is the current actor
const duel = (seed = HIT_SEED) =>
  new Battle(
    flat(6, 3),
    stateOf(
      [
        { id: 'a', def: 'warrior', team: 'hero', x: 0, y: 1 },
        { id: 'b', def: 'beacon', team: 'hero', x: 0, y: 0 },
        { id: 'f', def: 'soldier', team: 'enemy', x: 1, y: 1 },
      ],
      seed,
    ),
  );

describe('player turn', () => {
  it('moves in parts up to the movement (Nov 13) and acts once, in any order', () => {
    const b = duel();
    expect(b.move(at(0, 2)).length).toBeGreaterThan(0);
    expect(b.state.turn.spent).toBe(1);
    expect(b.move(at(1, 2)).length).toBeGreaterThan(0); // movement left: moves again
    expect(b.state.units[0].pos).toEqual(at(1, 2));
    expect(b.reach().size).toBeGreaterThan(0); // 2 still left
    expect(b.act('strike', at(1, 1)).length).toBeGreaterThan(0);
    expect(b.act('strike', at(1, 1))).toEqual([]); // already acted
  });

  it('the move event starts at the origin tile (the animation starts there, without jumping to the 1st step)', () => {
    const b = duel();
    const [e] = b.move(at(1, 2));
    expect(e.k === 'move' && e.path).toEqual([at(0, 1), at(0, 2), at(1, 2)]);
  });

  it('rejects a destination out of range and an ability the actor does not have', () => {
    const b = duel();
    expect(b.move(at(5, 2))).toEqual([]);
    expect(b.act('firebolt', at(1, 1))).toEqual([]);
  });

  it('ending the turn passes the turn and clears what was done', () => {
    const b = duel();
    b.act('strike', at(1, 1));
    const first = b.state.turn.actor;
    b.endTurn();
    expect(b.state.turn.actor).not.toBe(first);
    expect(b.state.turn.moved).toBe(false);
    expect(b.state.turn.usedAbility).toBeNull();
  });

  it('winning ends the battle and blocks new actions', () => {
    const b = duel();
    b.state.units[2].hp = 1;
    b.move(at(1, 2));
    b.act('strike', at(1, 1));
    expect(b.state.outcome).toBe('victory');
    b.endTurn();
    expect(b.act('strike', at(1, 1))).toEqual([]);
  });
});

describe('undo', () => {
  it('undoing an attack restores HP but does NOT restore the die', () => {
    const b = duel();
    const rngBefore = b.state.rng;
    b.act('strike', at(1, 1));
    const rngAfterAct = b.state.rng;
    expect(rngAfterAct).not.toBe(rngBefore);
    expect(b.undo()).toBe(true);
    expect(b.state.units[2].hp).toBe(UNIT_DEFS.soldier.hp);
    expect(b.state.turn.usedAbility).toBeNull();
    expect(b.state.rng).toBe(rngAfterAct); // the roll moves on
    // attacking again uses the next rolls, not the same ones
    b.move(at(1, 2));
    b.act('strike', at(1, 1));
    expect(b.state.rng).not.toBe(rngAfterAct);
  });

  it('undoing a move is free; undoing an attack spends one and runs out at the limit', () => {
    const b = duel();
    b.move(at(1, 2));
    expect(b.undo()).toBe(true);
    expect(b.undosLeft).toBe(UNDO_LIMIT);
    expect(b.state.units[0].pos).toEqual(at(0, 1));
    b.move(at(1, 2));
    b.undosLeft = 0;
    b.act('strike', at(1, 1));
    expect(b.undo()).toBe(false); // with no undo left the attack stays
    expect(b.state.turn.usedAbility).toBe('strike');
  });

  it('spends one undo per undone attack', () => {
    const b = duel();
    b.move(at(1, 2));
    b.act('strike', at(1, 1));
    b.undo();
    expect(b.undosLeft).toBe(UNDO_LIMIT - 1);
  });

  it('only undoes within the current turn', () => {
    const b = duel();
    b.move(at(1, 2));
    b.endTurn();
    expect(b.canUndo).toBe(false);
    expect(b.undo()).toBe(false);
  });

  it('undoes in order: attack first, then the move', () => {
    const b = duel();
    b.move(at(1, 2));
    b.act('strike', at(1, 1));
    b.undo();
    expect(b.state.units[0].pos).toEqual(at(1, 2));
    b.undo();
    expect(b.state.units[0].pos).toEqual(at(0, 1));
    expect(b.canUndo).toBe(false);
  });
});

describe('clone and save', () => {
  it('the clone is independent of the original', () => {
    const b = duel();
    const c = b.clone();
    c.move(at(1, 2));
    expect(b.state.units[0].pos).toEqual(at(0, 1));
    expect(c.state.units[0].pos).toEqual(at(1, 2));
  });

  it('save and load returns to the same state, undo included', () => {
    const b = Battle.start(SCENARIOS.skirmish, 99);
    const start = b.actor.pos;
    b.move([...b.reach().values()][0].pos);
    const loaded = Battle.load(b.save())!;
    expect(loaded.state).toEqual(b.state);
    expect(loaded.undosLeft).toBe(b.undosLeft);
    expect(loaded.undo()).toBe(true);
    expect(loaded.actor.pos).toEqual(start);
  });
});

describe('a broken save does not crash the game', () => {
  const good = () => JSON.parse(Battle.start(SCENARIOS.skirmish, 1).save());
  // biome-ignore lint/suspicious/noExplicitAny: the test corrupts arbitrary fields of a parsed save
  const mutate = (fn: (s: any) => void) => {
    const s = good();
    fn(s.state);
    return parseBattleState(s.state);
  };

  it('garbage and invalid JSON become null', () => {
    expect(Battle.load('não é json')).toBeNull();
    expect(Battle.load('null')).toBeNull();
    expect(Battle.load('[]')).toBeNull();
    expect(Battle.load('{}')).toBeNull();
    expect(parseBattleState(42)).toBeNull();
  });

  it('invalid scenario, unit, HP, position and actor are rejected', () => {
    expect(parseBattleState(good().state)).not.toBeNull();
    expect(mutate((s) => (s.scenario = 'missing'))).toBeNull();
    expect(mutate((s) => (s.units[0].def = 'dragao'))).toBeNull();
    expect(mutate((s) => (s.units[1].hp = -3))).toBeNull();
    expect(mutate((s) => (s.units[1].hp = 9999))).toBeNull();
    expect(mutate((s) => (s.units[1].pos = { x: 99, y: 0 }))).toBeNull();
    expect(mutate((s) => (s.units[1].pos = { x: 0.5, y: 0 }))).toBeNull();
    expect(mutate((s) => (s.turn.actor = 'ninguem'))).toBeNull();
    expect(mutate((s) => (s.outcome = 'empate'))).toBeNull();
    expect(mutate((s) => (s.rng = 'x'))).toBeNull();
    expect(mutate((s) => (s.units[1].id = s.units[2].id))).toBeNull();
    expect(mutate((s) => (s.units[1].pos = { ...s.units[2].pos }))).toBeNull();
    expect(mutate((s) => (s.turn.usedAbility = 'fogo_infinito'))).toBeNull();
  });
});

describe('save with a big unit (Nov 13 review)', () => {
  it('rejects a Colossus with a tile off the map or on top of another unit', () => {
    const base = Battle.start(SCENARIOS.skirmish, 1).state;
    const st = {
      ...base,
      units: [
        { id: 'h', def: 'warrior', team: 'hero' as const, pos: { x: 0, y: 7 }, hp: 42, ct: 0, facing: 2 },
        { id: 'b', def: 'beacon', team: 'hero' as const, pos: { x: 3, y: 7 }, hp: 50, ct: 0 },
        { id: 'c', def: 'colossus', team: 'enemy' as const, pos: { x: 0, y: 0 }, hp: 160, ct: 0, facing: 0 },
      ],
      turn: { actor: 'h', moved: false, usedAbility: null },
      charges: [],
    };
    const copy = () => JSON.parse(JSON.stringify(st));
    expect(parseBattleState(copy())).not.toBeNull();
    const out = copy();
    out.units[2].pos = { x: 7, y: 0 }; // 2x2 from the last column: half off the map
    expect(parseBattleState(out)).toBeNull();
    const over = copy();
    over.units[0].pos = { x: 1, y: 1 }; // the warrior inside the Colossus square
    expect(parseBattleState(over)).toBeNull();
  });
});

// Counterattack (Nov 13, Fernando's request; half damage): the attacked unit strikes back if the attacker moves afterwards
describe('counterattack', () => {
  const g = flat(6, 3);
  it('melee: hitting and moving away draws a counter for half damage; staying adjacent does not', () => {
    const s = stateOf([
      { id: 'a', def: 'warrior', team: 'hero', x: 1, y: 1 },
      { id: 'b', def: 'soldier', team: 'enemy', x: 2, y: 1 },
      { id: 'f', def: 'beacon', team: 'hero', x: 0, y: 0 },
    ]); // the Beacon: without it the battle ends on the hit
    s.turn = { actor: 'a', moved: false, usedAbility: null };
    s.rng = HIT_SEED;
    const b = new Battle(g, s);
    b.act('strike', at(2, 1));
    expect(b.state.engaged).toEqual([{ unit: 'b', by: 'a', ranged: false, turns: 2 }]);
    const hp = b.state.units[0].hp;
    expect(b.move(at(2, 2)).some((e) => e.k === 'attack' && e.unit === 'b')).toBe(false); // still adjacent: no counter
    const ev = b.move(at(3, 2));
    expect(ev.some((e) => e.k === 'attack' && e.unit === 'b')).toBe(true);
    const hit = ev.find((e) => e.k === 'hit' && e.unit === 'a');
    if (hit && hit.k === 'hit') expect(hit.dmg).toBeLessThanOrEqual(Math.ceil(ABILITIES.strike.damage[1] / 2));
    expect(b.state.units[0].hp).toBeLessThanOrEqual(hp);
  });

  it('an archer who shoots another archer and then moves takes the ranged counter', () => {
    const s = stateOf([
      { id: 'a', def: 'archer', team: 'hero', x: 0, y: 1 },
      { id: 'b', def: 'skeleton_archer', team: 'enemy', x: 3, y: 1 },
      { id: 'f', def: 'beacon', team: 'hero', x: 5, y: 2 },
    ]);
    s.turn = { actor: 'a', moved: false, usedAbility: null };
    const b = new Battle(g, s);
    b.act(UNIT_DEFS.archer.abilities[0], at(3, 1));
    expect(b.state.engaged).toEqual([{ unit: 'b', by: 'a', ranged: true, turns: 2 }]);
    expect(b.move(at(0, 0)).some((e) => e.k === 'attack' && e.unit === 'b')).toBe(true);
  });
});
