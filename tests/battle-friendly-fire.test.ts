import { describe, expect, it } from 'vitest';
import { buildDevScenario, unitFrom } from '../src/client/dev-roster.ts';
import { ABILITIES } from '../src/shared/battle/abilities.ts';
import { previewAbility, resolveAbility } from '../src/shared/battle/combat.ts';
import { halfDef } from '../src/shared/battle/half.ts';
import type { BattleEvent } from '../src/shared/battle/types.ts';
import { resistOf, UNIT_DEFS } from '../src/shared/battle/units.ts';
import { flat, HIT_SEED, stateOf } from './battle-helpers.ts';

// Friendly fire (Nov 15, Fernando, "no exceptions"): whatever lands on the caster's own side does half the damage, aimed or
// collateral; a heal that lands on the other side heals half; a heal on the undead hurts by half its amount instead
const at = (x: number, y = 0) => ({ x, y });
const half = ([lo, hi]: [number, number]) => [Math.floor(lo / 2), Math.floor(hi / 2)];
// half of a physical hit on a soldier, after its physical resistance (Nov 15)
const halfOnSoldier = (r: [number, number]) =>
  r.map((d) => Math.floor((d * (100 - resistOf(UNIT_DEFS.soldier, 'phys'))) / 200));
const dealt = (events: BattleEvent[], unit: string) =>
  events.find((e): e is Extract<BattleEvent, { k: 'hit' }> => e.k === 'hit' && e.unit === unit)?.dmg;

