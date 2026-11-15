// What touch does in battle, without DOM or Three (testable): bar mode, chosen tile waiting for Confirm and
// unit under inspection. The scene and the HUD only draw what `highlights` returns.
import { ABILITIES } from '../shared/battle/abilities.ts';
import type { Battle } from '../shared/battle/battle.ts';
import type { Preview } from '../shared/battle/combat.ts';
import { FACING, type Grid, inBounds, posKey, samePos } from '../shared/battle/grid.ts';
import {
  aimEnds,
  aimTile,
  areaOf,
  cellsOf,
  footprint,
  inAbilityRange,
  inArea,
  lineOfSight,
  nearestTile,
  pathTo,
  reachable,
  sightEnds,
  unitAt,
} from '../shared/battle/pathing.ts';
import type { BattleEvent, BattleState, Pos } from '../shared/battle/types.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';

export type Mode = { k: 'move' } | { k: 'ability'; id: string } | { k: 'idle' };
export interface Ui {
  mode: Mode;
  pending: Pos | null; // chosen tile; only becomes an action on Confirm (spec: 2nd tap picks, button executes)
  inspect: string | null; // unit tapped to see HP and threat
  invalid: boolean; // the last tap landed on a tile that doesn't work: the card warns instead of staying silent
}
export type TileKind = 'actor' | 'move' | 'range' | 'blocked' | 'threat' | 'area' | 'target' | 'nogo';
export interface Highlights {
  tiles: { pos: Pos; kind: TileKind }[];
  path: Pos[] | null;
  preview: Preview | null;
  size?: number; // cells per side of whoever walks `path`: a big unit or a half-tile token walks by its corner cell
}

const selfCentered = (id: string) => ABILITIES[id].range[1] === 0;

// some tile with a unit accepts the ability from here and it hits who it should (enemy, or ally for healing): an area
// that would only hit the ally next to it doesn't count as a target
function hasTarget(b: Battle, id: string): boolean {
  const heal = ABILITIES[id].heal[1] > 0;
  // any tile of the unit (the large one occupies 4; only one of them may be in range)
  return b.state.units.some((u) =>
    footprint(u).some((p) =>
      b.preview(id, p).targets.some((tg) => {
        const hit = b.state.units.find((x) => x.id === tg.unit)!;
        return heal === (hit.team === b.actor.team);
      }),
    ),
  );
}

// not moved yet: Move; already moved: the first ability that has a target from here (no target, none: picking Stab
// far from everyone only asked for an impossible tap)
export function defaultMode(b: Battle): Mode {
  if (b.over) return { k: 'idle' };
  if (b.reach().size && !b.state.turn.moved) return { k: 'move' }; // already moved: the default is to act (the rest of the movement is left for after)
  const id = !b.state.turn.usedAbility && UNIT_DEFS[b.actor.def].abilities.find((a) => hasTarget(b, a));
  return id ? { k: 'ability', id } : { k: 'idle' };
}

const allowed = (b: Battle, m: Mode) =>
  m.k === 'idle' ||
  (m.k === 'move' ? b.reach().size > 0 : !b.state.turn.usedAbility && UNIT_DEFS[b.actor.def].abilities.includes(m.id));

// ability centered on the user is born with the target already marked: there's no tile to choose
const withMode = (b: Battle, mode: Mode): Ui => ({
  mode,
  pending: mode.k === 'ability' && selfCentered(mode.id) ? b.actor.pos : null,
  inspect: null,
  invalid: false,
});

export const freshUi = (b: Battle): Ui => withMode(b, defaultMode(b));
export const selectMode = (b: Battle, ui: Ui, mode: Mode): Ui => (allowed(b, mode) ? withMode(b, mode) : ui);

export function tapTile(b: Battle, ui: Ui, pos: Pos): Ui {
  const other = unitAt(b.state, pos);
  const mode = ui.mode;
  if (mode.k === 'move' && b.reach().has(posKey(pos))) return { ...ui, pending: pos, inspect: null, invalid: false };
  if (mode.k === 'ability' && !selfCentered(mode.id) && b.preview(mode.id, pos).ok)
    return { ...ui, pending: pos, inspect: null, invalid: false };
  if (other && other.id !== b.actor.id) return { ...withMode(b, mode), inspect: other.id };
  // tapping your own hero clears the choice; so does an empty tile that doesn't work, but it warns
  return { ...withMode(b, mode), invalid: !other && mode.k !== 'idle' };
}

// Keyboard cursor: hovering already shows the preview (path or hit %), as in FFT; Enter executes.
// A tile that doesn't work only clears the choice: a warning on every cursor step would be noise.
export const hoverTile = (b: Battle, ui: Ui, pos: Pos): Ui => ({ ...tapTile(b, ui, pos), invalid: false });

// Esc: first releases the marked tile and the inspection; again, goes back from the ability to Move (if not moved yet)
export function cancel(b: Battle, ui: Ui): Ui {
  if (ui.pending || ui.inspect) return { ...withMode(b, ui.mode), pending: null };
  if (ui.mode.k === 'ability' && !b.state.turn.moved) return withMode(b, { k: 'move' });
  return ui;
}

