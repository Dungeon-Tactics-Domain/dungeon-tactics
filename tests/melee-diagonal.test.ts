import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../src/shared/battle/abilities.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { hitChance, previewAbility } from '../src/shared/battle/combat.ts';
import { pendingCounters } from '../src/shared/battle/counter.ts';
import { halve } from '../src/shared/battle/half.ts';
import { HALF } from '../src/shared/battle/units.ts';
import { flat, HIT_SEED, stateOf } from './battle-helpers.ts';

// Fernando, Nov 21: a melee blow reaches the 8 tiles around, diagonals included; the Spin hits them too, and a foe on the
// diagonal is in contact, so walking away from it draws its counter
const whole = (foe: { x: number; y: number }) =>
  new Battle(
    flat(8, 8),
    stateOf(
      [
        { id: 'a', def: 'warrior', team: 'hero', x: 3, y: 3 },
        { id: 'b', def: 'soldier', team: 'enemy', ...foe },
        { id: 'f', def: 'beacon', team: 'hero', x: 7, y: 7 },
      ],
      HIT_SEED,
    ),
  );
const split = () => {
  const spawns = ['warrior', 'soldier', 'beacon'].map((def, i) => ({ id: def, def, team: 'hero' as const, x: i, y: 0 }));
  const g = halve({ id: 't-diag', name: 't-diag', en: 't-diag', grid: flat(6, 6), spawns }).grid; // registers the sheets
  return new Battle(
    g,
    stateOf(
      [
        { id: 'a', def: `warrior${HALF}`, team: 'hero', x: 4, y: 4 },
        { id: 'b', def: `soldier${HALF}`, team: 'enemy', x: 6, y: 6 },
        { id: 'f', def: `beacon${HALF}`, team: 'hero', x: 0, y: 10 },
      ],
      HIT_SEED,
    ),
  );
};

describe('melee on the diagonal (Nov 21)', () => {
  it('a blow reaches the diagonal tile, not two tiles off', () => {
    expect(
      previewAbility(whole({ x: 4, y: 4 }).grid, whole({ x: 4, y: 4 }).state, 'a', 'strike', { x: 4, y: 4 }).ok,
    ).toBe(true);
    const far = whole({ x: 5, y: 4 });
    expect(previewAbility(far.grid, far.state, 'a', 'strike', { x: 5, y: 4 }).ok).toBe(false);
  });

  it('on half tiles the diagonal 2x2 token is in reach too', () => {
    const b = split();
    expect(previewAbility(b.grid, b.state, 'a', 'strike', { x: 6, y: 6 }).ok).toBe(true);
    expect(previewAbility(b.grid, b.state, 'a', 'strike', { x: 7, y: 7 }).ok).toBe(true); // any cell of its body
  });

  it('a diagonal blow aims as well as a straight one', () => {
    const b = whole({ x: 4, y: 4 });
    const a = ABILITIES.strike;
    expect(hitChance(b.grid, a, { x: 3, y: 3 }, { x: 4, y: 4 })).toBe(
      hitChance(b.grid, a, { x: 3, y: 3 }, { x: 4, y: 3 }),
    );
  });

  it('the Spin hits the diagonal neighbours', () => {
    const b = whole({ x: 4, y: 4 });
    const p = previewAbility(b.grid, b.state, 'a', 'spin', { x: 3, y: 3 });
    expect(p.ok).toBe(true);
    expect(p.ok && p.targets.map((t) => t.unit)).toContain('b');
  });

  it('a spell area of radius 1 keeps its cross: only melee counts the diagonal', () => {
    const b = whole({ x: 4, y: 4 });
    b.state.units.find((u) => u.id === 'a')!.def = 'mage';
    b.state.units.find((u) => u.id === 'a')!.pos = { x: 0, y: 4 };
    const p = previewAbility(b.grid, b.state, 'a', 'blast', { x: 3, y: 3 });
    expect(p.ok && p.targets.map((t) => t.unit)).not.toContain('b');
  });

  it('walking away from a foe on the diagonal that was struck draws its counter', () => {
    const b = whole({ x: 4, y: 4 });
    b.act('strike', { x: 4, y: 4 });
    expect(pendingCounters(b.grid, b.state, 'a', { x: 1, y: 3 }).map((c) => c.unit)).toEqual(['b']);
    expect(pendingCounters(b.grid, b.state, 'a', { x: 3, y: 4 })).toEqual([]); // still beside it: no counter
  });
});
