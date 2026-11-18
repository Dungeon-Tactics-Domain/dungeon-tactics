import { afterEach, describe, expect, it } from 'vitest';
import { parseChest, parseEquip } from '../src/client/chest.ts';
import { parseSetup } from '../src/client/dev-roster.ts';
import { DEPLOY_MAX, GROUP_MAX, parseGroup } from '../src/client/group.ts';
import { pickLang } from '../src/client/i18n.ts';
import { parseManifest, summary } from '../src/client/saves.ts';
import { parseButtons } from '../src/client/screen-buttons.ts';
import { parseSound } from '../src/client/sound.ts';
import { migrate, store } from '../src/client/store.ts';
import { parseBest } from '../src/client/survival.ts';
import { parseTownGrid } from '../src/client/town-map.ts';
import { STORY } from '../src/content/party.ts';
import { ITEMS } from '../src/shared/battle/equipment.ts';
import { expeditionMap, openNodes, parseExpedition, startExpedition } from '../src/shared/crawl/expedition.ts';

// Security review of every parse* behind a dt:* key: each one is the only gate between what the browser kept (edited by
// hand, by an extension or half written) and the game. They must never throw and must hand back a value the game can use.

// one table of hostile values for every parser; a cycle and NaN are not reachable through JSON.parse, they are here for
// robustness only (store.json always goes through JSON.parse)
const cyclic: Record<string, unknown> = { members: [], slots: [], party: [] };
cyclic.self = cyclic;
(cyclic.members as unknown[]).push(cyclic);
const sparse: unknown[] = [];
sparse[5] = { id: 'r1', name: 'Ana', cls: 'warrior' };
const HOSTILE: [string, unknown][] = [
  ['undefined', undefined],
  ['null', null],
  ['true', true],
  ['zero', 0],
  ['negative', -1],
  ['NaN', Number.NaN],
  ['Infinity', Number.POSITIVE_INFINITY],
  ['1e308', 1e308],
  ['empty text', ''],
  ['1 MB text', 'x'.repeat(1_000_000)],
  ['empty array', []],
  ['array of null', [null, null]],
  ['sparse array', sparse],
  ['empty object', {}],
  ['__proto__ key', JSON.parse('{"__proto__":{"polluted":1,"gold":5,"members":[1]}}')],
  ['constructor key', JSON.parse('{"constructor":{"prototype":{"polluted":1}}}')],
  [
    'every field a string',
    { gold: '5', items: 'sword', members: 'x', deployed: 'x', slots: 'x', path: 'x', party: 'x' },
  ],
  ['cycle', cyclic],
];

const PARSERS: [string, (raw: unknown) => unknown][] = [
  ['parseGroup', parseGroup],
  ['parseChest', parseChest],
  ['parseEquip', parseEquip],
  ['parseManifest', parseManifest],
  ['parseExpedition', parseExpedition],
  ['parseSetup', parseSetup],
  ['parseSound', parseSound],
  ['parseBest', parseBest],
  ['parseTownGrid', parseTownGrid],
  ['parseButtons', parseButtons],
];

describe('every parse* survives the hostile table', () => {
  afterEach(() => expect(({} as Record<string, unknown>).polluted).toBeUndefined());
  for (const [name, parse] of PARSERS)
    it.each(HOSTILE)(`${name}: %s`, (_, raw) => {
      expect(() => parse(raw)).not.toThrow();
    });
});

describe('dt:party (parseGroup)', () => {
  const valid = (g: ReturnType<typeof parseGroup>) => {
    expect(g.members.length).toBeGreaterThanOrEqual(STORY.length);
    expect(g.members.length).toBeLessThanOrEqual(GROUP_MAX);
    expect(g.deployed.length).toBeGreaterThanOrEqual(1);
    expect(g.deployed.length).toBeLessThanOrEqual(DEPLOY_MAX);
    for (const d of g.deployed) expect(g.members.some((m) => m.id === d)).toBe(true);
    expect(new Set(g.members.map((m) => m.id)).size).toBe(g.members.length);
  };

  it.each(HOSTILE)('%s gives a usable party', (_, raw) => valid(parseGroup(raw)));

  it('drops recruits with a bad id, class or name, repeated ids and anything past the cap', () => {
    const members = [
      { id: '__proto__', name: 'Ana', cls: 'warrior' },
      { id: 'r1', name: 'x'.repeat(17), cls: 'warrior' },
      { id: 'r2', name: '   ', cls: 'warrior' },
      { id: 'r3', name: 'Ana', cls: 'dragon' },
      { id: 'r4', name: 'Ana', cls: 'constructor' },
      { id: 'r5', name: 5, cls: 'mage' },
      ...Array.from({ length: 20 }, (_, i) => ({ id: `r${10 + i}`, name: `N${i}`, cls: 'mage' })),
      { id: 'r10', name: 'Dup', cls: 'mage' },
    ];
    const g = parseGroup({ members, deployed: ['r10', 'r10', 'ghost', '__proto__', 'r11', 'r12', 'r13', 'r14'] });
    valid(g);
    expect(g.members.map((m) => m.id)).toEqual([...STORY.map((s) => s.id), 'r10', 'r11', 'r12', 'r13']);
    expect(g.deployed).toEqual(['r10', 'r11', 'r12', 'r13']);
  });

  it('a story member can never be removed or renamed by the save', () => {
    const g = parseGroup({ members: [{ id: STORY[0].id, name: 'Hacker', cls: 'mage', recruit: true }] });
    expect(g.members[0]).toEqual({ ...STORY[0], cls: 'mage' });
  });

  it('a name with markup is kept as plain text (safe only because the DOM pieces append text nodes)', () => {
    const name = '<svg onload=a()>';
    expect(name.length).toBeLessThanOrEqual(16);
    const g = parseGroup({ members: [{ id: 'r1', name, cls: 'mage' }] });
    expect(g.members.at(-1)?.name).toBe(name);
  });
});

