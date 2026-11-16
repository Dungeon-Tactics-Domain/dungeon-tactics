import { beforeAll, describe, expect, it } from 'vitest';
import { PAINT } from '../src/client/terrain.ts';
import { CRAWL_BOSS, CRAWL_GROUPS, CRAWL_PARTY, CRAWL_THEMES } from '../src/content/crawl/rooms.ts';
import { dist, FACING, inBounds, posKey, TERRAIN, type Tile, tileAt } from '../src/shared/battle/grid.ts';
import { halve } from '../src/shared/battle/half.ts';
import type { Scenario, Spawn } from '../src/shared/battle/scenarios.ts';
import type { Pos } from '../src/shared/battle/types.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';
import { buildRoom, CRAWL_VERSION, generateRoom, type RoomOptions, roomTheme } from '../src/shared/crawl/generate.ts';
import { startRange, verifyRoom } from '../src/shared/crawl/verify.ts';

// Crawl rooms (Nov 15, the new dungeon loop): the generator keeps a layout only when verifyRoom passes, so a room coming
// out says little by itself. The checks here are separate ones, written on whole tiles without the engine, plus a
// broken room for each verifier rule.
const THEMES = Object.keys(CRAWL_THEMES);
const optionsOf = (i: number): RoomOptions => ({ depth: 1 + (i % 4), boss: i % 10 === 0, theme: THEMES[i % 3] });
const sizeOf = (def: string) => UNIT_DEFS[def].size ?? 1;
const tilesOf = (s: Spawn) =>
  Array.from({ length: sizeOf(s.def) ** 2 }, (_, k) => ({
    x: s.x + (k % sizeOf(s.def)),
    y: s.y + Math.floor(k / sizeOf(s.def)),
  }));

// whole-tile flood fill, jump 1 by the surface, deep water closed: the lab's guaranteed path, without pathing.ts
function dryWalk(room: Scenario, from: Pos): Set<string> {
  const g = room.grid;
  const ok = (t: Tile) => TERRAIN[t.terrain].walkable && (t.depth ?? 0) < 2;
  const seen = new Set([posKey(from)]);
  const queue = [from];
  for (let i = 0; i < queue.length; i++)
    for (const f of FACING) {
      const p = queue[i],
        q = { x: p.x + f.x, y: p.y + f.y };
      if (!inBounds(g, q) || seen.has(posKey(q)) || !ok(tileAt(g, q))) continue;
      if (Math.abs(tileAt(g, q).h - tileAt(g, p).h) > 1) continue;
      seen.add(posKey(q));
      queue.push(q);
    }
  return seen;
}

