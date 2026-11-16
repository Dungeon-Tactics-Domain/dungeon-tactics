import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHEST_KEY, parseChest } from '../src/client/chest.ts';
import { newBattle, selectBattle } from '../src/client/game/boot.ts';
import {
  CRAWL_KEY,
  leftRoom,
  liveExpedition,
  ROOM_KEY,
  savedExpedition,
  savedRoom,
  settleRoom,
} from '../src/client/game/crawl.ts';
import { parseGroup } from '../src/client/group.ts';
import { store } from '../src/client/store.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { HALF } from '../src/shared/battle/half.ts';
import { MAPS, SCENARIOS } from '../src/shared/battle/scenarios.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';
import {
  descentGold,
  expeditionMap,
  openChest,
  openNodes,
  startExpedition,
  winRoom,
} from '../src/shared/crawl/expedition.ts';
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
    if (!sel) throw new Error('no battle');
    expect(sel.scenario.id).toBe(`${CRAWL_VERSION}-7-d2-boss-forest${HALF}`);
    expect(sel.title).toBe(false);
    expect(sel.saveKey).toBe('dt:battle:crawl');
    store.set(sel.saveKey, Battle.start(sel.scenario, 3).save());
    const again = await selectBattle();
    if (!again) throw new Error('no battle');
    expect(Battle.load(store.get(again.saveKey) ?? '')?.state.scenario).toBe(again.scenario.id);
  });

  it('a seed with no room moves on to the next one', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    open('?crawl=3');
    const sel = await selectBattle();
    if (!sel) throw new Error('no battle');
    expect(sel.scenario.id).toBe(`${CRAWL_VERSION}-4-d1-dungeon${HALF}`);
  });

  it('two seeds with no room go back home with a message, without throwing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const alert = vi.fn();
    vi.stubGlobal('alert', alert);
    const location = open('?crawl=1');
    expect(await selectBattle()).toBeNull();
    expect(alert).toHaveBeenCalledOnce();
    expect(location.search).toBe('?home');
  });

  it('?room= opens an open expedition room with the town party at its carried life; a closed one goes home', async () => {
    const ids = parseGroup(null).deployed;
    const exp = startExpedition(
      21,
      ids.map((id) => ({ id, max: 250 })),
    );
    exp.party[1].hp = 35;
    store.set(CRAWL_KEY, JSON.stringify(exp));
    const map = expeditionMap(21);
    const node = openNodes(map, [])[0];
    open(`?room=${node}`);
    const sel = await selectBattle();
    if (!sel) throw new Error('no battle');
    expect(sel.saveKey).toBe('dt:battle:expedition');
    expect(sel.title).toBe(false);
    expect(sel.room?.node).toBe(node);
    expect(Object.values(sel.room?.heroes ?? {}).map((h) => h.id)).toEqual(ids);
    expect(sel.scenario.id).toBe(`${CRAWL_VERSION}-${map[node].seed}-d1-dungeon${HALF}`);
    const b = newBattle(sel.scenario, sel.room);
    expect(b.state.units.find((u) => u.id === 'h1')?.hp).toBe(35);
    // a saved life above the battle sheet's (Bran 210, Odo 120) is cut to it
    expect(b.state.units.find((u) => u.id === 'h0')?.hp).toBe(210);
    expect(b.state.units.find((u) => u.id === 'h2')?.hp).toBe(120);
    expect(b.state.units.filter((u) => u.team === 'hero')).toHaveLength(ids.length);

    // won with Lia (h3) fallen and the rest as they entered: +25% of the saved max (ceil 62.5) for whoever stood, never above it,, 25% for her
    b.state.units = b.state.units.filter((u) => u.team === 'hero' && u.id !== 'h3');
    settleRoom(sel.room!, true, b.state);
    const after = savedExpedition();
    expect(after?.path).toEqual([node]);
    expect(after?.party.map((h) => h.hp)).toEqual([250, 35 + 63, 120 + 63, 63]);
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
    expect(location.search).toBe('?home');
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
    if (!sel) throw new Error('no battle');
    const b = newBattle(sel.scenario, sel.room);
    store.set(ROOM_KEY, b.save()); // what main.ts boot saves on the room's first frame
    // Restart is free: a new battle of the same room, with the life the party entered with
    expect(newBattle(sel.scenario, sel.room).state.units.find((u) => u.id === 'h0')?.hp).toBe(9);
    // the same room again (a reload, or the title's Continue after closing the tab) resumes it
    // each open is a new page, where the room saved is not registered yet (this process still had it, which hid that a
    // sibling room opened)
    const newPage = () => {
      delete SCENARIOS[sel.scenario.id];
      delete SCENARIOS[sel.scenario.id.slice(0, -HALF.length)];
    };
    expect(savedRoom()).toBe(node);
    newPage();
    expect(await selectBattle()).not.toBeNull();
    // a sibling room goes home instead of opening, and home finds the room left behind: the expedition is lost
    newPage();
    const location = open(`?room=${sibling}`);
    expect(await selectBattle()).toBeNull();
    expect(location.search).toBe('?home');
    expect(leftRoom()).toBe(0); // the gold that went home: half of none found
    expect(savedExpedition()).toBeNull();
    expect(savedRoom()).toBeNull();
    expect(store.get(ROOM_KEY)).toBe('');
    expect(leftRoom()).toBeNull();
  });

  it('the descent gold goes to town when it ends: half after a fall; a chest node is no battle', async () => {
    const ids = parseGroup(null).deployed;
    const map = expeditionMap(21);
    let exp = startExpedition(
      21,
      ids.map((id) => ({ id, max: 20 })),
    );
    // through the floor's chest and into floor 2, where the rooms drop gold
    exp = winRoom(
      exp,
      map.findIndex((n) => n.next.some((c) => map[c].chest)),
      {},
    );
    const chest = openNodes(map, exp.path).find((i) => map[i].chest)!;
    store.set(CRAWL_KEY, JSON.stringify(exp));
    const location = open(`?room=${chest}`);
    expect(await selectBattle()).toBeNull();
    expect(location.search).toBe('?home');
    exp = openChest(exp, chest);
    while (map[openNodes(map, exp.path)[0]].floor < 3) exp = winRoom(exp, openNodes(map, exp.path)[0], {});
    const found = descentGold(exp);
    expect(found).toBeGreaterThan(0);
    store.set(CRAWL_KEY, JSON.stringify(exp));
    store.set(CHEST_KEY, JSON.stringify({ gold: 7, items: [] }));
    const lost = settleRoom({ node: openNodes(map, exp.path)[0], heroes: {} }, false, newBattle(MAPS[0]).state);
    expect(lost?.gold.banked).toBe(Math.floor(found / 2));
    expect(parseChest(store.json(CHEST_KEY)).gold).toBe(7 + Math.floor(found / 2));
    expect(savedExpedition()).toBeNull();
  });

  it('the town offers to continue only an expedition whose boss is still up', () => {
    const map = expeditionMap(33);
    let exp = startExpedition(
      33,
      parseGroup(null).deployed.map((id) => ({ id, max: 20 })),
    );
    store.set(CRAWL_KEY, '');
    expect(liveExpedition()).toBeNull();
    store.set(CRAWL_KEY, JSON.stringify(exp));
    expect(liveExpedition()?.seed).toBe(33);
    while (openNodes(map, exp.path).length) exp = { ...exp, path: [...exp.path, openNodes(map, exp.path)[0]] };
    store.set(CRAWL_KEY, JSON.stringify(exp)); // the boss down, saved by hand: no expedition to continue
    expect(savedExpedition()).not.toBeNull();
    expect(liveExpedition()).toBeNull();
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
    if (!sel) throw new Error('no battle');
    expect(sel.scenario.id).toBe(`${CRAWL_VERSION}-${map[node].seed}-d3-boss-dungeon${HALF}`);
    const b = newBattle(sel.scenario, sel.room);
    const foes = b.state.units.filter((u) => u.team === 'enemy');
    expect(foes.map((u) => UNIT_DEFS[u.def].size)).toEqual([4, 2]); // the 2x2 Colossus and one minion, in half tiles
    expect(b.state.units.filter((u) => u.team === 'hero').map((u) => u.hp)).toEqual([20, 20, 20, 20]);
    store.set(sel.saveKey, b.save());
    const again = await selectBattle();
    if (!again) throw new Error('no battle');
    expect(Battle.load(store.get(again.saveKey) ?? '')?.state.scenario).toBe(again.scenario.id);
  });
});
