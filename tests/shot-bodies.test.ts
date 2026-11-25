import { describe, expect, it } from 'vitest';
import { buildDevScenario, defaultSetup, unitFrom } from '../src/client/dev-roster.ts';
import { halve } from '../src/shared/battle/half.ts';
import { footprint } from '../src/shared/battle/pathing.ts';
import { initialState } from '../src/shared/battle/scenarios.ts';
import { traceShot } from '../src/shared/battle/shot.ts';
import type { Pos } from '../src/shared/battle/types.ts';
import { bodyMetres, PERSON_M } from '../src/shared/battle/units.ts';
import { gridOf, stateOf } from './battle-helpers.ts';

// Fernando, Nov 25: a shot aims at the middle of the target's model, not at a fixed 1.5 m, so a small creature on a
// ledge is much harder to hit from below; the shooter's shot leaves its own middle, and a body stops a shot only below
// its own height
const shoot = (heights: string, target: string, at: Pos, others: { def: string; at: Pos }[] = []) => {
  const g = gridOf([heights.replace(/./g, '.')], [heights]);
  const s = stateOf([
    { id: 'a', def: 'archer', team: 'hero', x: 0, y: 0 },
    { id: 'b', def: target, team: 'enemy', ...at },
    ...others.map((o, i) => ({ id: `o${i}`, def: o.def, team: 'enemy' as const, ...o.at })),
  ]);
  return traceShot(g, s, s.units[0], at, false);
};

describe('shots aim at the middle of the body (Nov 25)', () => {
  it('the heights: a person 1.7 m, a rat far less, a big unit more', () => {
    expect(bodyMetres('soldier')).toBe(PERSON_M);
    expect(bodyMetres('rat')).toBeLessThan(0.5);
    expect(bodyMetres('brute')).toBeGreaterThan(PERSON_M);
  });

  it('a rat back on a 2 m ledge hides behind its edge; a person there is hit', () => {
    expect(shoot('0000002222', 'rat', { x: 8, y: 0 }).stop).toMatchObject({ pos: { x: 6, y: 0 }, unit: null });
    expect(shoot('0000002222', 'soldier', { x: 8, y: 0 }).stop).toBeNull();
  });

  it('the shot leaves and lands at half the body: 0.85 m for a person, under 0.25 m for a rat', () => {
    const s = shoot('0000000000', 'rat', { x: 6, y: 0 });
    expect(s.from.h).toBeCloseTo(PERSON_M / 2);
    expect(s.to.h).toBeCloseTo(bodyMetres('rat') / 2);
    expect(s.lift).toBeCloseTo(bodyMetres('rat') / 2);
  });

  it('a rat in the way lets the shot fly over it; a person in the way stops it', () => {
    expect(shoot('0000000000', 'soldier', { x: 6, y: 0 }, [{ def: 'rat', at: { x: 3, y: 0 } }]).stop).toBeNull();
    expect(shoot('0000000000', 'soldier', { x: 6, y: 0 }, [{ def: 'soldier', at: { x: 3, y: 0 } }]).stop?.unit).toBe(
      'o0',
    );
  });
});

// Fernando, Nov 25: "o rato ainda esta ocupando 2x2 ... animais pequenos = 1x1 tile e cobra = 1x2": the expedition builds
// its rooms through the developer roster, whose copy of the class dropped the body's shape
describe("an expedition room keeps the class's body", () => {
  it('a rat stands on one half tile and a snake on two', () => {
    const setup = defaultSetup('beacon_hill');
    setup.enemies = [unitFrom('rat'), unitFrom('snake'), ...setup.enemies.slice(2)];
    const room = halve(buildDevScenario(setup));
    const units = initialState(room, 1).units;
    const of = (id: string) => footprint(units.find((u) => u.id === id)!).length;
    expect(of('e0')).toBe(1);
    expect(of('e1')).toBe(2);
  });
});
