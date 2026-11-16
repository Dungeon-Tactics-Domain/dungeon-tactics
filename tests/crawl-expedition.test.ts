import { describe, expect, it } from 'vitest';
import { CRAWL_GOLD, CRAWL_GROUPS, CRAWL_RUN } from '../src/content/crawl/rooms.ts';
import {
  classMana,
  cleared,
  descentGold,
  type Expedition,
  expeditionMap,
  goldHome,
  nodeGold,
  openChest,
  openNodes,
  parseExpedition,
  startExpedition,
  winRoom,
} from '../src/shared/crawl/expedition.ts';
import { generateRoom, roomGroup } from '../src/shared/crawl/generate.ts';

const party = [
  { id: 'bran', max: 42 },
  { id: 'odo', max: 24 },
];
const first = (e: Expedition) => openNodes(expeditionMap(e.seed), e.path)[0];
const at = (e: Expedition, hp: number[]): Expedition => ({ ...e, party: e.party.map((h, i) => ({ ...h, hp: hp[i] })) });

describe('crawl expedition', () => {
  it('the same seed gives the same map; floors of rooms lead down, and one boss room ends the last floor', () => {
    expect(expeditionMap(11)).toEqual(expeditionMap(11));
    expect(expeditionMap(11)).not.toEqual(expeditionMap(12));
    const map = expeditionMap(11);
    for (let f = 1; f <= CRAWL_RUN.floors; f++) {
      const floor = map.filter((n) => n.floor === f);
      for (let r = 0; r < CRAWL_RUN.rows; r++) {
        const row = floor.filter((n) => n.row === r && !n.boss && !n.chest).length;
        expect(row).toBeGreaterThanOrEqual(CRAWL_RUN.width[0]);
        expect(row).toBeLessThanOrEqual(CRAWL_RUN.width[1]);
      }
      // a floor's last row leads to every room of the next floor's first row
      if (f < CRAWL_RUN.floors)
        for (const n of floor.filter((n) => n.row === CRAWL_RUN.rows - 1))
          expect(n.next.map((i) => [map[i].floor, map[i].row])).toEqual(n.next.map(() => [f + 1, 0]));
    }
    expect(map.filter((n) => n.boss)).toEqual([map.at(-1)]);
    expect(map.at(-1)?.floor).toBe(CRAWL_RUN.floors);
    expect(map.at(-1)?.next).toEqual([]);
    expect(map.filter((n) => !n.next.length)).toHaveLength(1);
  });

  it('the node preview is the group the room is built with', () => {
    const map = expeditionMap(5);
    for (const n of map.filter((_, i) => i < 3 || map[i].boss).slice(0, 4)) {
      const opts = { depth: n.floor, boss: n.boss };
      expect(generateRoom(n.seed, opts).name).toBe(roomGroup(n.seed, opts).group.name[0]);
    }
  });

  it('a won room heals the standing +25% (capped) and brings the fallen back at 25%, rounded up', () => {
    const e = at(startExpedition(3, party), [20, 24]);
    const node = first(e);
    const next = winRoom(e, node, { bran: 20 }); // odo fell
    expect(next.path).toEqual([node]);
    expect(next.party).toEqual([
      { id: 'bran', max: 42, hp: 31 }, // 20 + ceil(10.5)
      { id: 'odo', max: 24, hp: 6 }, // 25% only, no room heal on top
    ]);
    expect(winRoom(at(e, [40, 24]), node, { bran: 40, odo: 24 }).party.map((h) => h.hp)).toEqual([42, 24]);
    // max 41: 25% is 10.25, up to 11 (rounding would give 10)
    const odd = startExpedition(3, [{ id: 'tess', max: 41 }]);
    expect(winRoom({ ...odd, party: [{ id: 'tess', max: 41, hp: 20 }] }, node, { tess: 20 }).party[0].hp).toBe(31);
    expect(winRoom(odd, node, {}).party[0].hp).toBe(11);
  });

  it('going down a floor adds +50% to everyone, the fallen included; the boss clears the expedition', () => {
    const map = expeditionMap(9);
    const leadsDown = (e: Expedition) => map[first(e)].next.some((n) => map[n].floor > map[first(e)].floor);
    let e = startExpedition(9, party);
    expect(leadsDown(e)).toBe(false);
    while (!leadsDown(e)) e = winRoom(e, first(e), { bran: 42, odo: 24 });
    e = at(e, [10, 24]);
    const down = winRoom(e, first(e), { bran: 10 });
    expect(down.party.map((h) => h.hp)).toEqual([10 + 11 + 21, 6 + 12]);
    expect(map[first(down)].floor).toBe(2);
    // the rooms between floors heal only the room's +25%
    const mid = winRoom(at(down, [10, 10]), first(down), { bran: 10, odo: 10 });
    expect(mid.party.map((h) => h.hp)).toEqual([10 + 11, 10 + 6]);
    let end = mid;
    while (!cleared(map, end.path)) end = winRoom(end, first(end), { bran: 1, odo: 1 });
    // the boss leads nowhere: no floor heal
    expect(end.party.map((h) => h.hp)).toEqual([1 + 11, 1 + 6]);
    expect(end.path.filter((n) => map[n].boss)).toHaveLength(1);
    expect(end.path).toHaveLength(CRAWL_RUN.floors * CRAWL_RUN.rows + 1);
  });

  it('mana follows the life: +25% standing, 25% fallen, +50% going down; the save keeps it (Nov 16)', () => {
    const map = expeditionMap(9);
    const leadsDown = (e: Expedition) => map[first(e)].next.some((n) => map[n].floor > map[first(e)].floor);
    let e = startExpedition(9, [
      { id: 'mia', max: 30, manaMax: 60 },
      { id: 'bran', max: 42 },
    ]);
    expect(e.party).toEqual([
      { id: 'mia', max: 30, hp: 30, manaMax: 60, mana: 60 },
      { id: 'bran', max: 42, hp: 42 },
    ]);
    const room = winRoom(e, first(e), { mia: 30, bran: 42 }, { mia: 10 });
    expect(room.party[0].mana).toBe(10 + 15);
    expect(room.party[1]).not.toHaveProperty('mana');
    expect(winRoom(e, first(e), { bran: 42 }, {}).party[0].mana).toBe(15); // fell: 25% only
    while (!leadsDown(e)) e = winRoom(e, first(e), { mia: 30, bran: 42 }, { mia: 60 });
    expect(winRoom(e, first(e), { mia: 30, bran: 42 }, { mia: 0 }).party[0].mana).toBe(15 + 30);
    expect(parseExpedition(JSON.parse(JSON.stringify(room)))).toEqual(room);
  });

  it('a save from before the mana enters full; a mana without its max or above it is dropped', () => {
    const old = { ...startExpedition(8, party) };
    expect(parseExpedition(old)!.party[0]).not.toHaveProperty('mana');
    const hero = { id: 'mia', max: 30, hp: 30 };
    for (const bad of [
      { ...hero, mana: 5 },
      { ...hero, manaMax: 60, mana: 61 },
      { ...hero, manaMax: 60, mana: -1 },
    ])
      expect(parseExpedition({ ...old, party: [bad] })).toBeNull();
  });

  // the class may change in town between rooms (Nov 16 review): the warrior turned mage got no mana and entered full forever
  it('mana follows the class a hero has now: a new pool enters full once, a lost one is dropped', () => {
    const e = startExpedition(9, [
      { id: 'mia', max: 30, manaMax: 60 },
      { id: 'bran', max: 42 },
    ]);
    const toMage = classMana(e, { mia: 0, bran: 60 }); // mia became a warrior, bran a mage
    expect(toMage.party).toEqual([
      { id: 'mia', max: 30, hp: 30 },
      { id: 'bran', max: 42, hp: 42, manaMax: 60, mana: 60 },
    ]);
    // after a room bran's mana is carried, and the same class keeps it instead of refilling
    const room = winRoom(toMage, first(toMage), { mia: 30, bran: 42 }, { bran: 4 });
    expect(classMana(room, { mia: 0, bran: 60 }).party[1].mana).toBe(4 + 15);
    // a member no longer in the group keeps what it had
    expect(classMana(room, {})).toEqual(room);
    // a save from before the mana: a mage enters full, then it is carried
    const old = parseExpedition(startExpedition(9, [{ id: 'odo', max: 24 }]))!;
    expect(classMana(old, { odo: 60 }).party[0]).toEqual({ id: 'odo', max: 24, hp: 24, manaMax: 60, mana: 60 });
  });

  it('a room that is not open (cleared, or off the path) changes nothing', () => {
    const e = startExpedition(4, party);
    const map = expeditionMap(4);
    const once = winRoom(e, first(e), { bran: 42, odo: 24 });
    expect(winRoom(once, once.path[0], { bran: 42, odo: 24 })).toBe(once);
    const far = map.findIndex((n) => n.floor === 2);
    expect(winRoom(e, far, {})).toBe(e);
  });

  it('every floor has one chest, off one room of its first row, leading on to the second', () => {
    for (let seed = 0; seed < 50; seed++) {
      const map = expeditionMap(seed);
      for (let f = 1; f <= CRAWL_RUN.floors; f++) {
        const chests = map.flatMap((n, i) => (n.floor === f && n.chest ? [i] : []));
        expect(chests).toHaveLength(1);
        const [c] = chests;
        const firstRow = map.flatMap((n, i) => (n.floor === f && n.row === 0 && !n.chest ? [i] : []));
        const second = map.flatMap((n, i) => (n.floor === f && n.row === 1 ? [i] : []));
        expect(firstRow.filter((i) => map[i].next.includes(c))).toHaveLength(1);
        expect(map[c].next).toEqual(second);
      }
      expect(openNodes(map, []).some((i) => map[i].chest)).toBe(false);
    }
  });

  it('every room draws one of its floor compositions', () => {
    const map = expeditionMap(21);
    for (const n of map.filter((n) => !n.chest && !n.boss)) {
      const { group } = roomGroup(n.seed, { depth: n.floor });
      expect(CRAWL_GROUPS.filter((g) => g.depth === n.floor)).toContain(group);
    }
  });

  it('a chest opens without battle or heal; a room cannot be opened as a chest, nor a chest won as a room', () => {
    const map = expeditionMap(6);
    const c = map.findIndex((n) => n.chest);
    const from = map.findIndex((n) => n.next.includes(c));
    let e = at(startExpedition(6, party), [20, 24]);
    expect(openChest(e, c)).toBe(e); // not open yet
    e = winRoom(e, from, { bran: 20, odo: 24 });
    expect(winRoom(e, c, { bran: 20, odo: 24 })).toBe(e);
    expect(openChest(e, first(e))).toBe(e);
    const opened = openChest(e, c);
    expect(opened.path).toEqual([from, c]);
    expect(opened.party).toEqual(e.party);
    expect(openChest(opened, c)).toBe(opened);
    expect(parseExpedition(JSON.parse(JSON.stringify(opened)))).toEqual(opened);
  });

  it('gold: each enemy drops within its range, simple undead nothing, the boss 300, a chest 80 to 150', () => {
    for (let seed = 0; seed < 100; seed++)
      for (const n of expeditionMap(seed)) {
        const gold = nodeGold(n);
        expect(nodeGold(n)).toBe(gold); // from the node's seed: a Restart cannot roll it again
        if (n.chest) {
          expect(gold).toBeGreaterThanOrEqual(CRAWL_RUN.chest[0]);
          expect(gold).toBeLessThanOrEqual(CRAWL_RUN.chest[1]);
          continue;
        }
        const { enemies } = roomGroup(n.seed, { depth: n.floor, boss: n.boss }).group;
        const range = (k: 0 | 1) => enemies.reduce((s, e) => s + (CRAWL_GOLD[e]?.[k] ?? 0), 0);
        expect(gold).toBeGreaterThanOrEqual(range(0));
        expect(gold).toBeLessThanOrEqual(range(1));
        if (n.boss) expect(gold).toBe(300);
        if (enemies.every((e) => e === 'minion' || e === 'skeleton_archer')) expect(gold).toBe(0);
      }
  });

  it('the gold found is read back from the path; a fallen party takes half home, rounded down', () => {
    const e = startExpedition(14, party);
    expect(descentGold(e)).toBe(0);
    let run = e;
    while (!cleared(expeditionMap(14), run.path)) {
      const map = expeditionMap(14);
      const open = openNodes(map, run.path);
      const chest = open.find((i) => map[i].chest);
      run = chest !== undefined ? openChest(run, chest) : winRoom(run, open[0], { bran: 42, odo: 24 });
    }
    const map = expeditionMap(14);
    expect(descentGold(run)).toBe(run.path.reduce((s, n) => s + nodeGold(map[n]), 0));
    expect(goldHome(run, false)).toBe(descentGold(run));
    expect(goldHome({ ...run, path: run.path.slice(0, 3) }, true)).toBe(
      Math.floor(descentGold({ ...run, path: run.path.slice(0, 3) }) / 2),
    );
    expect(goldHome({ ...e, path: [] }, true)).toBe(0);
  });

  it('parse keeps a good save and drops anything doubtful', () => {
    const e = winRoom(startExpedition(8, party), first(startExpedition(8, party)), { bran: 30, odo: 1 });
    expect(parseExpedition(JSON.parse(JSON.stringify(e)))).toEqual(e);
    for (const bad of [
      null,
      'x',
      { ...e, v: 'crawl0' },
      { ...e, seed: 1.5 },
      { ...e, path: [999] },
      { ...e, path: [e.path[0], e.path[0]] },
      { ...e, party: [] },
      { ...e, party: [...e.party, ...e.party] },
      { ...e, party: [{ id: 'bran', max: 42, hp: 0 }] },
      { ...e, party: [{ id: 'bran', max: 42, hp: 43 }] },
      { ...e, party: [{ id: 'bran', max: 1000, hp: 1000 }] },
      { ...e, party: [{ id: '', max: 42, hp: 1 }] },
      { ...e, party: [null] },
      { ...e, party: [1, 2, 3, 4, 5].map((n) => ({ id: `m${n}`, max: 9, hp: 9 })) },
    ])
      expect(parseExpedition(bad)).toBeNull();
  });
});
