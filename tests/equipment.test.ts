import { describe, expect, it } from 'vitest';
import { buildDevScenario, defaultSetup } from '../src/client/dev-roster.ts';
import { ABILITIES } from '../src/shared/battle/abilities.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { bonusOf, ITEMS } from '../src/shared/battle/equipment.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';

// Equipment (Nov 13): general stats added to the battle sheet
describe('equipamento', () => {
  it('sums the items in each slot and ignores unknown items or items in the wrong slot', () => {
    expect(bonusOf({ weapon: 'iron_blade', armor: 'chain_mail', accessory: 'swift_boots' })).toEqual({
      hp: 12,
      power: 2,
      hit: 0,
      move: 1,
      jump: 0,
      speed: -1,
    });
    expect(bonusOf({ weapon: 'chain_mail', armor: 'nada' })).toEqual({
      hp: 0,
      power: 0,
      hit: 0,
      move: 0,
      jump: 0,
      speed: 0,
    });
    expect(Object.values(ITEMS).every((i) => i.price > 0)).toBe(true);
  });

  it('the battle sheet carries the equipment: extra health, movement and damage in the preview', () => {
    const s = defaultSetup('skirmish');
    s.heroes[0] = { ...s.heroes[0], items: { weapon: 'iron_blade', armor: 'leather_vest', accessory: 'swift_boots' } };
    const sc = buildDevScenario(s);
    const id = sc.spawns.find((sp) => sp.id === 'h0')!.def;
    const base = UNIT_DEFS[s.heroes[0].base];
    expect(UNIT_DEFS[id].hp).toBe(s.heroes[0].hp + 6);
    expect(UNIT_DEFS[id].move).toBe(s.heroes[0].move + 1);
    expect(UNIT_DEFS[id].power).toBe(2);
    const b = Battle.start(sc, 1);
    const me = b.state.units.find((u) => u.def === id)!;
    const ability = base.abilities.find((a) => ABILITIES[a].damage[1] > 0)!;
    const foe = b.state.units.find((u) => u.team === 'enemy')!;
    b.state.turn.actor = me.id;
    me.pos = { x: foe.pos.x, y: foe.pos.y + 1 };
    const p = b.preview(ability, foe.pos);
    expect(p.ok).toBe(true);
    expect(p.targets[0].dmgMin).toBe(ABILITIES[ability].damage[0] + 2);
  });
});
