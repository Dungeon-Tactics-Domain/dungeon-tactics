import { describe, expect, it } from 'vitest';
import { chooseTurn } from '../src/shared/battle/ai.ts';
import type { Pos } from '../src/shared/battle/types.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';
import { flat, stateOf } from './battle-helpers.ts';

// Nov 20, Fernando ("Enxame chega junto"): a swarm unit stops beside its kin so an area catches several. Made-up sheets: the
// real rat, spider and bat live in src/content
UNIT_DEFS['t-swarm'] = { ...UNIT_DEFS.soldier, id: 't-swarm', swarm: true };
UNIT_DEFS['t-plain'] = { ...UNIT_DEFS.soldier, id: 't-plain' };
// a target hard to hurt, so a hit is worth little and only the guard in chooseTurn keeps the attack
UNIT_DEFS['t-tank'] = { ...UNIT_DEFS.soldier, id: 't-tank', dodge: 50, resist: { phys: 60 } };

const touches = (a: Pos, b: Pos) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 1;
const grid = flat(20, 20);
// the hero far on the diagonal: every stop on one anti-diagonal is the same walk away, so the plain unit has ties to break
const hero = { id: 'h', def: 'soldier', team: 'hero' as const, x: 18, y: 18 };
const kin = (def: string) => [
  { id: 'k1', def, team: 'enemy' as const, x: 0, y: 5 },
  { id: 'k2', def, team: 'enemy' as const, x: 1, y: 5 },
];

describe('swarm AI (Nov 20)', () => {
  it('a swarm unit picks the stop beside two swarm allies over an equally good lonely one', () => {
    const plain = chooseTurn(
      grid,
      stateOf([{ id: 'e', def: 't-plain', team: 'enemy', x: 0, y: 0 }, hero, ...kin('t-swarm')]),
      'e',
    );
    const swarm = chooseTurn(
      grid,
      stateOf([{ id: 'e', def: 't-swarm', team: 'enemy', x: 0, y: 0 }, hero, ...kin('t-swarm')]),
      'e',
    );
    expect(plain.moveTo).not.toBeNull();
    expect(swarm.moveTo).not.toBeNull();
    expect(touches(plain.moveTo!, { x: 0, y: 5 }) || touches(plain.moveTo!, { x: 1, y: 5 })).toBe(false);
    expect(touches(swarm.moveTo!, { x: 0, y: 5 }) && touches(swarm.moveTo!, { x: 1, y: 5 })).toBe(true);
    // the same value without the bonus: it only broke a tie the plain unit settled elsewhere
    expect(swarm.score).toBeCloseTo(plain.score);
  });

  it('a swarm unit still attacks a target in reach, even when staying in the ring of its kin would score more', () => {
    // it stands in a full ring of eight kin, two tiles from the hero: staying is worth more than walking up to a hit unless
    // the kin bonus is kept among attacking stops
    const ring = [
      [4, 0],
      [5, 0],
      [6, 0],
      [4, 1],
      [6, 1],
      [4, 2],
      [5, 2],
      [6, 2],
    ].map(([x, y], i) => ({ id: `k${i}`, def: 't-swarm', team: 'enemy' as const, x, y }));
    const state = stateOf([
      { id: 'e', def: 't-swarm', team: 'enemy', x: 5, y: 1 },
      { id: 'h', def: 't-tank', team: 'hero', x: 5, y: 3 },
      ...ring,
    ]);
    expect(chooseTurn(grid, state, 'e').ability).not.toBeNull();
  });

  it('a unit that is not swarm ignores swarm allies', () => {
    const me = { id: 'e', def: 't-plain', team: 'enemy' as const, x: 0, y: 0 };
    expect(chooseTurn(grid, stateOf([me, hero, ...kin('t-swarm')]), 'e')).toEqual(
      chooseTurn(grid, stateOf([me, hero, ...kin('t-plain')]), 'e'),
    );
  });
});
