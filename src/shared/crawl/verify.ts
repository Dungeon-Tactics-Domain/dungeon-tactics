// Checks a crawl room (generate.ts) the way the game will play it: split into half tiles by `halve`, walked with the real
// `reachable`, shot at with the real `traceShot`. Returns the problems in words; an empty list is a good room. The numbers
// are the Mechanics lab's descent proposal of Nov 15 (dungeon-tactics-labs, web/src/content/mecanicas/descida.json).
import { ABILITIES } from '../battle/abilities.ts';
import { canStand, FACING, type Grid, inBounds, isDeep, posKey, tileAt } from '../battle/grid.ts';
import { halve, SUB } from '../battle/half.ts';
import { cellsOf, footprint, gap, reachable, restsOn } from '../battle/pathing.ts';
import { initialState, type Scenario, type Spawn } from '../battle/scenarios.ts';
import { traceShot } from '../battle/shot.ts';
import type { Pos, UnitState } from '../battle/types.ts';
import { UNIT_DEFS } from '../battle/units.ts';

// whole tiles from each enemy to the nearest hero at the start: 10 to 14 half tiles, contact on the 1st or 2nd turn, on
// the 24x24 room too (the extra room is for flanking); the Colossus, which does not walk, 16 to 20 half tiles away. A
// ranged enemy may still hit on its first turn, which Fernando accepted on Nov 15 (enemies may act on turn 1)
export const NEAR = 5;
export const FAR = 7;
export const startRange = (def: string): [number, number] => (UNIT_DEFS[def].size ? [8, 10] : [NEAR, FAR]);
const MAX_WATER = 0.15; // of the tiles; deep water is never the only way through (the walk below closes it)
const MAX_SPIKES = 6; // 0 to 6 on the bigger room (the lab's descida.json)
const MAX_H = 3; // height levels 0 to 3
const HIGH = 2; // a high point both sides can climb to with jump 1
const MIN_COVER = 2; // tiles that stop a shot between the two sides at the start
const SCRATCH = 'crawl-verify'; // one scratch id for every check, so checking many seeds does not fill SCENARIOS

const sizeOf = (def: string) => UNIT_DEFS[def].size ?? 1;
const tilesOf = (s: Spawn) => cellsOf(s, sizeOf(s.def));

