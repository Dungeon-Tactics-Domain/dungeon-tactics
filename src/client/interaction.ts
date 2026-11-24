// What touch does in battle, without DOM or Three (testable): Move mode, chosen tile waiting for Confirm and
// unit under inspection. The scene and the HUD only draw what `highlights` returns.
import { ABILITIES, type AbilityDef } from '../shared/battle/abilities.ts';
import type { Battle } from '../shared/battle/battle.ts';
import { type Preview, previewAbility } from '../shared/battle/combat.ts';
import { pendingCounters } from '../shared/battle/counter.ts';
import { FACING, type Grid, inBounds, posKey, samePos, subOf } from '../shared/battle/grid.ts';
import {
  aimTile,
  areaOf,
  cellsOf,
  closest,
  farCells,
  footprint,
  gap,
  inAbilityRange,
  inArea,
  isMelee,
  pathTo,
  reachable,
  unitAt,
} from '../shared/battle/pathing.ts';
import { chargeAim } from '../shared/battle/turn-queue.ts';
import type { BattleEvent, BattleState, Pos } from '../shared/battle/types.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';

export type Mode = { k: 'move' } | { k: 'idle' };
export interface Ui {
  mode: Mode;
  pending: Pos | null; // chosen tile; only becomes an action on Confirm (spec: 2nd tap picks, button executes)
  inspect: string | null; // unit tapped to see HP and threat
  invalid: boolean; // the last tap landed on a tile that doesn't work: the card warns instead of staying silent
}
export type TileKind = 'actor' | 'move' | 'range' | 'blocked' | 'threat' | 'area' | 'target' | 'nogo' | 'counter';
export interface Highlights {
  tiles: { pos: Pos; kind: TileKind }[];
  path: Pos[] | null;
  preview: Preview | null;
  size?: number; // cells per side of whoever walks `path`: a big unit or a half-tile token walks by its corner cell
  invalid?: boolean; // `Ui.invalid`, for the HUD's help line: the last tap landed on a tile that does not work
}

// not moved yet: Move; already moved: nothing to aim here, Act has its own screens (act-flow.ts)
export function defaultMode(b: Battle): Mode {
  return !b.over && b.reach().size && !b.state.turn.moved ? { k: 'move' } : { k: 'idle' };
}

const allowed = (b: Battle, m: Mode) => m.k === 'idle' || b.reach().size > 0;

const withMode = (mode: Mode): Ui => ({ mode, pending: null, inspect: null, invalid: false });

export const freshUi = (b: Battle): Ui => withMode(defaultMode(b));
export const selectMode = (b: Battle, ui: Ui, mode: Mode): Ui => (allowed(b, mode) ? withMode(mode) : ui);

export function tapTile(b: Battle, ui: Ui, pos: Pos): Ui {
  const other = unitAt(b.state, pos);
  const mode = ui.mode;
  if (mode.k === 'move' && b.reach().has(posKey(pos))) return { ...ui, pending: pos, inspect: null, invalid: false };
  if (other && other.id !== b.actor.id) return { ...withMode(mode), inspect: other.id };
  // tapping your own hero clears the choice; so does an empty tile that doesn't work, but it warns
  return { ...withMode(mode), invalid: !other && mode.k !== 'idle' };
}

// Keyboard cursor: hovering already shows the preview (path or hit %), as in FFT; Enter executes.
// A tile that doesn't work only clears the choice: a warning on every cursor step would be noise.
export const hoverTile = (b: Battle, ui: Ui, pos: Pos): Ui => ({ ...tapTile(b, ui, pos), invalid: false });

// Esc: releases the marked tile and the inspection
export function cancel(ui: Ui): Ui {
  return ui.pending || ui.inspect ? { ...withMode(ui.mode), pending: null } : ui;
}

export function confirm(b: Battle, ui: Ui): { events: BattleEvent[]; ui: Ui } {
  if (ui.mode.k !== 'move' || !ui.pending) return { events: [], ui };
  const events = b.move(ui.pending);
  // whoever moves may fall into the counterattack (Nov 13): without an actor, the Ui stays as it was and the game passes the turn
  const alive = b.state.units.some((u) => u.id === b.state.turn.actor);
  return { events, ui: events.length && alive ? freshUi(b) : ui };
}