describe('crawl rooms: 500 seeds', () => {
  let built: { room: Scenario; tries: number }[] = [];
  beforeAll(() => {
    built = Array.from({ length: 500 }, (_, i) => buildRoom(i, optionsOf(i)));
  }, 120_000);

  it('every seed gives a room within a few layouts', () => {
    // each layout that fails the checks costs one more; the cap is 200
    expect(Math.max(...built.map((b) => b.tries))).toBeLessThanOrEqual(15);
  });

  it('rooms have the lab size, heights 0 to 3, little water and few spikes', () => {
    built.forEach(({ room }, i) => {
      // 24x24 half tiles (28x28 for the boss), written as 12x12 (14x14) whole tiles
      const n = optionsOf(i).boss ? 14 : 12;
      expect([room.grid.width, room.grid.height], room.id).toEqual([n, n]);
      expect(room.grid.tiles.length).toBe(n * n);
      expect(
        room.grid.tiles.every((t) => t.h >= 0 && t.h <= 3 && Number.isInteger(t.h)),
        room.id,
      ).toBe(true);
      expect(room.grid.tiles.filter((t) => t.depth).length, room.id).toBeLessThanOrEqual(0.15 * n * n);
      expect(room.grid.tiles.filter((t) => t.spikes).length, room.id).toBeLessThanOrEqual(6);
      expect(
        room.grid.tiles.some((t) => t.h >= 2),
        room.id,
      ).toBe(true);
    });
  });

  it('ramps rise exactly 1 level onto plain ground, as on the handmade maps', () => {
    let ramps = 0;
    for (const { room } of built)
      room.grid.tiles.forEach((t, i) => {
        if (!t.ramp) return;
        ramps++;
        const g = room.grid,
          f = FACING[t.ramp[0]];
        const p = { x: i % g.width, y: Math.floor(i / g.width) };
        const up = { x: p.x + f.x, y: p.y + f.y };
        const where = `${room.id} ${p.x},${p.y}`;
        expect(t.terrain === 'floor' && !t.depth && !t.spikes && t.ramp[1] === 1, where).toBe(true);
        expect(inBounds(g, up), where).toBe(true);
        const u = tileAt(g, up);
        expect(u.terrain === 'floor' && !u.depth && u.h === t.h + 1, where).toBe(true);
      });
    expect(ramps).toBeGreaterThan(500);
  });

  it('the party and one group of the room depth start on plain ground inside the border, at the lab distance', () => {
    built.forEach(({ room }, i) => {
      const o = optionsOf(i);
      const heroes = room.spawns.filter((s) => s.team === 'hero');
      const foes = room.spawns.filter((s) => s.team === 'enemy');
      expect(heroes.map((s) => s.def)).toEqual(CRAWL_PARTY);
      const tier = Math.min(o.depth!, 3);
      const groups = o.boss ? [CRAWL_BOSS] : CRAWL_GROUPS.filter((g) => g.depth === tier);
      expect(
        groups.map((g) => g.enemies.join()),
        room.id,
      ).toContain(foes.map((s) => s.def).join());
      for (const s of room.spawns)
        for (const p of tilesOf(s)) {
          const t = tileAt(room.grid, p);
          expect(t.terrain === 'floor' && !t.depth && !t.spikes && !t.ramp, `${room.id} ${s.id}`).toBe(true);
          expect(t.h, `${room.id} ${s.id} flat`).toBe(tileAt(room.grid, s).h);
          expect(p.x > 0 && p.y > 0 && p.x < room.grid.width - 1 && p.y < room.grid.height - 1, s.id).toBe(true);
        }
      // each enemy 10 to 14 half tiles from the nearest hero, the Colossus 16 to 20
      for (const f of foes) {
        const d = Math.min(...heroes.flatMap((h) => tilesOf(f).map((p) => dist(h, p))));
        const [lo, hi] = startRange(f.def);
        expect(d, `${room.id} ${f.id}`).toBeGreaterThanOrEqual(lo);
        expect(d, `${room.id} ${f.id}`).toBeLessThanOrEqual(hi);
      }
    });
  });

  it('every hero walks to every enemy with jump 1 without swimming (whole-tile flood fill)', () => {
    for (const { room } of built)
      for (const h of room.spawns.filter((s) => s.team === 'hero')) {
        const seen = dryWalk(room, h);
        for (const f of room.spawns.filter((s) => s.team === 'enemy'))
          expect(
            tilesOf(f).some((p) => FACING.some((d) => seen.has(posKey({ x: p.x + d.x, y: p.y + d.y })))),
            `${room.id}: ${h.id} → ${f.id}`,
          ).toBe(true);
      }
  });

  it('the boss stands at the back, one level above the ground around it', () => {
    for (const { room } of built.filter((_, i) => optionsOf(i).boss)) {
      const c = room.spawns.find((s) => s.def === 'colossus')!;
      expect(c.y, room.id).toBe(1);
      expect(tileAt(room.grid, c).h, room.id).toBe(Math.min(3, tileAt(room.grid, { x: c.x, y: 0 }).h + 1));
    }
  });

  it('pins the first 25 rooms and their tries to the generator version', () => {
    // A change in the generator, the content tables or anything the checks walk with (pathing, half tiles, a unit's move
    // or size) gives other rooms for the same seeds: bump CRAWL_VERSION, so a saved room starts over, and re-pin.
    // FNV-1a of the JSON; the tries show which layout passed, the hash what it holds (3 boss rooms, depths 1 to 4)
    const first = built.slice(0, 25);
    let h = 0x811c9dc5;
    for (const ch of JSON.stringify(first)) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193);
    expect(CRAWL_VERSION).toBe('crawl6');
    expect(first.map((b) => b.tries).join(' ')).toBe('1 4 3 3 6 3 1 2 1 1 3 2 1 10 2 2 10 1 2 1 2 3 1 1 2');
    expect((h >>> 0).toString(16)).toBe('afacdded');
  });

  it('every tile, split into half tiles too, carries a look the smooth painted terrain draws', () => {
    // a look missing from PAINT falls back to KayKit blocks (scene/board.ts), the crude look these rooms had (Nov 15)
    for (const { room } of built.slice(0, 30)) {
      const half = halve({ ...room, id: 'crawl-look-test' });
      for (const t of [...room.grid.tiles, ...half.grid.tiles]) expect(t.look && t.look in PAINT, room.id).toBe(true);
    }
  });

  it('a room built again checks the same (verifyRoom keeps no state between rooms)', () => {
    for (const { room } of built.slice(0, 40)) expect(verifyRoom(room), room.id).toEqual([]);
  }, 30_000);
});

