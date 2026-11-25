// Half tile (Nov 13, Fernando's request: "the characters occupy a square of 4 tiles 2x2, but movement is 1 tile at a time";
// later: "trees can be 3, 4, 5 wide… many kinds of tree"). Since Nov 14 ("the half-tile movement mechanic still doesn't exist",
// looking at stage 0) every game battle is played this way: `halve` divides the map into cells (each tile becomes 2x2, Grid.sub
// = 2) and each unit into a 2x2 token that walks 1 cell at a time. Abilities stay as written, in whole tiles: the rules
// measure them in cells (pathing.ts farCells), so ranges, areas, pushes and hit chance answer as on the whole map.
// The test map (?scenario=half, Wood) adds trees 3 to 5 cells wide and crates and bodies scattered around.
import { FACING, type Grid, posKey, type Tile, tileAt } from './grid.ts';
import { SCENARIOS, type Scenario } from './scenarios.ts';
import type { Pos } from './types.ts';
import { HALF, UNIT_DEFS } from './units.ts';

export { baseDef, HALF } from './units.ts';
export const HALF_ID = 'ash_wood_half';
// cells per tile side; also what the screens multiply Move and Jump by, to show the numbers the battle spends (Nov 15)
export const SUB = 2;

// the token of a sheet: the square doubles (a 2x2 boss becomes 4x4) and so does the movement, now counted in cells. Always
// rebuilt: the developer and expedition sheets (dev-h0, dev-e0…) change from battle to battle under the same id
export function halfDef(id: string): string {
  const d = UNIT_DEFS[id];
  UNIT_DEFS[id + HALF] = { ...d, id: id + HALF, size: d.halfSize ?? (d.size ?? 1) * SUB, move: d.move * SUB };
  return id + HALF;
}

// each tile becomes 2x2 half-tiles; the ramp stays only on the half-tile next to the upper tile (the other is flat)
export function split(g: Grid): Grid {
  const W = g.width * 2,
    H = g.height * 2,
    tiles: Tile[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const t = tileAt(g, { x: x >> 1, y: y >> 1 });
      const c: Tile = { ...t };
      // the tile's object (crate, barrel, body) is drawn once, over its 4 cells: otherwise it became 4 small ones. The rule
      // keeps the whole tile: the crate and the barrel block its 4 cells and nobody stops on any cell of the body
      c.span = x % 2 === 0 && y % 2 === 0 ? SUB : 0;
      if (t.ramp) {
        const f = FACING[t.ramp[0]];
        const nearHigh =
          (f.x > 0 && x % 2 === 1) || (f.x < 0 && x % 2 === 0) || (f.y > 0 && y % 2 === 1) || (f.y < 0 && y % 2 === 0);
        if (!nearHigh) delete c.ramp;
      }
      tiles.push(c);
    }
  return { width: W, height: H, tiles, levelHeight: (g.levelHeight ?? 0.5) * 2, sub: SUB };
}

const TREE_LOOKS = ['tree', 'tree2', 'tree3', 'tree4'];