export function verifyRoom(room: Scenario): string[] {
  const out: string[] = [];
  const g0 = room.grid;
  const at = (p: Pos) => tileAt(g0, p);
  const heroes = room.spawns.filter((s) => s.team === 'hero');
  const foes = room.spawns.filter((s) => s.team === 'enemy');
  if (!heroes.length || !foes.length) return ['a side has no units'];

  // the map, on whole tiles as it is written
  const water = g0.tiles.filter((t) => t.depth).length;
  if (water > MAX_WATER * g0.tiles.length) out.push(`water on ${water} tiles, more than 15%`);
  const spikes = g0.tiles.filter((t) => t.spikes).length;
  if (spikes > MAX_SPIKES) out.push(`${spikes} spike tiles, more than ${MAX_SPIKES}`);
  if (g0.tiles.some((t) => t.h < 0 || t.h > MAX_H)) out.push(`a tile outside heights 0 to ${MAX_H}`);

  // where each unit starts: inside the border, not beside a drop of 2 or more (a push off it hurts) nor next to spikes
  for (const s of room.spawns) {
    const tiles = tilesOf(s);
    const where = `${s.id} at ${s.x},${s.y}`;
    if (tiles.some((p) => !inBounds(g0, p))) {
      out.push(`${where}: off the map`);
      continue;
    }
    if (tiles.some((p) => p.x === 0 || p.y === 0 || p.x === g0.width - 1 || p.y === g0.height - 1))
      out.push(`${where}: on the map border`);
    const around = tiles.flatMap((p) => FACING.map((f) => ({ x: p.x + f.x, y: p.y + f.y })));
    if (around.some((q) => inBounds(g0, q) && at(q).h <= at(s).h - 2)) out.push(`${where}: on a ledge`);
    if (around.some((q) => inBounds(g0, q) && at(q).spikes)) out.push(`${where}: next to spikes`);
  }
  // fair start: each enemy within its starting range of the nearest hero
  for (const f of foes) {
    const d = Math.min(...heroes.map((h) => gap(tilesOf(h), tilesOf(f))));
    const [lo, hi] = startRange(f.def);
    if (d < lo || d > hi) out.push(`${f.id} starts ${d} tiles from the nearest hero (${lo} to ${hi})`);
  }

  // the battle the client opens: the same split map and tokens, every unit walking with jump 1 (most classes; any class
  // may take a hero's place)
  const half = halve({ ...room, id: SCRATCH });
  half.rules = { jump: () => 1 };
  const g = half.grid;
  const state = initialState(half, 1);
  const units = state.units;
  const used = new Set<string>();
  for (const u of units) {
    const cells = footprint(u);
    const where = `${u.id} at ${u.pos.x / SUB},${u.pos.y / SUB}`;
    if (cells.some((c) => !inBounds(g, c) || !canStand(tileAt(g, c)))) {
      out.push(`${where}: on ground nobody stands on`);
      continue;
    }
    if (!restsOn(g, u.pos, sizeOf(u.def))) out.push(`${where}: not on even ground`);
    if (cells.some((c) => isDeep(tileAt(g, c)) || tileAt(g, c).spikes))
      out.push(`${where}: in deep water or on spikes`);
    if (cells.some((c) => used.has(posKey(c)))) out.push(`${where}: on top of another unit`);
    for (const c of cells) used.add(posKey(c));
  }
  if (out.length) return out; // the walks and shots below need a sound cast

  // stops of one unit walking alone (nobody in the way), its start included
  const dry: Grid = { ...g, tiles: g.tiles.map((t) => (isDeep(t) ? { ...t, terrain: 'wall' } : t)) };
  const walk = (grid: Grid, u: UnitState) => [
    u.pos,
    ...[...reachable(grid, { ...state, units: [u] }, u.id, 999).values()].map((s) => s.pos),
  ];
  const hs = units.filter((u) => u.team === 'hero');
  const es = units.filter((u) => u.team === 'enemy');
  const heroDry = hs.map((h) => walk(dry, h));
  // every hero reaches a stop beside every enemy with jump 1 and without swimming
  hs.forEach((h, i) => {
    for (const e of es)
      if (!heroDry[i].some((p) => gap(cellsOf(p, sizeOf(h.def)), footprint(e)) === 1))
        out.push(`${h.id} cannot reach ${e.id} with jump 1 on dry ground`);
  });
  // no tile cut off: every whole tile a token can stand on is a stop for the first hero, swimming allowed (a hero
  // shut in a pocket already fails its own walk above)
  const stops = new Set(walk(g, hs[0]).map(posKey));
  for (let y = 0; y < g.height; y += SUB)
    for (let x = 0; x < g.width; x += SUB) {
      const p = { x, y };
      const ok = cellsOf(p, SUB).every((c) => canStand(tileAt(g, c)) && !tileAt(g, c).noStop);
      if (ok && !stops.has(posKey(p))) out.push(`tile ${x / SUB},${y / SUB} is cut off`);
    }
  // a high point (level 2 or more) that both sides can stop on, outside the starting squares
  const high = (p: Pos) =>
    p.x % SUB === 0 && p.y % SUB === 0 && tileAt(g, p).h >= HIGH && cellsOf(p, SUB).every((c) => !used.has(posKey(c)));
  const heroHigh = new Set(heroDry.flat().filter(high).map(posKey));
  const walkers = es.filter((e) => UNIT_DEFS[e.def].move > 0);
  if (!walkers.some((e) => walk(dry, e).some((p) => heroHigh.has(posKey(p)))))
    out.push(`no high point (level ${HIGH}+) that both sides reach with jump 1`);

  // line of fire: tiles that stop a shot between the sides, and no shooting enemy sees every hero from its start. Each
  // enemy's own path (a bow's curve, else straight) with only the two of them on the map: the cover is the terrain's
  const blocks = new Set<string>();
  for (const e of es) {
    const shot = UNIT_DEFS[e.def].abilities.map((a) => ABILITIES[a]).find((a) => a.needsSight && a.range[1] > 1);
    let hidden = false;
    for (const h of hs) {
      const stop = traceShot(g, { ...state, units: [e, h] }, e, h.pos, !!shot?.arc).stop;
      if (stop) blocks.add(posKey(stop.pos));
      hidden ||= !!stop;
    }
    if (shot && !hidden) out.push(`${e.id} sees every hero from its start`);
  }
  if (blocks.size < MIN_COVER) out.push(`${blocks.size} tiles stop a shot between the sides (min ${MIN_COVER})`);
  return out;
}
