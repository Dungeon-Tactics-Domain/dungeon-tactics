// The map builder's document (Nov 25, docs/game-design/map-builder.md): a whole-tile map, terrain only, plain data the
// builder edits, saves and exports. Built from a live battle, which runs split in half tiles, or blank. Units are not
// the map's (Fernando, Nov 25: "o map builder nao deve ter a ver com as unidades"); they live in battle.ts.
import type { Grid, Tile } from '../battle/grid.ts';
import { HALF, SUB } from '../battle/half.ts';
import { SCENARIOS, type Scenario } from '../battle/scenarios.ts';
import type { Pos } from '../battle/types.ts';

export interface MapDoc {
  id: string;
  name: string; // Portuguese
  en: string; // English; starts as a copy of the Portuguese (Fernando, Nov 25)
  width: number;
  height: number;
  tiles: Tile[];
}

// spec: width and height of 4 to 24 tiles, heights 0 to 9 (one digit per tile in the H rows)
export const SIZE = [4, 24] as const;
export const MAX_H = 9;
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const index = (d: { width: number }, p: Pos) => p.y * d.width + p.x;
export const inside = (d: { width: number; height: number }, p: Pos) =>
  p.x >= 0 && p.y >= 0 && p.x < d.width && p.y < d.height;

// a played map's own id (play.ts), so a map started from Ash Wood never overwrites `ash_wood½` nor opens its save
export const PLAY_PREFIX = 'mapedit_';

export const plainTile = (h = 0): Tile => ({ terrain: 'floor', look: 'grass', h });

// The tile as the builder keeps it: the rules' and the drawing's fields in one order, without the half-tile drawing
// marks (tree, span), so equal tiles compare and export equal
export function cleanTile(t: Tile): Tile {
  return {
    terrain: t.terrain,
    ...(t.look !== undefined && { look: t.look }),
    ...(t.depth !== undefined && { depth: t.depth }),
    ...(t.spikes && { spikes: true as const }),
    ...(t.noStop && { noStop: true as const }),
    h: clamp(t.h, 0, MAX_H),
    ...(t.ramp && { ramp: [t.ramp[0], t.ramp[1]] as [number, number] }),
  };
}
// the tile's kind (all but height and ramp): one palette entry, one KEY letter in the .ts export
export const kindKey = (t: Tile) => {
  const { h, ramp, ...kind } = cleanTile(t);
  return JSON.stringify(kind);
};

export function blankDoc(width: number, height: number, id = 'new_map', name = 'Novo mapa'): MapDoc {
  const w = clamp(Math.trunc(width) || SIZE[0], ...SIZE),
    h = clamp(Math.trunc(height) || SIZE[0], ...SIZE);
  return { id, name, en: name, width: w, height: h, tiles: Array.from({ length: w * h }, () => plainTile()) };
}

// A half grid back to whole tiles: each tile is the top-left cell of its 2x2, with the ramp of whichever cell kept it
// (split leaves it only on the cell beside the higher tile). Exact for a grid split by halve; the half test map's own
// trees and props (registerHalf) sit on single cells and are lost
export function unsplit(g: Grid): Grid {
  const width = g.width / SUB,
    height = g.height / SUB,
    tiles: Tile[] = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const cells = [0, 1, 2, 3].map((k) => g.tiles[(y * SUB + (k >> 1)) * g.width + x * SUB + (k & 1)]);
      const { span, tree, ramp, ...t } = cells[0];
      const kept = cells.find((c) => c.ramp)?.ramp;
      tiles.push(kept ? { ...t, ramp: [kept[0], kept[1]] } : t);
    }
  return { width, height, tiles };
}

// The whole-tile scenario behind a battle, and how many cells per tile its spawns are counted in. A live battle is the
// `<id>½` copy halve made: its whole source is still registered under `<id>` for game maps, crawl and expedition rooms
// and the developer battle; without it, the half grid is un-split
export function wholeSource(sc: Scenario): { id: string; scenario: Scenario; cells: number } {
  const halved = (sc.grid.sub ?? 1) > 1;
  const id = sc.id.endsWith(HALF) ? sc.id.slice(0, -HALF.length) : sc.id;
  const own = id.startsWith(PLAY_PREFIX) ? id.slice(PLAY_PREFIX.length) : id;
  if (!halved) return { id: own, scenario: sc, cells: 1 };
  if (Object.hasOwn(SCENARIOS, id) && (SCENARIOS[id].grid.sub ?? 1) === 1)
    return { id: own, scenario: SCENARIOS[id], cells: 1 };
  return { id: own, scenario: { ...sc, grid: unsplit(sc.grid) }, cells: SUB };
}

// The map of a battle, terrain only (battle.ts battleFromScenario reads its units)
export function docFromScenario(sc: Scenario): MapDoc {
  const { id, scenario } = wholeSource(sc);
  const { grid } = scenario;
  return {
    id,
    name: scenario.name,
    en: scenario.en,
    width: grid.width,
    height: grid.height,
    tiles: grid.tiles.map(cleanTile),
  };
}
