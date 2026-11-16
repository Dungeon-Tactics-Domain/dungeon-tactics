// Procedural rooms for the dungeon crawl (Nov 15, Fernando: a new mode apart from Beacon Ashes, with rooms made by rules).
// A room is a plain `Scenario` in whole tiles: heroes on one side, one enemy group on the other, height, water, ramps and
// obstacles between them. The client splits it like any battle (half.ts). Pure and deterministic: the same seed and
// options always give the same room, drawn only through rng.ts.
import { CRAWL_BOSS, CRAWL_GROUPS, CRAWL_PARTY, CRAWL_THEMES } from '../../content/crawl/rooms.ts';
import { dist, FACING, type Tile } from '../battle/grid.ts';
import { rollInt } from '../battle/rng.ts';
import type { Scenario, Spawn } from '../battle/scenarios.ts';
import type { Pos } from '../battle/types.ts';
import { UNIT_DEFS } from '../battle/units.ts';
import { startRange, verifyRoom } from './verify.ts';

// In every room id: a change that gives other rooms for the same seed bumps it, so a save of an older room starts over.
// crawl4 (Nov 15): life and damage x5, so an expedition saved at the old scale (max life 42) is dropped, not carried;
// crawl5 (Nov 16): a chest node on every floor, so the same seed gives another map;
// crawl6 (Nov 16, the trajectory grill): the checks shoot with the realistic path, so some seeds keep another layout
export const CRAWL_VERSION = 'crawl6';
export interface RoomGroup {
  name: [string, string];
  depth: number;
  enemies: string[];
}
export interface CrawlTheme {
  floors: string[]; // floor look by height level (the last one for anything higher)
  props: Partial<Tile>[]; // obstacles: a terrain and its look
  border: Partial<Tile>[]; // what closes the room along its border, like Ash Wood's trees: trees, rock walls
  road?: string; // floor look of a winding road from the heroes' side to the far one, like Ash Wood's sand road
  hazard?: Partial<Tile>; // up to 6 spike tiles
}
export interface RoomOptions {
  depth?: number;
  boss?: boolean;
  theme?: string;
}
// the theme ends the room id (the client picks the room's mood by it)
export const roomTheme = (id: string) => (id.startsWith(`${CRAWL_VERSION}-`) ? id.slice(id.lastIndexOf('-') + 1) : '');

// layouts drawn per room before giving up; the 500 test seeds need at most 11, 1.8 on average, ~75 ms a room (Nov 15)
const TRIES = 200;
// room side in whole tiles: 24x24 half tiles like Ash Wood, 28x28 for the boss (Nov 15, Fernando; the lab's descida.json)
const SIDE = 12,
  BOSS_SIDE = 14;

export const generateRoom = (seed: number, opts: RoomOptions = {}): Scenario => buildRoom(seed, opts).room;

// The room and how many layouts it took: each one is drawn from the same seeded stream and kept only if verifyRoom passes
const depthOf = (opts: RoomOptions) => Math.min(99, Math.max(1, Math.trunc(opts.depth ?? 1) || 1));
const themeOf = (opts: RoomOptions) => (opts.theme && Object.hasOwn(CRAWL_THEMES, opts.theme) ? opts.theme : 'dungeon');
// the id of the room a seed builds, known before building it (the title's Continue looks the saved room up by it)
export const roomId = (seed: number, opts: RoomOptions = {}) =>
  `${CRAWL_VERSION}-${seed | 0}-d${depthOf(opts)}${opts.boss ? '-boss' : ''}-${themeOf(opts)}`;

// The enemy group a room will hold, without laying it out: the expedition map shows it on the node before the fight. It is
// the first draw of the room's stream, so buildRoom goes on from `rng` and the pinned rooms keep their layout
export function roomGroup(seed: number, opts: RoomOptions = {}): { group: Omit<RoomGroup, 'depth'>; rng: number } {
  if (opts.boss) return { group: CRAWL_BOSS, rng: seed | 0 };
  const depth = depthOf(opts);
  const tier = Math.max(...CRAWL_GROUPS.filter((g) => g.depth <= depth).map((g) => g.depth));
  const pool = CRAWL_GROUPS.filter((g) => g.depth === tier);
  const [i, rng] = rollInt(seed | 0, 0, pool.length - 1);
  return { group: pool[i], rng };
}

