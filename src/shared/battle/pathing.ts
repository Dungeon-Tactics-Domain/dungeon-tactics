import type { AbilityDef } from './abilities.ts';
import {
  blocksOf,
  canStand,
  dist,
  FACING,
  type Grid,
  inBounds,
  isDeep,
  neighbors,
  posKey,
  samePos,
  standH,
  stepCost,
  subOf,
  TERRAIN,
  tileAt,
} from './grid.ts';
import { rulesOf } from './rules.ts';
import type { BattleState, Pos, UnitState } from './types.ts';
import { UNIT_DEFS } from './units.ts';

// Jump of whoever does not state its own (UnitDef.jump): climbing or descending more than this in one step is blocked (spec, Oct 25). Since Nov 13
// each class may have its own, as in FFT; the FFT study swaps it for its own rule (rules.jump)
export const MAX_JUMP = 1;
export const jumpOf = (state: BattleState, def: string) =>
  rulesOf(state).jump?.(def) ?? UNIT_DEFS[def]?.jump ?? MAX_JUMP;
// Height of the eyes and the aim point above the tile floor, in levels. Together with the terrain's blocks it decides who sees over.
const EYE = 1;

// Large unit (UnitDef.size, night of Nov 12: the boss that occupies 2x2): `pos` is the top-left tile of the square.
// Every "who is on this tile" question goes through here, so walking, blocking and aiming apply to all 4 tiles.
export function cellsOf(p: Pos, size: number): Pos[] {
  const out: Pos[] = [];
  for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) out.push({ x: p.x + dx, y: p.y + dy });
  return out;
}
export const footprint = (u: UnitState): Pos[] => cellsOf(u.pos, UNIT_DEFS[u.def].size ?? 1);
// distance to the unit's nearest tile (range, area and hit chance against the large boss)
export const distTo = (u: UnitState, p: Pos) => Math.min(...footprint(u).map((f) => dist(f, p)));
// standing height of a square with its corner on `p`: its highest cell (a token straddling a step stands on the upper side)
export const squareH = (grid: Grid, p: Pos, size: number) =>
  Math.max(...cellsOf(p, size).map((c) => standH(tileAt(grid, c))));
export const nearestTile = (u: UnitState, p: Pos): Pos =>
  footprint(u).reduce((a, b) => (dist(b, p) < dist(a, p) ? b : a));
// tiles between two groups of tiles (two units side by side: 1), and their closest pair [in a, in b]
export const gap = (a: Pos[], b: Pos[]) => Math.min(...a.flatMap((p) => b.map((q) => dist(p, q))));
export const closest = (a: Pos[], b: Pos[]): [Pos, Pos] =>
  a.flatMap((p) => b.map((q): [Pos, Pos] => [p, q])).reduce((x, y) => (dist(y[0], y[1]) < dist(x[0], x[1]) ? y : x));

// Half tiles (Nov 14, Fernando: half-tile movement in the real battles): abilities keep their ranges and radii in whole
// tiles and the split map (Grid.sub) measures them in cells between the two squares. Two units D whole tiles apart are
// 2D-1 cells apart along a line and 2D-2 on a diagonal, so these keep every whole-tile answer (tests/half-tiles.test.ts)
export const farCells = (g: Grid, r: number) => (r <= 0 ? 0 : subOf(g) * (r - 1) + 1);
export const nearCells = (g: Grid, r: number) => Math.max(r, subOf(g) * (r - 1));
// whole tiles that `d` cells stand for (the inverse of farCells): the distance the hit chance counts
export const wholeTiles = (g: Grid, d: number) => Math.ceil((d + subOf(g) - 1) / subOf(g));