describe('dt:chest and dt:equip (parseChest, parseEquip)', () => {
  it('gold must be a whole number from 0 to 999 999; items only known ids, at most 99', () => {
    for (const gold of [-1, 1.5, 1_000_000, Number.NaN, '100', null]) expect(parseChest({ gold }).gold).toBe(0);
    expect(parseChest({ gold: 999_999 }).gold).toBe(999_999);
    const known = Object.keys(ITEMS)[0];
    const items = ['__proto__', 'constructor', 'toString', 'ghost', 5, null, ...Array(200).fill(known)];
    expect(parseChest({ items }).items).toEqual(Array(99).fill(known));
  });

  // a known item in a slot of another kind is not lost: it moves to a free slot of its own kind (the Nov 16 migration)
  it('a slot keeps only an item of its kind; prototype names are not items', () => {
    const [id, item] = Object.entries(ITEMS).find(([, i]) => i.kind === 'head')!;
    const wrong = Object.values(ITEMS).find((i) => i.kind !== item.kind);
    const eq = parseEquip({
      h0: { head: id, constructor: 'x' },
      h1: { head: 'constructor' },
      h2: { head: wrong?.id },
      h3: 'sword',
      h4: null,
    });
    expect(eq).toEqual({
      h0: { head: id },
      h1: {},
      h2: { [wrong!.kind === 'accessory' ? 'acc1' : wrong!.kind]: wrong!.id },
    });
  });

  // chest.ts skips a "__proto__" key: assigning it would swap the prototype of the returned object
  it('a "__proto__" member key does not change the prototype of the equipment', () => {
    const eq = parseEquip(JSON.parse('{"__proto__":{"weapon":"x"},"h0":{}}'));
    expect(Object.getPrototypeOf(eq)).toBe(Object.prototype);
  });

  it('never pollutes the global prototype', () => {
    parseEquip(JSON.parse('{"__proto__":{"polluted":1}}'));
    parseChest(JSON.parse('{"__proto__":{"polluted":1}}'));
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('dt:saves (parseManifest)', () => {
  it('slot ids must be safe whole numbers above 0, unique; active must name a slot', () => {
    const ids = [0, -1, 1.5, 2 ** 60, Number.NaN, '3', null, 4, 4, 5];
    const m = parseManifest({ active: 9, slots: ids.map((id) => ({ id, data: {} })) });
    expect(m.slots.map((s) => s.id)).toEqual([4, 5]);
    expect(m.active).toBeNull();
    expect(parseManifest({ active: '4', slots: [{ id: 4, data: {} }] }).active).toBeNull();
  });

  it('a slot copies only progress keys with text values; settings and prototype keys are dropped', () => {
    const data = JSON.parse(
      '{"dt:party":"{}","dt:lang":"en","dt:migrated":"0","dt:chest":5,"dt:crawl":"","__proto__":{"dt:equip":"x"}}',
    );
    const m = parseManifest({ active: 1, slots: [{ id: 1, data }] });
    expect(m.slots[0].data).toEqual({ 'dt:party': '{}' });
  });

  it('a slot summary of garbage data still has a leader, names and gold', () => {
    const s = summary({
      id: 1,
      data: { 'dt:party': '{"deployed":"x"', 'dt:chest': 'null', 'dt:crawl': '[]', 'dt:played': '-5' },
    });
    expect(s.names.length).toBeGreaterThan(0);
    expect(s.gold).toBe(0);
    expect(s.floor).toBeNull();
    expect(s.played).toBeNull();
  });

  // saves-ui.ts formats played with toLocaleString, which shows "Invalid Date" past 8.64e15 ms
  it('a played time past the Date range is dropped', () => {
    const s = summary({ id: 1, data: { 'dt:played': '1e300' } });
    expect(s.played).toBeNull();
  });
});

describe('dt:crawl (parseExpedition)', () => {
  const exp = () => startExpedition(21, [{ id: 'warrior', max: 50 }]);
  it('a party out of range, a repeated hero or a room that is not open is rejected', () => {
    const map = expeditionMap(21);
    const open = openNodes(map, [])[0];
    const bad = [
      { ...exp(), v: 'old' },
      { ...exp(), seed: 1.5 },
      { ...exp(), seed: '21' },
      { ...exp(), path: [map.length - 1] },
      { ...exp(), path: [open, open] },
      { ...exp(), path: [-1] },
      { ...exp(), path: ['0'] },
      { ...exp(), party: [] },
      {
        ...exp(),
        party: Array(5)
          .fill(0)
          .map((_, i) => ({ id: `h${i}`, max: 10, hp: 10 })),
      },
      { ...exp(), party: [{ id: 'a', max: 10, hp: 11 }] },
      { ...exp(), party: [{ id: 'a', max: 1000, hp: 10 }] },
      { ...exp(), party: [{ id: 'a', max: 10, hp: 0 }] },
      { ...exp(), party: [{ id: '', max: 10, hp: 5 }] },
      {
        ...exp(),
        party: [
          { id: 'a', max: 10, hp: 5 },
          { id: 'a', max: 10, hp: 5 },
        ],
      },
      { ...exp(), party: [null] },
    ];
    for (const raw of bad) expect(parseExpedition(raw)).toBeNull();
    expect(parseExpedition({ ...exp(), path: [open] })?.path).toEqual([open]);
  });

  it('a path as long as the whole map stops at the first room that is not open', () => {
    const map = expeditionMap(21);
    expect(parseExpedition({ ...exp(), path: Array(100_000).fill(0) })).toBeNull();
    expect(map.length).toBeLessThan(100);
  });
});

describe('dt:dev (parseSetup)', () => {
  const unit = { base: 'warrior', name: 'Bran', hp: 10, speed: 5, move: 4, abilities: ['strike'] };
  it('the baseline setup passes, so each rejection below is for its own field', () => {
    expect(parseSetup({ map: 'skirmish', heroes: [unit], enemies: [] })).not.toBeNull();
  });
  it.each([
    ['unknown map', { map: 'constructor', heroes: [], enemies: [] }],
    ['unknown class', { map: 'skirmish', heroes: [{ ...unit, base: '__proto__' }], enemies: [] }],
    ['hp past the limit', { map: 'skirmish', heroes: [{ ...unit, hp: 1000 }], enemies: [] }],
    ['speed 0', { map: 'skirmish', heroes: [{ ...unit, speed: 0 }], enemies: [] }],
    ['name too long', { map: 'skirmish', heroes: [{ ...unit, name: 'x'.repeat(25) }], enemies: [] }],
    ['13 units', { map: 'skirmish', heroes: Array(13).fill(unit), enemies: [] }],
    ['ability by prototype name', { map: 'skirmish', heroes: [{ ...unit, abilities: ['constructor'] }], enemies: [] }],
  ])('%s is rejected', (_, raw) => expect(parseSetup(raw)).toBeNull());
});

describe('settings: dt:sound, dt:dawn, dt:town-grid, dt:lang', () => {
  it('each bad field falls back alone', () => {
    expect(parseSound({ music: 7, sfx: Number.NaN })).toEqual(parseSound(null));
    expect(parseSound({ music: 105, sfx: -5 })).toEqual(parseSound(null));
    for (const v of ['-1', '1.5', '1e9', 'NaN', 'Infinity', null]) expect(parseBest(v)).toBe(0);
    expect(parseTownGrid('true')).toBe(false);
    expect(pickLang('<script>', 'en-US')).toBe('en');
    expect(pickLang('__proto__', 'pt-BR')).toBe('pt');
  });
});

describe('store.json and the save migration', () => {
  const keys = ['dt:test-trust'];
  afterEach(() => {
    for (const k of keys) store.set(k, '');
  });

  it('broken JSON in any key reads as null instead of throwing', () => {
    for (const v of ['{', 'undefined', "{'a':1}", '\u0000', 'x'.repeat(100_000)]) {
      store.set(keys[0], v);
      expect(store.json(keys[0])).toBeNull();
    }
  });

  const browser = (init: Record<string, string>) => {
    const m = new Map(Object.entries(init));
    return {
      m,
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
      key: (i: number) => [...m.keys()][i] ?? null,
      get length() {
        return m.size;
      },
    };
  };

  it('a migration count past the list runs nothing', () => {
    const s = browser({ 'dt:migrated': '1e9', 'dt:pixel': '{"size":2}', 'dt:battle': 'x' });
    migrate(s);
    expect(s.m.get('dt:pixel')).toBe('{"size":2}');
    expect(s.m.get('dt:battle')).toBe('x');
  });

  // slice() takes a negative count from the end, so an edited "-1" would rerun the last step and wipe every dt:battle* save
  it('a negative migration count never reruns the last step', () => {
    const s = browser({ 'dt:migrated': '-1', 'dt:battle': 'x' });
    migrate(s);
    expect(s.m.get('dt:battle')).toBe('x');
  });

  // garbage ("abc") reads as all done (Fernando, Nov 16: a bad count never deletes saves); only a missing key reruns
  // every step, whose first one removes dt:pixel
  it('a garbage migration count keeps the live pixel setting', () => {
    const s = browser({ 'dt:migrated': 'abc', 'dt:pixel': '{"size":2}' });
    migrate(s);
    expect(s.m.get('dt:pixel')).toBe('{"size":2}');
  });
});
