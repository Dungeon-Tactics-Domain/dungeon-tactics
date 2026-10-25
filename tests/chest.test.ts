import { describe, expect, it } from 'vitest';
import { buy, equip, parseChest, parseEquip, sell } from '../src/client/chest.ts';

// Baú do grupo e equipamento (13/11)
describe('baú e equipamento', () => {
  it('o save só aceita ouro inteiro e itens conhecidos no espaço certo', () => {
    expect(parseChest({ gold: 120, items: ['iron_blade', 'nada', 3] })).toEqual({ gold: 120, items: ['iron_blade'] });
    expect(parseChest({ gold: -5 })).toEqual({ gold: 0, items: [] });
    expect(parseEquip({ warrior: { weapon: 'iron_blade', armor: 'iron_blade' }, x: 'lixo' })).toEqual({ warrior: { weapon: 'iron_blade' } });
  });

  it('comprar tira o ouro, vender devolve metade', () => {
    const c = buy({ gold: 150, items: [] }, 'iron_blade')!;
    expect(c).toEqual({ gold: 30, items: ['iron_blade'] });
    expect(buy(c, 'iron_blade')).toBeNull(); // sem ouro
    expect(sell(c, 'iron_blade')).toEqual({ gold: 90, items: [] });
  });

  it('equipar troca com o baú; tirar devolve', () => {
    let r = equip({ gold: 0, items: ['iron_blade', 'hunter_bow'] }, {}, 'archer', 'weapon', 'hunter_bow')!;
    expect(r.eq.archer.weapon).toBe('hunter_bow');
    r = equip(r.chest, r.eq, 'archer', 'weapon', 'iron_blade')!;
    expect(r.eq.archer.weapon).toBe('iron_blade');
    expect(r.chest.items).toEqual(['hunter_bow']);
    r = equip(r.chest, r.eq, 'archer', 'weapon', null)!;
    expect(r.eq.archer.weapon).toBeUndefined();
    expect(r.chest.items.sort()).toEqual(['hunter_bow', 'iron_blade']);
    expect(equip(r.chest, r.eq, 'archer', 'armor', 'iron_blade')).toBeNull(); // espaço errado
  });
});
