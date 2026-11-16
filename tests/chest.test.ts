import { describe, expect, it } from 'vitest';
import {
  buy,
  CHEST_KEY,
  CHEST_MAX,
  EQUIP_KEY,
  equip,
  parseChest,
  parseEquip,
  sell,
  startingEquip,
} from '../src/client/chest.ts';
import { loadSlot, newGame } from '../src/client/saves.ts';

// a browser's storage, as saves.ts reads it
const browser = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    saved: (k: string) => m.get(k) ?? null,
  };
};
// as store.json: a missing or cleared ('') key is null
const read = (s: { getItem(k: string): string | null }, k: string): unknown => {
  try {
    return JSON.parse(s.getItem(k) || 'null');
  } catch {
    return null;
  }
};
// the 3 slots of the save before Nov 16
const OLD = {
  warrior: { weapon: 'iron_blade', armor: 'chain_mail', accessory: 'swift_boots' },
  archer: { accessory: 'quick_charm' },
};

// Group chest and equipment (Nov 13; 7 slots since Nov 16)
describe('chest and equipment', () => {
  it('the save only accepts whole gold and known items', () => {
    expect(parseChest({ gold: 120, items: ['iron_blade', 'nada', 3] })).toEqual({ gold: 120, items: ['iron_blade'] });
    expect(parseChest({ gold: -5 })).toEqual({ gold: 0, items: [] });
    // a new game has no chest saved: it starts with 0 gold (Fernando's gold grill, Nov 15)
    expect(parseChest(null)).toEqual({ gold: 0, items: [] });
  });

  it('a new game starts with 0 gold and the common weapon of each story member', () => {
    expect(startingEquip()).toEqual({
      warrior: { main: 'iron_blade' },
      archer: { main: 'hunter_bow' },
      mage: { main: 'ash_staff' },
      rogue: { main: 'iron_blade' },
    });
    const s = browser({ 'dt:party': '{"deployed":["mage"]}', [CHEST_KEY]: '{"gold":150}', [EQUIP_KEY]: '{}' });
    newGame(s, 1000);
    expect(parseChest(read(s, CHEST_KEY)).gold).toBe(0);
    expect(parseEquip(read(s, EQUIP_KEY))).toEqual(startingEquip());
    // once saved, an empty hand stays empty: the weapon does not come back
    expect(parseEquip({ warrior: {} })).toEqual({ warrior: {} });
  });

  it('a game already going without the equipment key, or with a broken one, gets no free weapons', () => {
    // a slot from before Nov 16 with a party and gold but no dt:equip, and one whose dt:equip is not JSON
    for (const equipRaw of [undefined, '{broken']) {
      const s = browser({
        'dt:saves': JSON.stringify({
          active: 2,
          slots: [
            {
              id: 1,
              data: {
                'dt:party': '{"deployed":["mage"]}',
                [CHEST_KEY]: '{"gold":80}',
                ...(equipRaw ? { [EQUIP_KEY]: equipRaw } : {}),
              },
            },
            { id: 2, data: {} },
          ],
        }),
      });
      expect(loadSlot(s, 1)).toBe(true);
      expect(parseEquip(read(s, EQUIP_KEY))).toEqual({});
    }
    expect(parseEquip(null)).toEqual({});
  });

  it('a "__proto__" member in the save is dropped, not made the prototype', () => {
    const eq = parseEquip(JSON.parse('{"__proto__":{"main":"iron_blade"},"mage":{"main":"ash_staff"}}'));
    expect(Object.getPrototypeOf(eq)).toBe(Object.prototype);
    expect(eq).toEqual({ mage: { main: 'ash_staff' } });
    expect(Object.keys(eq)).toEqual(['mage']);
  });

  it('the chest keeps CHEST_MAX pieces: buying or taking a piece off stops there, a swap still works', () => {
    const full = { gold: 999, items: Array<string>(CHEST_MAX).fill('hood') };
    expect(parseChest({ ...full, items: [...full.items, 'hood'] }).items).toHaveLength(CHEST_MAX);
    expect(buy(full, 'iron_blade')).toBeNull(); // the gold stays: the piece would be lost on the next load
    expect(buy({ ...full, items: full.items.slice(1) }, 'iron_blade')?.items).toHaveLength(CHEST_MAX);
    const eq = { warrior: { head: 'iron_helm' } };
    expect(equip(full, eq, 'warrior', 'head', null)).toBeNull();
    expect(equip(full, eq, 'warrior', 'head', 'hood')?.chest.items).toHaveLength(CHEST_MAX);
  });

  it('the old 3-slot save maps every piece to its kind, live or in a save slot', () => {
    const mapped = {
      warrior: { main: 'iron_blade', body: 'chain_mail', legs: 'swift_boots' },
      archer: { acc1: 'quick_charm' },
    };
    expect(parseEquip(OLD)).toEqual(mapped);
    // a slot saved before the change, loaded from the title's Continue
    const s = browser({
      'dt:saves': JSON.stringify({
        active: 2,
        slots: [
          { id: 1, data: { [EQUIP_KEY]: JSON.stringify(OLD) } },
          { id: 2, data: {} },
        ],
      }),
    });
    expect(loadSlot(s, 1)).toBe(true);
    expect(parseEquip(read(s, EQUIP_KEY))).toEqual(mapped);
  });

  it('a piece saved in a slot of another kind goes to its own; unknown pieces and junk drop', () => {
    expect(
      parseEquip({
        warrior: { main: 'chain_mail', head: 'iron_helm', acc2: 'buckler', off: 3, legs: 'nada' },
        x: 'lixo',
      }),
    ).toEqual({ warrior: { body: 'chain_mail', head: 'iron_helm', off: 'buckler' } });
    expect(parseEquip(5)).toEqual({});
  });

  it('buying takes the gold and only commons are sold; selling gives half back', () => {
    const c = buy({ gold: 150, items: [] }, 'iron_blade')!;
    expect(c).toEqual({ gold: 30, items: ['iron_blade'] });
    expect(buy(c, 'iron_blade')).toBeNull(); // no gold
    expect(buy({ gold: 9999, items: [] }, 'chain_mail')).toBeNull(); // a rare only drops
    expect(sell(c, 'iron_blade')).toEqual({ gold: 90, items: [] });
    expect(sell({ gold: 0, items: ['colossus_plate'] }, 'colossus_plate')).toEqual({ gold: 300, items: [] });
  });

  it('equipping swaps with the chest; unequipping returns it; an accessory fits either accessory slot', () => {
    let r = equip({ gold: 0, items: ['iron_blade', 'hunter_bow'] }, {}, 'archer', 'main', 'hunter_bow')!;
    expect(r.eq.archer.main).toBe('hunter_bow');
    r = equip(r.chest, r.eq, 'archer', 'main', 'iron_blade')!;
    expect(r.eq.archer.main).toBe('iron_blade');
    expect(r.chest.items).toEqual(['hunter_bow']);
    r = equip(r.chest, r.eq, 'archer', 'main', null)!;
    expect(r.eq.archer.main).toBeUndefined();
    expect(r.chest.items.sort()).toEqual(['hunter_bow', 'iron_blade']);
    expect(equip(r.chest, r.eq, 'archer', 'body', 'iron_blade')).toBeNull(); // wrong kind
    const rings = { gold: 0, items: ['ember_ring', 'ember_ring'] };
    r = equip(rings, {}, 'mage', 'acc1', 'ember_ring')!;
    r = equip(r.chest, r.eq, 'mage', 'acc2', 'ember_ring')!;
    expect(r.eq.mage).toEqual({ acc1: 'ember_ring', acc2: 'ember_ring' });
    expect(r.chest.items).toEqual([]);
    expect(equip(r.chest, r.eq, 'mage', 'head', 'ember_ring')).toBeNull(); // not in the chest any more
  });
});
