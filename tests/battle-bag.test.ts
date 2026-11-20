import { describe, expect, it } from 'vitest';
import { START_BAG } from '../src/content/items.ts';
import { itemEffect, itemOptions, parseBag } from '../src/shared/battle/bag.ts';
import { Battle, parseBattleState } from '../src/shared/battle/battle.ts';
import { halve } from '../src/shared/battle/half.ts';
import { initialState, SCENARIOS } from '../src/shared/battle/scenarios.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';
import {
  chestItem,
  expeditionMap,
  openChest,
  parseExpedition,
  startExpedition,
  winRoom,
} from '../src/shared/crawl/expedition.ts';
import { flat, stateOf } from './battle-helpers.ts';

const g = flat(12, 5);
const party = () => {
  const s = stateOf([
    { id: 'm', def: 'mage', team: 'hero', x: 0, y: 2 },
    { id: 'w', def: 'warrior', team: 'hero', x: 3, y: 2 },
    { id: 'far', def: 'warrior', team: 'hero', x: 11, y: 0 },
    { id: 'e', def: 'soldier', team: 'enemy', x: 11, y: 4 },
  ]);
  s.bag = { life_potion: 2, ether: 1 };
  s.units[1].hp = 10;
  s.units[0].vars = { mana: 0 };
  return s;
};

describe('items in battle (bag.ts, Nov 19)', () => {
  it('a potion heals an ally up to 3 tiles away, capped at its max, and spends the action and one potion', () => {
    const s = party();
    const b = new Battle(g, s);
    const ev = b.useItem('life_potion', { x: 3, y: 2 });
    expect(ev.map((e) => e.k)).toEqual(['item', 'heal']);
    expect(b.state.units[1].hp).toBe(Math.min(UNIT_DEFS.warrior.hp, 110));
    expect(b.state.bag).toEqual({ life_potion: 1, ether: 1 });
    expect(b.state.turn.bonus).toBe('life_potion');
    expect(b.useItem('ether', { x: 0, y: 2 }).length).toBe(2); // a second item takes the main action
    expect(b.useItem('life_potion', { x: 3, y: 2 })).toEqual([]); // both are spent
  });

  it('an ether gives mana back to the user; the last one leaves the bag', () => {
    const b = new Battle(g, party());
    expect(b.useItem('ether', { x: 0, y: 2 }).map((e) => e.k)).toEqual(['item', 'mana']);
    expect(b.state.units[0].vars?.mana).toBe(Math.min(30, UNIT_DEFS.mage.vars!.mana));
    expect(b.state.bag).toEqual({ life_potion: 2 });
  });

  it('no item on an enemy, out of reach, or with none left', () => {
    const s = party();
    expect(itemEffect(g, s, 'm', 'life_potion', { x: 11, y: 4 })).toBeNull();
    expect(itemEffect(g, s, 'm', 'life_potion', { x: 11, y: 0 })).toBeNull();
    expect(itemEffect(g, s, 'm', 'fire_oil', { x: 3, y: 2 })).toBeNull();
    expect(itemEffect(g, s, 'm', 'life_potion', { x: 4, y: 2 })).toBeNull(); // empty ground
  });

  it('undo gives the item and the life back', () => {
    const b = new Battle(g, party());
    b.useItem('life_potion', { x: 3, y: 2 });
    expect(b.undo()).toBe(true);
    expect(b.state.bag).toEqual({ life_potion: 2, ether: 1 });
    expect(b.state.units[1].hp).toBe(10);
    expect(b.undosLeft).toBe(3); // no die, so it costs no undo
  });

  it('itemOptions lists the user first, then allies it can reach by walking first', () => {
    const o = itemOptions(g, party(), 'm');
    expect(o.map((x) => [x.item, x.count])).toEqual([
      ['life_potion', 2],
      ['ether', 1],
    ]);
    const potion = o[0];
    expect(potion.targets.map((t) => t.unit)).toEqual(['m', 'w']);
    // 'far' is 11 tiles off: the mage's walk plus 3 is not enough
    expect(potion.targets.find((t) => t.unit === 'w')!.spots[0]).toMatchObject({ cost: 0, effect: { heal: 100 } });
  });

  it('itemOptions turns off once both actions are used', () => {
    const s = party();
    s.turn.main = 'fire';
    s.turn.bonus = 'ether';
    expect(itemOptions(g, s, 'm').every((x) => !x.enabled && x.reason === 'used')).toBe(true);
  });

  it('on the split map the reach is 3 whole tiles between the two squares', () => {
    const sc = halve({
      id: 'bag_half',
      name: 't',
      en: 't',
      grid: flat(10, 3),
      spawns: [
        { id: 'a', def: 'warrior', team: 'hero', x: 0, y: 1 },
        { id: 'b', def: 'warrior', team: 'hero', x: 3, y: 1 },
        { id: 'c', def: 'warrior', team: 'hero', x: 4, y: 1 },
        { id: 'e', def: 'soldier', team: 'enemy', x: 9, y: 1 },
      ],
    });
    const s = initialState(sc, 1);
    s.turn = { actor: 'a', moved: false, main: null, bonus: null };
    s.bag = { life_potion: 1 };
    const at = (id: string) => s.units.find((u) => u.id === id)!.pos;
    expect(itemEffect(sc.grid, s, 'a', 'life_potion', at('b'))).not.toBeNull(); // 3 whole tiles apart
    expect(itemEffect(sc.grid, s, 'a', 'life_potion', at('c'))).toBeNull(); // 4
  });

  it('parseBag and the battle save keep only known items with whole counts', () => {
    expect(parseBag(undefined)).toEqual({});
    expect(parseBag({ life_potion: 2, ether: 0 })).toEqual({ life_potion: 2 });
    expect(parseBag({ sword: 1 })).toBeNull();
    expect(parseBag({ ether: 1.5 })).toBeNull();
    expect(parseBag({ ether: 100 })).toBeNull();
    expect(parseBag([1])).toBeNull();
    const raw = JSON.parse(Battle.start(SCENARIOS.skirmish, 1).save()).state;
    expect(parseBattleState({ ...raw, bag: { ether: 2 } })?.bag).toEqual({ ether: 2 });
    expect(parseBattleState({ ...raw, bag: { evil: 1 } })).toBeNull();
    expect(parseBattleState({ ...raw, turn: { ...raw.turn, bonus: 'ether' } })?.turn.bonus).toBe('ether');
    expect(parseBattleState({ ...raw, turn: { ...raw.turn, bonus: 'evil' } })).toBeNull();
  });
});