export function buildRoom(seed: number, opts: RoomOptions = {}): { room: Scenario; tries: number } {
  const theme = themeOf(opts);
  let { group, rng } = roomGroup(seed, opts);
  const int = (lo: number, hi: number) => {
    const [v, next] = rollInt(rng, lo, hi);
    rng = next;
    return v;
  };
  const id = roomId(seed, opts);
  for (let tries = 1; tries <= TRIES; tries++) {
    const laid = layout(int, opts.boss ? BOSS_SIDE : SIDE, group.enemies, CRAWL_THEMES[theme]);
    if (!laid) continue;
    const room: Scenario = { id, name: group.name[0], en: group.name[1], ...laid };
    if (!verifyRoom(room).length) return { room, tries };
  }
  throw new Error(`crawl: no room passed the checks for seed ${seed}`);
}

// One N x N layout, or null when the units do not fit. Heroes in a band of 2 rows (4 half tiles) with 2 rows behind
// them, enemies ahead at the lab's starting distance; the extra width and the back rows are room to flank
function layout(int: (lo: number, hi: number) => number, N: number, enemies: string[], theme: CrawlTheme) {
  const hero = int(0, 1);
  const foe = hero + int(0, 1); // the enemy side may hold ground 1 level up, never more
  const edge = Array.from({ length: N }, () => int(4, N - 4)); // where the enemy level ends, column by column
  const tiles: Tile[] = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) tiles.push({ terrain: 'floor', h: y < edge[x] ? foe : hero });
  const at = (p: Pos) => tiles[p.y * N + p.x];
  const rect = (x0: number, y0: number, w: number, h: number) => {
    const out: Tile[] = [];
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) out.push(at({ x, y }));
    return out;
  };
  const middle = (h: number) => int(2, N - 2 - h); // a top row that keeps a feature between the two bands

  // 2 to 4 mounds (1 or 2 on the first 16x16 half-tile room, scaled by area); a step up inside one makes a high point with drops of 2 on its far sides (the jump-2 shortcut)
  for (let m = int(2, 4); m > 0; m--) {
    const w = int(2, 3),
      h = int(2, 3),
      x0 = int(0, N - w),
      y0 = middle(h);
    for (const t of rect(x0, y0, w, h)) t.h = Math.min(3, t.h + 1);
    if (int(0, 1) || at({ x: x0, y: y0 }).h < 2)
      for (const t of rect(x0 + 1, y0 + 1, w - 1, h - 1)) t.h = Math.min(3, t.h + 1);
  }
  // up to 2 small pools on flat ground (at most 6 tiles each: under 15%), sunk 1 level; deep 1 time in 4
  for (let k = int(0, 2); k > 0; k--) {
    const w = int(1, 3),
      h = int(1, 2),
      pool = rect(int(0, N - w), middle(h), w, h),
      depth = int(0, 3) ? 1 : 2;
    if (pool.every((t) => t.h === pool[0].h))
      for (const t of pool) Object.assign(t, { h: Math.max(0, t.h - 1), depth, look: 'water' });
  }
  // obstacles between the sides, then the place's spikes
  for (let k = int(N - 3, N + 2); k > 0; k--) {
    const t = at({ x: int(0, N - 1), y: int(2, N - 3) });
    if (!t.look) Object.assign(t, theme.props[int(0, theme.props.length - 1)]);
  }
  if (theme.hazard)
    for (let k = int(0, 6); k > 0; k--) {
      const t = at({ x: int(1, N - 2), y: int(2, N - 3) });
      if (!t.look) Object.assign(t, theme.hazard);
    }
  // the border closed in places, 3 tiles in 5, and always in the corners (a free corner between two closed tiles is cut
  // off): a room inside a wood or a cave, not a slab in the void
  for (let i = 0; i < N * N; i++) {
    const x = i % N,
      y = Math.floor(i / N),
      side = x === 0 || x === N - 1;
    if ((side || y === 0 || y === N - 1) && ((side && (y === 0 || y === N - 1)) || int(0, 4) < 3) && !tiles[i].look)
      Object.assign(tiles[i], theme.border[int(0, theme.border.length - 1)]);
  }

  // starting tiles: plain ground at the side's level, inside the border, not beside a drop of 2 or spikes
  const near = (p: Pos) =>
    FACING.map((f) => ({ x: p.x + f.x, y: p.y + f.y })).filter((q) => q.x >= 0 && q.y >= 0 && q.x < N && q.y < N);
  const plain = (p: Pos, level: number) => {
    const t = at(p);
    return (
      t.terrain === 'floor' &&
      !t.depth &&
      !t.spikes &&
      t.h === level &&
      near(p).every((q) => at(q).h > level - 2 && !at(q).spikes)
    );
  };
  const band = (y0: number, y1: number, level: number) => {
    const out: Pos[] = [];
    for (let y = y0; y <= y1; y++) for (let x = 1; x < N - 1; x++) if (plain({ x, y }, level)) out.push({ x, y });
    return out;
  };
  const pick = (from: Pos[], ok: (p: Pos) => boolean): Pos | null => {
    const fit = from.filter(ok);
    return fit.length ? fit[int(0, fit.length - 1)] : null;
  };
  const spawns: Spawn[] = [];
  const taken: Pos[] = []; // every tile a unit stands on
  for (const def of CRAWL_PARTY) {
    const p = pick(band(N - 4, N - 3, hero), (q) => taken.every((t) => dist(q, t) >= 2));
    if (!p) return null;
    spawns.push({ id: `h-${def}`, def, team: 'hero', ...p });
    taken.push(p);
  }
  const heroes = [...taken];
  const gapTo = (tiles: Pos[]) => Math.min(...tiles.flatMap((p) => heroes.map((q) => dist(p, q))));
  const square = (p: Pos, size: number) =>
    Array.from({ length: size * size }, (_, k) => ({ x: p.x + (k % size), y: p.y + Math.floor(k / size) }));
  for (const [i, def] of enemies.entries()) {
    const size = UNIT_DEFS[def].size ?? 1;
    const [lo, hi] = startRange(def);
    // the Colossus on a dais at the back (rows 1 and 2), one level up: the lab's boss stands "at the back and high", 16
    // to 20 half tiles from the heroes, past its spells' reach of 2 to 5 tiles, so the fight is the walk in under them
    const from =
      size > 1
        ? band(1, 1, foe).filter((p) => p.x < N - 2 && square(p, 2).every((q) => plain(q, foe)))
        : band(1, N - 6, foe);
    const p = pick(from, (q) => {
      const own = square(q, size);
      const d = gapTo(own);
      return d >= lo && d <= hi && own.every((o) => taken.every((t) => dist(o, t) >= 2));
    });
    if (!p) return null;
    const own = square(p, size);
    if (size > 1) for (const q of own) at(q).h = Math.min(3, foe + 1);
    spawns.push({ id: `e${i}-${def}`, def, team: 'enemy', ...p });
    taken.push(...own);
  }

  // ramps on half the steps of 1 between two plain tiles (drawing; the rules read only the height), never under a unit
  for (let i = 0; i < tiles.length; i++) {
    const p = { x: i % N, y: Math.floor(i / N) },
      t = tiles[i];
    if (t.terrain !== 'floor' || t.depth || t.spikes || taken.some((q) => dist(p, q) === 0)) continue;
    const up = FACING.flatMap((f, d) => {
      const q = { x: p.x + f.x, y: p.y + f.y };
      if (q.x < 0 || q.y < 0 || q.x >= N || q.y >= N) return [];
      const n = at(q);
      return n.terrain === 'floor' && !n.depth && !n.spikes && n.h === t.h + 1 ? [d] : [];
    });
    if (up.length && int(0, 1)) t.ramp = [up[int(0, up.length - 1)], 1];
  }
  // the road is look only: 2 tiles wide, drifting a column at a time, over plain floor
  if (theme.road)
    for (let y = N - 1, x = int(2, N - 4); y >= 0; y--, x = Math.min(N - 3, Math.max(1, x + int(-1, 1))))
      for (const t of [at({ x, y }), at({ x: x + 1, y })]) if (t.terrain === 'floor' && !t.look) t.look = theme.road;
  for (const t of tiles) t.look ??= theme.floors[Math.min(t.h, theme.floors.length - 1)];
  return { grid: { width: N, height: N, tiles }, spawns };
}
