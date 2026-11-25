import { describe, expect, it } from 'vitest';
import { previewAbility } from '../src/shared/battle/combat.ts';
import type { Grid } from '../src/shared/battle/grid.ts';
import { halfDef, halve } from '../src/shared/battle/half.ts';
import { shotAt, traceShot } from '../src/shared/battle/shot.ts';
import type { Pos } from '../src/shared/battle/types.ts';
import { flat, gridOf, stateOf } from './battle-helpers.ts';

// Shots under the realistic rule of the trajectory grill of Nov 15, with the Mechanics lab's own scene (trajetorias/index.html):
// a 10x8 board, the shooter on (1, 4), the target 7 tiles away on (8, 4), a 1 m wall on x 2 and a 2 m wall on x 6 (rows 3 to
// 5) and a 5 m pillar on (1, 3)
const LAB = gridOf(
  Array(8).fill('..........'),
  Array.from({ length: 8 }, (_, z) =>
    Array.from({ length: 10 }, (_, x) =>
      x === 1 && z === 3 ? 5 : z >= 3 && z <= 5 && x === 2 ? 1 : z >= 3 && z <= 5 && x === 6 ? 2 : 0,
    ).join(''),
  ),
);
const SHOOTER = { x: 1, y: 4 },
  TARGET = { x: 8, y: 4 };

// an archer on `a` shooting at a soldier on `b`, with soldiers standing on `others`
function shoot(g: Grid, a: Pos, b: Pos, arc: boolean, others: Pos[] = []) {
  const s = stateOf([
    { id: 'a', def: 'archer', team: 'hero', ...a },
    { id: 'b', def: 'soldier', team: 'enemy', ...b },
    ...others.map((p, i) => ({ id: `o${i}`, def: 'soldier', team: 'enemy' as const, ...p })),
  ]);
  return traceShot(g, s, s.units[0], b, arc);
}

describe('trajectory: the lab cases', () => {
  // since Nov 25 a shot leaves and aims at the middle of a person, 0.85 m up (1.5 m before): the 1 m wall stops it too
  it('a straight shot (crossbow, thrown knife) at 0.85 m stops on the 1 m wall, and past it on the 2 m wall', () => {
    expect(shoot(LAB, SHOOTER, { x: 5, y: 4 }, false).stop).toMatchObject({ pos: { x: 2, y: 4 }, unit: null });
    const s = shoot(LAB, { x: 3, y: 4 }, TARGET, false);
    expect(s.stop).toMatchObject({ pos: { x: 6, y: 4 }, unit: null });
    expect(shotAt(s, s.stop!.k).h).toBeCloseTo(0.85);
  });

  it("a bow's curve clears the 2 m wall with the target 7 tiles away: top 2 m over the 0.85 m points", () => {
    const s = shoot(LAB, SHOOTER, TARGET, true);
    expect(s.stop).toBeNull();
    expect(shotAt(s, 0.5).h).toBeCloseTo(2.85); // 7 tiles: floor(7 / 3) = 2 levels above 0.85 m
    expect(shotAt(s, 5.5 / 7).h).toBeCloseTo(2.197, 3); // the wall's far edge, where the curve is lowest over it
  });

  it('a 5 m pillar beside the shooter stops even the highest curve (3 levels, 3.85 m)', () => {
    expect(shoot(LAB, SHOOTER, { x: 1, y: 0 }, true).stop?.pos).toEqual({ x: 1, y: 3 });
    const row = gridOf(['............'], ['050000000000']);
    const s = shoot(row, { x: 0, y: 0 }, { x: 11, y: 0 }, true);
    expect(shotAt(s, 0.5).h).toBeCloseTo(3.85); // 11 tiles: the top is capped at 3 levels
    expect(s.stop?.pos).toEqual({ x: 1, y: 0 });
  });

  it('the top rises 1 level per 3 tiles between the ends, at least 1 and at most 3', () => {
    const top = (d: number) => shotAt(shoot(flat(13, 1), { x: 0, y: 0 }, { x: d, y: 0 }, true), 0.5).h - 0.85;
    // rounded: 0.85 m ends leave float dust (2.9999...)
    expect([2, 3, 5, 6, 9, 12].map((d) => Math.round(top(d) * 1e6) / 1e6)).toEqual([1, 1, 1, 2, 3, 3]);
  });
});

