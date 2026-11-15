import { afterEach, describe, expect, it, vi } from 'vitest';
import { newBattle, selectBattle } from '../src/client/game/boot.ts';
import { CRAWL_KEY, leftRoom, ROOM_KEY, savedExpedition, settleRoom } from '../src/client/game/crawl.ts';
import { parseGroup } from '../src/client/group.ts';
import { store } from '../src/client/store.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { HALF } from '../src/shared/battle/half.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';
import { expeditionMap, openNodes, startExpedition } from '../src/shared/crawl/expedition.ts';
import type * as Generate from '../src/shared/crawl/generate.ts';
import { CRAWL_VERSION, type RoomOptions } from '../src/shared/crawl/generate.ts';

// ?crawl= through the boot's real path (boot.ts has no DOM or Three), as tests/half-tiles.test.ts does. Seeds 1 to 3
// stand for seeds whose 200 layouts all fail (none of the 500 tested do), so the fallback can be checked
vi.mock('../src/shared/crawl/generate.ts', async (importOriginal) => {
  const real = await importOriginal<typeof Generate>();
  return {
    ...real,
    generateRoom: (seed: number, opts: RoomOptions) => {
      if (seed >= 1 && seed <= 3) throw new Error(`crawl: no room passed the checks for seed ${seed}`);
      return real.generateRoom(seed, opts);
    },
  };
});

const open = (search: string) => {
  const location = { search };
  vi.stubGlobal('location', location);
  return location;
};