// Wood trees in half-tiles: the old ones become trees of 2; plus some of 3 to 5 on grass tiles, away from the
// road, the water and where the units spawn, each one only if the path from the heroes to the enemies stays open
function plantTrees(g: Grid, spawns: Pos[], hero: Pos, foe: Pos): void {
  let s = 4242;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const at = (p: Pos) => g.tiles[p.y * g.width + p.x];
  const W = g.width,
    H = g.height;
  // trees that already existed: the 2x2 square of each forest tile becomes a single tree, of 2
  for (let y = 0; y < H; y += 2)
    for (let x = 0; x < W; x += 2) {
      const t = at({ x, y });
      if (t.terrain !== 'forest') continue;
      t.tree = 2;
      for (const c of [
        { x: x + 1, y },
        { x, y: y + 1 },
        { x: x + 1, y: y + 1 },
      ])
        at(c).look = 'grass';
    }
  const near = (p: Pos, look: string[], r: number) => {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const q = { x: p.x + dx, y: p.y + dy };
        if (q.x < 0 || q.y < 0 || q.x >= W || q.y >= H) continue;
        const t = at(q);
        if (look.includes(t.look ?? '') || t.depth) return true; // the road (sand) may touch: the tree just does not sit on top of it
      }
    return false;
  };
  // without touching the 2x2 square of whoever spawns (1 half-tile of slack)
  const spawnClose = (p: Pos, sz: number) =>
    spawns.some((sp) => sp.x + 2 >= p.x - 1 && sp.x <= p.x + sz && sp.y + 2 >= p.y - 1 && sp.y <= p.y + sz);
  // open path for whoever occupies 2x2 (climbs or descends 1 level per step), from a hero to near an enemy
  const open = () => {
    const ok = (p: Pos) => {
      if (p.x < 0 || p.y < 0 || p.x + 1 >= W || p.y + 1 >= H) return false;
      const cs = [p, { x: p.x + 1, y: p.y }, { x: p.x, y: p.y + 1 }, { x: p.x + 1, y: p.y + 1 }].map(at);
      return cs.every((t) => t.terrain === 'floor' && (t.depth ?? 0) < 2);
    };
    const seen = new Set([posKey(hero)]),
      queue = [hero];
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i];
      if (Math.abs(p.x - foe.x) <= 3 && Math.abs(p.y - foe.y) <= 3) return true;
      for (const f of FACING) {
        const n = { x: p.x + f.x, y: p.y + f.y };
        if (seen.has(posKey(n)) || !ok(n) || Math.abs(at(n).h - at(p).h) > 1) continue;
        seen.add(posKey(n));
        queue.push(n);
      }
    }
    return false;
  };
  let placed = 0;
  for (let tries = 0; tries < 4000 && placed < 26; tries++) {
    const sz = 3 + Math.floor(rnd() * 3); // 3, 4 or 5 half-tiles wide
    const p = { x: Math.floor(rnd() * (W - sz)), y: Math.floor(rnd() * (H - sz)) };
    const cells: Pos[] = [];
    for (let dy = 0; dy < sz; dy++) for (let dx = 0; dx < sz; dx++) cells.push({ x: p.x + dx, y: p.y + dy });
    const h = at(p).h;
    // trees on slopes too (up to 1 level of difference in the square): the map has steps in almost every corner
    if (
      spawnClose(p, sz) ||
      cells.some(
        (c) =>
          Math.abs(at(c).h - h) > 1 ||
          near(c, ['bridge', 'water'], 1) ||
          !['grass', undefined].includes(at(c).look) ||
          at(c).terrain !== 'floor',
      )
    )
      continue;
    const before = cells.map((c) => ({ ...at(c) }));
    cells.forEach((c, k) => {
      const t = at(c);
      t.terrain = 'forest';
      t.look = k === 0 ? TREE_LOOKS[Math.floor(rnd() * TREE_LOOKS.length)] : 'grass';
      if (k === 0) t.tree = sz;
    });
    if (!open()) {
      cells.forEach((c, k) => (g.tiles[c.y * W + c.x] = before[k]));
      continue;
    }
    placed++;
  }
}

// crates, barrels and bodies scattered on both sides (one per half-tile, away from the road and the spawns)
function scatterProps(g: Grid, spawns: Pos[]): void {
  let s = 777;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const kinds: Partial<Tile>[] = [
    { terrain: 'wall', look: 'crates', span: 1 },
    { terrain: 'wall', look: 'barrel', span: 1 },
    { terrain: 'floor', look: 'corpse', noStop: true, span: 1 },
    { terrain: 'floor', look: 'corpse', noStop: true, span: 1 },
  ];
  let placed = 0;
  for (let tries = 0; tries < 600 && placed < 14; tries++) {
    const p = { x: Math.floor(rnd() * g.width), y: Math.floor(rnd() * g.height) };
    const t = g.tiles[p.y * g.width + p.x];
    if (t.terrain !== 'floor' || t.depth || t.ramp || t.look === 'bridge' || t.noStop) continue;
    if (spawns.some((sp) => Math.abs(sp.x - p.x) <= 3 && Math.abs(sp.y - p.y) <= 3)) continue;
    Object.assign(t, kinds[placed % kinds.length]);
    placed++;
  }
}

// The battle in half tiles: the map split, the spawns on the cell of their tile's corner, each sheet as its token and the
// scenario's own rules (boss, last one standing, dawn). Registered under `<id>½`, so a whole-tile save never opens on it
export function halve(base: Scenario): Scenario {
  const sc: Scenario = {
    ...base,
    id: base.id + HALF,
    grid: split(base.grid),
    spawns: base.spawns.map((sp) => ({ ...sp, def: halfDef(sp.def), x: sp.x * SUB, y: sp.y * SUB })),
  };
  SCENARIOS[sc.id] = sc;
  return sc;
}

// Wood in half-tiles with the big trees and the scattered props (client with ?scenario=half)
export function registerHalf(): Scenario {
  const sc = halve(SCENARIOS.ash_wood);
  // its own copy of the tiles: halve registered `ash_wood½` with this grid, which the trees must not reach (Nov 14 review)
  const grid = structuredClone(sc.grid);
  const anchors = sc.spawns.map((sp) => ({ x: sp.x, y: sp.y }));
  const hero = sc.spawns.find((sp) => sp.team === 'hero')!,
    foe = sc.spawns.find((sp) => sp.team === 'enemy')!;
  plantTrees(grid, anchors, hero, foe);
  scatterProps(grid, anchors);
  const test: Scenario = { ...sc, grid, id: HALF_ID, name: `${sc.name} (meia casa)`, en: `${sc.en} (half tiles)` };
  SCENARIOS[HALF_ID] = test;
  return test;
}
