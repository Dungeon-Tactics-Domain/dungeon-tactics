import { describe, expect, it } from 'vitest';
import { chart } from '../src/client/expedition-places.ts';
import { nextSpot, type WalkDir } from '../src/client/spot-walk.ts';
import { commandText, M, mapLayout, type PlaceKind } from '../src/client/town3d/map-layout.ts';
import { T } from '../src/client/town3d/town-layout.ts';
import { SCREEN } from '../src/client/ui3d/layout.ts';
import { expeditionMap } from '../src/shared/crawl/expedition.ts';

const SEEDS = Array.from({ length: 40 }, (_, i) => i * 7919 + 3);
const kinds = (map: ReturnType<typeof expeditionMap>): PlaceKind[] =>
  map.map((n) => (n.chest ? 'chest' : n.boss ? 'boss' : 'room'));
const lay = (seed: number, path: number[] = []) => {
  const map = expeditionMap(seed);
  return mapLayout(chart(map, path), kinds(map), 4, 3);
};

describe('3D expedition map layout', () => {
  it('keeps every place whole on the sheet, clear of the floor names, and no two places touching', () => {
    for (const seed of SEEDS) {
      const L = lay(seed),
        S = M.chart;
      for (const p of L.places) {
        expect(p.x - p.size / 2).toBeGreaterThanOrEqual(S.x + M.gutter - M.place);
        expect(p.x + p.size / 2).toBeLessThanOrEqual(S.x + S.w);
        expect(p.y - p.size / 2).toBeGreaterThanOrEqual(S.y);
        expect(p.y + p.size / 2).toBeLessThanOrEqual(S.y + S.h);
      }
      L.places.forEach((a, i) => {
        for (const b of L.places.slice(i + 1))
          expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual((a.size + b.size) / 2 + 8);
      });
    }
  });

  it('fits the whole descent with no scroll: the rows never step more than the reference and end inside the sheet', () => {
    for (const seed of SEEDS) {
      const L = lay(seed);
      expect(L.step).toBeLessThanOrEqual(M.step);
      expect(L.field.y + L.field.h).toBeLessThanOrEqual(M.chart.y + M.chart.h - M.pad + 0.001);
    }
  });

  it('draws the walked ways last, over the others', () => {
    const map = expeditionMap(77);
    const L = mapLayout(chart(map, [0]), kinds(map), 4, 3);
    const order = L.links.map((l) => l.kind);
    expect(order.lastIndexOf('off')).toBeLessThan(order.indexOf('walked'));
    expect(order.at(-1)).toBe('walked');
  });

  it('stands the flag beside the gate tag before the first room and over the place after it, on the sheet', () => {
    const start = lay(77);
    expect(start.flag).toEqual({ x: start.gate.x + 76, y: start.gate.y - 22 });
    expect(start.flag.y).toBeGreaterThanOrEqual(M.chart.y);
    const map = expeditionMap(77);
    const after = mapLayout(chart(map, [0]), kinds(map), 4, 3);
    expect(after.flag).toEqual({ x: after.places[0].x + 20, y: after.places[0].y - 56 });
  });

  it('seats the party two a row inside its panel and the commands on the town plaques, all on the screen', () => {
    const L = lay(77),
      P = M.party;
    expect(L.heroes).toHaveLength(4);
    for (const h of L.heroes) {
      expect(h.x).toBeGreaterThanOrEqual(P.x);
      expect(h.x + h.w).toBeLessThanOrEqual(P.x + P.w);
      expect(h.y + h.h).toBeLessThanOrEqual(P.y + P.h);
    }
    expect(L.heroes[1].y).toBe(L.heroes[0].y);
    expect(L.heroes[2].y).toBeGreaterThan(L.heroes[0].y + L.heroes[0].h);
    expect(L.commands.map((c) => c.y)).toEqual([0, 1, 2].map((i) => T.plaque.y + i * (T.plaque.h + T.plaque.gap)));
    for (const c of L.commands) expect(c.x + c.w).toBeLessThanOrEqual(M.chart.x);
    expect(M.info.x + M.info.w).toBeLessThanOrEqual(SCREEN.w);
  });
});