describe('friendly fire (Nov 15)', () => {
  it('a hit aimed at an ally lands at half damage', () => {
    const s = stateOf(
      [
        { id: 'a', def: 'warrior', team: 'hero', x: 0, y: 0 },
        { id: 'ally', def: 'soldier', team: 'hero', x: 1, y: 0 },
      ],
      HIT_SEED,
    );
    const [lo, hi] = halfOnSoldier(ABILITIES.strike.damage);
    expect(previewAbility(flat(3, 1), s, 'a', 'strike', at(1)).targets).toMatchObject([
      { unit: 'ally', dmgMin: lo, dmgMax: hi },
    ]);
    const dmg = dealt(resolveAbility(flat(3, 1), s, 'a', 'strike', at(1)), 'ally')!;
    expect(dmg).toBeGreaterThanOrEqual(lo);
    expect(dmg).toBeLessThanOrEqual(hi);
  });

  it('a shot that stops on an ally in its path hits it at half, for either side', () => {
    for (const side of ['hero', 'enemy'] as const) {
      const other = side === 'hero' ? 'enemy' : 'hero';
      const s = stateOf(
        [
          { id: 'a', def: 'archer', team: side, x: 0, y: 0 },
          { id: 'ally', def: 'soldier', team: side, x: 2, y: 0 },
          { id: 'foe', def: 'soldier', team: other, x: 4, y: 0 },
        ],
        HIT_SEED,
      );
      const [lo, hi] = halfOnSoldier(ABILITIES.shot.damage);
      expect(previewAbility(flat(6, 1), s, 'a', 'shot', at(4)).targets, side).toMatchObject([
        { unit: 'ally', dmgMin: lo, dmgMax: hi },
      ]);
      const dmg = dealt(resolveAbility(flat(6, 1), s, 'a', 'shot', at(4)), 'ally')!;
      expect(dmg).toBeLessThanOrEqual(hi);
    }
  });

  it('an area hits the ally inside it at half and the enemy at full', () => {
    const s = stateOf([
      { id: 'a', def: 'mage', team: 'hero', x: 0, y: 0 },
      { id: 'ally', def: 'rogue', team: 'hero', x: 3, y: 0 },
      { id: 'foe', def: 'soldier', team: 'enemy', x: 4, y: 0 },
    ]);
    const [lo, hi] = ABILITIES.blast.damage;
    const p = previewAbility(flat(6, 1), s, 'a', 'blast', at(4));
    expect(p.targets.find((t) => t.unit === 'ally')).toMatchObject({
      dmgMin: half([lo, hi])[0],
      dmgMax: half([lo, hi])[1],
    });
    expect(p.targets.find((t) => t.unit === 'foe')).toMatchObject({ dmgMin: lo, dmgMax: hi });
  });

  it('a heal that lands on the other side heals half: aimed, and inside an area', () => {
    ABILITIES.test_mass_heal = { ...ABILITIES.heal, id: 'test_mass_heal', radius: 1 };
    UNIT_DEFS.test_healer = { ...UNIT_DEFS.mage, id: 'test_healer', abilities: ['heal', 'test_mass_heal'] };
    const s = stateOf([
      { id: 'a', def: 'test_healer', team: 'hero', x: 0, y: 0 },
      { id: 'ally', def: 'warrior', team: 'hero', x: 3, y: 0, hp: 10 },
      { id: 'foe', def: 'soldier', team: 'enemy', x: 4, y: 0, hp: 10 },
    ]);
    const [lo, hi] = ABILITIES.heal.heal;
    expect(previewAbility(flat(6, 1), s, 'a', 'heal', at(4)).targets).toMatchObject([
      { unit: 'foe', healMin: half([lo, hi])[0], healMax: half([lo, hi])[1] },
    ]);
    const p = previewAbility(flat(6, 1), s, 'a', 'test_mass_heal', at(4));
    expect(p.targets.find((t) => t.unit === 'ally')).toMatchObject({ healMin: lo, healMax: hi });
    expect(p.targets.find((t) => t.unit === 'foe')).toMatchObject({
      healMin: half([lo, hi])[0],
      healMax: half([lo, hi])[1],
    });
    resolveAbility(flat(6, 1), s, 'a', 'test_mass_heal', at(4));
    const foe = s.units.find((u) => u.id === 'foe')!;
    expect(foe.hp - 10).toBeGreaterThanOrEqual(half([lo, hi])[0]);
    expect(foe.hp - 10).toBeLessThanOrEqual(half([lo, hi])[1]);
  });

  it('healing the undead hurts by half the heal instead, whoever casts it', () => {
    const [lo, hi] = half(ABILITIES.heal.heal);
    // a hero heals an enemy skeleton, and the Acolyte "heals" its own minion
    for (const [caster, side, target, team] of [
      ['mage', 'hero', 'skeleton_archer', 'enemy'],
      ['acolyte', 'enemy', 'minion', 'enemy'],
    ] as const) {
      const s = stateOf([
        { id: 'a', def: caster, team: side, x: 0, y: 0 },
        { id: 'u', def: target, team, x: 2, y: 0, hp: 100 },
      ]);
      expect(previewAbility(flat(4, 1), s, 'a', 'heal', at(2)).targets, target).toMatchObject([
        { unit: 'u', chance: 100, dmgMin: lo, dmgMax: hi, healMin: 0, healMax: 0 },
      ]);
      const dmg = dealt(resolveAbility(flat(4, 1), s, 'a', 'heal', at(2)), 'u')!;
      expect(dmg).toBeGreaterThanOrEqual(lo);
      expect(dmg).toBeLessThanOrEqual(hi);
      expect(s.units.find((u) => u.id === 'u')!.hp).toBe(100 - dmg);
    }
  });

  it('a heal that hurts an undead can kill it, and the last enemy down wins', () => {
    const s = stateOf(
      [
        { id: 'a', def: 'mage', team: 'hero', x: 0, y: 0 },
        { id: 'b', def: 'beacon', team: 'hero', x: 3, y: 0 },
        { id: 'u', def: 'minion', team: 'enemy', x: 2, y: 0, hp: 30 },
      ],
      1,
    );
    const ev = resolveAbility(flat(4, 1), s, 'a', 'heal', at(2));
    // seed 1 rolls a heal of 79 (60 to 90): half, rounded down, is 39, past the minion's 30
    expect(ev).toEqual([
      { k: 'attack', unit: 'a', ability: 'heal', target: at(2) },
      { k: 'hit', unit: 'u', dmg: 39, chance: 100 },
      { k: 'die', unit: 'u' },
    ]);
    expect(s.units.map((u) => u.id)).toEqual(['a', 'b']);
    expect(s.outcome).toBe('victory');
  });

  it('the undead flag is data on the skeleton sheets and survives the half tiles and the battle sheets', () => {
    const undead = Object.values(UNIT_DEFS)
      .filter((d) => d.undead && !d.id.includes('½') && !d.id.startsWith('dev-'))
      .map((d) => d.id)
      .sort();
    expect(undead).toEqual(['colossus', 'minion', 'skeleton_archer']);
    expect(UNIT_DEFS[halfDef('minion')].undead).toBe(true);
    const sc = buildDevScenario({
      map: 'skirmish',
      heroes: [unitFrom('archer')],
      enemies: [unitFrom('skeleton_archer')],
    });
    const sheet = (team: string) =>
      UNIT_DEFS[sc.spawns.find((sp) => sp.team === team && sp.def.startsWith('dev'))!.def];
    expect(sheet('enemy').undead).toBe(true);
    expect(sheet('hero').undead).toBeUndefined();
  });
});
