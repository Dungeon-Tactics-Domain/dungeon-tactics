import { describe, expect, it } from 'vitest';
import { buildDevScenario, unitFrom } from '../src/client/dev-roster.ts';
import { halfDef } from '../src/shared/battle/half.ts';
import { DODGE_MAX, dodgeOf, ELEMENTS, RESIST_RANGE, resistOf, UNIT_DEFS } from '../src/shared/battle/units.ts';

// The Nov 15 grill's attributes (resistances, dodge, power), from the Mechanics lab's equipamento.json
describe('unit attributes', () => {
  it('resistances stay within −100 and 60, dodge within 0 and 50', () => {
    const d = { ...UNIT_DEFS.warrior, resist: { phys: 90, mag: -150, fire: 30 }, dodge: 80 };
    expect(resistOf(d, 'phys')).toBe(60);
    expect(resistOf(d, 'mag')).toBe(-100);
    expect(resistOf(d, 'fire')).toBe(30);
    expect(resistOf(d, 'ice')).toBe(0); // unset is 0
    expect(dodgeOf(d)).toBe(50);
    expect(dodgeOf({ ...d, dodge: -5 })).toBe(0);
    expect(dodgeOf(UNIT_DEFS.archer)).toBe(10);
  });

  it('every class and enemy is written within the limits, so nothing is cut silently', () => {
    for (const d of Object.values(UNIT_DEFS)) {
      for (const k of ['phys', 'mag', ...ELEMENTS] as const) {
        const v = d.resist?.[k] ?? 0;
        expect(v, `${d.id} ${k}`).toBeGreaterThanOrEqual(RESIST_RANGE[0]);
        expect(v, `${d.id} ${k}`).toBeLessThanOrEqual(RESIST_RANGE[1]);
      }
      expect(d.dodge ?? 0, d.id).toBeLessThanOrEqual(DODGE_MAX);
    }
  });

  it('the battle sheets and the half-tile tokens keep the class attributes', () => {
    const sc = buildDevScenario({ map: 'skirmish', heroes: [unitFrom('rogue')], enemies: [unitFrom('dark_mage')] });
    const [hero, foe] = sc.spawns.filter((s) => s.def.startsWith('dev-')).map((s) => s.def);
    expect(UNIT_DEFS[hero].dodge).toBe(20);
    expect(UNIT_DEFS[foe].resist).toEqual(UNIT_DEFS.dark_mage.resist);
    expect(UNIT_DEFS[halfDef(foe)].resist).toEqual(UNIT_DEFS.dark_mage.resist);
  });
});
