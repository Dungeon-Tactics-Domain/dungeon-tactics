import { describe, expect, it } from 'vitest';
import {
  byPlayed,
  deleteSlot,
  loadSlot,
  newGame,
  parseManifest,
  readSaves,
  SAVES_KEY,
  summary,
} from '../src/client/saves.ts';
import { migrate, store } from '../src/client/store.ts';
import { expeditionMap, openNodes, startExpedition } from '../src/shared/crawl/expedition.ts';

const browser = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    saved: (k: string) => m.get(k) ?? null,
    removeItem: (k: string) => void m.delete(k),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
};
// like store.ts: every write lands in the tab's memory, the browser refuses the keys `full` names, and get falls back on
// memory; only `saved` tells a refused write
const fullBrowser = (init: Record<string, string>, full: (k: string) => boolean) => {
  const s = browser(init);
  const mem = new Map<string, string>();
  return {
    ...s,
    getItem: (k: string) => s.m.get(k) ?? mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, v);
      if (!full(k)) s.m.set(k, v);
    },
  };
};
const party = (gold: number) => ({ 'dt:party': '{"deployed":["mage"]}', 'dt:chest': `{"gold":${gold}}` });
const live = (s: { m: Map<string, string> }, k: string) => s.m.get(k) || null;

describe('save slots', () => {
  it('New game keeps the game in play in its slot and starts a clean one, listed at once', () => {
    const s = browser({ ...party(150), 'dt:lang': 'en' });
    expect(newGame(s, 1000)).toBe(true);
    const m = readSaves(s);
    expect(m.active).toBe(2);
    expect(m.slots.map((x) => x.id)).toEqual([1, 2]);
    expect(m.slots[0].data['dt:chest']).toBe('{"gold":150}');
    expect(live(s, 'dt:chest')).toBeNull();
    expect(live(s, 'dt:played')).toBe('1000');
    expect(s.m.get('dt:lang')).toBe('en'); // settings are not part of a game
  });

  it('loading a slot writes the live game back into its own slot first', () => {
    const s = browser(party(150));
    newGame(s, 1000);
    s.setItem('dt:chest', '{"gold":40}'); // played the new game
    expect(loadSlot(s, 1)).toBe(true);
    expect(live(s, 'dt:chest')).toBe('{"gold":150}');
    expect(readSaves(s).slots.find((x) => x.id === 2)!.data['dt:chest']).toBe('{"gold":40}');
    loadSlot(s, 2);
    expect(live(s, 'dt:chest')).toBe('{"gold":40}');
  });

  it('a room in play and the expedition travel with their slot', () => {
    const s = browser({ ...party(0), 'dt:crawl': '{"v":1}', 'dt:battle:expedition': '{"state":{}}' });
    newGame(s, 1000);
    expect(live(s, 'dt:crawl')).toBeNull();
    expect(live(s, 'dt:battle:expedition')).toBeNull();
    loadSlot(s, 1);
    expect(live(s, 'dt:battle:expedition')).toBe('{"state":{}}');
  });

  it('deleting a slot removes it; deleting the one in play clears the live game', () => {
    const s = browser(party(150));
    newGame(s, 1000);
    s.setItem('dt:chest', '{"gold":40}');
    expect(deleteSlot(s, 1)).toBe(true);
    expect(readSaves(s).slots.map((x) => x.id)).toEqual([2]);
    expect(live(s, 'dt:chest')).toBe('{"gold":40}');
    deleteSlot(s, 2);
    expect(readSaves(s)).toEqual({ active: null, slots: [] });
    expect(live(s, 'dt:chest')).toBeNull();
  });

  it('live progress with no slot becomes a new slot; nothing saved lists nothing', () => {
    expect(readSaves(browser({ 'dt:lang': 'en' }))).toEqual({ active: null, slots: [] });
    const s = browser({
      [SAVES_KEY]: JSON.stringify({ active: null, slots: [{ id: 3, data: party(5) }] }),
      ...party(9),
    });
    expect(readSaves(s).active).toBe(4);
  });

  it('a full browser storage stops the change before the live game is touched', () => {
    // the manifest was never written: the tab's memory alone would say it was
    const s = fullBrowser(party(150), (k) => k === SAVES_KEY);
    expect(newGame(s, 1000)).toBe(false);
    expect(live(s, 'dt:chest')).toBe('{"gold":150}');
  });

  it('a progress write stamps the last-played time; a setting does not', () => {
    store.set('dt:played', '1');
    store.set('dt:lang', 'pt');
    expect(store.get('dt:played')).toBe('1');
    store.set('dt:chest', '{"gold":1}');
    expect(Number(store.get('dt:played'))).toBeGreaterThan(Date.now() - 60_000);
    store.set('dt:chest', '');
  });

  it('the single save from before the slots becomes slot 1 on load', () => {
    const s = browser({ 'dt:migrated': '3', ...party(150), 'dt:sound': '{}' });
    migrate(s);
    expect(JSON.parse(s.m.get(SAVES_KEY)!)).toEqual({ active: 1, slots: [{ id: 1, data: party(150) }] });
    const fresh = browser({ 'dt:migrated': '3', 'dt:lang': 'en' });
    migrate(fresh);
    expect(fresh.m.has(SAVES_KEY)).toBe(false);
  });
});

describe('save manifest (trust boundary)', () => {
  it('keeps only slots with a positive whole id of their own and only the slot keys with text', () => {
    const m = parseManifest({
      active: 9,
      slots: [
        { id: 1, data: { 'dt:chest': '{"gold":1}', 'dt:lang': 'en', 'dt:migrated': '0', 'dt:party': 5 } },
        { id: 1, data: {} },
        { id: 0, data: {} },
        { id: 2.5 },
        null,
        { id: 2 },
      ],
    });
    expect(m).toEqual({
      active: null,
      slots: [
        { id: 1, data: { 'dt:chest': '{"gold":1}' } },
        { id: 2, data: {} },
      ],
    });
    expect(parseManifest('junk')).toEqual({ active: null, slots: [] });
    expect(parseManifest({ active: 2, slots: [{ id: 2, data: {} }] }).active).toBe(2);
  });
});

describe('slot summary', () => {
  it('says who goes, the gold, the floor in play and when it was last played', () => {
    const exp = startExpedition(77, [{ id: 'warrior', max: 50 }]);
    const floor = expeditionMap(77)[openNodes(expeditionMap(77), [])[0]].floor;
    const row = summary({
      id: 3,
      data: {
        'dt:party': '{"deployed":["archer","mage"]}',
        'dt:chest': '{"gold":320}',
        'dt:crawl': JSON.stringify(exp),
        'dt:battle:expedition': '{}',
        'dt:played': '1700000000000',
      },
    });
    expect(row).toEqual({
      id: 3,
      leader: 'archer',
      names: ['Tess', 'Odo'],
      gold: 320,
      floor,
      room: true,
      played: 1700000000000,
    });
  });

  it('an empty slot is the default party in town, never played', () => {
    expect(summary({ id: 1, data: {} })).toMatchObject({
      leader: 'warrior',
      names: ['Bran', 'Tess', 'Odo', 'Lia'],
      gold: 0,
      floor: null,
      room: false,
      played: null,
    });
  });

  it('lists the latest played first', () => {
    const at = (id: number, played: number | null) => ({ ...summary({ id, data: {} }), played });
    expect([at(1, 5), at(2, null), at(3, 9), at(4, null)].sort(byPlayed).map((x) => x.id)).toEqual([3, 1, 4, 2]);
  });
});
