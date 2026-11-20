import { describe, expect, it } from 'vitest';
import { Battle, parseBattleState } from '../src/shared/battle/battle.ts';
import { bodyOf, footprint, reachable, unitAt } from '../src/shared/battle/pathing.ts';
import { simulatePush } from '../src/shared/battle/push.ts';
import { SCENARIOS } from '../src/shared/battle/scenarios.ts';
import { HALF, UNIT_DEFS } from '../src/shared/battle/units.ts';
import { flat, gridOf, stateOf } from './battle-helpers.ts';

// a 1x2 body (UnitDef.halfLength): head on `pos`, tail on the cell behind its facing
UNIT_DEFS.t_snake = { ...UNIT_DEFS.mini_skeleton, id: 't_snake', size: 1, halfLength: 2 };

describe('long body (halfLength)', () => {
  it('lies behind the head, opposite the facing', () => {
    expect(bodyOf('t_snake', { x: 3, y: 3 }, 0)).toEqual([
      { x: 3, y: 3 },
      { x: 3, y: 2 },
    ]);
    expect(bodyOf('t_snake', { x: 3, y: 3 }, 1)).toEqual([
      { x: 3, y: 3 },
      { x: 2, y: 3 },
    ]);
    // a square unit keeps its square
    expect(bodyOf('mini_skeleton', { x: 3, y: 3 }, 1)).toEqual([{ x: 3, y: 3 }]);
  });

  it('is found on its tail cell', () => {
    const s = stateOf([{ id: 's', def: 't_snake', team: 'enemy', x: 3, y: 3 }]);
    s.units[0].facing = 1;
    expect(footprint(s.units[0])).toHaveLength(2);
    expect(unitAt(s, { x: 2, y: 3 })?.id).toBe('s');
    expect(unitAt(s, { x: 4, y: 3 })).toBeUndefined();
  });

  it('cannot stop where its tail would sit on another unit', () => {
    const s = stateOf([
      { id: 's', def: 't_snake', team: 'enemy', x: 2, y: 2 },
      { id: 'b', def: 'mini_skeleton', team: 'enemy', x: 3, y: 2 },
    ]);
    s.units[0].facing = 0;
    const r = reachable(flat(6, 6), s, 's', 2);
    // (1,2) faces -x, tail on its old cell (2,2): free
    expect(r.has('1,2')).toBe(true);
    // (4,2) is reached only through the ally on (3,2), where the tail would rest
    expect(r.has('4,2')).toBe(false);
  });

  it('cannot turn its tail into a wall', () => {
    const g = gridOf(['.....', '.....', '..#..', '.....', '.....']);
    const b = new Battle(g, stateOf([{ id: 's', def: 't_snake', team: 'enemy', x: 2, y: 3 }]));
    b.state.units[0].facing = 1; // tail on (1,3)
    b.face(0); // tail would go on (2,2), a wall
    expect(b.state.units[0].facing).toBe(1);
    b.face(2); // tail on (2,4)
    expect(b.state.units[0].facing).toBe(2);
  });

  it('cannot turn its tail off the map', () => {
    const b = new Battle(flat(4, 4), stateOf([{ id: 's', def: 't_snake', team: 'enemy', x: 0, y: 2 }]));
    b.state.units[0].facing = 3; // tail on (1,2)
    b.face(1); // tail would be on (-1,2)
    expect(b.state.units[0].facing).toBe(3);
  });
});

