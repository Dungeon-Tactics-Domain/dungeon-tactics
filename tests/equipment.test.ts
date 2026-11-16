import { describe, expect, it } from 'vitest';
import { buildDevScenario, type DevSetup, defaultSetup } from '../src/client/dev-roster.ts';
import { ABILITIES } from '../src/shared/battle/abilities.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { bonusOf, ITEMS, type Loadout, withGear } from '../src/shared/battle/equipment.ts';
import { resistOf, UNIT_DEFS } from '../src/shared/battle/units.ts';

// Equipment (Nov 13; 7 slots since Nov 16, slice 3 of the Nov 15 grill): general stats added to the battle sheet
describe('equipment', () => {
  it('sums the piece in each of the 7 slots, resistances by kind', () => {
    const b = bonusOf({
      main: 'iron_blade',
      off: 'buckler',
      head: 'iron_helm',
      body: 'chain_mail',
      legs: 'swift_boots',
      acc1: 'ember_ring',
      acc2: 'quick_charm',
    });
    expect(b).toMatchObject({ hp: 75, physPower: 20, magPower: 10, hit: 5, dodge: 15, move: 1, jump: 0, speed: 1 });
    expect(b.resist).toEqual({ phys: 40, fire: 20 });
  });

  it('two accessories add up, and an unknown piece or one of another kind does not count', () => {
    expect(bonusOf({ acc1: 'ember_ring', acc2: 'ember_ring' })).toMatchObject({ magPower: 20, resist: { fire: 40 } });
    const none = bonusOf({ main: 'chain_mail', off: 'nada', acc2: 'buckler', legs: 'quick_charm' } as Loadout);
    expect(Object.values({ ...none, resist: 0 }).every((v) => v === 0)).toBe(true);
    expect(none.resist).toEqual({});
  });

  it('a bare sheet is the class own; pieces add on top and the cap stays on read', () => {
    expect(withGear(UNIT_DEFS.warrior, {})).toEqual(UNIT_DEFS.warrior);
    const d = withGear(UNIT_DEFS.rogue, {
      off: 'buckler',
      legs: 'swift_boots',
      acc1: 'quick_charm',
      acc2: 'quick_charm',
    });
    expect(d.dodge).toBe(20 + 5 + 5 + 5 + 5); // the raw sum: dodgeOf caps it at 50 where the battle reads it
    expect(d.speed).toBe(UNIT_DEFS.rogue.speed + 2);
    expect(d.move).toBe(UNIT_DEFS.rogue.move + 1);
    expect(d.resist).toEqual({ phys: 10 });
    // an epic's negative stat takes from the sheet (the Colossus plate's -1 move)
    expect(withGear(UNIT_DEFS.mage, { body: 'colossus_plate' }).move).toBe(UNIT_DEFS.mage.move - 1);
  });

  it('the battle sheet carries the equipment: life, move, power, resistance and dodge in the preview', () => {
    const s = defaultSetup('skirmish');
    s.heroes[0] = { ...s.heroes[0], items: { main: 'iron_blade', body: 'leather_vest', legs: 'swift_boots' } };
    const sc = buildDevScenario(s);
    const id = sc.spawns.find((sp) => sp.id === 'h0')!.def;
    expect(UNIT_DEFS[id].hp).toBe(s.heroes[0].hp + 25);
    expect(UNIT_DEFS[id].move).toBe(s.heroes[0].move + 1);
    expect(UNIT_DEFS[id].physPower).toBe(20);
    expect(UNIT_DEFS[id].dodge).toBe((UNIT_DEFS[s.heroes[0].base].dodge ?? 0) + 5 + 5);

    // the same strike on the same foe, bare and then with a buckler and an iron helm: less damage, lower chance
    const strike = (foeItems?: Loadout) => {
      const setup: DevSetup = { ...s, enemies: s.enemies.map((e, i) => (i ? e : { ...e, items: foeItems })) };
      const b = Battle.start(buildDevScenario(setup), 1);
      const me = b.state.units.find((u) => u.id === 'h0')!;
      const foe = b.state.units.find((u) => u.id === 'e0')!;
      b.state.turn.actor = me.id;
      me.pos = { x: foe.pos.x, y: foe.pos.y + 1 };
      const ability = UNIT_DEFS[s.heroes[0].base].abilities.find((a) => ABILITIES[a].damage[1] > 0)!;
      const p = b.preview(ability, foe.pos);
      expect(p.ok).toBe(true);
      return { t: p.targets[0], foe: UNIT_DEFS[foe.def], ability };
    };
    const bare = strike();
    const armed = strike({ off: 'buckler', head: 'iron_helm' });
    expect(resistOf(armed.foe, 'phys')).toBe(resistOf(bare.foe, 'phys') + 20);
    // the blade's physical power on a martial ability, then the foe's physical resistance
    const dmg = (resist: number) => Math.floor(((ABILITIES[bare.ability].damage[0] + 20) * (100 - resist)) / 100);
    expect(bare.t.dmgMin).toBe(dmg(resistOf(bare.foe, 'phys')));
    expect(armed.t.dmgMin).toBe(dmg(resistOf(armed.foe, 'phys')));
    expect(armed.t.dmgMin).toBeLessThan(bare.t.dmgMin);
    expect(armed.t.chance).toBeLessThan(bare.t.chance); // the buckler's 5% dodge
  });

  it('every piece has a price, and only commons are cheap enough for the shop', () => {
    for (const it of Object.values(ITEMS)) {
      expect(it.price).toBeGreaterThan(0);
      if (it.rarity === 'common') expect(it.price).toBeGreaterThanOrEqual(100);
      if (it.rarity === 'common') expect(it.price).toBeLessThanOrEqual(150);
    }
  });
});
