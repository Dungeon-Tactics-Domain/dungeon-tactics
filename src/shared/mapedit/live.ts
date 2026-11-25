// Editing the map mid-battle (battle builder grill, Nov 25, Fernando: "so pode enquanto nao tiver movimento sendo
// feito... enquanto tiver no turno do jogador"): the edited whole-tile map becomes the battle's grid, and whoever stands
// where nobody may stop now goes to the nearest free tile, so the battle goes on from the same turn.
import { canStand, dist, type Grid, inBounds, subOf, tileAt } from '../battle/grid.ts';
import { HALF, split } from '../battle/half.ts';
import { bodyFits, bodyOf, noStopAt, restsOn, unitAt } from '../battle/pathing.ts';
import { controlOf, SCENARIOS, type Scenario } from '../battle/scenarios.ts';
import type { BattleState, Pos, UnitState } from '../battle/types.ts';
import { UNIT_DEFS } from '../battle/units.ts';
import type { MapDoc } from './doc.ts';

export interface LiveEdit {
  grid: Grid;
  state: BattleState;
  moved: { unit: string; from: Pos; to: Pos }[];
}

// `moving`: the client's word that nothing animates (a walk, a shot, the AI thinking)
export function canEditLive(state: BattleState, scenario: Scenario | undefined, moving: boolean): boolean {
  const actor = state.units.find((u) => u.id === state.turn.actor);
  return !moving && state.outcome === 'ongoing' && !!actor && controlOf(scenario, actor.team) === 'player';
}

// where the unit may stop, by the same checks as a walk's or a push's end (pathing.ts)
const standsAt = (grid: Grid, state: BattleState, u: UnitState, p: Pos) =>
  bodyOf(u.def, p, u.facing).every((c) => {
    if (!inBounds(grid, c) || !canStand(tileAt(grid, c)) || noStopAt(grid, state, c)) return false;
    const o = unitAt(state, c);
    return !o || o.id === u.id;
  }) &&
  restsOn(grid, p, UNIT_DEFS[u.def].size ?? 1) &&
  bodyFits(grid, state, u, p, u.facing);

// The battle on the edited map: the grid split as the running one is, and a copy of the state with each stranded unit
// on the free tile nearest to it (ties to the lowest row, then column). Null when the size changed or someone has no
// free tile left. Re-registers the scenario under its id (and its whole-tile source), since the save and the outcome
// read it there; the client rebuilds the board and a new Battle, so its Undo resets
export function editLive(state: BattleState, scenario: Scenario, doc: MapDoc): LiveEdit | null {
  // the builder's whole tiles, as docToScenario plays them (play.ts)
  const whole: Grid = { width: doc.width, height: doc.height, tiles: doc.tiles.map((t) => ({ ...t })) };
  const grid = subOf(scenario.grid) > 1 ? split(whole) : { ...scenario.grid, ...whole };
  if (grid.width !== scenario.grid.width || grid.height !== scenario.grid.height) return null;
  const next = structuredClone(state);
  const moved: LiveEdit['moved'] = [];
  const cells = Array.from({ length: grid.width * grid.height }, (_, i) => ({
    x: i % grid.width,
    y: Math.floor(i / grid.width),
  }));
  const lost = (u: UnitState) =>
    bodyOf(u.def, u.pos, u.facing).some((c) => !inBounds(grid, c) || !canStand(tileAt(grid, c)));
  for (const u of next.units) {
    // a spot the old map already let it hold (a small body off a tile's corner) is not the edit's doing
    const held = standsAt(scenario.grid, state, u, u.pos);
    if (!lost(u) && (!held || standsAt(grid, next, u, u.pos))) continue;
    const from = u.pos;
    const to = cells
      .filter((p) => standsAt(grid, next, u, p))
      .sort((a, b) => dist(from, a) - dist(from, b) || a.y - b.y || a.x - b.x)[0];
    if (!to) return null;
    u.pos = to;
    moved.push({ unit: u.id, from, to });
  }
  SCENARIOS[scenario.id] = { ...scenario, grid };
  const source = scenario.id.endsWith(HALF) ? scenario.id.slice(0, -HALF.length) : null;
  if (source && SCENARIOS[source] && subOf(SCENARIOS[source].grid) === 1)
    SCENARIOS[source] = { ...SCENARIOS[source], grid: whole };
  return { grid, state: next, moved };
}
