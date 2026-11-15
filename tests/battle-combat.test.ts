import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../src/shared/battle/abilities.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { COMBAT, checkOutcome, previewAbility, resolveAbility } from '../src/shared/battle/combat.ts';
import type { Grid } from '../src/shared/battle/grid.ts';
import { SCENARIOS } from '../src/shared/battle/scenarios.ts';
import type { BattleState } from '../src/shared/battle/types.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';
import { flat, gridOf, HIT_SEED, MISS_SEED, stateOf } from './battle-helpers.ts';

const at = (x: number, y = 0) => ({ x, y });
const chanceOf = (g: Grid, s: BattleState, ability: string, target: { x: number; y: number }) =>
  previewAbility(g, s, 'a', ability, target).targets[0]?.chance;
const duel = (def: string, foeAt: number, foeDef = 'soldier', rng = 1) =>
  stateOf(
    [
      { id: 'a', def, team: 'hero', x: 0, y: 0 },
      { id: 'f', def: foeDef, team: 'enemy', x: foeAt, y: 0 },
    ],
    rng,
  );

describe('hit chance', () => {
  it('drops with distance (3 points per tile beyond the first)', () => {
    const g = flat(9, 1);
    expect(chanceOf(g, duel('archer', 2), 'shot', at(2))).toBe(82);
    expect(chanceOf(g, duel('archer', 5), 'shot', at(5))).toBe(73);
  });

  it('rises 5 points per level above the target and drops 5 per level below', () => {
    const s = duel('archer', 3);
    expect(chanceOf(gridOf(['....'], ['1000']), s, 'shot', at(3))).toBe(79 + 5);
    expect(chanceOf(gridOf(['....'], ['0001']), s, 'shot', at(3))).toBe(79 - 5);
  });

  it('forest on the target gives cover against shots, but not against melee hits', () => {
    expect(chanceOf(gridOf(['..T']), duel('archer', 2), 'shot', at(2))).toBe(82 - 20);
    expect(chanceOf(gridOf(['.T']), duel('warrior', 1), 'strike', at(1))).toBe(90);
  });

  it('never exceeds 95', () => {
    expect(chanceOf(gridOf(['....'], ['3000']), duel('archer', 3), 'aimed_shot', at(3))).toBe(95);
  });
});

describe('ability preview', () => {
  it('out of range gives the reason; without sight the shot stops at the obstacle and an empty tile is also valid (Nov 13)', () => {
    const g = flat(9, 1);
    expect(previewAbility(g, duel('archer', 8), 'a', 'shot', at(8))).toMatchObject({ ok: false, reason: 'range' });
    expect(previewAbility(gridOf(['..#..']), duel('archer', 4), 'a', 'shot', at(4))).toMatchObject({
      ok: true,
      center: at(2),
      targets: [],
    });
    expect(previewAbility(g, duel('archer', 3), 'a', 'shot', at(1))).toMatchObject({ ok: false, reason: 'range' });
    expect(previewAbility(flat(5, 1), duel('archer', 3), 'a', 'shot', at(2))).toMatchObject({ ok: true, targets: [] });
  });

  it('damage and heal land on either side; the wrong side gets half (Nov 15, battle-friendly-fire.test.ts)', () => {
    const s = stateOf([
      { id: 'a', def: 'mage', team: 'hero', x: 0, y: 0 },
      { id: 'ally', def: 'rogue', team: 'hero', x: 2, y: 0 },
      { id: 'f', def: 'soldier', team: 'enemy', x: 3, y: 0 },
    ]);
    const g = flat(5, 1);
    expect(previewAbility(g, s, 'a', 'firebolt', at(2)).targets.map((t) => t.unit)).toEqual(['ally']);
    expect(previewAbility(g, s, 'a', 'firebolt', at(3)).targets.map((t) => t.unit)).toEqual(['f']);
    expect(previewAbility(g, s, 'a', 'heal', at(2)).targets.map((t) => t.unit)).toEqual(['ally']);
    expect(previewAbility(g, s, 'a', 'heal', at(3)).targets.map((t) => t.unit)).toEqual(['f']);
    expect(previewAbility(g, s, 'a', 'heal', at(0)).ok).toBe(false); // never the caster itself (range starts at 1)
  });

  it('area hits everyone inside it, allies too, and never the user', () => {
    const s = stateOf([
      { id: 'a', def: 'mage', team: 'hero', x: 0, y: 0 },
      { id: 'ally', def: 'rogue', team: 'hero', x: 3, y: 0 },
      { id: 'f', def: 'soldier', team: 'enemy', x: 4, y: 0 },
    ]);
    const p = previewAbility(flat(6, 1), s, 'a', 'blast', at(4));
    expect(p.targets.map((t) => t.unit).sort()).toEqual(['ally', 'f']);
    const spin = stateOf([
      { id: 'a', def: 'warrior', team: 'hero', x: 1, y: 0 },
      { id: 'f', def: 'soldier', team: 'enemy', x: 2, y: 0 },
    ]);
    expect(previewAbility(flat(4, 1), spin, 'a', 'spin', at(3)).targets.map((t) => t.unit)).toEqual(['f']); // centered on the user
  });

  it('shows the damage range', () => {
    expect(previewAbility(flat(3, 1), duel('warrior', 1), 'a', 'strike', at(1)).targets[0]).toMatchObject({
      dmgMin: ABILITIES.strike.damage[0],
      dmgMax: ABILITIES.strike.damage[1],
    });
  });
});