export function confirm(b: Battle, ui: Ui): { events: BattleEvent[]; ui: Ui } {
  if (!ui.pending || ui.mode.k === 'idle') return { events: [], ui };
  const events = ui.mode.k === 'move' ? b.move(ui.pending) : b.act(ui.mode.id, ui.pending);
  // whoever moves may fall into the counterattack (Nov 13): without an actor, the Ui stays as it was and the game passes the turn
  const alive = b.state.units.some((u) => u.id === b.state.turn.actor);
  return { events, ui: events.length && alive ? freshUi(b) : ui };
}

function allTiles(b: Battle): Pos[] {
  const out: Pos[] = [];
  for (let y = 0; y < b.grid.height; y++) for (let x = 0; x < b.grid.width; x++) out.push({ x, y });
  return out;
}

// What the unit can hit on its next turn: move and then use any ability (without checking sight;
// it's the "enemy range" of the puzzle pillar, a wide warning and not the exact prediction)
function threat(b: Battle, unitId: string): Pos[] {
  const u = b.state.units.find((x) => x.id === unitId)!;
  const def = UNIT_DEFS[u.def];
  if (!def.abilities.length) return [];
  const spots = [u.pos, ...[...reachable(b.grid, b.state, unitId).values()].map((s) => s.pos)];
  // from the square's cell nearest to the tile, like the rule (a token occupies 2x2 cells)
  const from = (s: Pos, t: Pos) => nearestTile({ ...u, pos: s }, t);
  return allTiles(b).filter((t) =>
    def.abilities.some((a) => spots.some((s) => inAbilityRange(b.grid, ABILITIES[a], from(s, t), t))),
  );
}

// `cursor`: the tile under the cursor, whose square shows as not fitting when a unit bigger than one cell cannot stop there (Move)
export function highlights(b: Battle, ui: Ui, cursor?: Pos): Highlights {
  const tiles = new Map<string, { pos: Pos; kind: TileKind }>();
  const mark = (pos: Pos, kind: TileKind) => tiles.set(posKey(pos), { pos, kind });
  let path: Pos[] | null = null;
  let preview: Preview | null = null;
  const size = ui.mode.k === 'move' ? (UNIT_DEFS[b.actor.def].size ?? 1) : 1;
  const reach = ui.mode.k === 'move' ? b.reach() : null; // not cached in Battle: worked out once per cursor change
  if (ui.inspect && b.state.units.some((u) => u.id === ui.inspect))
    for (const p of threat(b, ui.inspect)) mark(p, 'threat');
  if (reach) {
    // every cell the unit's square can cover: a 2x2 token stops by its corner cell, and marking only the corners showed the
    // area half a tile off (Nov 14, Fernando on stage 0: "it needs a preview of the tiles the units will occupy in 2x2")
    for (const s of reach.values()) for (const c of cellsOf(s.pos, size)) mark(c, 'move');
    if (ui.pending) path = pathTo(reach, ui.pending);
  } else if (ui.mode.k === 'ability') {
    const a = ABILITIES[ui.mode.id];
    const own = footprint(b.actor);
    if (!selfCentered(a.id)) {
      // measured from the actor's cell nearest to the tile, like the rule (previewAbility)
      for (const t of allTiles(b)) {
        const [from, to] = aimEnds(b.grid, b.state, b.actor, t);
        if (!inAbilityRange(b.grid, a, from, to)) continue;
        mark(t, a.needsSight && !lineOfSight(b.grid, ...sightEnds(b.grid, b.state, b.actor, t)) ? 'blocked' : 'range');
      }
    }
    if (ui.pending) {
      preview = b.preview(a.id, ui.pending);
      const area = areaOf(b.grid, b.state, preview.center);
      for (const t of allTiles(b))
        if (a.radius > 0 && inArea(b.grid, area, a.radius, [t]) && !own.some((p) => samePos(p, t))) mark(t, 'area');
    }
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
  } else if (ui.pending)
    for (const c of areaOf(b.grid, b.state, aimTile(b.grid, b.state, ui.pending))) mark(c, 'target'); // the aimed whole tile: all 4 cells of a token
  return { tiles: [...tiles.values()], path, preview, size };
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

// Tiles the queued charges will hit (night of Nov 12): a charged spell follows the unit (follow) and the Aimed Shot's
// stays on its tile; the area is the ability's radius around it. The scene paints it purple and the HUD says it in text, to give time to leave.
export function chargeDanger(grid: Grid, state: BattleState): Map<string, string> {
  const out = new Map<string, string>(); // tile -> ability that lands on it
  for (const c of state.charges) {
    // same calculation as the charge when leaving (turn-queue.ts): large unit followed, its tile closest to the caster
    const followed = c.follow ? state.units.find((u) => u.id === c.follow) : undefined;
    const caster = state.units.find((u) => u.id === c.unit);
    const center = followed ? (caster ? nearestTile(followed, caster.pos) : followed.pos) : c.target;
    // a charge aimed at a cell lands on its whole tile, as when it fires (previewAbility)
    const r = ABILITIES[c.ability].radius,
      area = areaOf(grid, state, aimTile(grid, state, center));
    for (let y = 0; y < grid.height; y++)
      for (let x = 0; x < grid.width; x++) if (inArea(grid, area, r, [{ x, y }])) out.set(posKey({ x, y }), c.ability);
  }
  return out;
}
