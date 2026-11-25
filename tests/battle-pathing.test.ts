import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../src/shared/battle/abilities.ts';
import { inAbilityRange, leaps, pathTo, reachable } from '../src/shared/battle/pathing.ts';
import { clearShot, flat, gridOf, stateOf } from './battle-helpers.ts';

const keys = (m: Map<string, unknown>) => [...m.keys()].sort();

describe('movement', () => {
  it('moves up to the tile limit and does not stay where it is', () => {
    const g = flat(9, 1);
    const s = stateOf([{ id: 'a', def: 'mage', team: 'hero', x: 0, y: 0 }]); // move 3
    expect(keys(reachable(g, s, 'a'))).toEqual(['1,0', '2,0', '3,0']);
  });

  it('a unit that does not state its jump has 1 level: climbs and drops 1, not 2', () => {
    const g = gridOf(['....'], ['0124']);
    const s = stateOf([{ id: 'a', def: 'warrior', team: 'hero', x: 0, y: 0 }]); // move 4, no jump
    expect(keys(reachable(g, s, 'a'))).toEqual(['1,0', '2,0']);
    const down = gridOf(['....'], ['4210']);
    const s2 = stateOf([{ id: 'a', def: 'warrior', team: 'hero', x: 3, y: 0 }]);
    expect(keys(reachable(down, s2, 'a'))).toEqual(['1,0', '2,0']);
  });

  it('each class jumps its own (UnitDef.jump): the Rogue climbs and drops 2, the Warrior does not', () => {
    const g = gridOf(['....'], ['0247']); // 2 climbs, 3 does not
    expect(keys(reachable(g, stateOf([{ id: 'a', def: 'rogue', team: 'hero', x: 0, y: 0 }]), 'a'))).toEqual([
      '1,0',
      '2,0',
    ]);
    expect(keys(reachable(g, stateOf([{ id: 'a', def: 'warrior', team: 'hero', x: 0, y: 0 }]), 'a'))).toEqual([]);
    const down = gridOf(['...'], ['420']);
    expect(keys(reachable(down, stateOf([{ id: 'a', def: 'rogue', team: 'hero', x: 0, y: 0 }]), 'a'))).toEqual([
      '1,0',
      '2,0',
    ]);
  });

  it('FFT gap ([Jump/2] tiles): jump 2 flies over 1 tile of deep water, jump 1 only swims across; wall and big drop block', () => {
    const g = gridOf(['...'], ['000']);
    g.tiles[1] = { ...g.tiles[1], depth: 2 }; // deep water in the middle
    const rogue = stateOf([{ id: 'a', def: 'rogue', team: 'hero', x: 0, y: 0 }]); // jump 2
    const r = reachable(g, rogue, 'a');
    expect(keys(r)).toEqual(['1,0', '2,0']); // deep water can also be entered by swimming (Nov 13)
    expect(r.get('2,0')?.cost).toBe(2); // the flown-over tile counts 1
    expect(pathTo(r, { x: 2, y: 0 })).toEqual([{ x: 2, y: 0 }]); // the path jumps straight over
    const swim = reachable(g, stateOf([{ id: 'a', def: 'warrior', team: 'hero', x: 0, y: 0 }]), 'a'); // jump 1 does not fly
    expect([swim.get('1,0')?.cost, swim.get('2,0')?.cost]).toEqual([1, 2]); // swims in (1) and out (1)
    expect(leaps(gridOf(['.#.'], ['000']), { x: 0, y: 0 }, 2)).toEqual([]); // a wall is not a gap
    expect(leaps(gridOf(['...'], ['010']), { x: 0, y: 0 }, 2)).toEqual([]); // a taller tile in the middle is not a gap
    const high = gridOf(['...'], ['003']);
    high.tiles[1] = { ...high.tiles[1], depth: 2 };
    expect(leaps(high, { x: 0, y: 0 }, 2)).toEqual([]); // landing 3 above exceeds the jump
  });

  it('wall and tree block the path (tree since Nov 13)', () => {
    const g = gridOf(['.#...', '.....']);
    const s = stateOf([{ id: 'a', def: 'warrior', team: 'hero', x: 0, y: 0 }]); // move 4
    const r = reachable(g, s, 'a');
    expect(r.has('1,0')).toBe(false);
    expect(r.get('2,0')?.cost).toBe(4); // goes around below
    const f = gridOf(['.T..']);
    expect(reachable(f, stateOf([{ id: 'a', def: 'mage', team: 'hero', x: 0, y: 0 }]), 'a').size).toBe(0);
  });

  it('an enemy blocks, an ally only lets you pass (you cannot stop on top)', () => {
    const g = flat(5, 1);
    const s = stateOf([
      { id: 'a', def: 'mage', team: 'hero', x: 0, y: 0 },
      { id: 'ally', def: 'mage', team: 'hero', x: 1, y: 0 },
      { id: 'foe', def: 'soldier', team: 'enemy', x: 3, y: 0 },
    ]);
    const r = reachable(g, s, 'a');
    expect(r.has('1,0')).toBe(false);
    expect(r.has('2,0')).toBe(true); // passed through the ally
    expect(r.has('3,0')).toBe(false);
    expect(r.has('4,0')).toBe(false); // the enemy closes the corridor
  });

  it('pathTo returns the path tiles without the starting one, in order', () => {
    const g = flat(5, 1);
    const s = stateOf([{ id: 'a', def: 'mage', team: 'hero', x: 0, y: 0 }]);
    expect(pathTo(reachable(g, s, 'a'), { x: 3, y: 0 })).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ]);
    expect(pathTo(reachable(g, s, 'a'), { x: 4, y: 0 })).toBeNull();
  });

  it('a unit without speed (the target to protect) does not move', () => {
    const s = stateOf([{ id: 'b', def: 'beacon', team: 'hero', x: 1, y: 1 }]);
    expect(reachable(flat(3, 3), s, 'b').size).toBe(0);
  });
});

