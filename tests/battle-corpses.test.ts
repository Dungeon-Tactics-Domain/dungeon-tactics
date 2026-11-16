import { describe, expect, it } from 'vitest';
import { chooseTurn, playAiTurn } from '../src/shared/battle/ai.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { registerHalf } from '../src/shared/battle/half.ts';
import { reachable } from '../src/shared/battle/pathing.ts';
import { simulatePush } from '../src/shared/battle/push.ts';
import { SCENARIOS } from '../src/shared/battle/scenarios.ts';
import { flat, gridOf, HIT_SEED, stateOf } from './battle-helpers.ts';

// A dead unit leaves a corpse (Fernando, Nov 16): its cells stay in BattleState.corpses for the rest of the battle; nobody
// may end a move or a push there, but anyone may walk or jump over them, like a map body (Tile.noStop)
const row = gridOf(['......']);
const killer = (grid = row, foe: { def?: string; x: number; y: number } = { x: 1, y: 0 }) =>
  new Battle(
    grid,
    stateOf(
      [
        { id: 'a', def: 'warrior', team: 'hero', x: 0, y: 0 },
        { id: 'b', def: foe.def ?? 'soldier', team: 'enemy', x: foe.x, y: foe.y, hp: 1 },
        { id: 'c', def: 'soldier', team: 'enemy', x: 5, y: 0 },
      ],
      HIT_SEED,
    ),
  );

describe('corpses: the state', () => {
  it('a unit that dies leaves its tile as a corpse', () => {
    const b = killer();
    b.act('strike', { x: 1, y: 0 });
    expect(b.state.units.map((u) => u.id)).not.toContain('b');
    expect(b.state.corpses).toEqual([{ x: 1, y: 0 }]);
  });

  it('the Colossus leaves its 4 tiles', () => {
    const b = killer(flat(6, 6), { def: 'colossus', x: 1, y: 0 });
    b.act('strike', { x: 1, y: 0 });
    expect(b.state.corpses).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ]);
  });

  it('a battle without deaths has no field (the save does not change)', () => {
    expect(Battle.start(SCENARIOS.skirmish, 7).state.corpses).toBeUndefined();
  });

  it('undo of the killing blow takes the corpse back', () => {
    const b = killer();
    b.act('strike', { x: 1, y: 0 });
    expect(b.undo()).toBe(true);
    expect(b.state.corpses).toBeUndefined();
    expect(b.state.units.map((u) => u.id)).toContain('b');
  });

  it('the AI is deterministic with corpses: the same seed plays the same battle', () => {
    const play = () => {
      const b = Battle.start(SCENARIOS.skirmish, 7);
      for (let i = 0; i < 400 && !b.over; i++) playAiTurn(b);
      return b.state;
    };
    const one = play();
    expect(one.corpses?.length).toBeGreaterThan(0);
    expect(play()).toEqual(one);
  });
});

describe('corpses: the save', () => {
  const saved = (corpses: unknown) => {
    const raw = JSON.parse(Battle.start(SCENARIOS.skirmish, 7).save());
    raw.state.corpses = corpses;
    return Battle.load(JSON.stringify(raw));
  };

  it('round trip keeps the corpses, and a cloned battle too', () => {
    const b = Battle.start(SCENARIOS.skirmish, 7);
    b.state.corpses = [
      { x: 2, y: 3 },
      { x: 4, y: 4 },
    ];
    expect(Battle.load(b.save())?.state.corpses).toEqual(b.state.corpses);
    expect(b.clone().state.corpses).toEqual(b.state.corpses);
  });

  it('an old save without the field loads with none', () => {
    const b = saved(undefined);
    expect(b).not.toBeNull();
    expect(b?.state.corpses).toBeUndefined();
  });

  it('repeated cells are kept once', () => {
    expect(
      saved([
        { x: 1, y: 1 },
        { x: 1, y: 1 },
      ])?.state.corpses,
    ).toEqual([{ x: 1, y: 1 }]);
  });

  it('a broken field is refused', () => {
    const { width, height } = SCENARIOS.skirmish.grid;
    for (const bad of [
      'x',
      {},
      [null],
      [{ x: 1 }],
      [{ x: 1.5, y: 1 }],
      [{ x: -1, y: 0 }],
      [{ x: width, y: 0 }],
      [{ x: 0, y: height }],
      Array.from({ length: width * height + 1 }, () => ({ x: 0, y: 0 })),
    ])
      expect(saved(bad)).toBeNull();
  });

  it('only x and y are kept', () => {
    expect(saved([{ x: 1, y: 1, evil: true }])?.state.corpses).toEqual([{ x: 1, y: 1 }]);
  });
});

describe('corpses: nobody stops on one', () => {
  it('a corpse is walked over but is not a stop', () => {
    const b = killer();
    b.act('strike', { x: 1, y: 0 });
    const reach = reachable(row, b.state, 'a', 4);
    expect(reach.has('1,0')).toBe(false);
    expect(reach.get('2,0')?.path).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);
  });

  it('a 2x2 token stops on no square that covers a corpse cell, and walks over it', () => {
    registerHalf();
    const s = stateOf([{ id: 'a', def: 'warrior½', team: 'hero', x: 0, y: 0 }]);
    s.corpses = [{ x: 4, y: 0 }];
    const reach = reachable(flat(10, 2), s, 'a', 20);
    expect(reach.has('3,0')).toBe(false);
    expect(reach.has('4,0')).toBe(false);
    expect(reach.has('5,0')).toBe(true);
  });

  it('a push onto a corpse stops short with the bump, like a map body (Tile.noStop)', () => {
    const s = stateOf([
      { id: 'a', def: 'warrior', team: 'hero', x: 0, y: 0 },
      { id: 'b', def: 'soldier', team: 'enemy', x: 1, y: 0 },
    ]);
    s.corpses = [{ x: 2, y: 0 }];
    const corpse = simulatePush(row, s, s.units[1], { x: 1, y: 0 }, { x: 0, y: 0 }, 2);
    const body = gridOf(['......']);
    body.tiles[2] = { ...body.tiles[2], noStop: true };
    const map = simulatePush(body, { ...s, corpses: undefined }, s.units[1], { x: 1, y: 0 }, { x: 0, y: 0 }, 2);
    expect(corpse).toEqual(map);
    expect(corpse.to).toEqual({ x: 1, y: 0 });
    expect(corpse.events.map((e) => e.k)).toEqual(['bump']);
  });

  it('the AI never plans to stop on a corpse', () => {
    const s = stateOf([
      { id: 'a', def: 'warrior', team: 'hero', x: 0, y: 0 },
      { id: 'e', def: 'soldier', team: 'enemy', x: 4, y: 0 },
    ]);
    expect(chooseTurn(row, s, 'a').moveTo).toEqual({ x: 3, y: 0 }); // the only tile beside the foe
    s.corpses = [{ x: 3, y: 0 }];
    expect(chooseTurn(row, s, 'a').moveTo).not.toEqual({ x: 3, y: 0 });
  });
});