export function allTiles(b: Battle): Pos[] {
  const out: Pos[] = [];
  for (let y = 0; y < b.grid.height; y++) for (let x = 0; x < b.grid.width; x++) out.push({ x, y });
  return out;
}

// What the unit can hit on its next turn: move and then use any ability (without checking sight;
// it's the "enemy range" of the puzzle pillar, a wide warning and not the exact prediction)
export function threat(b: Battle, unitId: string): Pos[] {
  const u = b.state.units.find((x) => x.id === unitId)!;
  const def = UNIT_DEFS[u.def];
  if (!def.abilities.length) return [];
  const spots = [u.pos, ...[...reachable(b.grid, b.state, unitId).values()].map((s) => s.pos)];
  const size = def.size ?? 1;
  // the rule's own reading (aimEnds): the square's cell nearest to the aimed whole tile's square; the tile's side is worked out once per cell
  return allTiles(b).filter((t) => {
    const area = areaOf(b.grid, b.state, aimTile(b.grid, b.state, t));
    return spots.some((s) => {
      const ends = closest(cellsOf(s, size), area);
      return def.abilities.some((a) => inAbilityRange(b.grid, ABILITIES[a], ...ends));
    });
  });
}

// Another unit's range, from its mini menu (unit-peek.ts; Fernando, Nov 18 night): where it walks in blue, what it
// could strike after walking in red (the threat above), its own square and the acting hero's as the actor
export function rangeMarks(b: Battle, unitId: string): Highlights {
  const tiles = new Map<string, { pos: Pos; kind: TileKind }>();
  const mark = (pos: Pos, kind: TileKind) => tiles.set(posKey(pos), { pos, kind });
  const u = b.state.units.find((x) => x.id === unitId);
  if (u) {
    for (const p of threat(b, unitId)) mark(p, 'threat');
    const size = UNIT_DEFS[u.def].size ?? 1;
    for (const s of reachable(b.grid, b.state, unitId).values()) for (const c of cellsOf(s.pos, size)) mark(c, 'move');
    for (const c of footprint(u)) mark(c, 'actor');
  }
  for (const c of footprint(b.actor)) mark(c, 'actor');
  return { tiles: [...tiles.values()], path: null, preview: null };
}

// `cursor`: the tile under the cursor, whose square shows as not fitting when a unit bigger than one cell cannot stop there (Move)
export function highlights(b: Battle, ui: Ui, cursor?: Pos): Highlights {
  const tiles = new Map<string, { pos: Pos; kind: TileKind }>();
  const mark = (pos: Pos, kind: TileKind) => tiles.set(posKey(pos), { pos, kind });
  let path: Pos[] | null = null;
  const size = ui.mode.k === 'move' ? (UNIT_DEFS[b.actor.def].size ?? 1) : 1;
  const reach = ui.mode.k === 'move' ? b.reach() : null; // not cached in Battle: worked out once per cursor change
  if (ui.inspect && b.state.units.some((u) => u.id === ui.inspect))
    for (const p of threat(b, ui.inspect)) mark(p, 'threat');
  if (reach) {
    // every cell the unit's square can cover: a 2x2 token stops by its corner cell, and marking only the corners showed the
    // area half a tile off (Nov 14, Fernando on stage 0: "it needs a preview of the tiles the units will occupy in 2x2")
    // after a strike, a stop that draws the counter of a unit struck this turn (Nov 15, Fernando; pendingCounters): red frame; a
    // cell a counter-free stop also covers stays blue
    const safe = new Set<string>();
    for (const s of reach.values()) {
      const red = !!b.state.turn.engaged && pendingCounters(b.grid, b.state, b.actor.id, s.pos).length > 0;
      for (const c of cellsOf(s.pos, size))
        if (!red) {
          safe.add(posKey(c));
          mark(c, 'move');
        } else if (!safe.has(posKey(c))) mark(c, 'counter');
    }
    if (ui.pending) path = pathTo(reach, ui.pending);
  }
  if (!b.over) for (const c of footprint(b.actor)) mark(c, 'actor');
  // the choice goes over the actor's square: a 2x2 token stepping 1 cell overlaps where it stands
  if (reach) {
    // the whole square where it would stop; only `reach` says whether it fits (a square on 4 marked cells may still
    // straddle a step, a ledge corner, an ally or a body). A 1-cell unit marks only its chosen tile, as before the squares: the red
    // square under the cursor is for units bigger than one cell (Nov 14 review: not asked for whole tiles, nor FFT's feel)
    const at = size > 1 ? (ui.pending ?? cursor) : ui.pending;
    const fits = !!at && reach.has(posKey(at));
    if (at && !samePos(at, b.actor.pos))
      for (const c of cellsOf(at, size)) if (inBounds(b.grid, c)) mark(c, fits ? 'target' : 'nogo');
  }
  return { tiles: [...tiles.values()], path, preview: null, size, invalid: ui.invalid };
}