// Nov 20, Fernando ("Cauda no caminho todo"): the tail fits at every step, every turn, every push and every load
describe('long body: no hole along the way', () => {
  const snakeAt = (x: number, y: number, facing: number, others: Parameters<typeof stateOf>[0] = []) => {
    const s = stateOf([{ id: 's', def: 't_snake', team: 'enemy', x, y }, ...others]);
    s.units[0].facing = facing;
    return s;
  };

  it('does not leap a gap its tail would hang into', () => {
    // a pit 3 levels deep: the mini skeleton (jump 2) leaps it, the snake's tail would lie at its bottom
    const g = gridOf(['.....', '.....', '.....'], ['33033', '33033', '33033']);
    expect(
      reachable(g, stateOf([{ id: 'm', def: 'mini_skeleton', team: 'enemy', x: 1, y: 1 }]), 'm', 4).has('3,1'),
    ).toBe(true);
    const r = reachable(g, snakeAt(1, 1, 1), 's', 4);
    expect(r.has('3,1')).toBe(false);
    expect(r.has('4,1')).toBe(false);
  });

  it('may crawl back onto its own tail', () => {
    // tail on (2,1): the head steps there and the tail lands on the old head
    expect(reachable(flat(5, 5), snakeAt(2, 2, 0), 's', 1).has('2,1')).toBe(true);
  });

  it('takes another last step when the cheapest one leaves the tail on an ally', () => {
    // (2,3) costs 2 both ways; the search finds it first through the ally on (2,2), where the tail would rest
    const s = snakeAt(1, 2, 0, [{ id: 'a', def: 'mini_skeleton', team: 'enemy', x: 2, y: 2 }]);
    const r = reachable(flat(5, 5), s, 's', 2);
    expect(r.get('2,3')?.path).toEqual([
      { x: 1, y: 3 },
      { x: 2, y: 3 },
    ]);
  });

  it('cannot turn its tail down a cliff deeper than its jump', () => {
    const g = gridOf(['...', '...', '...'], ['030', '000', '000']);
    const b = new Battle(g, snakeAt(1, 1, 1));
    b.face(0); // tail on (1,0), 3 levels up
    expect(b.state.units[0].facing).toBe(1);
    b.face(2); // tail on (1,2), level
    expect(b.state.units[0].facing).toBe(2);
  });

  it('keeps its facing when turning to act would put the tail on a wall', () => {
    const g = gridOf(['.....', '.....', '.....', '..#..', '.....']);
    const b = new Battle(g, snakeAt(2, 2, 3, [{ id: 'h', def: 'mini_skeleton', team: 'hero', x: 2, y: 1 }]));
    b.act('stab', { x: 2, y: 1 }); // facing the hero (-y) would lay the tail on the wall at (2,3)
    expect(b.state.units[0].facing).toBe(3);
  });

  it('is pushed whole: a wall under the tail blocks it', () => {
    const s = snakeAt(2, 2, 1); // tail on (1,2), pushed toward +y
    expect(simulatePush(flat(5, 5), s, s.units[0], { x: 2, y: 2 }, { x: 2, y: 1 }, 1).to).toEqual({ x: 2, y: 3 });
    const g = gridOf(['.....', '.....', '.....', '.#...', '.....']);
    const p = simulatePush(g, s, s.units[0], { x: 2, y: 2 }, { x: 2, y: 1 }, 1);
    expect(p.to).toEqual({ x: 2, y: 2 });
    expect(p.events.some((e) => e.k === 'bump')).toBe(true);
  });

  it('loads only with a facing and its tail on the map', () => {
    const raw = JSON.parse(Battle.start(SCENARIOS.skirmish, 1).save()).state;
    const i = raw.units.findIndex((u: { team: string }) => u.team === 'enemy');
    const def = raw.units[i].def.endsWith(HALF) ? `snake${HALF}` : 'snake';
    const withSnake = (patch: object) => ({
      ...raw,
      units: raw.units.map((u: object, k: number) =>
        k === i ? { ...u, def, hp: 1, vars: { stamina: 30, mana: 30 }, ...patch } : u,
      ),
    });
    // some facing fits where the unit stood (the rest of the save is sound)
    expect([0, 1, 2, 3].some((f) => parseBattleState(withSnake({ facing: f })))).toBe(true);
    expect(parseBattleState(withSnake({ facing: undefined }))).toBeNull();
    expect(parseBattleState(withSnake({ pos: { x: 0, y: raw.units[i].pos.y }, facing: 1 }))).toBeNull();
  });
});
