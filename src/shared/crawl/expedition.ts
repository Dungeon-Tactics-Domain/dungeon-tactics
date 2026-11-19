// The expedition of the dungeon crawl (Nov 15, F2): floors of short rooms linked in a small graph, the party's life carried
// from room to room. Only the seed, the rooms cleared and the party's life and mana are saved; the map comes back from the seed
// (rng.ts), so the same seed always gives the same floors and rooms, and the gold found comes back from the path.
import { CRAWL_GOLD, CRAWL_RUN } from '../../content/crawl/rooms.ts';
import { CONSUMABLES, START_BAG } from '../../content/items.ts';
import { parseBag } from '../battle/bag.ts';
import { rollInt } from '../battle/rng.ts';
import { CRAWL_VERSION, roomGroup } from './generate.ts';

export interface CrawlNode {
  floor: number; // 1 to CRAWL_RUN.floors; also the depth the room is drawn at
  row: number; // the boss is one more row after the last floor's
  seed: number; // the room's seed for generateRoom
  boss: boolean;
  chest: boolean; // a chest, no battle: off one room of the floor's first row, leading on to the second
  next: number[]; // the rooms it leads to (all of the next row, and the floor's chest); none after the boss
}
export interface CrawlHero {
  id: string; // party member id (the client's group)
  max: number;
  hp: number;
  // mana carried like the life (Nov 16; stamina refills in every room, so it is not saved); only for a class with a pool,
  // and absent in a save from before it, which enters every room full
  manaMax?: number;
  mana?: number;
}
export interface Expedition {
  v: string; // CRAWL_VERSION: another one gives other rooms for the same seed, so an older save is dropped
  seed: number;
  path: number[]; // rooms cleared, in order
  party: CrawlHero[];
  // the heroes' shared bag of items, carried from room to room like the life (Nov 19); absent = empty (a save from before)
  bag?: Record<string, number>;
}

export function expeditionMap(seed: number): CrawlNode[] {
  let rng = seed | 0;
  const int = (lo: number, hi: number) => {
    const [v, next] = rollInt(rng, lo, hi);
    rng = next;
    return v;
  };
  const nodes: CrawlNode[] = [];
  let prev: number[] = [];
  let detour: [from: number, chest: number] | null = null;
  for (let floor = 1; floor <= CRAWL_RUN.floors; floor++)
    for (let row = 0; row < CRAWL_RUN.rows + (floor === CRAWL_RUN.floors ? 1 : 0); row++) {
      const boss = row === CRAWL_RUN.rows; // only on the last floor: one boss at the end of the expedition
      const ids = Array.from({ length: boss ? 1 : int(...CRAWL_RUN.width) }, (_, k) => nodes.length + k);
      for (const p of prev) nodes[p].next = [...ids];
      if (detour) nodes[detour[0]].next.push(detour[1]);
      detour = null;
      for (const _ of ids) nodes.push({ floor, row, seed: int(0, 2 ** 31 - 1), boss, chest: false, next: [] });
      prev = ids;
      // the floor's chest (Fernando's gold grill, Nov 15: 1 per floor, off the shortest route): only one room of the first
      // row leads to it, and it leads on to the second row, one step longer; never after a last row (the floor heal)
      if (row === 0 && CRAWL_RUN.rows > 1) {
        detour = [ids[int(0, ids.length - 1)], nodes.length];
        nodes.push({ floor, row, seed: int(0, 2 ** 31 - 1), boss: false, chest: true, next: [] });
        prev = [...ids, nodes.length - 1];
      }
    }
  return nodes;
}

// the rooms the party may enter now: the first row, then wherever the last cleared room leads
export const openNodes = (map: CrawlNode[], path: number[]): number[] =>
  path.length
    ? map[path[path.length - 1]].next
    : map.flatMap((n, i) => (n.floor === 1 && n.row === 0 && !n.chest ? [i] : []));

// the boss is down: the expedition is won
export const cleared = (map: CrawlNode[], path: number[]) => path.length > 0 && !map[path[path.length - 1]].next.length;

export const startExpedition = (seed: number, party: { id: string; max: number; manaMax?: number }[]): Expedition => ({
  v: CRAWL_VERSION,
  seed: seed | 0,
  path: [],
  bag: { ...START_BAG },
  party: party.map(({ manaMax, ...h }) => ({ ...h, hp: h.max, ...(manaMax && { manaMax, mana: manaMax }) })),
});

// The mana pool each hero's class and pieces give now (`max` by member id, 0 without one), since the class and the pieces
// may change in town between rooms (Nov 16 review): a new max enters full once and is then carried, a class without a pool drops it, and a hero
// missing from `max` (no longer in the group) keeps what it had
export const classMana = (exp: Expedition, max: Record<string, number>): Expedition => ({
  ...exp,
  party: exp.party.map(({ manaMax, mana, ...h }) => {
    const m = max[h.id] ?? manaMax;
    return m ? { ...h, manaMax: m, mana: m === manaMax ? mana : m } : h;
  }),
});

// rounded up, as the lab rounds the fallen (42 → 11): a heal on a small life never rounds to nothing
const share = (max: number, pct: number) => Math.ceil((max * pct) / 100);

