import { describe, expect, it } from 'vitest';
import { chooseTurn, playAiTurn } from '../src/shared/battle/ai.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { COMBAT, resolveAbility } from '../src/shared/battle/combat.ts';
import { samePos } from '../src/shared/battle/grid.ts';
import { halve, registerHalf } from '../src/shared/battle/half.ts';
import { footprint, reachable } from '../src/shared/battle/pathing.ts';
import { simulatePush } from '../src/shared/battle/push.ts';
import { SCENARIOS } from '../src/shared/battle/scenarios.ts';
import { HALF } from '../src/shared/battle/units.ts';
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
    expect(one.outcome).not.toBe('ongoing');
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

  it('a leap does not land on a corpse, and the walk goes on past it', () => {
    const gap = gridOf(['.....'], ['30333']);
    const s = stateOf([{ id: 'a', def: 'rogue', team: 'hero', x: 0, y: 0 }]);
    expect(reachable(gap, s, 'a').has('2,0')).toBe(true); // jump 2 flies over the pit
    s.corpses = [{ x: 2, y: 0 }];
    const reach = reachable(gap, s, 'a');
    expect(reach.has('2,0')).toBe(false);
    expect(reach.has('3,0')).toBe(true);
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

// Fernando, Nov 16 (lab audit): a push passes over a body (a map's Tile.noStop or a corpse) and only cannot end on it.
// The body cell counts in the push's distance; a push that runs out on a body slides back to the last cell before the
// chain, with no bump (nothing solid was hit)
describe('corpses: a push passes over one', () => {
  // the soldier at `at` on a row of `terrain`, pushed `steps` away from the warrior on its left, with corpses on `bodies`
  const pushed = (terrain: string, bodies: number[], steps: number, at = 1) => {
    const s = stateOf([
      { id: 'a', def: 'warrior', team: 'hero', x: at - 1, y: 0 },
      { id: 'b', def: 'soldier', team: 'enemy', x: at, y: 0 },
    ]);
    s.corpses = bodies.map((x) => ({ x, y: 0 }));
    return simulatePush(gridOf([terrain]), s, s.units[1], { x: at, y: 0 }, { x: at - 1, y: 0 }, steps);
  };
  const kinds = (r: { events: { k: string }[] }) => r.events.map((e) => e.k);

  it('goes on past the body when there is room beyond, and a map body reads the same', () => {
    const r = pushed('......', [2], 2);
    expect(r.to).toEqual({ x: 3, y: 0 });
    expect(kinds(r)).toEqual(['push', 'push']);
    expect(r.dmg).toBe(0);
    const s = stateOf([{ id: 'b', def: 'soldier', team: 'enemy', x: 1, y: 0 }]);
    const body = gridOf(['......']);
    body.tiles[2] = { ...body.tiles[2], noStop: true };
    expect(simulatePush(body, s, s.units[0], { x: 1, y: 0 }, { x: 0, y: 0 }, 2)).toEqual(r);
  });

  it('a push that runs out on the body slides back before it, unhurt', () => {
    const r = pushed('......', [3], 2);
    expect(r.to).toEqual({ x: 2, y: 0 });
    expect(kinds(r)).toEqual(['push']);
    expect(r.dmg).toBe(0);
  });

  it('crosses a chain of 2 bodies, or slides back before the whole chain', () => {
    expect(pushed('......', [2, 3], 3).to).toEqual({ x: 4, y: 0 });
    const r = pushed('......', [2, 3], 2);
    expect(r.to).toEqual({ x: 1, y: 0 });
    expect(r.events).toEqual([]);
  });

  it('a wall past the body still bumps, back before the body', () => {
    const r = pushed('...#..', [2], 2);
    expect(r.to).toEqual({ x: 1, y: 0 });
    expect(kinds(r)).toEqual(['bump']);
    expect(r.dmg).toBe(COMBAT.BUMP_DAMAGE);
  });

  it('the map edge or deep water past the body still bumps, back before the body', () => {
    const edge = pushed('.....', [4], 3, 2);
    expect(edge.to).toEqual({ x: 3, y: 0 });
    expect(kinds(edge)).toEqual(['push', 'bump']);
    const s = stateOf([{ id: 'b', def: 'soldier', team: 'enemy', x: 1, y: 0 }]);
    s.corpses = [{ x: 2, y: 0 }];
    const g = gridOf(['.....']);
    g.tiles[3] = { ...g.tiles[3], depth: 2 };
    const deep = simulatePush(g, s, s.units[0], { x: 1, y: 0 }, { x: 0, y: 0 }, 2);
    expect(deep.to).toEqual({ x: 1, y: 0 });
    expect(kinds(deep)).toEqual(['bump']);
  });

  it('a 2x2 token passes over a body under any of its cells and never ends with a cell on one', () => {
    const g = halve({ id: 't-body', name: 't-body', en: 't-body', grid: flat(6, 2), spawns: [] }).grid;
    const s = stateOf([{ id: 'b', def: `soldier${HALF}`, team: 'enemy', x: 2, y: 0 }]);
    s.corpses = [{ x: 5, y: 1 }]; // one cell, on the token's lower row
    const push = (steps: number) => simulatePush(g, s, s.units[0], s.units[0].pos, { x: 0, y: 0 }, steps);
    // 1 tile is 2 cells: the second would cover the body, so it slides back to the first
    expect(push(1).to).toEqual({ x: 3, y: 0 });
    expect(kinds(push(1))).toEqual(['push']);
    // 2 tiles: over the body (corners 4 and 5) to corner 6
    expect(push(2).to).toEqual({ x: 6, y: 0 });
    expect(push(2).dmg).toBe(0);
  });

  it('the shield bash moves the target where the push said, and the same seed lands the same', () => {
    const bash = () => {
      const s = stateOf(
        [
          { id: 'a', def: 'warrior', team: 'hero', x: 0, y: 0 },
          { id: 'b', def: 'soldier', team: 'enemy', x: 1, y: 0 },
        ],
        HIT_SEED,
      );
      s.corpses = [{ x: 2, y: 0 }];
      const said = simulatePush(row, s, s.units[1], { x: 1, y: 0 }, { x: 0, y: 0 }, 2);
      const events = resolveAbility(row, s, 'a', 'shield_bash', { x: 1, y: 0 });
      return { said, events, to: s.units[1].pos };
    };
    const one = bash();
    expect(one.to).toEqual({ x: 3, y: 0 });
    expect(one.to).toEqual(one.said.to);
    expect(one.events.filter((e) => e.k === 'push' || e.k === 'bump')).toEqual(one.said.events);
    expect(bash()).toEqual(one);
  });

  for (const [name, map] of [
    ['whole', SCENARIOS.skirmish],
    ['half', halve(SCENARIOS.skirmish)],
  ] as const)
    it(`AI battles (${name} tiles) never leave a unit on a corpse`, () => {
      const bad: string[] = [];
      for (const seed of [3, 7, 11]) {
        const b = Battle.start(map, seed);
        for (let i = 0; i < 400 && !b.over; i++) {
          playAiTurn(b);
          for (const u of b.state.units)
            if (footprint(u).some((c) => b.state.corpses?.some((k) => samePos(k, c))))
              bad.push(`seed ${seed} turn ${i}: ${u.id}`);
        }
      }
      expect(bad.slice(0, 5)).toEqual([]);
    }, 60000);
});
