import { describe, expect, it } from 'vitest';
import { Battle } from '../src/shared/battle/battle.ts';
import { bodyOf, footprint, reachable, unitAt } from '../src/shared/battle/pathing.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';
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