// Direction choice at the end of the turn: the tiles beside each side of the acting unit's square, the faced side marked
// (beside a 2x2 token, not around its corner cell, which put two of the four marks under it)
export function facingHighlights(b: Battle): Highlights {
  const me = b.actor,
    s = UNIT_DEFS[me.def].size ?? 1;
  const side = (d: Pos, k: number): Pos => ({
    x: d.x > 0 ? me.pos.x + s : d.x < 0 ? me.pos.x - 1 : me.pos.x + k,
    y: d.y > 0 ? me.pos.y + s : d.y < 0 ? me.pos.y - 1 : me.pos.y + k,
  });
  const tiles = FACING.flatMap((d, i) =>
    Array.from({ length: s }, (_, k) => side(d, k))
      .filter((p) => inBounds(b.grid, p))
      .map((pos) => ({ pos, kind: (i === me.facing ? 'target' : 'range') as TileKind })),
  );
  return {
    tiles: [...tiles, ...footprint(me).map((pos) => ({ pos, kind: 'actor' as const }))],
    path: null,
    preview: null,
  };
}

// Every cell of the whole tiles an area touches: the rule hits any token whose 2x2 touches it, so painting by cell left tiles
// half lit (Nov 19); the diagonal half tiles an area adds on half tiles (pathing.ts inArea, Nov 24: "Cantos em meio-tile")
// stay half tiles, so radius 1 reads as a rounded cross and not a 3x3 square
export function areaCells(grid: Grid, area: Pos[], radius: number, square = false): Pos[] {
  const k = subOf(grid),
    f = farCells(grid, radius);
  const out: Pos[] = [];
  for (let y = 0; y < grid.height; y += k)
    for (let x = 0; x < grid.width; x += k) {
      const tile = cellsOf({ x, y }, k);
      if (square ? inArea(grid, area, radius, tile, true) : gap(area, tile) <= f) out.push(...tile);
      else if (!square) out.push(...tile.filter((c) => inArea(grid, area, radius, [c])));
    }
  return out;
}

// What the banner before an attack marks: the aimed cell as the target and the ability's area around it
export function attackMarks(b: Battle, a: AbilityDef, target: Pos): { pos: Pos; kind: TileKind }[] {
  const area =
    a.radius > 0
      ? areaCells(b.grid, areaOf(b.grid, b.state, aimTile(b.grid, b.state, target)), a.radius, isMelee(a))
      : [];
  return [target, ...area.filter((p) => !samePos(p, target))].map((pos, i) => ({ pos, kind: i ? 'area' : 'target' }));
}

// Tiles the queued charges will hit (night of Nov 12): a charged spell follows the unit (follow) and the Aimed Shot's
// stays on its tile; the area is the ability's radius around it. The scene paints it purple and the HUD says it in text, to give time to leave.
export function chargeDanger(grid: Grid, state: BattleState): Map<string, string> {
  const out = new Map<string, string>(); // tile -> ability that lands on it
  for (const c of state.charges) {
    // same calculation as the charge when it fires (turn-queue.ts): the lock, and since Nov 15 the shot traced from where the
    // caster stands, so a shot that will stop on a wall or a unit marks the area there
    const aim = chargeAim(state, c);
    const shot = state.units.some((u) => u.id === c.unit)
      ? previewAbility(grid, state, c.unit, c.ability, aim, true)
      : null;
    const center = shot?.ok ? shot.center : aim;
    // a charge aimed at a cell lands on its whole tile, as when it fires (previewAbility)
    const r = ABILITIES[c.ability].radius,
      area = areaOf(grid, state, aimTile(grid, state, center));
    for (const p of areaCells(grid, area, r, isMelee(ABILITIES[c.ability]))) out.set(posKey(p), c.ability);
  }
  return out;
}
