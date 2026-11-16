import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../src/shared/battle/abilities.ts';
import { COMBAT, damageRange, previewAbility, resolveAbility } from '../src/shared/battle/combat.ts';
import type { Team } from '../src/shared/battle/types.ts';
import { UNIT_DEFS, type UnitDef } from '../src/shared/battle/units.ts';
import { flat, seedWhere, stateOf } from './battle-helpers.ts';

// The Nov 15 grill's formulas (the Mechanics lab's equipamento.json, formulas section): hit x (1 - dodge x side), damage
// with power, then x (1 - physical or magic resistance) x (1 - the element's), rounded down, at least 1
const sheet = (id: string, extra: Partial<UnitDef>) => {
  UNIT_DEFS[id] = { ...UNIT_DEFS.soldier, resist: undefined, dodge: undefined, ...extra, id };
  return id;
};
const PLAIN = sheet('t_plain', {});
const grid = flat(5, 3);
// attacker at 0,1 and the target at `x`,1 facing `facing` (3 = toward the attacker)
const duel = (attacker: string, target: string, x = 3, facing = 3, team: Team = 'enemy', rng = 1) => {
  const s = stateOf(
    [
      { id: 'a', def: attacker, team: 'hero', x: 0, y: 1 },
      { id: 't', def: target, team, x, y: 1 },
    ],
    rng,
  );
  s.units[1].facing = facing;
  return s;
};
const aim = (attacker: string, ability: string, target: string, x = 3, facing = 3, team: Team = 'enemy') =>
  previewAbility(grid, duel(attacker, target, x, facing, team), 'a', ability, { x, y: 1 }).targets[0];

describe('dodge (Nov 15)', () => {
  const DODGER = sheet('t_dodger', { dodge: 40 });

  it('counts whole from the front, 0.75 from the side and 0.5 from behind, on top of the side and back bonus', () => {
    const plain = (f: number) => aim('archer', 'shot', PLAIN, 3, f).chance;
    expect(aim('archer', 'shot', DODGER, 3, 3).chance).toBe(Math.round(plain(3) * 0.6));
    expect(aim('archer', 'shot', DODGER, 3, 0).chance).toBe(Math.round(plain(0) * 0.7));
    expect(aim('archer', 'shot', DODGER, 3, 1).chance).toBe(Math.round(plain(1) * 0.8));
  });

  it('spells are dodged the same way', () => {
    const plain = aim('mage', 'firebolt', PLAIN).chance;
    expect(aim('mage', 'firebolt', DODGER).chance).toBe(Math.round(plain * 0.6));
  });

  it('caps at 50 (90% to hit from the front becomes 45%), and heals are never dodged', () => {
    const wall = sheet('t_wall', { dodge: 80 });
    expect(aim('warrior', 'strike', PLAIN, 1).chance).toBe(90);
    expect(aim('warrior', 'strike', wall, 1).chance).toBe(45);
    expect(aim('mage', 'heal', wall, 2).chance).toBe(100);
  });

  it('the roll uses it: a roll between 45 and 90 hits the plain sheet and misses the dodger', () => {
    const half = sheet('t_half', { dodge: 50 });
    const seed = seedWhere((v) => v > 0.5 && v < 0.85);
    const kinds = (target: string) =>
      resolveAbility(grid, duel('warrior', target, 1, 3, 'enemy', seed), 'a', 'strike', { x: 1, y: 1 }).map((e) => e.k);
    expect(kinds(PLAIN)).toContain('hit');
    expect(kinds(half)).toContain('miss');
  });
});

describe('resistances (Nov 15)', () => {
  it('a physical one cuts a martial hit, and stays between -100 and 60', () => {
    expect(aim('warrior', 'strike', sheet('t_weak', { resist: { phys: -150 } }), 1)).toMatchObject({
      dmgMin: 100, // -100: twice
      dmgMax: 160,
    });
    expect(aim('warrior', 'strike', sheet('t_hard', { resist: { phys: 90 } }), 1)).toMatchObject({
      dmgMin: 20, // 60: 50 x 0.4
      dmgMax: 32,
    });
    // a magic resistance does nothing against a martial hit
    expect(aim('warrior', 'strike', sheet('t_ward', { resist: { mag: 60 } }), 1)).toMatchObject({ dmgMin: 50 });
  });

  it("a spell takes the magic one, then its element's; another element does nothing", () => {
    expect(aim('mage', 'firebolt', sheet('t_fire', { resist: { mag: 20, fire: 50 } }))).toMatchObject({
      dmgMin: 20, // 50 x 0.8 x 0.5
      dmgMax: 32,
    });
    expect(aim('mage', 'firebolt', sheet('t_cold', { resist: { fire: -50, ice: 60 } }))).toMatchObject({
      dmgMin: 75, // fire -50: 1.5 times; the ice is not this spell's
      dmgMax: 120,
    });
  });

  it("the AI's threat reads the preview's range (damageRange), not the ability's table", () => {
    const s = duel('warrior', sheet('t_hard', { resist: { phys: 90 } }), 1);
    const [lo, hi] = damageRange(s, s.units[0], ABILITIES.strike, s.units[1]);
    expect([lo, hi]).toEqual([20, 32]);
    const p = previewAbility(grid, s, 'a', 'strike', { x: 1, y: 1 }).targets[0];
    expect([p.dmgMin, p.dmgMax]).toEqual([lo, hi]);
  });

  it('a hit that lands always takes at least 1', () => {
    // Gust 10 to 20 through 60 magic and 60 wind, at half on its own side: 0.8, rounded down to 0, so 1
    const tank = sheet('t_tank', { resist: { mag: 60, wind: 60 } });
    expect(aim('mage', 'gust', tank, 2, 3, 'hero')).toMatchObject({ dmgMin: 1, dmgMax: 1 });
  });

  it('heals ignore them', () => {
    expect(aim('mage', 'heal', sheet('t_holy', { resist: { mag: 60, light: 60 } }), 2, 3, 'hero')).toMatchObject({
      healMin: 60,
      healMax: 90,
    });
  });
});

describe('power (Nov 15)', () => {
  const brawler = sheet('t_brawler', { ...UNIT_DEFS.warrior, physPower: 10, magPower: 30 });
  const caster = sheet('t_caster', { ...UNIT_DEFS.mage, physPower: 30, magPower: 15 });

  it('physical power goes on martial abilities, magic power on spells, at both ends', () => {
    expect(aim(brawler, 'strike', PLAIN, 1)).toMatchObject({ dmgMin: 60, dmgMax: 90 });
    expect(aim(caster, 'firebolt', PLAIN)).toMatchObject({ dmgMin: 65, dmgMax: 95 });
  });

  it('heals get none', () => {
    expect(aim(caster, 'heal', PLAIN, 2, 3, 'hero')).toMatchObject({ healMin: 60, healMax: 90 });
  });
});

describe('push, fall and spikes x5 (Nov 15)', () => {
  it('match the life scale', () => {
    expect(COMBAT).toMatchObject({ BUMP_DAMAGE: 25, FALL_DAMAGE: 45, SPIKE_DAMAGE: 50 });
  });
});