describe('resolving the ability', () => {
  it('a hit removes HP within the range and a miss removes nothing', () => {
    const g = flat(3, 1);
    const hit = duel('warrior', 1, 'soldier', HIT_SEED);
    const ev = resolveAbility(g, hit, 'a', 'strike', at(1));
    const lost = UNIT_DEFS.soldier.hp - hit.units[1].hp;
    expect(lost).toBeGreaterThanOrEqual(ABILITIES.strike.damage[0]);
    expect(lost).toBeLessThanOrEqual(ABILITIES.strike.damage[1]);
    expect(ev.map((e) => e.k)).toContain('hit');
    const miss = duel('warrior', 1, 'soldier', MISS_SEED);
    const ev2 = resolveAbility(g, miss, 'a', 'strike', at(1));
    expect(miss.units[1].hp).toBe(UNIT_DEFS.soldier.hp);
    expect(ev2.map((e) => e.k)).toContain('miss');
  });

  it('the same situation with the same seed gives the same result, and the roll advances', () => {
    const g = flat(3, 1);
    const a = duel('warrior', 1, 'soldier', 5);
    const b = duel('warrior', 1, 'soldier', 5);
    expect(resolveAbility(g, a, 'a', 'strike', at(1))).toEqual(resolveAbility(g, b, 'a', 'strike', at(1)));
    expect(a.units[1].hp).toBe(b.units[1].hp);
    expect(a.rng).not.toBe(5);
  });

  it('an invalid ability does not change the state', () => {
    const s = duel('warrior', 3);
    const before = structuredClone(s);
    expect(resolveAbility(flat(5, 1), s, 'a', 'strike', at(3))).toEqual([]);
    expect(s).toEqual(before);
  });

  it('heal restores up to the max and never misses', () => {
    const s = stateOf(
      [
        { id: 'a', def: 'mage', team: 'hero', x: 0, y: 0 },
        { id: 'w', def: 'warrior', team: 'hero', x: 2, y: 0, hp: 40 },
      ],
      MISS_SEED,
    );
    const ev = resolveAbility(flat(3, 1), s, 'a', 'heal', at(2));
    expect(s.units[1].hp).toBe(42);
    expect(ev).toContainEqual({ k: 'heal', unit: 'w', amount: 2 });
  });

  it('killing removes the unit and announces it', () => {
    const s = stateOf(
      [
        { id: 'a', def: 'warrior', team: 'hero', x: 0, y: 0 },
        { id: 'f', def: 'soldier', team: 'enemy', x: 1, y: 0, hp: 1 },
      ],
      HIT_SEED,
    );
    const ev = resolveAbility(flat(3, 1), s, 'a', 'strike', at(1));
    expect(s.units.map((u) => u.id)).toEqual(['a']);
    expect(ev).toContainEqual({ k: 'die', unit: 'f' });
  });
});

describe('push', () => {
  const bash = (g: Grid, s: BattleState) => resolveAbility(g, s, 'a', 'shield_bash', at(1));

  it('moves 2 tiles away from the pusher', () => {
    const s = duel('warrior', 1, 'soldier', HIT_SEED);
    bash(flat(6, 1), s);
    expect(s.units[1].pos).toEqual(at(3));
  });

  it('wall, another unit and the edge stop the push; wall and unit deal impact damage', () => {
    const wall = duel('warrior', 1, 'soldier', HIT_SEED);
    const ev = bash(gridOf(['..#.']), wall);
    expect(wall.units[1].pos).toEqual(at(1));
    expect(ev.find((e) => e.k === 'bump')).toMatchObject({ unit: 'f', dmg: COMBAT.BUMP_DAMAGE });

    const crowd = stateOf(
      [
        { id: 'a', def: 'warrior', team: 'hero', x: 0, y: 0 },
        { id: 'f', def: 'soldier', team: 'enemy', x: 1, y: 0 },
        { id: 'g', def: 'soldier', team: 'enemy', x: 2, y: 0 },
      ],
      HIT_SEED,
    );
    bash(flat(5, 1), crowd);
    expect(crowd.units[1].pos).toEqual(at(1));

    const edge = duel('warrior', 1, 'soldier', HIT_SEED);
    bash(flat(2, 1), edge);
    expect(edge.units[1].pos).toEqual(at(1));
  });

  it('a fall of 2 levels or more deals damage; a step of 1 does not', () => {
    const drop = duel('warrior', 1, 'soldier', HIT_SEED);
    const ev = bash(gridOf(['....'], ['3300']), drop);
    expect(drop.units[1].pos).toEqual(at(3));
    expect(ev.find((e) => e.k === 'fall')).toMatchObject({ levels: 3, dmg: 2 * COMBAT.FALL_DAMAGE });
    const step = duel('warrior', 1, 'soldier', HIT_SEED);
    expect(bash(gridOf(['....'], ['0110']), step).some((e) => e.k === 'fall')).toBe(false);
  });

  it('does not push up a step greater than the jump', () => {
    const s = duel('warrior', 1, 'soldier', HIT_SEED);
    const ev = bash(gridOf(['....'], ['0003']), s);
    expect(s.units[1].pos).toEqual(at(2));
    expect(ev.some((e) => e.k === 'bump')).toBe(true);
  });

  it('whoever dies in the fall leaves the battle', () => {
    const s = stateOf(
      [
        { id: 'a', def: 'warrior', team: 'hero', x: 0, y: 0 },
        { id: 'f', def: 'soldier', team: 'enemy', x: 1, y: 0, hp: 5 },
      ],
      HIT_SEED,
    );
    const ev = bash(gridOf(['....'], ['3300']), s);
    expect(s.units).toHaveLength(1);
    expect(ev.some((e) => e.k === 'die' && e.unit === 'f')).toBe(true);
  });

  it('area push moves away from the blast center', () => {
    const s = stateOf(
      [
        { id: 'a', def: 'mage', team: 'hero', x: 0, y: 2 },
        { id: 'f', def: 'soldier', team: 'enemy', x: 3, y: 2 },
      ],
      HIT_SEED,
    );
    resolveAbility(flat(8, 5), s, 'a', 'gust', at(3, 2));
    expect(s.units[1].pos).toEqual(at(5, 2)); // Gust: pushes 2 tiles, away from the caster
  });
});