// Area of an ability aimed at `center`: on the split map, the square of the unit standing there (or, on empty ground, the 2x2
// from the cell: the aimed tile's corner from `aimTile`, or the square where a shot stopped, which is not snapped so an
// off-grid shooter's blocked shot stays where it hit), the same as the whole tile it stands for; on a whole map, the tile
export const areaOf = (grid: Grid, state: BattleState, center: Pos): Pos[] => {
  if (subOf(grid) === 1) return [center];
  const u = unitAt(state, center);
  return u ? footprint(u) : cellsOf(center, subOf(grid));
};
// The whole tile an aim at `p` stands for on the split map, as the corner cell of its square: the tile of the token's own
// square that holds `p`, or the map's tile under the cell on empty ground (Nov 14 review: an empty aim was measured from
// the clicked cell, so a tile's far cells reached less and its areas straddled two tiles). On a whole map, `p` itself
export const aimTile = (grid: Grid, state: BattleState, p: Pos): Pos => {
  const k = subOf(grid);
  if (k === 1) return p;
  const o = unitAt(state, p)?.pos ?? { x: 0, y: 0 };
  return { x: p.x - ((p.x - o.x) % k), y: p.y - ((p.y - o.y) % k) };
};
// The two cells range and sight are measured between when `actor` aims at `center`: its cell nearest to the tile; on the split
// map, the closest cells of its square and the aimed tile's, whichever of the 4 cells was picked (an adjacent token stays
// adjacent for the minimum range)
export const aimEnds = (grid: Grid, state: BattleState, actor: UnitState, center: Pos): [Pos, Pos] =>
  subOf(grid) === 1
    ? [nearestTile(actor, center), center]
    : closest(footprint(actor), areaOf(grid, state, aimTile(grid, state, center)));
export const inArea = (grid: Grid, area: Pos[], radius: number, cells: Pos[]) =>
  gap(area, cells) <= farCells(grid, radius);

export const unitAt = (state: BattleState, p: Pos): UnitState | undefined =>
  state.units.find((u) => footprint(u).some((f) => samePos(f, p)));

export interface Step {
  pos: Pos;
  cost: number;
  from: string | null; // key of the previous tile
  path?: Pos[]; // path from the starting tile (without it), built before removing the occupied tiles
}

// Leap over a gap, as in FFT (Nov 13, Fernando's request; BMG: the gap goes up to [Jump/2] tiles): in a straight line, over
// tiles where you cannot stand (deep water) or that are lower than both ends; a wall in the middle blocks. Lands on the
// same level or up to `jump` levels below (FFT does not let you land higher). `over` are the tiles flown over, each counts 1 movement point. Jump 1 flies over nothing.
export function leaps(grid: Grid, from: Pos, jump: number): { to: Pos; over: Pos[] }[] {
  const out: { to: Pos; over: Pos[] }[] = [];
  const h0 = standH(tileAt(grid, from));
  for (const d of FACING) {
    const over: Pos[] = [];
    for (let k = 1; k <= Math.floor(jump / 2); k++) {
      const mid = { x: from.x + d.x * k, y: from.y + d.y * k };
      const to = { x: mid.x + d.x, y: mid.y + d.y };
      if (!inBounds(grid, to)) break;
      const g = tileAt(grid, mid);
      if (!TERRAIN[g.terrain].walkable) break;
      over.push(mid);
      const land = tileAt(grid, to);
      // landing on the same level or below, up to `jump` levels (Nov 13: the FFT tutorial does not let the gap land higher than the
      // start; it used to land up to `jump` above)
      if (!canStand(land) || isDeep(land) || standH(land) > h0 || h0 - standH(land) > jump) continue; // landing in deep water: it is just swimming in
      const low = Math.min(h0, standH(land));
      if (
        over.every((p) => {
          const t = tileAt(grid, p);
          return !canStand(t) || standH(t) < low;
        })
      )
        out.push({ to, over: [...over] });
    }
  }
  return out;
}

