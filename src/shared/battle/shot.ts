// Shots: the path a shot flies, what stops it and the two ends it is measured between; the rule, the preview and the flight read it.
import { blocksOf, dist, type Grid, inBounds, isDeep, standH, subOf, tileAt } from './grid.ts';
import { aimEnds, aimTile, cellsOf, footprint, nearestTile, unitAt, wholeTiles } from './pathing.ts';
import type { BattleState, Point, Pos, Shot, UnitState } from './types.ts';
import { bodyMetres, PERSON_M, UNIT_DEFS } from './units.ts';

// whoever swims in deep water aims and is aimed at from the surface (Nov 13 review): with the bottom height, the line passed under the
// neighboring ground and whoever was in the water became invisible at 3 tiles or more; the hit chance is still worse because of height (standH)
const sightH = (grid: Grid, cells: Pos[]) =>
  Math.max(
    ...cells
      .filter((p) => inBounds(grid, p))
      .map((p) => {
        const t = tileAt(grid, p);
        return isDeep(t) ? t.h : standH(t);
      }),
  );

// top of the terrain column of a cell: its ground plus what the terrain or a low object raises (grid.ts blocksOf)
const blockTop = (grid: Grid, p: Pos) => {
  const t = tileAt(grid, p);
  return t.h + blocksOf(t);
};

// ends of a shot: the shooter's whole tile nearest to the aimed one and the aimed whole tile, as corner cells. On the split
// map each end is the corner of a whole tile of its token (the aimed tile of a big target, the shooter's nearest)
export const sightEnds = (grid: Grid, state: BattleState, actor: UnitState, center: Pos): [Pos, Pos] => {
  const k = subOf(grid);
  if (k === 1) return [nearestTile(actor, center), center];
  const snap = (u: UnitState, p: Pos) => ({
    x: u.pos.x + Math.floor((p.x - u.pos.x) / k) * k,
    y: u.pos.y + Math.floor((p.y - u.pos.y) / k) * k,
  });
  const to = aimTile(grid, state, center);
  return [snap(actor, nearestTile(actor, to)), to];
};

// Shots, the realistic rule of the trajectory grill of Nov 15 (the Mechanics lab's trajetorias.json and its prototype, whose
// path this ports): a half tile is 1 m and a level 1 m, so the rule counts cells across and levels up (a whole map's tile is
// 2 m). The shot leaves the middle of the shooter's body and aims at the middle of the target's (Nov 25, Fernando: "no
// centro do modelo 3d do target": a rat on a ledge hides behind its edge), or a person's middle over an empty aimed tile;
// until Nov 25 every end stood 1.5 m up and every body 1.8 m tall. Whatever the path crosses stops it: terrain, a wall,
// the body of another unit (as tall as it is, bodyMetres), with no exception for a tile beside either end; only the
// shooter's and the target's bodies are ignored, and on their own tiles only the ground. The rule, the preview and the
// flight all read this one path

export const shotAt = (s: Shot, k: number): Point => ({
  x: s.from.x + (s.to.x - s.from.x) * k,
  y: s.from.y + (s.to.y - s.from.y) * k,
  h: s.from.h + s.rise * k - s.fall * k * k,
});

