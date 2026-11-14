import { describe, expect, it } from 'vitest';
import { chooseTurn } from '../src/shared/battle/ai.ts';
import { hitChance, previewAbility, simulatePush } from '../src/shared/battle/combat.ts';
import { ABILITIES } from '../src/shared/battle/abilities.ts';
import { type Grid } from '../src/shared/battle/grid.ts';
import { lineOfSight, reachable } from '../src/shared/battle/pathing.ts';
import { flat, stateOf } from './battle-helpers.ts';

// Shallow and deep water (Fernando's decision of Nov 12, "like FFT", BMG 6.5): shallow costs 2 movement, 2h or more does not
// allow entry; since Nov 13 shallow water does not lower whoever stands in it (it only costs movement).
const withWater = (g: Grid, cells: [x: number, y: number, depth: number][]) => {
  for (const [x, y, depth] of cells) g.tiles[y * g.width + x] = { ...g.tiles[y * g.width + x], depth };
  return g;
};

describe('water', () => {
  it("water costs 1 movement since Nov 13 (Fernando's choice: fewer restraints); with 4 points the Warrior crosses 4 tiles", () => {
    const g = withWater(flat(8, 3), [
      [2, 1, 1],
      [3, 1, 1],
      [4, 1, 1],
      [5, 1, 1],
    ]);
    const s = stateOf([{ id: 'a', def: 'warrior', team: 'hero', x: 1, y: 1 }]);
    const reach = reachable(g, s, 'a');
    expect(reach.get('2,1')?.cost).toBe(1);
    expect(reach.get('5,1')?.cost).toBe(4);
    expect(reach.has('6,1')).toBe(false);
  });

  it("deep (2 or more) allows entry since Nov 13 (Fernando's choice): costs 1 and jump 1 is enough, measured from the surface", () => {
    const g = withWater(flat(5, 3), [
      [2, 1, 2],
      [3, 1, 2],
    ]);
    const s = stateOf([{ id: 'a', def: 'warrior', team: 'hero', x: 1, y: 1 }]);
    const reach = reachable(g, s, 'a');
    expect(reach.get('2,1')?.cost).toBe(1);
    expect(reach.get('3,1')?.cost).toBe(2);
  });

  it('in deep water you can only move or wait: no ability comes out of there', () => {
    const g = withWater(flat(5, 3), [[2, 1, 2]]);
    const s = stateOf([
      { id: 'a', def: 'warrior', team: 'hero', x: 2, y: 1 },
      { id: 'b', def: 'soldier', team: 'enemy', x: 3, y: 1 },
    ]);
    expect(previewAbility(g, s, 'a', 'strike', { x: 3, y: 1 })).toMatchObject({ ok: false, reason: 'water' });
    const dry = stateOf([
      { id: 'a', def: 'warrior', team: 'hero', x: 1, y: 1 },
      { id: 'b', def: 'soldier', team: 'enemy', x: 2, y: 1 },
    ]);
    expect(previewAbility(g, dry, 'a', 'strike', { x: 2, y: 1 }).ok).toBe(true); // from outside, a swimmer takes a normal hit
  });

  it("shallow water does not lower whoever stands in it (Nov 13, Fernando's request): from a bank 1 above you go down and up with jump 1", () => {
    const g = withWater(flat(5, 1), [[2, 0, 1]]);
    g.tiles[3] = { ...g.tiles[3], h: 1 }; // bank 1 level above the water
    const s = stateOf([{ id: 'a', def: 'warrior', team: 'hero', x: 2, y: 0 }]);
    expect(reachable(g, s, 'a').has('3,0')).toBe(true);
    const strike = ABILITIES.strike;
    expect(hitChance(g, strike, { x: 1, y: 0 }, { x: 2, y: 0 })).toBe(Math.min(95, strike.accuracy)); // same level
  });

  it('a swimmer in deep water is seen from afar through the surface (Nov 13 review: at 3 tiles or more it was invisible)', () => {
    const g = withWater(flat(8, 1), [[6, 0, 2]]);
    for (let x = 0; x <= 4; x++) expect(lineOfSight(g, { x, y: 0 }, { x: 6, y: 0 })).toBe(true);
  });

  it('a push stops at deep water, like a wall (our assumption)', () => {
    const g = withWater(flat(5, 3), [[3, 1, 2]]);
    const s = stateOf([
      { id: 'a', def: 'warrior', team: 'hero', x: 1, y: 1 },
      { id: 'b', def: 'soldier', team: 'enemy', x: 2, y: 1 },
    ]);
    const r = simulatePush(g, s, s.units[1], { x: 2, y: 1 }, { x: 1, y: 1 }, 2);
    expect(r.to).toEqual({ x: 2, y: 1 });
    expect(r.events[0]).toMatchObject({ k: 'bump' });
  });

  it('the AI measures distance on foot: it goes around instead of standing still behind deep water', () => {
    // wall of deep water between the two, with a gap below; in a straight line he is already "2 tiles away" and used not to move
    const g = withWater(flat(5, 5), [
      [2, 0, 2],
      [2, 1, 2],
      [2, 2, 2],
      [2, 3, 2],
    ]);
    const s = stateOf([
      { id: 'a', def: 'soldier', team: 'enemy', x: 1, y: 1 },
      { id: 'b', def: 'warrior', team: 'hero', x: 3, y: 1 },
      { id: 'beacon', def: 'beacon', team: 'hero', x: 4, y: 4 },
    ]);
    const plan = chooseTurn(g, s, 'a');
    expect(plan.moveTo?.y).toBeGreaterThan(1); // goes down toward the gap
  });
});