// Search by the cost of each step (1, or 2 in shallow water; the gap, 1 per tile flown) up to def.move points. Passes through allies, never enemies; the result does not include
// the starting tile or occupied tiles, so the client can paint only where you can stop.
// Whoever occupies more than one tile and walks (half tile: the tokens occupy 2x2 and walk 1 cell at a time; half.ts): the
// search is by the top-left corner. It fits if all the cells of the square are walkable, none holds an enemy and they differ by at
// most the jump (a square across a step of 2 is the middle of the jump of whoever jumps 2); the square's height is the highest, and
// the step follows the jump by the surface, deep water included (it enters, like the 1-tile unit). Cost: 1 per cell. The gap flies
// over the cells between the two squares, up to [jump/2] whole tiles, like `leaps`
// One move of such a square from the corner `cur`, in FACING order, each step before its gaps: the corner it reaches and the
// points it costs. `blocked` is a cell the square cannot stand on or fly over (an enemy, for `reachable`; nothing, for the
// AI's walking map, which ignores units)
export function squareMoves(
  grid: Grid,
  cur: Pos,
  size: number,
  jump: number,
  blocked: (c: Pos) => boolean,
): { to: Pos; cost: number }[] {
  const cells = (p: Pos) => cellsOf(p, size);
  const heightOf = (p: Pos): number | null => {
    let lo = Infinity,
      hi = -Infinity;
    for (const c of cells(p)) {
      if (!inBounds(grid, c)) return null;
      const t = tileAt(grid, c);
      if (!canStand(t) || blocked(c)) return null;
      lo = Math.min(lo, t.h);
      hi = Math.max(hi, t.h);
    }
    return hi - lo > jump ? null : hi;
  };
  const out: { to: Pos; cost: number }[] = [];
  const flyMax = subOf(grid) * Math.floor(jump / 2);
  const h0 = heightOf(cur) ?? tileAt(grid, cur).h;
  for (const d of FACING) {
    const n = { x: cur.x + d.x, y: cur.y + d.y };
    const h = heightOf(n);
    if (h !== null && Math.abs(h - h0) <= jump)
      out.push({ to: n, cost: Math.max(...cells(n).map((c) => stepCost(tileAt(grid, c)))) });
    // gap: `g` lines of cells past the square's edge are flown over (deep water or lower than both ends; a wall or an enemy
    // blocks) and the square lands right after them, never higher and never in deep water. Tried even when the first
    // step does not fit: a square half over a drop deeper than the jump cannot stand there, but `leaps` flies it (Nov 14)
    const edge = { x: cur.x + (d.x > 0 ? size - 1 : 0), y: cur.y + (d.y > 0 ? size - 1 : 0) };
    const strip: Pos[] = [];
    for (let g = 1; g <= flyMax; g++) {
      const line = Array.from({ length: size }, (_, k) => ({
        x: edge.x + d.x * g + (d.x ? 0 : k),
        y: edge.y + d.y * g + (d.y ? 0 : k),
      }));
      if (line.some((c) => !inBounds(grid, c) || !TERRAIN[tileAt(grid, c).terrain].walkable || blocked(c))) break;
      strip.push(...line);
      const land = { x: cur.x + d.x * (size + g), y: cur.y + d.y * (size + g) };
      const hl = heightOf(land);
      if (hl === null || hl > h0 || h0 - hl > jump || cells(land).some((c) => isDeep(tileAt(grid, c)))) continue;
      const low = Math.min(h0, hl);
      if (strip.every((c) => standH(tileAt(grid, c)) < low)) out.push({ to: land, cost: size + g });
    }
  }
  return out;
}

function reachableBig(
  grid: Grid,
  state: BattleState,
  unit: UnitState,
  budget: number,
  jump: number,
): Map<string, Step> {
  const size = UNIT_DEFS[unit.def].size!;
  const cells = (p: Pos) => cellsOf(p, size);
  const foe = (c: Pos) => {
    const o = unitAt(state, c);
    return !!o && o.id !== unit.id && o.team !== unit.team; // passes through allies, never enemies
  };
  const seen = new Map<string, Step>([[posKey(unit.pos), { pos: unit.pos, cost: 0, from: null }]]);
  const queue: Pos[] = [unit.pos];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    const cost = seen.get(posKey(cur))!.cost;
    for (const { to, cost: step } of squareMoves(grid, cur, size, jump, foe)) {
      const k = posKey(to);
      if (cost + step > budget || (seen.get(k)?.cost ?? Infinity) <= cost + step) continue;
      seen.set(k, { pos: to, cost: cost + step, from: posKey(cur) });
      queue.push(to);
    }
  }
  for (const step of seen.values()) {
    const path: Pos[] = [];
    for (let s: Step | undefined = step; s?.from; s = seen.get(s.from)) path.unshift(s.pos);
    step.path = path;
  }
  seen.delete(posKey(unit.pos));
  // stop only where the whole square is free (an ally on the path, yes; on top, no) and with no body underneath
  for (const [k, step] of seen)
    if (
      cells(step.pos).some((c) => {
        const o = unitAt(state, c);
        return (o && o.id !== unit.id) || tileAt(grid, c).noStop;
      })
    )
      seen.delete(k);
  return seen;
}

