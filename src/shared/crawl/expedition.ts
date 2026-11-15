// The expedition of the dungeon crawl (Nov 15, F2): floors of short rooms linked in a small graph, the party's life carried
// from room to room. Only the seed, the rooms cleared and the party's life are saved; the map comes back from the seed
// (rng.ts), so the same seed always gives the same floors and rooms.
import { CRAWL_RUN } from '../../content/crawl/rooms.ts';
import { rollInt } from '../battle/rng.ts';
import { CRAWL_VERSION } from './generate.ts';

export interface CrawlNode {
  floor: number; // 1 to CRAWL_RUN.floors; also the depth the room is drawn at
  row: number; // the boss is one more row after the last floor's
  seed: number; // the room's seed for generateRoom
  boss: boolean;
  next: number[]; // the rooms it leads to (all of the next row); none after the boss
}
export interface CrawlHero {
  id: string; // party member id (the client's group)
  max: number;
  hp: number;
}
export interface Expedition {
  v: string; // CRAWL_VERSION: another one gives other rooms for the same seed, so an older save is dropped
  seed: number;
  path: number[]; // rooms cleared, in order
  party: CrawlHero[];
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
  for (let floor = 1; floor <= CRAWL_RUN.floors; floor++)
    for (let row = 0; row < CRAWL_RUN.rows + (floor === CRAWL_RUN.floors ? 1 : 0); row++) {
      const boss = row === CRAWL_RUN.rows; // only on the last floor: one boss at the end of the expedition
      const ids = Array.from({ length: boss ? 1 : int(...CRAWL_RUN.width) }, (_, k) => nodes.length + k);
      for (const p of prev) nodes[p].next = [...ids];
      for (const _ of ids) nodes.push({ floor, row, seed: int(0, 2 ** 31 - 1), boss, next: [] });
      prev = ids;
    }
  return nodes;
}

// the rooms the party may enter now: the first row, then wherever the last cleared room leads
export const openNodes = (map: CrawlNode[], path: number[]): number[] =>
  path.length ? map[path[path.length - 1]].next : map.flatMap((n, i) => (n.floor === 1 && n.row === 0 ? [i] : []));

// the boss is down: the expedition is won
export const cleared = (map: CrawlNode[], path: number[]) => path.length > 0 && !map[path[path.length - 1]].next.length;

export const startExpedition = (seed: number, party: { id: string; max: number }[]): Expedition => ({
  v: CRAWL_VERSION,
  seed: seed | 0,
  path: [],
  party: party.map((h) => ({ ...h, hp: h.max })),
});

// rounded up, as the lab rounds the fallen (42 → 11): a heal on a small life never rounds to nothing
const share = (max: number, pct: number) => Math.ceil((max * pct) / 100);

// After a won room. `left`: each standing hero's life at the end, by member id; a hero missing from it fell and comes back
// at 25% without the room heal (the lab's reading, kept in the F2 order). Clearing a floor's last row leads down a floor:
// +50% to everyone, the fallen included. A room that is not open changes nothing.
export function winRoom(exp: Expedition, node: number, left: Record<string, number>): Expedition {
  const map = expeditionMap(exp.seed);
  if (!openNodes(map, exp.path).includes(node)) return exp;
  const down = map[node].next.some((n) => map[n].floor > map[node].floor);
  return {
    ...exp,
    path: [...exp.path, node],
    party: exp.party.map((h) => {
      const hp = Object.hasOwn(left, h.id)
        ? left[h.id] + share(h.max, CRAWL_RUN.roomHeal)
        : share(h.max, CRAWL_RUN.fallen);
      return { ...h, hp: Math.min(h.max, hp + (down ? share(h.max, CRAWL_RUN.floorHeal) : 0)) };
    }),
  };
}

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
    const { id, max, hp } = (h ?? {}) as Record<string, unknown>;
    if (typeof id !== 'string' || !id || party.some((p) => p.id === id)) return null;
    if (!Number.isInteger(max) || !Number.isInteger(hp) || (max as number) < 1 || (max as number) > 999) return null;
    if ((hp as number) < 1 || (hp as number) > (max as number)) return null;
    party.push({ id, max: max as number, hp: hp as number });
  }
  return party.length >= 1 && party.length <= 4 ? { v: CRAWL_VERSION, seed, path, party } : null;
}
