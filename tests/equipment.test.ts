import { describe, expect, it } from 'vitest';
import { buildDevScenario, type DevSetup, defaultSetup } from '../src/client/dev-roster.ts';
import { compareRows, itemStats, sheetRows } from '../src/client/sheet-lines.ts';
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

  it('mana and stamina pieces raise the pool max, and the regens add to the class own', () => {
    const mage = withGear(UNIT_DEFS.mage, { off: 'worn_grimoire', body: 'warded_robe', acc1: 'sleepstone' });
    expect(mage.vars).toEqual({ mana: 30 + 20 + 20 });
    expect(mage.regen).toEqual({ mana: 8 + 3 });
    expect(mage.hpRegen).toBe(10);
    expect(
      withGear(UNIT_DEFS.warrior, { body: 'colossus_plate', acc1: 'sleepstone', acc2: 'sleepstone' }).hpRegen,
    ).toBe(30);
    // a pool the class lacks opens with the piece (the lab: "+20 mana or stamina max"), regen only where a piece gives it
    const archer = withGear(UNIT_DEFS.mage, { off: 'leather_quiver' });
    expect(archer.vars).toEqual({ mana: 30, stamina: 20 });
    expect(archer.regen).toEqual({ mana: 8 });
    expect(withGear(UNIT_DEFS.warrior, { off: 'worn_grimoire' })).toMatchObject({
      vars: { stamina: 50, mana: 20 },
      regen: { stamina: 5, mana: 3 },
    });
    // a mana regen with no mana pool to fill gives nothing (it wrote an empty pool into the state every turn)
    const helm = withGear(UNIT_DEFS.warrior, { head: 'dawn_circlet' });
    expect([helm.vars, helm.regen]).toEqual([{ stamina: 50 }, { stamina: 5 }]);
    // the class sheet itself never changes
    expect([UNIT_DEFS.mage.vars, UNIT_DEFS.mage.regen, UNIT_DEFS.mage.hpRegen]).toEqual([
      { mana: 30 },
      { mana: 8 },
      undefined,
    ]);
  });

  it('a battle with a mana piece starts the pool full at its new max and regenerates the sum', () => {
    const s = defaultSetup('skirmish');
    const i = s.heroes.findIndex((h) => h.base === 'mage');
    s.heroes[i] = { ...s.heroes[i], items: { off: 'worn_grimoire', acc1: 'sleepstone' } };
    const b = Battle.start(buildDevScenario(s), 1);
    const me = b.state.units.find((u) => u.id === `h${i}`)!;
    expect(me.vars).toEqual({ mana: 50 });
    expect(UNIT_DEFS[me.def]).toMatchObject({ regen: { mana: 11 }, hpRegen: 10 });
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

  it('the Sheet shows each total the battle counts and where it comes from, and says when a cap took part', () => {
    // "total (origin)" per row label, to read the three columns in one string
    const rowsOf = (cls: string, load: Loadout) =>
      Object.fromEntries(sheetRows(cls, load).map(([k, v, from]) => [k, from ? `${v} (${from})` : v]));
    const rows = rowsOf('warrior', { main: 'iron_blade', head: 'iron_helm' });
    expect(rows.Vida).toBe('235 (Guerreiro 210 · Elmo de ferro +25)');
    expect(rows['Poder físico']).toBe('20 (Guerreiro 0 · Lâmina de ferro +20)');
    expect(rows['Resistência física']).toBe('+20% (Guerreiro +10% · Elmo de ferro +10%)');
    expect(rows.Esquiva).toBe('5%');
    expect(rows['Resistência a fogo']).toBeUndefined(); // an element only when something gives it
    const wall = { off: 'veil_shield', head: 'iron_helm', body: 'chain_mail', legs: 'padded_trousers' };
    const capped = rowsOf('warrior', wall);
    expect(capped['Resistência física']).toBe(
      '+60% (Guerreiro +10% · Escudo do Véu +30% · Elmo de ferro +10% · Cota de malha +20% · Calças acolchoadas +10% · no limite (bruto +80%; carregando, +30%))',
    );
    // charging takes nothing off an element, so past its cap only the raw sum is said
    const fire = rowsOf('mage', { main: 'ember_scepter', acc1: 'ember_ring', acc2: 'ember_ring' })[
      'Resistência a fogo'
    ];
    expect(fire).toMatch(/^\+60% .* · no limite \(bruto \+\d+%\)\)$/);
    expect(capped['Resistência a sombra']).toBe('+40% (Guerreiro 0% · Escudo do Véu +40%)');
    expect(capped.Velocidade).toBe('7 (Guerreiro 8 · Escudo do Véu −1)');
    const mage = rowsOf('mage', { off: 'worn_grimoire', acc1: 'sleepstone' });
    expect(mage.Mana).toBe('50 (Mago 30 · Grimório gasto +20)');
    expect(mage['Regeneração de mana']).toBe('11 (Mago 8 · Grimório gasto +3)');
    expect(mage['Regeneração de vida']).toBe('10 (Mago 0 · Pedra-do-sono +10)');
    // a pool or regen only when the class or a piece gives it
    expect(rows.Mana).toBeUndefined();
    expect(rows['Regeneração de vida']).toBeUndefined();
    expect(rowsOf('warrior', {}).Stamina).toBe('50');
    // the Party screen's bar: full at the rule's cap, else against the best party class with nothing on, never past full
    const bar = (cls: string, load: Loadout) => Object.fromEntries(sheetRows(cls, load).map(([k, , , s]) => [k, s]));
    expect(bar('warrior', wall)['Resistência física']).toBe(1);
    expect(bar('warrior', {})['Resistência física']).toBeCloseTo(10 / 60);
    expect(bar('mage', {})['Resistência física']).toBe(0); // −10%
    expect(bar('warrior', {}).Vida).toBe(1); // the sturdiest class
    expect(bar('warrior', { head: 'iron_helm' }).Vida).toBe(1);
    expect(bar('mage', {}).Vida).toBeCloseTo(120 / 210);
  });

  it('comparing reads the sheet as the rules do: past a cap only what is left changes, but charging it counts', () => {
    const wall = { off: 'veil_shield', head: 'iron_helm', body: 'chain_mail', legs: 'padded_trousers' };
    // "label now → after ▲/▼" per row, to read the four columns in one string
    const cmp = (...a: Parameters<typeof compareRows>) =>
      compareRows(...a).map(([k, now, after, up]) => `${k} ${now} → ${after} ${up ? '▲' : '▼'}`);
    // 80% physical becomes 70: both read 60, but a charging unit loses 50 from the raw sum, 30 then 20
    expect(cmp('warrior', wall, 'head', null)).toEqual([
      'Vida 310 → 285 ▼',
      'Resistência física carregando +30% → +20% ▼',
    ]);
    expect(cmp('warrior', wall, 'head', 'hood')).toEqual([
      'Vida 310 → 285 ▼',
      'Acerto 0 → 5 ▲',
      'Esquiva 5% → 10% ▲',
      'Resistência física carregando +30% → +20% ▼',
    ]);
    // under the cap the charging change equals the plain one, so it is said once
    expect(cmp('warrior', { head: 'iron_helm' }, 'head', null)).toEqual([
      'Vida 235 → 210 ▼',
      'Resistência física +20% → +10% ▼',
    ]);
    expect(cmp('warrior', wall, 'head', 'iron_helm')).toEqual([]);
    expect(cmp('mage', {}, 'off', 'worn_grimoire')).toEqual(['Mana 30 → 50 ▲', 'Regeneração de mana 8 → 11 ▲']);
    expect(cmp('warrior', {}, 'acc1', 'sleepstone')).toEqual(['Vida 210 → 235 ▲', 'Regeneração de vida 0 → 10 ▲']);
    expect(itemStats(ITEMS.ember_scepter)).toBe('+40 poder mágico · +40% fogo · −20% gelo · +3 regeneração de mana');
  });

  it('every piece has a price, and only commons are cheap enough for the shop', () => {
    for (const it of Object.values(ITEMS)) {
      expect(it.price).toBeGreaterThan(0);
      if (it.rarity === 'common') expect(it.price).toBeGreaterThanOrEqual(100);
      if (it.rarity === 'common') expect(it.price).toBeLessThanOrEqual(150);
    }
  });
});