// a straight shot under the realistic rule of Nov 15 (1.5 m up at both ends): the old line-of-sight cases keep their answers
describe('line of sight', () => {
  it('open ground sees; a wall in between blocks', () => {
    expect(clearShot(flat(5, 1), { x: 0, y: 0 }, { x: 4, y: 0 })).toBe(true);
    expect(clearShot(gridOf(['..#..']), { x: 0, y: 0 }, { x: 4, y: 0 })).toBe(false);
  });

  // from 2 levels until Nov 25, when the ends came down from 1.5 m to a person's middle (0.85 m)
  it('forest (2 m) blocks on the same level, but a shot from 3 levels above passes over it', () => {
    expect(clearShot(gridOf(['.T..']), { x: 0, y: 0 }, { x: 3, y: 0 })).toBe(false);
    expect(clearShot(gridOf(['.T..'], ['3000']), { x: 0, y: 0 }, { x: 3, y: 0 })).toBe(true);
  });

  it('a hill between two units on the ground blocks sight', () => {
    expect(clearShot(gridOf(['...'], ['020']), { x: 0, y: 0 }, { x: 2, y: 0 })).toBe(false);
  });

  it('is symmetric and the diagonal works', () => {
    const g = gridOf(['.....', '.#...', '.....', '.....']);
    for (const [a, b] of [
      [
        { x: 0, y: 0 },
        { x: 4, y: 3 },
      ],
      [
        { x: 0, y: 3 },
        { x: 4, y: 0 },
      ],
    ] as const) {
      expect(clearShot(g, a, b)).toBe(clearShot(g, b, a));
    }
  });
});

describe('ability range', () => {
  const shot = ABILITIES.shot; // 2 to 7 (6 before the bow's +1 of Nov 15), gains range from above
  it('respects minimum and maximum', () => {
    const g = flat(9, 1);
    expect(inAbilityRange(g, shot, { x: 0, y: 0 }, { x: 1, y: 0 })).toBe(false);
    expect(inAbilityRange(g, shot, { x: 0, y: 0 }, { x: 7, y: 0 })).toBe(true);
    expect(inAbilityRange(g, shot, { x: 0, y: 0 }, { x: 8, y: 0 })).toBe(false);
  });

  it('+1 range per level above the target, only for those with heightRange', () => {
    const g = gridOf(['..........'], ['2000000000']);
    expect(inAbilityRange(g, shot, { x: 0, y: 0 }, { x: 9, y: 0 })).toBe(true); // 9 tiles = 7 + 2 levels
    expect(inAbilityRange(flat(10, 1), shot, { x: 0, y: 0 }, { x: 9, y: 0 })).toBe(false); // on flat ground only 7
    expect(inAbilityRange(g, ABILITIES.gust, { x: 0, y: 0 }, { x: 5, y: 0 })).toBe(false); // Gust: 4 and no bonus
  });
});

describe('findings from the Nov 13 review', () => {
  it('passing through an ally leaves no hole in the path', () => {
    const g = flat(4, 1);
    const s = stateOf([
      { id: 'a', def: 'warrior', team: 'hero', x: 0, y: 0 },
      { id: 'b', def: 'archer', team: 'hero', x: 1, y: 0 },
    ]);
    expect(pathTo(reachable(g, s, 'a'), { x: 3, y: 0 })).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ]);
  });

  it('line of sight works the same in both directions', () => {
    const g = gridOf(['...', '.#.', '...']);
    for (const [a, b] of [
      [
        { x: 0, y: 0 },
        { x: 2, y: 1 },
      ],
      [
        { x: 0, y: 2 },
        { x: 2, y: 0 },
      ],
      [
        { x: 1, y: 0 },
        { x: 2, y: 2 },
      ],
    ]) {
      expect(clearShot(g, a, b)).toBe(clearShot(g, b, a));
    }
  });
});
