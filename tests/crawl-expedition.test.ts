import { describe, expect, it } from 'vitest';
import { CRAWL_RUN } from '../src/content/crawl/rooms.ts';
import {
  cleared,
  type Expedition,
  expeditionMap,
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
        const row = floor.filter((n) => n.row === r && !n.boss).length;
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

  it('a room that is not open (cleared, or off the path) changes nothing', () => {
    const e = startExpedition(4, party);
    const map = expeditionMap(4);
    const once = winRoom(e, first(e), { bran: 42, odo: 24 });
    expect(winRoom(once, once.path[0], { bran: 42, odo: 24 })).toBe(once);
    const far = map.findIndex((n) => n.floor === 2);
    expect(winRoom(e, far, {})).toBe(e);
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
      { ...e, party: [{ id: '', max: 42, hp: 1 }] },
      { ...e, party: [1, 2, 3, 4, 5].map((n) => ({ id: `m${n}`, max: 9, hp: 9 })) },
    ])
      expect(parseExpedition(bad)).toBeNull();
  });
});