describe('trajectory: what blocks', () => {
  it('another unit stops a straight shot, even one beside the shooter; a curve flies over its 1.8 m body', () => {
    const row = flat(8, 1);
    expect(shoot(row, { x: 0, y: 0 }, { x: 6, y: 0 }, false, [{ x: 1, y: 0 }]).stop).toMatchObject({ unit: 'o0' });
    expect(shoot(row, { x: 0, y: 0 }, { x: 6, y: 0 }, true, [{ x: 3, y: 0 }]).stop).toBeNull();
  });

  it('a single-target shot stopped by terrain hits nobody, not the unit standing on that ledge', () => {
    const g = gridOf(['.....'], ['00200']);
    const s = stateOf([
      { id: 'a', def: 'rogue', team: 'hero', x: 0, y: 0 },
      { id: 'b', def: 'soldier', team: 'enemy', x: 4, y: 0 },
      { id: 'c', def: 'soldier', team: 'enemy', x: 2, y: 0 },
    ]);
    const p = previewAbility(g, s, 'a', 'throwing_knife', { x: 4, y: 0 });
    expect(p.ok).toBe(true);
    expect(p.center).toEqual({ x: 2, y: 0 });
    expect(p.targets).toEqual([]);
  });

  it('a spell cast on the target (Blast, Heal) needs no path: a wall in between changes nothing', () => {
    const g = gridOf(['..#...']);
    const s = stateOf([
      { id: 'a', def: 'mage', team: 'hero', x: 0, y: 0 },
      { id: 'b', def: 'soldier', team: 'enemy', x: 4, y: 0 },
    ]);
    const p = previewAbility(g, s, 'a', 'blast', { x: 4, y: 0 });
    expect(p.shot).toBeUndefined();
    expect(p.targets.map((t) => t.unit)).toContain('b');
  });

  it('a seam the shot runs along probes both sides, so A to B and B to A agree', () => {
    const g = gridOf(['......', '..#...', '......']);
    for (const [a, b] of [
      [
        { x: 0, y: 0 },
        { x: 4, y: 2 },
      ],
      [
        { x: 0, y: 1 },
        { x: 5, y: 1 },
      ],
    ])
      for (const arc of [false, true])
        expect(!shoot(g, a, b, arc).stop, `${a.x},${a.y} ${b.x},${b.y} ${arc}`).toBe(!shoot(g, b, a, arc).stop);
  });
});

describe('trajectory on the split map', () => {
  it('the lab scene halved stops each shot at the same point of the path, on the same whole tile', () => {
    const half = halve({ id: 't-lab', name: 'lab', en: 'lab', grid: LAB, spawns: [] }).grid;
    for (const arc of [false, true])
      for (const to of [TARGET, { x: 5, y: 4 }, { x: 1, y: 0 }]) {
        const whole = shoot(LAB, SHOOTER, to, arc);
        const s = stateOf([
          { id: 'a', def: halfDef('archer'), team: 'hero', x: SHOOTER.x * 2, y: SHOOTER.y * 2 },
          { id: 'b', def: halfDef('soldier'), team: 'enemy', x: to.x * 2, y: to.y * 2 },
        ]);
        const split = traceShot(half, s, s.units[0], { x: to.x * 2 + 1, y: to.y * 2 }, arc);
        expect(split.stop?.k).toBe(whole.stop?.k);
        expect(split.stop?.pos ?? null).toEqual(whole.stop && { x: whole.stop.pos.x * 2, y: whole.stop.pos.y * 2 });
        expect(shotAt(split, 0.37).h).toBeCloseTo(shotAt(whole, 0.37).h);
      }
  });
});