// `budget`: movement points left in the turn (the whole movement, if absent)
export function reachable(grid: Grid, state: BattleState, unitId: string, budget?: number): Map<string, Step> {
  const unit = state.units.find((u) => u.id === unitId)!;
  budget ??= UNIT_DEFS[unit.def].move;
  const jump = jumpOf(state, unit.def);
  if ((UNIT_DEFS[unit.def].size ?? 1) > 1 && UNIT_DEFS[unit.def].move > 0)
    return reachableBig(grid, state, unit, budget, jump);
  const seen = new Map<string, Step>([[posKey(unit.pos), { pos: unit.pos, cost: 0, from: null }]]);
  const queue: Pos[] = [unit.pos];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    const cost = seen.get(posKey(cur))!.cost;
    for (const n of neighbors(grid, cur)) {
      const k = posKey(n);
      const to = tileAt(grid, n);
      // if some terrain costs more than 1: the cheapest path may arrive later, so the tile is revisited when it comes out cheaper
      const next = cost + stepCost(to);
      if (next > budget || (seen.get(k)?.cost ?? Infinity) <= next) continue;
      // the jump is measured by the surface (t.h): entering and leaving deep water is the same climb as the bank (grid.ts, isDeep)
      if (!canStand(to) || Math.abs(to.h - tileAt(grid, cur).h) > jump) continue;
      const other = unitAt(state, n);
      if (other && other.team !== unit.team) continue;
      seen.set(k, { pos: n, cost: next, from: posKey(cur) });
      queue.push(n);
    }
    // gap: each tile flown counts 1, plus the tile where it lands; an enemy under the flight blocks, as on the walking path
    for (const { to: n, over } of leaps(grid, cur, jump)) {
      const k = posKey(n);
      const next = cost + over.length + stepCost(tileAt(grid, n));
      if (next > budget || (seen.get(k)?.cost ?? Infinity) <= next) continue;
      if (
        [n, ...over].some((p) => {
          const o = unitAt(state, p);
          return o && o.team !== unit.team;
        })
      )
        continue;
      seen.set(k, { pos: n, cost: next, from: posKey(cur) });
      queue.push(n);
    }
  }
  // each tile's path is built before removing the occupied ones (Nov 13, review): passing through an ally erased its tile and
  // pathTo returned a path with a hole, which the scene drew as a jump of 2 to 4 tiles
  for (const step of seen.values()) {
    const path: Pos[] = [];
    for (let s: Step | undefined = step; s?.from; s = seen.get(s.from)) path.unshift(s.pos);
    step.path = path;
  }
  seen.delete(posKey(unit.pos));
  for (const [k, step] of seen) if (unitAt(state, step.pos) || tileAt(grid, step.pos).noStop) seen.delete(k);
  return seen;
}

// Path to `target`, without the starting tile (built by `reachable`, passing through allies); null if unreachable.
export function pathTo(reach: Map<string, Step>, target: Pos): Pos[] | null {
  return reach.get(posKey(target))?.path ?? null;
}

// Line of sight on the grid: walks the tiles between the two points (Bresenham) and compares the height of the line, which goes from the eye
// of the viewer to the target's aim point, with the top of each tile (height + how much the terrain blocks). Runs without Three and is
// deterministic, unlike the POC's 3D sampling.
export function lineOfSight(grid: Grid, from: Pos, to: Pos): boolean {
  return sightBlock(grid, from, to) === null;
}

// the first tile that blocks the line of sight (null if it passes free): the trajectory preview shows where the shot lands
// (Nov 13, Fernando's request, "like Tactics Ogre"). The same calculation as always: the line is traced from the lowest-index tile
// Where the shot stops, leaving the shooter (Nov 13, Fernando's request: "the projectile preview did not warn that it would hit my
// ally"): the first terrain obstacle (like sightBlock) or the first model on the path, ally or enemy, if the
// line passes below its head (UNIT_TALL levels above the ground). null if it reaches the target
const UNIT_TALL = 1.6;
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

