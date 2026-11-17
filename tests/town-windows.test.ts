import { describe, expect, it } from 'vitest';
import { fitLine, fitSlot, ownedOf, ownedText } from '../src/client/town-shop.ts';
import { shortBy, sideWindows } from '../src/client/town-ui.ts';
import { ITEMS } from '../src/shared/battle/equipment.ts';

describe('town windows', () => {
  it('the menu closes every window beside it, never itself', () => {
    const menu = { id: 'menu' };
    const shop = { id: 'shop' };
    const sheet = { id: 'sheet' };
    expect(sideWindows([menu, shop, sheet], menu)).toEqual([shop, sheet]);
    expect(sideWindows([menu], menu)).toEqual([]);
  });

  it("the Shop row says how much gold is missing under a turned-off button, and nothing when it's enough", () => {
    expect(shortBy(20, 120)).toBe('faltam 100 de ouro');
    expect(shortBy(120, 120)).toBe('');
    expect(shortBy(200, 120)).toBe('');
  });

  it('a new piece goes to the first empty slot of its kind, else the first', () => {
    expect(fitSlot({}, 'head')).toBe('head');
    expect(fitSlot({ acc1: 'ember_ring' }, 'accessory')).toBe('acc2');
    expect(fitSlot({ acc1: 'ember_ring', acc2: 'sleepstone' }, 'accessory')).toBe('acc1');
  });

  it("the Shop's box says what a piece changes on a member and what it replaces", () => {
    expect(fitLine('warrior', {}, ITEMS.hood)).toBe('+5 acerto · +5% esquiva');
    const swap = fitLine('warrior', { head: 'iron_helm' }, ITEMS.hood);
    expect(swap).toContain('−25 vida');
    expect(swap).toContain('(no lugar de Elmo de ferro)');
    expect(fitLine('warrior', { head: 'hood' }, ITEMS.hood)).toBe('já usa');
  });

  it('counts a piece loose in the chest and worn by the party', () => {
    const owned = ownedOf({ gold: 0, items: ['hood', 'hood', 'buckler'] }, { a: { head: 'hood' }, b: {} }, 'hood');
    expect(owned).toEqual([2, 1]);
    expect(ownedText(owned)).toBe('3 (2 no baú, 1 em uso)');
    expect(ownedText([0, 0])).toBe('nenhuma');
  });
});