describe('crawl rooms in the client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('?crawl= opens the room in half tiles, without the title, and a save of it resumes', async () => {
    open('?crawl=7&depth=2&boss=1&theme=forest');
    const sel = await selectBattle();
    if (!sel || sel === 'world') throw new Error('no battle');
    expect(sel.scenario.id).toBe(`${CRAWL_VERSION}-7-d2-boss-forest${HALF}`);
    expect(sel.title).toBe(false);
    expect(sel.saveKey).toBe('dt:battle:crawl');
    store.set(sel.saveKey, Battle.start(sel.scenario, 3).save());
    const again = await selectBattle();
    if (!again || again === 'world') throw new Error('no battle');
    expect(Battle.load(store.get(again.saveKey) ?? '')?.state.scenario).toBe(again.scenario.id);
  });

  it('a seed with no room moves on to the next one', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    open('?crawl=3');
    const sel = await selectBattle();
    if (!sel || sel === 'world') throw new Error('no battle');
    expect(sel.scenario.id).toBe(`${CRAWL_VERSION}-4-d1-dungeon${HALF}`);
  });

  it('two seeds with no room go back to the title with a message, without throwing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const alert = vi.fn();
    vi.stubGlobal('alert', alert);
    const location = open('?crawl=1');
    expect(await selectBattle()).toBeNull();
    expect(alert).toHaveBeenCalledOnce();
    expect(location.search).toBe('');
  });

  it('?room= opens an open expedition room with the town party at its carried life; a closed one goes home', async () => {
    const ids = parseGroup(null).deployed;
    const exp = startExpedition(
      21,
      ids.map((id) => ({ id, max: 50 })),
    );
    exp.party[1].hp = 7;
    store.set(CRAWL_KEY, JSON.stringify(exp));
    const map = expeditionMap(21);
    const node = openNodes(map, [])[0];
    open(`?room=${node}`);
    const sel = await selectBattle();
    if (!sel || sel === 'world') throw new Error('no battle');
    expect(sel.saveKey).toBe('dt:battle:expedition');
    expect(sel.title).toBe(false);
    expect(sel.room?.node).toBe(node);
    expect(Object.values(sel.room?.heroes ?? {}).map((h) => h.id)).toEqual(ids);
    expect(sel.scenario.id).toBe(`${CRAWL_VERSION}-${map[node].seed}-d1-dungeon${HALF}`);
    const b = newBattle(sel.scenario, sel.room);
    expect(b.state.units.find((u) => u.id === 'h1')?.hp).toBe(7);
    // a saved life above the battle sheet's (Bran 42, Odo 24) is cut to it
    expect(b.state.units.find((u) => u.id === 'h0')?.hp).toBe(42);
    expect(b.state.units.find((u) => u.id === 'h2')?.hp).toBe(24);
    expect(b.state.units.filter((u) => u.team === 'hero')).toHaveLength(ids.length);

    // won with Lia (h3) fallen and the rest as they entered: +25% of the saved max (ceil 12.5) for whoever stood, 25% for her
    b.state.units = b.state.units.filter((u) => u.team === 'hero' && u.id !== 'h3');
    settleRoom(sel.room!, true, b.state);
    const after = savedExpedition();
    expect(after?.path).toEqual([node]);
    expect(after?.party.map((h) => h.hp)).toEqual([42 + 8, 7 + 13, 24 + 13, 13]);
    // a result for a room that is no longer open (another tab won it) is ignored
    expect(settleRoom(sel.room!, false, b.state)).toBeNull();
    expect(savedExpedition()?.path).toEqual([node]);
    // a defeat ends it
    settleRoom({ ...sel.room!, node: openNodes(map, [node])[0] }, false, b.state);
    expect(savedExpedition()).toBeNull();

    store.set(CRAWL_KEY, JSON.stringify(exp));
    const closed = map.findIndex((n) => n.floor === 2);
    const location = open(`?room=${closed}`);
    expect(await selectBattle()).toBeNull();
    expect(location.search).toBe('');
  });

  it('leaving a room before it ends loses the expedition; Restart keeps the life the party entered with', async () => {
    const ids = parseGroup(null).deployed;
    const exp = startExpedition(
      21,
      ids.map((id) => ({ id, max: 20 })),
    );
    exp.party[0].hp = 9;
    store.set(CRAWL_KEY, JSON.stringify(exp));
    store.set(ROOM_KEY, '');
    const [node, sibling] = openNodes(expeditionMap(21), []);
    open(`?room=${node}`);
    const sel = await selectBattle();
    if (!sel || sel === 'world') throw new Error('no battle');
    const b = newBattle(sel.scenario, sel.room);
    store.set(ROOM_KEY, b.save()); // what main.ts boot saves on the room's first frame
    // Restart is free: a new battle of the same room, with the life the party entered with
    expect(newBattle(sel.scenario, sel.room).state.units.find((u) => u.id === 'h0')?.hp).toBe(9);
    // the same room again (a reload) resumes it
    expect(await selectBattle()).not.toBeNull();
    // a sibling room goes home instead of opening, and home finds the room left behind: the expedition is lost
    const location = open(`?room=${sibling}`);
    expect(await selectBattle()).toBeNull();
    expect(location.search).toBe('');
    expect(leftRoom()).toBe(true);
    expect(savedExpedition()).toBeNull();
    expect(store.get(ROOM_KEY)).toBe('');
    expect(leftRoom()).toBe(false);
  });

  it('the boss room opens with the Colossus and its battle saves and loads', async () => {
    const ids = parseGroup(null).deployed;
    const map = expeditionMap(33);
    let exp = startExpedition(
      33,
      ids.map((id) => ({ id, max: 20 })),
    );
    while (!map[openNodes(map, exp.path)[0]].boss) exp = { ...exp, path: [...exp.path, openNodes(map, exp.path)[0]] };
    store.set(CRAWL_KEY, JSON.stringify(exp));
    const node = openNodes(map, exp.path)[0];
    open(`?room=${node}`);
    const sel = await selectBattle();
    if (!sel || sel === 'world') throw new Error('no battle');
    expect(sel.scenario.id).toBe(`${CRAWL_VERSION}-${map[node].seed}-d3-boss-dungeon${HALF}`);
    const b = newBattle(sel.scenario, sel.room);
    const foes = b.state.units.filter((u) => u.team === 'enemy');
    expect(foes.map((u) => UNIT_DEFS[u.def].size)).toEqual([4, 2]); // the 2x2 Colossus and one minion, in half tiles
    expect(b.state.units.filter((u) => u.team === 'hero').map((u) => u.hp)).toEqual([20, 20, 20, 20]);
    store.set(sel.saveKey, b.save());
    const again = await selectBattle();
    if (!again || again === 'world') throw new Error('no battle');
    expect(Battle.load(store.get(again.saveKey) ?? '')?.state.scenario).toBe(again.scenario.id);
  });
});