// The tiles between two ends (Bresenham), each with the fraction of the way it sits at. On the split map the line walks in
// whole-tile strides from square corner to square corner and probes each sub x sub square (Nov 14): a cell-by-cell line
// slipped through corners the whole map blocks and changed which shots pass (measured on Beacon Hill and Ash Wood)
function* sightLine(grid: Grid, a: Pos, b: Pos): Generator<{ pos: Pos; cells: Pos[]; frac: number }> {
  const k = subOf(grid);
  const nx = Math.round(Math.abs(b.x - a.x) / k),
    ny = Math.round(Math.abs(b.y - a.y) / k);
  const total = nx + ny;
  if (total <= 1) return;
  const sx = a.x < b.x ? k : -k,
    sy = a.y < b.y ? k : -k;
  // an end between tiles rounds its strides up, so the last square probed can overlap that end's own square: its ground is
  // not an obstacle (a target on a ledge was hidden by the ledge it stands on)
  const ends = [...cellsOf(a, k), ...cellsOf(b, k)];
  let i = 0,
    j = 0,
    err = nx - ny;
  for (;;) {
    const e2 = 2 * err;
    if (e2 >= -ny) {
      err -= ny;
      i++;
    }
    if (e2 <= nx) {
      err += nx;
      j++;
    }
    if (i === nx && j === ny) return;
    // fraction by the advance in grid steps, not by the loop index, which on the diagonal moves 1 tile per iteration
    const pos = { x: a.x + i * sx, y: a.y + j * sy };
    const cells = cellsOf(pos, k).filter((c) => inBounds(grid, c) && !ends.some((e) => samePos(e, c)));
    yield { pos, cells, frac: (i + j) / total };
  }
}

// Where the shot stops, leaving the shooter (Nov 13, Fernando's request: "the projectile preview did not warn that it would hit my
// ally"): the first terrain obstacle (like sightBlock) or the first model on the path, ally or enemy, if the
// line passes below its head (UNIT_TALL levels above the ground). null if it reaches the target
export function shotStop(
  grid: Grid,
  state: BattleState,
  from: Pos,
  to: Pos,
  shooter: string,
  units = true,
): { pos: Pos; unit: string | null } | null {
  const k = subOf(grid);
  const eye = sightH(grid, cellsOf(from, k)) + EYE,
    aim = sightH(grid, cellsOf(to, k)) + EYE;
  // the target's own token can overlap the last square probed when it stands between tiles (a whole-map colossus still blocks)
  const target = k > 1 ? unitAt(state, to)?.id : undefined;
  for (const { pos, cells, frac } of sightLine(grid, from, to)) {
    const line = eye + (aim - eye) * frac;
    if (Math.max(...cells.map((c) => blockTop(grid, c))) > line) return { pos, unit: null };
    if (!units) continue;
    const u = cells.map((c) => unitAt(state, c)).find((u) => u && u.id !== shooter && u.id !== target);
    if (u && sightH(grid, cells) + UNIT_TALL > line) return { pos, unit: u.id };
  }
  return null;
}

const blockTop = (grid: Grid, p: Pos) => {
  const t = tileAt(grid, p);
  return t.h + blocksOf(t);
};

export function sightBlock(grid: Grid, from: Pos, to: Pos): Pos | null {
  // always traces from the lowest-index tile to the highest (Nov 13, review): Bresenham breaks the corner tie depending on the
  // direction, and an archer got shot from where it could not answer (5 to 6% of pairs). Eye and aim have the same height
  // above the ground, so swapping the ends does not change the line
  const [a, b] = from.y * grid.width + from.x <= to.y * grid.width + to.x ? [from, to] : [to, from];
  const k = subOf(grid);
  const eye = sightH(grid, cellsOf(a, k)) + EYE;
  const aim = sightH(grid, cellsOf(b, k)) + EYE;
  for (const { pos, cells, frac } of sightLine(grid, a, b))
    if (Math.max(...cells.map((c) => blockTop(grid, c))) > eye + (aim - eye) * frac) return pos;
  return null;
}

// ends of a line of sight: from the shooter's tile nearest to the aimed one. On the split map each end is the corner of a whole
// tile of its token (the aimed tile of a big target, the shooter's nearest), so the whole-tile strides of sightLine retrace
// the whole map's line
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

// max range against a tile: +1 per level above the target for whoever has heightRange (in cells on the split map)
export function maxRange(grid: Grid, ability: AbilityDef, from: Pos, to: Pos): number {
  const up = ability.heightRange ? Math.max(0, standH(tileAt(grid, from)) - standH(tileAt(grid, to))) : 0;
  return farCells(grid, ability.range[1] + up);
}

export function inAbilityRange(grid: Grid, ability: AbilityDef, from: Pos, to: Pos): boolean {
  const d = dist(from, to);
  return d >= nearCells(grid, ability.range[0]) && d <= maxRange(grid, ability, from, to);
}