// After a won room. `left`: each standing hero's life at the end, by member id; a hero missing from it fell and comes back
// at 25% without the room heal (the lab's reading, kept in the F2 order). Clearing a floor's last row leads down a floor:
// +50% to everyone, the fallen included. Mana follows the same steps (Nov 15 grill), from `manaLeft` (a standing hero's
// mana at the end; missing, what it had). `bagLeft`: the bag at the end of the battle (absent: as it went in). A room that
// is not open changes nothing.
export function winRoom(
  exp: Expedition,
  node: number,
  left: Record<string, number>,
  manaLeft: Record<string, number> = {},
  bagLeft?: Record<string, number>,
): Expedition {
  const map = expeditionMap(exp.seed);
  if (!openNodes(map, exp.path).includes(node) || map[node].chest) return exp;
  const down = map[node].next.some((n) => map[n].floor > map[node].floor);
  const carry = (now: number, max: number, stood: boolean) =>
    Math.min(
      max,
      (stood ? now + share(max, CRAWL_RUN.roomHeal) : share(max, CRAWL_RUN.fallen)) +
        (down ? share(max, CRAWL_RUN.floorHeal) : 0),
    );
  return {
    ...exp,
    path: [...exp.path, node],
    ...(bagLeft && { bag: bagLeft }),
    party: exp.party.map((h) => {
      const stood = Object.hasOwn(left, h.id);
      const hp = carry(left[h.id], h.max, stood);
      if (!h.manaMax) return { ...h, hp };
      return { ...h, hp, mana: carry(manaLeft[h.id] ?? h.mana ?? h.manaMax, h.manaMax, stood) };
    }),
  };
}

// Opening an open chest: the party walks to it, no battle and no heal; its gold counts in descentGold and its item
// (chestItem) goes into the bag
export function openChest(exp: Expedition, node: number): Expedition {
  const map = expeditionMap(exp.seed);
  if (!openNodes(map, exp.path).includes(node) || !map[node].chest) return exp;
  const item = chestItem(map[node]);
  return { ...exp, path: [...exp.path, node], bag: { ...exp.bag, [item]: (exp.bag?.[item] ?? 0) + 1 } };
}

// The item a chest holds (Fernando, Nov 19: 1 per chest, any consumable alike): rolled on a stream of its own from the
// node's seed, salted apart from its gold, so the expedition's map and gold stay as they were (no CRAWL_VERSION bump)
export function chestItem(n: CrawlNode): string {
  const [i] = rollInt((n.seed ^ 0x17e3) | 0, 0, CONSUMABLES.length - 1);
  return CONSUMABLES[i].id;
}

// The gold a node gives: a chest's, or the drops of every enemy of a won room (it ends with all of them down). Rolled on a
// stream of its own from the node's seed, not the battle's, so the free Restart of a room cannot roll it again
export function nodeGold(n: CrawlNode): number {
  let rng = (n.seed ^ 0x601d) | 0; // salted: the room's layout starts from the bare seed
  const roll = ([lo, hi]: [number, number]) => {
    const [v, next] = rollInt(rng, lo, hi);
    rng = next;
    return v;
  };
  if (n.chest) return roll(CRAWL_RUN.chest);
  const { enemies } = roomGroup(n.seed, { depth: n.floor, boss: n.boss }).group;
  return enemies.reduce((sum, e) => sum + (Object.hasOwn(CRAWL_GOLD, e) ? roll(CRAWL_GOLD[e]) : 0), 0);
}

// the gold found on this descent: every cleared room's and opened chest's, read back from the path
export const descentGold = (exp: Expedition) => {
  const map = expeditionMap(exp.seed);
  return exp.path.reduce((sum, n) => sum + nodeGold(map[n]), 0);
};

// what goes to the town's gold when the descent ends: all of it alive, half rounded down when the whole party fell
// (Fernando's gold grill, Nov 15); the gold already in town stays
export const goldHome = (exp: Expedition, fell: boolean) =>
  fell ? Math.floor(descentGold(exp) / 2) : descentGold(exp);

// Trust boundary (the dt:crawl save): rebuilt field by field; null on any doubt, which means no expedition in progress
export function parseExpedition(raw: unknown): Expedition | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== CRAWL_VERSION || !Number.isInteger(r.seed) || !Array.isArray(r.path) || !Array.isArray(r.party))
    return null;
  const seed = r.seed as number;
  const map = expeditionMap(seed);
  const path: number[] = [];
  for (const n of r.path) {
    if (!openNodes(map, path).includes(n as number)) return null;
    path.push(n as number);
  }
  const party: CrawlHero[] = [];
  for (const h of r.party as unknown[]) {
    const { id, max, hp, manaMax, mana } = (h ?? {}) as Record<string, unknown>;
    if (typeof id !== 'string' || !id || party.some((p) => p.id === id)) return null;
    if (!Number.isInteger(max) || !Number.isInteger(hp) || (max as number) < 1 || (max as number) > 999) return null;
    if ((hp as number) < 1 || (hp as number) > (max as number)) return null;
    // mana only with its max (an older save has neither and enters full)
    if (manaMax === undefined && mana !== undefined) return null;
    if (manaMax !== undefined) {
      if (!Number.isInteger(manaMax) || (manaMax as number) < 1 || (manaMax as number) > 999) return null;
      if (!Number.isInteger(mana) || (mana as number) < 0 || (mana as number) > (manaMax as number)) return null;
    }
    party.push({
      id,
      max: max as number,
      hp: hp as number,
      ...(manaMax !== undefined && { manaMax: manaMax as number, mana: mana as number }),
    });
  }
  const bag = parseBag(r.bag);
  if (!bag) return null;
  return party.length >= 1 && party.length <= 4 ? { v: CRAWL_VERSION, seed, path, party, bag } : null;
}
