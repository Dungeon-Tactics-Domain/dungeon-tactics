import type { AbilityDef } from './abilities.ts';
import { moveOf } from './effects.ts';
import {
  canStand,
  dist,
  FACING,
  facingTo,
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
  type Tile,
  tileAt,
} from './grid.ts';
import { rulesOf } from './rules.ts';
import type { BattleState, Pos, UnitState } from './types.ts';
import { UNIT_DEFS } from './units.ts';

// Jump of whoever does not state its own (UnitDef.jump): climbing or descending more than this in one step is blocked (spec, Oct 25). Since Nov 13
// each class may have its own, as in FFT; a scenario may swap it for its own rule (rules.jump)
export const MAX_JUMP = 1;
export const jumpOf = (state: BattleState, def: string) =>
  rulesOf(state).jump?.(def) ?? UNIT_DEFS[def]?.jump ?? MAX_JUMP;

// Large unit (UnitDef.size, night of Nov 12: the boss that occupies 2x2): `pos` is the top-left tile of the square.
// Every "who is on this tile" question goes through here, so walking, blocking and aiming apply to all 4 tiles.
export function cellsOf(p: Pos, size: number): Pos[] {
  const out: Pos[] = [];
  for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) out.push({ x: p.x + dx, y: p.y + dy });
  return out;
}
// a long body (UnitDef.halfLength, the snake) adds the squares behind the head, opposite its facing
export function bodyOf(def: string, pos: Pos, facing = 0): Pos[] {
  const d = UNIT_DEFS[def];
  const size = d.size ?? 1;
  const f = FACING[facing];
  const out: Pos[] = [];
  for (let k = 0; k < (d.halfLength ?? 1); k++) out.push(...cellsOf({ x: pos.x - f.x * k, y: pos.y - f.y * k }, size));
  return out;
}
export const footprint = (u: UnitState): Pos[] => bodyOf(u.def, u.pos, u.facing);
// a long body may stop or turn only where every cell is on the map, standable, free of others and of bodies
// (a square body answers true: its own rules already hold it)
export const bodyFits = (grid: Grid, state: BattleState, u: UnitState, pos: Pos, facing = 0) =>
  !UNIT_DEFS[u.def].halfLength ||
  bodyOf(u.def, pos, facing).every((c) => {
    if (!inBounds(grid, c) || !canStand(tileAt(grid, c)) || noStopAt(grid, state, c)) return false;
    const o = unitAt(state, c);
    return !o || o.id === u.id;
  });
// standing height of a square with its corner on `p`: its highest cell (a token straddling a step stands on the upper side)
export const squareH = (grid: Grid, p: Pos, size: number) =>
  Math.max(...cellsOf(p, size).map((c) => standH(tileAt(grid, c))));
export const nearestTile = (u: UnitState, p: Pos): Pos =>
  footprint(u).reduce((a, b) => (dist(b, p) < dist(a, p) ? b : a));
// tiles between two groups of tiles (two units side by side: 1), and their closest pair [in a, in b]
// (plain loops: actionOptions asks these thousands of times a turn; a tie keeps the first pair, a's order then b's)
export const closest = (a: Pos[], b: Pos[]): [Pos, Pos] => {
  let best: [Pos, Pos] = [a[0], b[0]];
  let d = Infinity;
  for (const p of a)
    for (const q of b)
      if (dist(p, q) < d) {
        d = dist(p, q);
        best = [p, q];
      }
  return best;
};
export const gap = (a: Pos[], b: Pos[]) => dist(...closest(a, b));

// Half tiles (Nov 14, Fernando: half-tile movement in the real battles): abilities keep their ranges and radii in whole
// tiles and the split map (Grid.sub) measures them in cells between the two squares. Two units D whole tiles apart are
// 2D-1 cells apart along a line and 2D-2 on a diagonal, so these keep every whole-tile answer (tests/half-tiles.test.ts)
export const farCells = (g: Grid, r: number) => (r <= 0 ? 0 : subOf(g) * (r - 1) + 1);
export const nearCells = (g: Grid, r: number) => Math.max(r, subOf(g) * (r - 1));
// whole tiles that `d` cells stand for (the inverse of farCells): the distance the hit chance counts
export const wholeTiles = (g: Grid, d: number) => Math.ceil((d + subOf(g) - 1) / subOf(g));