// the cursor on the chart: the buttons sit where the layout puts the places and the commands (map3d.ts seats them)
describe('3D expedition map walked by the arrows', () => {
  const DIRS: WalkDir[] = ['up', 'down', 'left', 'right'];
  const spots = (seed: number, path: number[] = []) => {
    const L = lay(seed, path);
    const boxes = [
      ...L.places.map((p) => ({ x: p.x - p.size / 2, y: p.y - p.size / 2, width: p.size, height: p.size })),
      ...L.commands.map((c) => ({ x: c.x, y: c.y, width: c.w, height: c.h })),
    ];
    return { L, boxes };
  };

  it('reaches every place and every command from the first place, on every descent', () => {
    for (const seed of SEEDS) {
      const { boxes } = spots(seed);
      const seen = new Set([0]);
      const todo = [0];
      while (todo.length) {
        const at = todo.pop()!;
        for (const d of DIRS) {
          const to = nextSpot(boxes, at, d);
          if (!seen.has(to)) {
            seen.add(to);
            todo.push(to);
          }
        }
      }
      expect([seed, seen.size]).toEqual([seed, boxes.length]);
    }
  });

  it('never moves on a slant or against the arrow: up and down keep the column, left and right the row', () => {
    for (const seed of SEEDS) {
      const { L, boxes } = spots(seed);
      const n = L.places.length;
      const mid = (i: number) => [boxes[i].x + boxes[i].width / 2, boxes[i].y + boxes[i].height / 2];
      boxes.forEach((_, i) => {
        for (const d of DIRS) {
          const to = nextSpot(boxes, i, d);
          if (to === i) continue;
          const [dx, dy] = [mid(to)[0] - mid(i)[0], mid(to)[1] - mid(i)[1]];
          const ahead = { up: -dy, down: dy, left: -dx, right: dx }[d];
          const off = Math.abs(d === 'up' || d === 'down' ? dx : dy);
          expect([seed, i, d, ahead > 0]).toEqual([seed, i, d, true]);
          // place to place and plaque to plaque: dead straight; a plaque and a place: level with each other
          const straight = i < n === to < n;
          expect([seed, i, d, off <= (straight ? 0.001 : (T.plaque.h + M.boss) / 2)]).toEqual([seed, i, d, true]);
        }
      });
    }
  });

  it('goes down to the boss from the room over it in the last row, and up from the boss to that room', () => {
    for (const seed of SEEDS) {
      const { L, boxes } = spots(seed);
      const boss = L.places.findIndex((p) => p.kind === 'boss');
      const rooms = L.places.flatMap((p, i) => (p.kind === 'room' ? [i] : []));
      const lastY = Math.max(...rooms.map((i) => L.places[i].y));
      const over = rooms.find((i) => L.places[i].y === lastY && L.places[i].x === L.places[boss].x);
      expect([seed, over !== undefined]).toEqual([seed, true]);
      expect([seed, nextSpot(boxes, over!, 'down')]).toEqual([seed, boss]);
      expect([seed, nextSpot(boxes, boss, 'up')]).toEqual([seed, over]);
      expect(nextSpot(boxes, boss, 'down')).toBe(boss);
    }
  });

  it("stands the rooms in columns with every row on the spine, the gate over it, and each chest in its room's row", () => {
    for (const seed of SEEDS) {
      const L = lay(seed);
      const rows = new Map<number, number[]>();
      for (const p of L.places) if (p.kind !== 'chest') rows.set(p.y, [...(rows.get(p.y) ?? []), p.x]);
      for (const xs of rows.values()) expect([seed, xs.includes(L.gate.x)]).toEqual([seed, true]);
      expect(L.places.find((p) => p.kind === 'boss')!.x).toBe(L.gate.x);
      for (const p of L.places) if (p.kind === 'chest') expect([seed, rows.has(p.y)]).toEqual([seed, true]);
    }
  });

  it('goes left and right to the neighbour in the same row when there is one', () => {
    for (const seed of SEEDS) {
      const { L, boxes } = spots(seed);
      L.places.forEach((p, i) => {
        const row = L.places.flatMap((q, k) => (q.y === p.y ? [k] : [])).sort((a, b) => L.places[a].x - L.places[b].x);
        const at = row.indexOf(i);
        if (row[at - 1] !== undefined) expect([seed, i, nextSpot(boxes, i, 'left')]).toEqual([seed, i, row[at - 1]]);
        if (row[at + 1] !== undefined) expect([seed, i, nextSpot(boxes, i, 'right')]).toEqual([seed, i, row[at + 1]]);
      });
    }
  });
});

describe('3D expedition map command text', () => {
  it('leaves the help band to the picked place for a plain command', () => {
    expect(commandText('Travel', '', false)).toEqual({ plaque: 'Travel', help: '' });
  });
  it('says why a command is off', () => {
    expect(commandText('Travel', 'clear the room before it', false)).toEqual({
      plaque: 'Travel',
      help: 'Travel: clear the room before it',
    });
  });
  it('keeps the word before the colon on an armed plaque and the whole sentence on the band', () => {
    expect(commandText('Confirm: banks the gold and ends the expedition', '', true)).toEqual({
      plaque: 'Confirm',
      help: 'Confirm: banks the gold and ends the expedition',
    });
  });
});
