import { describe, expect, it } from 'vitest';
import { registerHalf } from '../src/shared/battle/half.ts';
import { reachable } from '../src/shared/battle/pathing.ts';
import { flat, stateOf } from './battle-helpers.ts';

// Half tile (Nov 13): the 2x2 unit passes through allies and never through enemies, like the 1-tile one
describe('half tiles: 2x2 token', () => {
  registerHalf();
  // corridor 2 tiles wide (y 0 and 1); the unit starts at x 0 and wants to reach x 8
  const run = (other: 'hero' | 'enemy') =>
    reachable(
      flat(10, 2),
      stateOf([
        { id: 'a', def: 'warrior½', team: 'hero', x: 0, y: 0 },
        { id: 'b', def: 'soldier', team: other, x: 4, y: 1 },
      ]),
      'a',
      20,
    );
  it('an enemy in the corridor blocks the way', () => {
    expect(run('enemy').has('8,0')).toBe(false);
  });
  it('an ally in the corridor lets you through', () => {
    expect(run('hero').has('8,0')).toBe(true);
  });
});
