// Half tile (Nov 13, Fernando's request: "the characters occupy a square of 4 tiles 2x2, but movement is 1 tile at a time;
// I want to test it like this"; later: "trees can be 3, 4, 5 wide… many kinds of tree"). Test version
// (?cenario=meia, Wood): the map is divided into half-tiles (each tile becomes 2x2), each unit becomes a 2x2 token with
// movement and ranges doubled, and the Wood gets trees 3 to 5 half-tiles wide and crates and bodies
// scattered around. It only exists for whoever calls registerHalf (the client with ?cenario=meia), like the FFT study.
import { ABILITIES } from './abilities.ts';
import { FACING, posKey, tileAt, type Grid, type Tile } from './grid.ts';
import { SCENARIOS, type Scenario } from './scenarios.ts';
import type { Pos } from './types.ts';
import { UNIT_DEFS } from './units.ts';

export const HALF = '½';
export const HALF_ID = 'ash_wood_meia';
export const baseDef = (def: string) => (def.endsWith(HALF) ? def.slice(0, -HALF.length) : def);

// range in half-tiles: melee stays 1 (two squares side by side are 1 half-tile apart), the rest doubles
const twice = (r: number) => (r <= 1 ? r : r * 2);

function registerDefs() {
  for (const a of Object.values(ABILITIES)) {
    if (a.id.endsWith(HALF) || ABILITIES[a.id + HALF]) continue;
    ABILITIES[a.id + HALF] = {
      ...a,
      id: a.id + HALF,
      range: [twice(a.range[0]), twice(a.range[1])],
      radius: a.radius * 2,
      push: a.push * 2,
    };
  }
  for (const d of Object.values(UNIT_DEFS)) {
    if (d.id.endsWith(HALF) || UNIT_DEFS[d.id + HALF]) continue;
    UNIT_DEFS[d.id + HALF] = {
      ...d,
      id: d.id + HALF,
      size: (d.size ?? 1) * 2,
      move: d.move * 2,
      abilities: d.abilities.map((a) => a + HALF),
    };
  }
}

// each tile becomes 2x2 half-tiles; the ramp stays only on the half-tile next to the upper tile (the other is flat)
function split(g: Grid): Grid {
  const W = g.width * 2,
    H = g.height * 2,
    tiles: Tile[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const t = tileAt(g, { x: x >> 1, y: y >> 1 });
      const c: Tile = { ...t };
      // the tile's object (crate, barrel, body) stays only on the top-left half-tile: otherwise it became 4 identical ones. The crate and
      // the barrel still block the whole square; the body only occupies its own
      const corner = x % 2 === 0 && y % 2 === 0;
      if (!corner && PROPS.has(t.look ?? '')) {
        c.look = 'sand';
        if (t.look === 'corpse') {
          c.terrain = 'floor';
          delete c.noStop;
        }
      }
      if (t.ramp) {
        const f = FACING[t.ramp[0]];
        const nearHigh =
          (f.x > 0 && x % 2 === 1) || (f.x < 0 && x % 2 === 0) || (f.y > 0 && y % 2 === 1) || (f.y < 0 && y % 2 === 0);
        if (!nearHigh) delete c.ramp;
      }
      tiles.push(c);
    }
  return { width: W, height: H, tiles, levelHeight: (g.levelHeight ?? 0.5) * 2 };
}

const TREE_LOOKS = ['tree', 'tree2', 'tree3', 'tree4'];
const PROPS = new Set(['crates', 'barrel', 'corpse']);

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
    { terrain: 'wall', look: 'crates' },
    { terrain: 'wall', look: 'barrel' },
    { terrain: 'floor', look: 'corpse', noStop: true },
    { terrain: 'floor', look: 'corpse', noStop: true },
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

// Wood in half-tiles; registers the tokens and the scenario (client with ?cenario=meia)
export function registerHalf(): Scenario {
  registerDefs();
  const base = SCENARIOS.ash_wood;
  const grid = split(base.grid);
  const spawns = base.spawns.map((sp) => ({ ...sp, def: sp.def + HALF, x: sp.x * 2, y: sp.y * 2 }));
  const anchors = spawns.map((sp) => ({ x: sp.x, y: sp.y }));
  const hero = spawns.find((sp) => sp.team === 'hero')!,
    foe = spawns.find((sp) => sp.team === 'enemy')!;
  plantTrees(grid, anchors, hero, foe);
  scatterProps(grid, anchors);
  const sc: Scenario = { id: HALF_ID, name: `${base.name} (meia casa)`, en: `${base.en} (half tiles)`, grid, spawns };
  SCENARIOS[HALF_ID] = sc;
  return sc;
}
