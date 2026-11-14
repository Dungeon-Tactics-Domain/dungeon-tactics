import { describe, expect, it } from 'vitest';
import { buy, equip, parseChest, parseEquip, sell } from '../src/client/chest.ts';

// Group chest and equipment (Nov 13)
describe('chest and equipment', () => {
  it('the save only accepts whole gold and known items in the right slot', () => {
    expect(parseChest({ gold: 120, items: ['iron_blade', 'nada', 3] })).toEqual({ gold: 120, items: ['iron_blade'] });
    expect(parseChest({ gold: -5 })).toEqual({ gold: 0, items: [] });
    expect(parseEquip({ warrior: { weapon: 'iron_blade', armor: 'iron_blade' }, x: 'lixo' })).toEqual({
      warrior: { weapon: 'iron_blade' },
    });
  });

  it('buying takes the gold, selling gives half back', () => {
    const c = buy({ gold: 150, items: [] }, 'iron_blade')!;
    expect(c).toEqual({ gold: 30, items: ['iron_blade'] });
    expect(buy(c, 'iron_blade')).toBeNull(); // no gold
    expect(sell(c, 'iron_blade')).toEqual({ gold: 90, items: [] });
  });

  it('equipping swaps with the chest; unequipping returns it', () => {
    let r = equip({ gold: 0, items: ['iron_blade', 'hunter_bow'] }, {}, 'archer', 'weapon', 'hunter_bow')!;
    expect(r.eq.archer.weapon).toBe('hunter_bow');
    r = equip(r.chest, r.eq, 'archer', 'weapon', 'iron_blade')!;
    expect(r.eq.archer.weapon).toBe('iron_blade');
    expect(r.chest.items).toEqual(['hunter_bow']);
    r = equip(r.chest, r.eq, 'archer', 'weapon', null)!;
    expect(r.eq.archer.weapon).toBeUndefined();
    expect(r.chest.items.sort()).toEqual(['hunter_bow', 'iron_blade']);
    expect(equip(r.chest, r.eq, 'archer', 'armor', 'iron_blade')).toBeNull(); // wrong slot
  });
});