// `arc`: a bow's curve, its top 1 level per 3 whole tiles between the ends (at least 1, at most 3) above the higher end;
// else the straight line between the two
export function traceShot(grid: Grid, state: BattleState, shooter: UnitState, center: Pos, arc: boolean): Shot {
  const n = subOf(grid);
  const [a, b] = sightEnds(grid, state, shooter, center);
  // a body no wider than the end's tile is aimed at its own middle (a rat's cell); a bigger one at that tile's middle
  const end = (p: Pos, u: UnitState | undefined): Point => {
    const cells = u ? footprint(u) : [];
    if (!u || cells.length > n * n)
      return {
        x: p.x + n / 2,
        y: p.y + n / 2,
        h: sightH(grid, cellsOf(p, n)) + (u ? bodyMetres(u.def) : PERSON_M) / 2,
      };
    const mid = (k: 'x' | 'y') => (Math.min(...cells.map((c) => c[k])) + Math.max(...cells.map((c) => c[k])) + 1) / 2;
    return { x: mid('x'), y: mid('y'), h: sightH(grid, cells) + bodyMetres(u.def) / 2 };
  };
  const aimed = unitAt(state, b);
  const from = end(a, shooter),
    to = end(b, aimed);
  let rise = to.h - from.h,
    fall = 0;
  if (arc) {
    // the lab's parabola, highest exactly at `top` even when the ends differ in height; the tiles are the hit chance's
    const tiles = wholeTiles(grid, dist(...aimEnds(grid, state, shooter, center)));
    const top = Math.max(from.h, to.h) + Math.min(3, Math.max(1, Math.floor(tiles / 3)));
    const d = top - from.h,
      e = top - to.h;
    rise = 2 * (d + Math.sqrt(d * e));
    fall = (rise * rise) / (4 * d);
  }
  const lift = (aimed ? bodyMetres(aimed.def) : PERSON_M) / 2;
  const shot: Shot = { from, to, rise, fall, lift, stop: null };
  const target = aimed?.id;
  const bodies = state.units
    .filter((u) => u.id !== shooter.id && u.id !== target)
    .map((u) => ({ u, size: UNIT_DEFS[u.def].size ?? 1, top: sightH(grid, footprint(u)) + bodyMetres(u.def) }));
  const h = (k: number) => from.h + rise * k - fall * k * k;
  // the first k of [k0, k1] where the path runs under `top`: straight or arched, its lowest point in a stretch is an end
  const under = (top: number, k0: number, k1: number): number | null => {
    if (h(k0) < top) return k0;
    if (h(k1) >= top) return null;
    const k = fall ? (rise + Math.sqrt(rise * rise - 4 * fall * (top - from.h))) / (2 * fall) : (top - from.h) / rise;
    return Math.min(k1, Math.max(k0, k));
  };
  // every grid line the ground track crosses, in order (exact: the ends sit on half cells, so equal crossings are equal
  // numbers). Between two of them the path is inside one cell, or runs along a seam and probes the cells on both sides
  // (one side alone made A to B differ from B to A); a corner it only touches stops nothing
  const ks = [0, 1];
  for (const [p, q] of [
    [from.x, to.x],
    [from.y, to.y],
  ])
    for (let v = Math.floor(Math.min(p, q)) + 1; v < Math.max(p, q); v++) ks.push((v - p) / (q - p));
  ks.sort((p, q) => p - q);
  const sides = (v: number) => (Number.isInteger(v) ? [v - 1, v] : [Math.floor(v)]);
  // on the ends' own whole tiles only the ground counts, as the old line of sight skipped both ends: a unit in a forest or
  // on a crate's tile still shoots and is shot at (the forest's cover is in the hit chance), a cliff face below it still stops
  const own = (x: number, y: number) => [a, b].some((p) => x >= p.x && x < p.x + n && y >= p.y && y < p.y + n);
  for (let i = 1; i < ks.length; i++) {
    const k0 = ks[i - 1],
      k1 = ks[i];
    if (k0 === k1) continue;
    const m = shotAt(shot, (k0 + k1) / 2);
    let stop: Shot['stop'] = null;
    for (const y of sides(m.y))
      for (const x of sides(m.x)) {
        if (!inBounds(grid, { x, y })) continue;
        // the ground first: a shot into the ledge a unit stands on hits the ledge, not the unit
        const kt = under(own(x, y) ? tileAt(grid, { x, y }).h : blockTop(grid, { x, y }), k0, k1);
        if (kt !== null && (!stop || kt < stop.k))
          stop = { k: kt, pos: { x: x - (x % n), y: y - (y % n) }, unit: null };
        const body = bodies.find(
          ({ u, size }) => x >= u.pos.x && x < u.pos.x + size && y >= u.pos.y && y < u.pos.y + size,
        );
        const kb = body ? under(body.top, k0, k1) : null;
        if (body && kb !== null && (!stop || kb < stop.k)) stop = { k: kb, pos: { x, y }, unit: body.u.id };
      }
    if (stop) return { ...shot, stop };
  }
  return shot;
}
