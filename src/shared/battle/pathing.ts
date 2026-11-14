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
export function footprint(u: UnitState): Pos[] {
  const size = UNIT_DEFS[u.def].size ?? 1;
  const out: Pos[] = [];
  for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) out.push({ x: u.pos.x + dx, y: u.pos.y + dy });
  return out;
}
// distance to the unit's nearest tile (range, area and hit chance against the large boss)
export const distTo = (u: UnitState, p: Pos) => Math.min(...footprint(u).map((f) => dist(f, p)));
export const nearestTile = (u: UnitState, p: Pos): Pos =>
  footprint(u).reduce((a, b) => (dist(b, p) < dist(a, p) ? b : a));

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
// Whoever occupies more than one tile and walks (half tile, Nov 13: the models occupy 2x2 and walk 1 at a time; half.ts): the search is
// by the top-left corner. It fits if all the tiles of the square are walkable, none is a body to stop on, no other unit is there and
// they differ by at most 1 level; the square's height is the highest, and the step follows the jump. Cost: that
// of the most expensive tile entering the square. No gap for now
function reachableBig(
  grid: Grid,
  state: BattleState,
  unit: UnitState,
  budget: number,
  jump: number,
): Map<string, Step> {
  const size = UNIT_DEFS[unit.def].size!;
  const cells = (p: Pos) => {
    const out: Pos[] = [];
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) out.push({ x: p.x + dx, y: p.y + dy });
    return out;
  };
  const heightOf = (p: Pos): number | null => {
    let lo = Infinity,
      hi = -Infinity;
    for (const c of cells(p)) {
      if (!inBounds(grid, c)) return null;
      const t = tileAt(grid, c);
      if (!canStand(t) || isDeep(t)) return null;
      const o = unitAt(state, c);
      if (o && o.id !== unit.id && o.team !== unit.team) return null; // passes through allies, never enemies
      lo = Math.min(lo, t.h);
      hi = Math.max(hi, t.h);
    }
    return hi - lo > 1 ? null : hi;
  };
  const seen = new Map<string, Step>([[posKey(unit.pos), { pos: unit.pos, cost: 0, from: null }]]);
  const queue: Pos[] = [unit.pos];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    const cost = seen.get(posKey(cur))!.cost;
    const h0 = heightOf(cur) ?? tileAt(grid, cur).h;
    for (const d of FACING) {
      const n = { x: cur.x + d.x, y: cur.y + d.y };
      const h = heightOf(n);
      if (h === null || Math.abs(h - h0) > jump) continue;
      const next = cost + Math.max(...cells(n).map((c) => stepCost(tileAt(grid, c))));
      const k = posKey(n);
      if (next > budget || (seen.get(k)?.cost ?? Infinity) <= next) continue;
      seen.set(k, { pos: n, cost: next, from: posKey(cur) });
      queue.push(n);
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
export function shotStop(
  grid: Grid,
  state: BattleState,
  from: Pos,
  to: Pos,
  shooter: string,
  units = true,
): { pos: Pos; unit: string | null } | null {
  const total = dist(from, to);
  if (total <= 1) return null;
  const sight = (p: Pos) => {
    const t = tileAt(grid, p);
    return isDeep(t) ? t.h : standH(t);
  };
  const eye = sight(from) + EYE,
    aim = sight(to) + EYE;
  let x = from.x,
    y = from.y;
  const dx = Math.abs(to.x - from.x),
    dy = -Math.abs(to.y - from.y);
  const sx = from.x < to.x ? 1 : -1,
    sy = from.y < to.y ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
    if (x === to.x && y === to.y) return null;
    const p = { x, y },
      t = tileAt(grid, p);
    const line = eye + (aim - eye) * (dist(from, p) / total);
    if (t.h + blocksOf(t) > line) return { pos: p, unit: null };
    const u = units ? unitAt(state, p) : undefined;
    if (u && u.id !== shooter && sight(p) + UNIT_TALL > line) return { pos: p, unit: u.id };
  }
}

export function sightBlock(grid: Grid, from: Pos, to: Pos): Pos | null {
  // always traces from the lowest-index tile to the highest (Nov 13, review): Bresenham breaks the corner tie depending on the
  // direction, and an archer got shot from where it could not answer (5 to 6% of pairs). Eye and aim have the same height
  // above the ground, so swapping the ends does not change the line
  const [a, b] = from.y * grid.width + from.x <= to.y * grid.width + to.x ? [from, to] : [to, from];
  const total = dist(a, b);
  if (total <= 1) return null;
  // whoever swims in deep water aims and is aimed at from the surface (Nov 13 review): with the bottom height, the line passed under the
  // neighboring ground and whoever was in the water became invisible at 3 tiles or more; the hit chance is still worse because of height (standH)
  const sight = (p: Pos) => {
    const t = tileAt(grid, p);
    return isDeep(t) ? t.h : standH(t);
  };
  const eye = sight(a) + EYE;
  const aim = sight(b) + EYE;
  let x = a.x,
    y = a.y;
  const dx = Math.abs(b.x - a.x),
    dy = -Math.abs(b.y - a.y);
  const sx = a.x < b.x ? 1 : -1,
    sy = a.y < b.y ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
    if (x === b.x && y === b.y) return null;
    const t = tileAt(grid, { x, y });
    // fraction by the advance in grid steps, not by the loop index, which on the diagonal moves 1 tile per iteration
    const frac = dist(a, { x, y }) / total;
    if (t.h + blocksOf(t) > eye + (aim - eye) * frac) return { x, y };
  }
}

// max range against a tile: +1 per level above the target for whoever has heightRange
export function maxRange(grid: Grid, ability: AbilityDef, from: Pos, to: Pos): number {
  const up = ability.heightRange ? Math.max(0, standH(tileAt(grid, from)) - standH(tileAt(grid, to))) : 0;
  return ability.range[1] + up;
}

export function inAbilityRange(grid: Grid, ability: AbilityDef, from: Pos, to: Pos): boolean {
  const d = dist(from, to);
  return d >= ability.range[0] && d <= maxRange(grid, ability, from, to);
}