// Area of an ability aimed at `center`: on the split map, the aimed whole tile of the unit standing there (a 2x2 token's own
// square; one of the Colossus' four, Nov 14 review: its whole 4x4 square made the area and the range bigger than on whole
// tiles) or, on empty ground, the 2x2 from the cell: the aimed tile's corner from `aimTile`, or the square where a shot
// stopped, which is not snapped so an off-grid shooter's blocked shot stays where it hit. On a whole map, the tile itself
export const areaOf = (grid: Grid, state: BattleState, center: Pos): Pos[] => {
  if (subOf(grid) === 1) return [center];
  return cellsOf(unitAt(state, center) ? aimTile(grid, state, center) : center, subOf(grid));
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
  state.units.find((u) => {
    if (UNIT_DEFS[u.def].halfLength) return footprint(u).some((c) => samePos(c, p));
    const dx = p.x - u.pos.x;
    const dy = p.y - u.pos.y;
    return dx >= 0 && dy >= 0 && Math.max(dx, dy) < (UNIT_DEFS[u.def].size ?? 1);
  });
// a body lies on the cell: the map's (Tile.noStop) or a unit's that died here (Nov 16). Passed over, never stopped on
export const noStopAt = (grid: Grid, state: BattleState, p: Pos) =>
  !!tileAt(grid, p).noStop || !!state.corpses?.some((c) => samePos(c, p));

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

// A square that walks (half tile: the tokens occupy 2x2 and walk 1 cell at a time; half.ts), by its top-left corner. It
// passes if all the cells of the square are walkable, none holds an enemy and they differ by at
// most the jump (a square across a step of 2 is the middle of the jump of whoever jumps 2; it stops only on even ground,
// restsOn); the square's height is the highest, and
// the step follows the jump by the surface, deep water included (it enters, like the 1-tile unit). Cost: 1 per cell. The gap flies
// over the cells between the two squares, up to `jump` cells on the split map (`leaps` with the jump counted in cells)
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
  // the jump counts in cells like the move (Nov 15, Fernando: "the move and jump values double; 1 per half tile"), so the
  // gap is half of it: J cells for jump J on the split map, [J/2] tiles on a whole one. Height stays in levels
  const flyMax = Math.floor((subOf(grid) * jump) / 2);
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
      // and lands wholly past the gap, its square level (Nov 15, our reading, kept by Fernando): a 1-cell hop used to land half
      // inside a 1-tile trench, flying half of it
      if (strip.every((c) => standH(tileAt(grid, c)) < low) && cells(land).every((c) => tileAt(grid, c).h === hl))
        out.push({ to: land, cost: size + g });
    }
  }
  return out;
}

// Search by the cost of each step (1, or 2 in shallow water; the gap, 1 per tile flown) up to def.move points. Passes through allies, never enemies; the result does not include
// the starting tile or occupied tiles, so the client can paint only where you can stop.
// Whoever occupies more than one tile and walks: the search is by the top-left corner, one `squareMoves` at a time
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
  // stop only where the whole square is free (an ally on the path, yes; on top, no), with no body underneath and on even ground
  for (const [k, step] of seen)
    if (
      !restsOn(grid, step.pos, size) ||
      cells(step.pos).some((c) => {
        const o = unitAt(state, c);
        return (o && o.id !== unit.id) || noStopAt(grid, state, c);
      })
    )
      seen.delete(k);
  return seen;
}

// Where a square may stop (Nov 14, Fernando: "it must not let the character stand still on a corner like that", a token
// left hovering over a ledge): all its cells are the same ground (height, deep water, spikes, terrain; shallow water stands like dry ground, Nov 14), so it rests like one
// whole tile. A ramp cell only under a square on its own whole tile: between tiles the token stood half a level above the
// flat cells beside it. Crossing a step or a ramp on the way stays allowed (squareMoves). A push ends here too (simulatePush)
export function restsOn(grid: Grid, p: Pos, size: number): boolean {
  const k = subOf(grid);
  const kind = (t: Tile) => `${t.h},${standH(t)},${!!t.spikes},${t.terrain}`;
  const tiles = cellsOf(p, size).map((c) => tileAt(grid, c));
  return tiles.every((t) => kind(t) === kind(tiles[0]) && (!t.ramp || (p.x % k === 0 && p.y % k === 0)));
}

// `budget`: movement points left in the turn (the whole movement, if absent)
export function reachable(grid: Grid, state: BattleState, unitId: string, budget?: number): Map<string, Step> {
  const unit = state.units.find((u) => u.id === unitId)!;
  budget ??= moveOf(state, unit);
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
  for (const [k, step] of seen) if (unitAt(state, step.pos) || noStopAt(grid, state, step.pos)) seen.delete(k);
  // the tail lands behind the last step (battle.ts move faces that way); shortcut: only the stop is checked, not the tail
  // along the way, upgrade when a snake squeezes through a gap it should not
  if (UNIT_DEFS[unit.def].halfLength)
    for (const [k, step] of seen) {
      const f = unit.facing === undefined ? 0 : facingTo(step.path!.at(-2) ?? unit.pos, step.pos);
      if (!bodyFits(grid, state, unit, step.pos, f)) seen.delete(k);
    }
  return seen;
}

// Path to `target`, without the starting tile (built by `reachable`, passing through allies); null if unreachable.
export function pathTo(reach: Map<string, Step>, target: Pos): Pos[] | null {
  return reach.get(posKey(target))?.path ?? null;
}

// max range against a tile: +1 per level above the target for whoever has heightRange (in cells on the split map)
export function maxRange(grid: Grid, ability: AbilityDef, from: Pos, to: Pos): number {
  const up = ability.heightRange ? Math.max(0, standH(tileAt(grid, from)) - standH(tileAt(grid, to))) : 0;
  return farCells(grid, ability.range[1] + up);
}

export function inAbilityRange(grid: Grid, ability: AbilityDef, from: Pos, to: Pos): boolean {
  const d = dist(from, to);
  return d >= nearCells(grid, ability.range[0]) && d <= maxRange(grid, ability, from, to);
}
