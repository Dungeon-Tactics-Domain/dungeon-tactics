import { describe, expect, it } from 'vitest';
import { chart, goldRange, placeStates } from '../src/client/expedition-places.ts';
import { CRAWL_RUN } from '../src/content/crawl/rooms.ts';
import { cleared, expeditionMap, nodeGold, openNodes } from '../src/shared/crawl/expedition.ts';

const SEEDS = Array.from({ length: 40 }, (_, i) => i * 7919 + 3);
const lead = (map: ReturnType<typeof expeditionMap>, floor = 1) =>
  map.findIndex((n) => n.floor === floor && n.next.some((c) => map[c].chest));
const count = (states: string[], s: string) => states.filter((x) => x === s).length;

describe('expedition map chart', () => {
  it('starts with the first row open, everything else ahead and the party at the gate', () => {
    const map = expeditionMap(77);
    const c = chart(map, []);
    const open = openNodes(map, []);
    expect(c.places.filter((p) => p.state === 'open').map((p) => p.node)).toEqual(open);
    expect(c.places.every((p) => p.state === 'open' || p.state === 'ahead')).toBe(true);
    expect(c.party).toEqual(c.gate);
    // the gate leads to every room of the first row, and nowhere else
    expect(c.links.filter((l) => l.from === c.gate).map((l) => l.kind)).toEqual(open.map(() => 'open'));
  });

  it('closes the other rooms of a row once one is taken, and the chest when its room was not the one', () => {
    const map = expeditionMap(77);
    const chest = map[lead(map)].next.find((c) => map[c].chest)!;
    const other = openNodes(map, []).find((i) => i !== lead(map))!;
    const states = placeStates(map, [other]);
    expect(states[other]).toBe('cleared');
    expect(states[lead(map)]).toBe('skipped');
    expect(states[chest]).toBe('skipped');
    expect(count(states, 'open')).toBe(map[other].next.length);
  });

  it('opens the chest beside the next row after the room that leads to it, and closes it once the party walks on', () => {
    const map = expeditionMap(77);
    const chest = map[lead(map)].next.find((c) => map[c].chest)!;
    const row1 = map[chest].next[0];
    expect(placeStates(map, [lead(map)])[chest]).toBe('open');
    expect(placeStates(map, [lead(map)])[row1]).toBe('open');
    expect(placeStates(map, [lead(map), row1])[chest]).toBe('skipped');
    expect(placeStates(map, [lead(map), chest, row1])[chest]).toBe('cleared');
  });

  it('agrees with openNodes at every step of a whole descent', () => {
    for (const seed of SEEDS) {
      const map = expeditionMap(seed);
      const path: number[] = [];
      while (!cleared(map, path)) {
        const open = openNodes(map, path);
        const c = chart(map, path);
        expect(c.places.filter((p) => p.state === 'open').map((p) => p.node)).toEqual([...open].sort((a, b) => a - b));
        expect(c.places.filter((p) => p.state === 'cleared').map((p) => p.node)).toEqual(
          [...path].sort((a, b) => a - b),
        );
        // one walked way per step taken (the first from the gate), one open way per place the party may enter
        expect(
          count(
            c.links.map((l) => l.kind),
            'walked',
          ),
        ).toBe(path.length);
        expect(
          count(
            c.links.map((l) => l.kind),
            'open',
          ),
        ).toBe(open.length);
        expect(c.party).toEqual(path.length ? c.places[path[path.length - 1]].at : c.gate);
        path.push(open[open.length - 1]);
      }
    }
  });

  it('gives every place a spot of its own inside the chart, each floor below the one before', () => {
    for (const seed of SEEDS) {
      const map = expeditionMap(seed);
      const c = chart(map, []);
      expect(new Set(c.places.map((p) => p.at.join())).size).toBe(map.length);
      for (const p of c.places) {
        expect(p.at[0]).toBeGreaterThan(0);
        expect(p.at[0]).toBeLessThan(1);
        expect(p.at[1]).toBeGreaterThan(0);
        expect(p.at[1]).toBeLessThan(c.rows);
        // a way always leads down the chart
        for (const n of map[p.node].next) expect(c.places[n].at[1]).toBeGreaterThan(p.at[1]);
      }
      expect(c.floors.map((f) => f.floor)).toEqual(Array.from({ length: CRAWL_RUN.floors }, (_, i) => i + 1));
      c.floors.forEach((f, i) => {
        expect(f.from).toBe(i ? c.floors[i - 1].to + 1 : 1);
      });
      expect(c.floors[c.floors.length - 1].to).toBe(c.rows - 1);
    }
  });

  it('puts the chest at the edge, on the side of the room that leads to it', () => {
    for (const seed of SEEDS) {
      const map = expeditionMap(seed);
      const c = chart(map, []);
      map.forEach((n, i) => {
        if (!n.chest) return;
        const from = c.places[map.findIndex((m) => m.next.includes(i))].at[0];
        const rooms = c.places.filter((p) => !map[p.node].chest).map((p) => p.at[0]);
        if (from < 0.5) expect(c.places[i].at[0]).toBeLessThan(Math.min(...rooms));
        else expect(c.places[i].at[0]).toBeGreaterThan(Math.max(...rooms));
      });
    }
  });

  it("says a place's gold as a range the roll always falls in", () => {
    for (const seed of SEEDS)
      for (const n of expeditionMap(seed)) {
        const [lo, hi] = goldRange(n);
        expect(nodeGold(n)).toBeGreaterThanOrEqual(lo);
        expect(nodeGold(n)).toBeLessThanOrEqual(hi);
        if (n.chest) expect([lo, hi]).toEqual(CRAWL_RUN.chest);
      }
  });
});