describe('crawl rooms: seeds and options', () => {
  it('the same seed and options give the same room; another seed, another room', () => {
    expect(generateRoom(7, { depth: 2 })).toEqual(generateRoom(7, { depth: 2 }));
    expect(generateRoom(7, { depth: 2 }).grid).not.toEqual(generateRoom(8, { depth: 2 }).grid);
  });

  it('cleans the options: depth to 1 or more, an unknown theme falls back to the dungeon', () => {
    expect(generateRoom(1, { depth: Number.NaN }).id).toBe(`${CRAWL_VERSION}-1-d1-dungeon`);
    expect(generateRoom(1, { depth: -4, theme: 'swamp' }).id).toBe(`${CRAWL_VERSION}-1-d1-dungeon`);
    expect(generateRoom(1, { depth: 9, boss: true, theme: 'mountain' }).id).toBe(`${CRAWL_VERSION}-1-d9-boss-mountain`);
    expect(roomTheme(`${CRAWL_VERSION}-1-d9-boss-mountain`)).toBe('mountain');
    expect(roomTheme('ash_wood')).toBe('');
  });
});

describe('verifyRoom: a broken room for each rule', () => {
  const good = generateRoom(1, { depth: 1 });
  const broken = (change: (r: Scenario) => void) => {
    const r = structuredClone(good);
    change(r);
    return verifyRoom(r);
  };
  const at = (r: Scenario, p: Pos) => r.grid.tiles[p.y * r.grid.width + p.x];
  const hero = (r: Scenario) => r.spawns.find((s) => s.team === 'hero')!;
  const foe = (r: Scenario) => r.spawns.find((s) => s.team === 'enemy')!;

  it('passes the room it starts from', () => {
    expect(verifyRoom(good)).toEqual([]);
  });

  it('an enemy next to a hero, and one too far', () => {
    expect(broken((r) => Object.assign(foe(r), { x: hero(r).x, y: hero(r).y - 1 })).join()).toMatch(
      /starts \d tiles from the nearest hero \(5 to 7\)/,
    );
    // one enemy in the far corner, the heroes in the near one: 8 tiles or more
    const corner = [
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 10, y: 9 },
      { x: 8, y: 10 },
    ];
    expect(
      broken((r) => {
        r.spawns = r.spawns.filter((s) => s.team === 'hero' || s.id === foe(r).id);
        Object.assign(foe(r), { x: 1, y: 1 });
        r.spawns.filter((s) => s.team === 'hero').forEach((h, k) => Object.assign(h, corner[k]));
      }).join(),
    ).toMatch(/starts \d\d tiles from the nearest hero \(5 to 7\)/);
  });

  it('a hero in deep water, on the border, beside a drop of 2, beside spikes', () => {
    expect(broken((r) => Object.assign(at(r, hero(r)), { depth: 2, look: 'water' })).join()).toMatch(/deep water/);
    expect(broken((r) => Object.assign(hero(r), { y: r.grid.height - 1 })).join()).toMatch(/border/);
    expect(
      broken((r) => {
        const h = hero(r);
        at(r, h).h = 3;
        at(r, { x: h.x + 1, y: h.y }).h = 1;
      }).join(),
    ).toMatch(/ledge/);
    expect(broken((r) => Object.assign(at(r, { x: hero(r).x, y: hero(r).y + 1 }), { spikes: true })).join()).toMatch(
      /next to spikes/,
    );
  });

  it('an enemy walled in, a tile cut off, a flat open room', () => {
    expect(
      broken((r) => {
        const f = foe(r);
        for (const d of FACING) at(r, { x: f.x + d.x, y: f.y + d.y }).terrain = 'wall';
      }).join(),
    ).toMatch(/cannot reach/);
    expect(
      broken((r) => {
        Object.assign(at(r, { x: 0, y: 0 }), { terrain: 'floor', depth: undefined, h: 1 });
        at(r, { x: 1, y: 0 }).terrain = 'wall';
        at(r, { x: 0, y: 1 }).terrain = 'wall';
      }).join(),
    ).toMatch(/tile 0,0 is cut off/);
    const flat = broken((r) => {
      r.grid.tiles = r.grid.tiles.map(() => ({ terrain: 'floor', h: 0 }));
    }).join();
    expect(flat).toMatch(/no high point/);
    expect(flat).toMatch(/stop a shot/);
    expect(flat).toMatch(/sees every hero/);
  });

  it('too much water, too many spikes, a tile too high, a boss on uneven ground', () => {
    expect(broken((r) => r.grid.tiles.slice(0, 24).forEach((t) => (t.depth = 1))).join()).toMatch(
      /water on \d+ tiles, more than 15%/,
    );
    expect(broken((r) => r.grid.tiles.slice(0, 7).forEach((t) => (t.spikes = true))).join()).toMatch(
      /spike tiles, more than 6/,
    );
    expect(broken((r) => (r.grid.tiles[0].h = 4)).join()).toMatch(/heights 0 to 3/);
    const boss = generateRoom(1, { boss: true });
    const c = boss.spawns.find((s) => s.def === 'colossus')!;
    const r = structuredClone(boss);
    at(r, { x: c.x + 1, y: c.y + 1 }).h -= 1;
    expect(verifyRoom(r).join()).toMatch(/not on even ground/);
  });

  it('a side with nobody, a unit off the map, on a wall, on top of another', () => {
    expect(broken((r) => (r.spawns = r.spawns.filter((s) => s.team === 'hero')))).toEqual(['a side has no units']);
    expect(broken((r) => (hero(r).x = -1)).join()).toMatch(/h-warrior at -1,\d: off the map/);
    expect(broken((r) => (at(r, hero(r)).terrain = 'wall')).join()).toMatch(/on ground nobody stands on/);
    const [a, b] = good.spawns;
    expect(broken((r) => Object.assign(r.spawns[1], { x: a.x, y: a.y })).join()).toMatch(
      new RegExp(`${b.id} at ${a.x},${a.y}: on top of another unit`),
    );
  });

  // A handmade 8x8 room that breaks one rule at a time: flat floor, a ramp of 1 up to a level-2 tile on the left,
  // the heroes in row 6 and one enemy 5 tiles up
  const handmade = (enemies: Spawn[], walls: Pos[] = []): Scenario => {
    const tiles: Tile[] = Array.from({ length: 64 }, () => ({ terrain: 'floor', h: 0 }));
    tiles[2 * 8].h = 1;
    tiles[3 * 8].h = 2;
    tiles[4 * 8].h = 1;
    for (const w of walls) tiles[w.y * 8 + w.x].terrain = 'wall';
    const heroes = CRAWL_PARTY.map((def, k): Spawn => ({ id: `h-${def}`, def, team: 'hero', x: 2 + k, y: 6 }));
    return {
      id: 'crawl-test',
      name: 'Teste',
      en: 'Test',
      grid: { width: 8, height: 8, tiles },
      spawns: [...heroes, ...enemies],
    };
  };
  const minion: Spawn = { id: 'e0-minion', def: 'minion', team: 'enemy', x: 3, y: 1 };

  it('a room with no cover fails only the cover rule', () => {
    expect(verifyRoom(handmade([minion]))).toEqual(['0 tiles stop a shot between the sides (min 2)']);
  });

  it('an archer that sees every hero fails only that rule', () => {
    // two walls hide the heroes from the minion in the corner, never from the archer in the middle. A row lower than
    // before the exact shot path of Nov 15: from the corner every line left through the wall below it, one tile in all
    const corner = { ...minion, x: 6 };
    const archer: Spawn = { id: 'e1-skeleton_archer', def: 'skeleton_archer', team: 'enemy', x: 3, y: 1 };
    const walls = [
      { x: 5, y: 3 },
      { x: 6, y: 3 },
    ];
    expect(verifyRoom(handmade([corner], walls))).toEqual([]);
    expect(verifyRoom(handmade([corner, archer], walls))).toEqual([
      'e1-skeleton_archer sees every hero from its start',
    ]);
  });
});
