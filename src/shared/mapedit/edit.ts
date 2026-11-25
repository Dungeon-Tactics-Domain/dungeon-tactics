// Tile edits of the map builder: paint, height and ramps. Each returns a new document, or the same one when nothing
// changed, so the history records a step only for a real edit (history.ts).
import type { PaletteEntry } from '../../content/map-palette.ts';
import { canStand, FACING, isDeep, type Tile } from '../battle/grid.ts';
import type { Pos } from '../battle/types.ts';
import { clamp, cleanTile, index, inside, kindKey, MAX_H, type MapDoc } from './doc.ts';

// where a ramp may sit and what it may climb to, as the game maps and crawl rooms place them (scenario-maps test)
const rampBase = (t: Tile) => t.terrain === 'floor' && !t.depth && !t.spikes;
const rampTop = (t: Tile) => canStand(t) && !isDeep(t);
const sameTile = (a: Tile, b: Tile) => kindKey(a) === kindKey(b) && a.h === b.h && `${a.ramp}` === `${b.ramp}`;

// directions (FACING order) a ramp on `p` can rise toward, with the rise each would take
function rampDirs(doc: MapDoc, tiles: Tile[], p: Pos): [dir: number, rise: number][] {
  const t = tiles[index(doc, p)];
  if (!rampBase(t)) return [];
  return FACING.flatMap((f, d) => {
    const q = { x: p.x + f.x, y: p.y + f.y };
    if (!inside(doc, q)) return [];
    const n = tiles[index(doc, q)];
    return rampTop(n) && n.h > t.h ? [[d, n.h - t.h] as [number, number]] : [];
  });
}

// the ramp on tile i after its tile or a neighbour changed: the rise follows the step; gone when the step is
function fixAt(doc: MapDoc, tiles: Tile[], i: number): void {
  const t = tiles[i];
  if (!t.ramp) return;
  const dir = t.ramp[0];
  const hit = rampDirs(doc, tiles, { x: i % doc.width, y: Math.floor(i / doc.width) }).find(([d]) => d === dir);
  if (!hit) {
    const { ramp, ...flat } = t;
    tiles[i] = flat;
  } else if (hit[1] !== t.ramp[1]) tiles[i] = { ...t, ramp: [dir, hit[1]] };
}

// The changed tiles written in, then the ramps on and around them checked; the same document when nothing differs
export function withTiles(doc: MapDoc, changes: [i: number, t: Tile][]): MapDoc {
  const real = changes.filter(([i, t]) => !sameTile(doc.tiles[i], t));
  if (!real.length) return doc;
  const tiles = [...doc.tiles];
  for (const [i, t] of real) tiles[i] = t;
  const near = new Set<number>();
  for (const [i] of real) {
    near.add(i);
    for (const f of FACING) {
      const q = { x: (i % doc.width) + f.x, y: Math.floor(i / doc.width) + f.y };
      if (inside(doc, q)) near.add(index(doc, q));
    }
  }
  for (const i of near) fixAt(doc, tiles, i);
  return { ...doc, tiles };
}

// every ramp checked against its step (after a resize, or to confirm a map's ramps); same document when all hold
export function fixRamps(doc: MapDoc): MapDoc {
  const tiles = [...doc.tiles];
  tiles.forEach((_, i) => fixAt(doc, tiles, i));
  return tiles.every((t, i) => t === doc.tiles[i]) ? doc : { ...doc, tiles };
}

// The entry's kind over the tile, its height kept; a ramp stays if the new ground still takes it
export function paint(doc: MapDoc, p: Pos, entry: PaletteEntry): MapDoc {
  if (!inside(doc, p)) return doc;
  const old = doc.tiles[index(doc, p)];
  const { id, name, ...kind } = entry;
  return withTiles(doc, [[index(doc, p), cleanTile({ ...kind, h: old.h, ...(old.ramp && { ramp: old.ramp }) })]]);
}

export function setHeight(doc: MapDoc, p: Pos, h: number): MapDoc {
  if (!inside(doc, p)) return doc;
  const t = doc.tiles[index(doc, p)];
  return withTiles(doc, [[index(doc, p), { ...t, h: clamp(Math.trunc(h) || 0, 0, MAX_H) }]]);
}
export const raise = (doc: MapDoc, p: Pos, delta: number) =>
  inside(doc, p) ? setHeight(doc, p, doc.tiles[index(doc, p)].h + delta) : doc;

// The ramp tool: no ramp, then each higher neighbour in FACING order, then no ramp again (the way to erase one)
export function cycleRamp(doc: MapDoc, p: Pos): MapDoc {
  if (!inside(doc, p)) return doc;
  const i = index(doc, p),
    t = doc.tiles[i];
  const dirs = rampDirs(doc, doc.tiles, p);
  const at = t.ramp ? dirs.findIndex(([d]) => d === t.ramp![0]) : -1;
  const next = dirs[at + 1];
  if (next) return withTiles(doc, [[i, { ...t, ramp: next }]]);
  if (!t.ramp) return doc;
  const { ramp, ...flat } = t;
  return withTiles(doc, [[i, flat]]);
}

// Auto-ramps (spec): every one-level step on plain ground becomes a ramp toward the first higher neighbour in FACING
// order, as the hand-picked ramps of withRamps; steps of 2 or more stay drops, and ramps already placed stay
export function autoRamps(doc: MapDoc): MapDoc {
  const changes: [number, Tile][] = [];
  doc.tiles.forEach((t, i) => {
    if (t.ramp) return;
    const one = rampDirs(doc, doc.tiles, { x: i % doc.width, y: Math.floor(i / doc.width) }).find(([, r]) => r === 1);
    if (one) changes.push([i, { ...t, ramp: one }]);
  });
  return withTiles(doc, changes);
}
