import { describe, expect, it } from 'vitest';
import { COMBAT, resolveAbility, simulatePush } from '../src/shared/battle/combat.ts';
import { nextRng, rollInt } from '../src/shared/battle/rng.ts';
import { startNextTurn } from '../src/shared/battle/turn-queue.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';
import { flat, gridOf, HIT_SEED, stateOf } from './battle-helpers.ts';

// Edge cases of rules already decided (Nov 12 to Nov 15), run against the engine on Nov 16 (edge-case battery)
const BEACON = { id: 'f', def: 'beacon', team: 'hero' as const, x: 0, y: 3 };

describe('charges on the same tick (Nov 12, FFT tie-break: enemies first)', () => {
  it('fire in list order with enemies first, and a caster killed by an earlier one loses its charge', () => {
    const s = stateOf(
      [
        { id: 'h', def: 'mage', team: 'hero', x: 1, y: 1, hp: 1 },
        { id: 'e', def: 'dark_mage', team: 'enemy', x: 4, y: 1 },
        { id: 'g', def: 'warrior', team: 'hero', x: 8, y: 3 }, // keeps the battle going, so the second charge is reached
        BEACON,
      ],
      HIT_SEED,
    );
    s.charges = [
      { unit: 'h', ability: 'blast', target: { x: 4, y: 1 }, follow: 'e', ticks: 1 },
      { unit: 'e', ability: 'blast', target: { x: 1, y: 1 }, follow: 'h', ticks: 1 },
    ];
    const ev = startNextTurn(flat(10, 4), s);
    expect(s.outcome).toBe('ongoing');
    expect(ev.map((e) => e.k)).toEqual(['attack', 'hit', 'die']);
    expect(ev[0]).toMatchObject({ unit: 'e' });
    expect(ev.some((e) => 'unit' in e && e.unit === 'h' && (e.k === 'attack' || e.k === 'fizzle'))).toBe(false);
    expect(s.charges).toEqual([]);
  });
});

describe('one rounding at the end (Nov 15 grill)', () => {
  it('a counter rounds once after both resistances and the half: 51 at 30% magic and 10% fire is 16, not 15', () => {
    UNIT_DEFS.t_edge = { ...UNIT_DEFS.soldier, id: 't_edge', resist: { mag: 30, fire: 10 }, dodge: 0 };
    // first seed whose hit roll lands and whose damage roll (Fireball 50 to 80) is 51
    let seed = 1;
    while (!(nextRng(seed)[0] < 0.5 && rollInt(nextRng(seed)[1], 50, 80)[0] === 51)) seed++;
    const s = stateOf(
      [
        { id: 'c', def: 'acolyte', team: 'enemy', x: 0, y: 1 },
        { id: 't', def: 't_edge', team: 'hero', x: 3, y: 1 },
        BEACON,
      ],
      seed,
    );
    const ev = resolveAbility(flat(5, 4), s, 'c', 'firebolt', { x: 3, y: 1 }, true, COMBAT.COUNTER);
    expect(ev.find((e) => e.k === 'hit')).toMatchObject({ dmg: 16 }); // 51 x 0.7 x 0.9 x 0.5 = 16.07
  });
});

describe('push damage adds up (x5 of Nov 15)', () => {
  const pushed = (terrain: string, heights: string) => {
    const s = stateOf([
      { id: 'a', def: 'warrior', team: 'hero', x: 0, y: 0 },
      { id: 'b', def: 'soldier', team: 'enemy', x: 1, y: 0 },
    ]);
    return simulatePush(gridOf([terrain], [heights]), s, s.units[1], { x: 1, y: 0 }, { x: 0, y: 0 }, 2);
  };

  it('two drops in one push add their falls: 3 levels then 2 is 90 + 45', () => {
    const r = pushed('.....', '66310');
    expect(r.to).toEqual({ x: 3, y: 0 });
    expect(r.dmg).toBe(2 * COMBAT.FALL_DAMAGE + COMBAT.FALL_DAMAGE);
  });

  it('a fall then a wall adds the fall and the bump: 90 + 25', () => {
    const r = pushed('...#.', '33000');
    expect(r.to).toEqual({ x: 2, y: 0 });
    expect(r.events.map((e) => e.k)).toEqual(['push', 'fall', 'bump']);
    expect(r.dmg).toBe(2 * COMBAT.FALL_DAMAGE + COMBAT.BUMP_DAMAGE);
  });
});

describe('a body on the ground (Nov 13, Fernando: passable, but nobody stays on it)', () => {
  it('a push cannot end on it: it stops before, with the bump', () => {
    const g = flat(5, 1);
    g.tiles[3].noStop = true;
    const s = stateOf([
      { id: 'a', def: 'warrior', team: 'hero', x: 0, y: 0 },
      { id: 'b', def: 'soldier', team: 'enemy', x: 1, y: 0 },
    ]);
    const r = simulatePush(g, s, s.units[1], { x: 1, y: 0 }, { x: 0, y: 0 }, 2);
    expect(r.to).toEqual({ x: 2, y: 0 });
    expect(r.events.map((e) => e.k)).toEqual(['push', 'bump']);
    expect(r.dmg).toBe(COMBAT.BUMP_DAMAGE);
  });
});