describe('the expedition bag (Nov 19)', () => {
  const exp = () => startExpedition(7, [{ id: 'h', max: 100 }]);

  it('starts with the fixed bag and a chest adds its own item', () => {
    expect(exp().bag).toEqual(START_BAG);
    const map = expeditionMap(7);
    const first = map.findIndex((n) => n.floor === 1 && n.row === 0 && !n.chest && n.next.some((k) => map[k].chest));
    const chest = map[first].next.find((k) => map[k].chest)!;
    const won = winRoom(exp(), first, { h: 50 });
    const opened = openChest(won, chest);
    const item = chestItem(map[chest]);
    expect(opened.bag?.[item]).toBe((START_BAG[item] ?? 0) + 1);
    expect(chestItem(map[chest])).toBe(item); // the same seed, the same item
  });

  it('a won room carries the battle bag; a save without bag reads as empty, a bad one is dropped', () => {
    const map = expeditionMap(7);
    const first = map.findIndex((n) => n.floor === 1 && n.row === 0 && !n.chest);
    expect(winRoom(exp(), first, { h: 50 }, {}, { ether: 1 }).bag).toEqual({ ether: 1 });
    const { bag: _bag, ...old } = exp();
    expect(parseExpedition(JSON.parse(JSON.stringify(old)))?.bag).toEqual({});
    expect(parseExpedition({ ...exp(), bag: { gold: 3 } })).toBeNull();
  });
});
