// The expedition map as a chart (pure): where each place of the descent sits, what the party may do with it, how the
// places link and what a place pays, for game/expedition-map.ts to draw.
import { CRAWL_GOLD, CRAWL_RUN } from '../content/crawl/rooms.ts';
import { type CrawlNode, openNodes } from '../shared/crawl/expedition.ts';
import { roomGroup } from '../shared/crawl/generate.ts';

// cleared: on the path walked; open: the party may enter now; ahead: still reachable further down; skipped: no way
// leads there any more (another room of its row was taken, or the chest's room was not)
export type PlaceState = 'cleared' | 'open' | 'ahead' | 'skipped';
// walked: a step of the path; open: from the party to a place it may enter; ahead: a way still to come; off: closed for good
export type LinkKind = 'walked' | 'open' | 'ahead' | 'off';
export type Spot = [x: number, y: number]; // x from 0 to 1 across the chart, y in rows from the gate (row 0) down
export interface Place {
  node: number;
  at: Spot;
  state: PlaceState;
}
export interface Chart {
  rows: number; // the gate's row and one per row of places
  gate: Spot;
  party: Spot; // the last place cleared, the gate before the first
  places: Place[]; // by node, as expeditionMap gives them
  links: { from: Spot; to: Spot; kind: LinkKind }[];
  floors: { floor: number; from: number; to: number }[]; // the rows each floor takes, both ends included
}

export function placeStates(map: CrawlNode[], path: number[]): PlaceState[] {
  const open = openNodes(map, path);
  const ahead = new Set<number>();
  const visit = (i: number) => {
    for (const c of map[i].next)
      if (!ahead.has(c)) {
        ahead.add(c);
        visit(c);
      }
  };
  open.forEach(visit);
  return map.map((_, i) =>
    path.includes(i) ? 'cleared' : open.includes(i) ? 'open' : ahead.has(i) ? 'ahead' : 'skipped',
  );
}

const SIDE = 0.1; // the chest's column, at the edge of the chart: clear of the ways between the rows of rooms

export function chart(map: CrawlNode[], path: number[]): Chart {
  const states = placeStates(map, path);
  const gate: Spot = [0.5, 0];
  let y = 0;
  const spots = map.map((n, i): Spot => {
    const prev = map[i - 1];
    // the map lists a row's rooms together and the floor's chest right after its row: each run takes one row of the chart
    if (!prev || prev.floor !== n.floor || prev.row !== n.row || prev.chest !== n.chest) y++;
    return [0, y];
  });
  map.forEach((n, i) => {
    const row = map.flatMap((m, k) => (spots[k][1] === spots[i][1] && !m.chest ? [k] : []));
    if (!n.chest) spots[i][0] = (row.indexOf(i) + 1) / (row.length + 1);
  });
  // the chest on the side of the one room that leads to it, so that way crosses no other room
  map.forEach((n, i) => {
    if (n.chest) spots[i][0] = spots[map.findIndex((m) => m.next.includes(i))][0] < 0.5 ? SIDE : 1 - SIDE;
  });
  const links: Chart['links'] = [];
  map.forEach((n, i) => {
    if (n.floor === 1 && n.row === 0 && !n.chest)
      links.push({ from: gate, to: spots[i], kind: path[0] === i ? 'walked' : path.length ? 'off' : 'open' });
    const step = path.indexOf(i);
    for (const c of n.next)
      links.push({
        from: spots[i],
        to: spots[c],
        kind:
          step < 0
            ? states[i] === 'skipped'
              ? 'off'
              : 'ahead'
            : path[step + 1] === c
              ? 'walked'
              : step === path.length - 1
                ? 'open'
                : 'off',
      });
  });
  const floors = [...new Set(map.map((n) => n.floor))].map((floor) => {
    const ys = map.flatMap((n, i) => (n.floor === floor ? [spots[i][1]] : []));
    return { floor, from: Math.min(...ys), to: Math.max(...ys) };
  });
  return {
    rows: y + 1,
    gate,
    party: path.length ? spots[path[path.length - 1]] : gate,
    places: map.map((_, i) => ({ node: i, at: spots[i], state: states[i] })),
    links,
    floors,
  };
}

// The gold a place may pay, before it is won: the chest's range, or the sum of its enemies' drops (nodeGold rolls inside
// it); [0, 0] when none of them carries gold
export function goldRange(n: CrawlNode): [lo: number, hi: number] {
  if (n.chest) return CRAWL_RUN.chest;
  return roomGroup(n.seed, { depth: n.floor, boss: n.boss }).group.enemies.reduce<[number, number]>(
    ([lo, hi], e) => (Object.hasOwn(CRAWL_GOLD, e) ? [lo + CRAWL_GOLD[e][0], hi + CRAWL_GOLD[e][1]] : [lo, hi]),
    [0, 0],
  );
}