describe('battle end', () => {
  it('wins when no enemy remains; loses when the target falls or all heroes die', () => {
    const base = [
      { id: 'h', def: 'warrior', team: 'hero' as const, x: 0, y: 0 },
      { id: 'b', def: 'beacon', team: 'hero' as const, x: 1, y: 1 },
      { id: 'e', def: 'soldier', team: 'enemy' as const, x: 3, y: 3 },
    ];
    expect(checkOutcome(stateOf(base))).toBe('ongoing');
    expect(checkOutcome(stateOf(base.filter((u) => u.id !== 'e')))).toBe('victory');
    expect(checkOutcome(stateOf(base.filter((u) => u.id !== 'b')))).toBe('defeat');
    expect(checkOutcome(stateOf(base.filter((u) => u.id !== 'h')))).toBe('defeat');
  });
});

// FFT study (Nov 11): Throw Stone and Charge push ~50% of the time
describe('push with chance', () => {
  it('pushChance 0 never pushes and 100 always pushes; without the field, it always pushes', () => {
    const grid = flat(6, 1);
    const pushed = (pushChance?: number) => {
      ABILITIES.test_push = { ...ABILITIES.shield_bash, id: 'test_push', pushChance };
      UNIT_DEFS.test_pusher = { ...UNIT_DEFS.warrior, id: 'test_pusher', abilities: ['test_push'] };
      const state = stateOf(
        [
          { id: 'a', def: 'test_pusher', team: 'hero', x: 0, y: 0 },
          { id: 'b', def: 'soldier', team: 'enemy', x: 1, y: 0 },
          { id: 'f', def: 'beacon', team: 'hero', x: 5, y: 0 },
        ],
        HIT_SEED,
      );
      return resolveAbility(grid, state, 'a', 'test_push', { x: 1, y: 0 }).some((e) => e.k === 'push');
    };
    expect(pushed(0)).toBe(false);
    expect(pushed(100)).toBe(true);
    expect(pushed()).toBe(true);
  });
});

describe('facing in the game (Nov 13)', () => {
  it('a physical hit gains accuracy from the side and more from behind; magic ignores facing', () => {
    const g = flat(5, 3);
    const s = stateOf([
      { id: 'a', def: 'archer', team: 'hero', x: 0, y: 1 },
      { id: 'f', def: 'soldier', team: 'enemy', x: 3, y: 1 },
    ]);
    const shot = (facing: number) => {
      s.units[1].facing = facing;
      return previewAbility(g, s, 'a', 'shot', { x: 3, y: 1 }).targets[0];
    };
    const front = shot(3); // facing -x, toward the archer
    expect(front.side).toBe('front');
    expect(shot(0).side).toBe('side');
    expect(shot(0).chance).toBe(Math.min(COMBAT.MAX_CHANCE, front.chance + COMBAT.SIDE_BONUS));
    expect(shot(1).side).toBe('back');
    expect(shot(1).chance).toBe(Math.min(COMBAT.MAX_CHANCE, front.chance + COMBAT.BACK_BONUS));
  });
});

describe('battle end without Beacon (Nov 13)', () => {
  it('a map that starts without a Beacon does not lose for lacking one', () => {
    const st = Battle.start(SCENARIOS.ash_wood, 1).state;
    expect(checkOutcome(st)).toBe('ongoing');
    expect(checkOutcome({ ...st, units: st.units.filter((u) => u.team !== 'enemy') })).toBe('victory');
  });
});
