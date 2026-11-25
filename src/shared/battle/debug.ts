// The debug panel's changes to a live battle (Fernando, Nov 25: "spawnar monstro novo no mapa ... fazer essas mudancas no
// meio da luta"): create a unit, heal everyone, kill one. Pure and tested (tests/battle-debug.test.ts); the client's
// game/debug-menu.ts runs them. Undo does not take any of them back: forgetUndo clears the history after each, since a
// snapshot from before a spawn would drop the new unit (and draw it as a body)
import { Battle } from './battle.ts';
import { hurt } from './combat.ts';
import { canStand, dist, facingTo, type Grid, inBounds, subOf, tileAt } from './grid.ts';
import { halfDef } from './half.ts';
import { bodyOf, noStopAt, restsOn, unitAt } from './pathing.ts';
import type { BattleEvent, BattleState, Pos, Team, UnitState } from './types.ts';
import { HALF, isObjective, UNIT_DEFS } from './units.ts';

// every class a battle may hold: the sheets as written, not their half-tile tokens, the developer's and the expedition's
// runtime copies (dev-h0, dev-e0…, a built battle's mapedit_<map>-h0: every runtime sheet has a dash) or the Beacon, which is an objective and never plays
export const spawnClasses = () =>
  Object.keys(UNIT_DEFS).filter((id) => !id.endsWith(HALF) && !id.includes('-') && !isObjective(id));

// The unit `base` of `team` standing on `at`, or on the nearest spot its whole body fits (every cell on the map,
// standable, not a pass-through tile or a body, nobody on it, and on a split map even ground, as a walk leaves it); null
// when nowhere fits. On a split map the sheet becomes its token (halfDef), so a rat takes one cell and a snake two.
// Born as initialState makes a unit: full life, ct 0, its sheet's counters, looking at the nearest foe. `taken`: ids the
// client still draws (the fallen), which a new id must not reuse
export function spawnUnit(
  grid: Grid,
  state: BattleState,
  base: string,
  team: Team,
  at: Pos,
  taken: Iterable<string> = [],
): UnitState | null {
  const def = subOf(grid) > 1 ? halfDef(base) : base;
  const d = UNIT_DEFS[def];
  const used = new Set([...taken, ...state.units.map((u) => u.id)]);
  let n = 1;
  while (used.has(`${base}-debug-${n}`)) n++;
  const foes = state.units.filter((u) => u.team !== team);
  const facing = (p: Pos) => {
    const foe = foes.reduce<UnitState | null>((a, u) => (!a || dist(u.pos, p) < dist(a.pos, p) ? u : a), null);
    return foe ? facingTo(p, foe.pos) : 0;
  };
  const fits = (p: Pos) =>
    bodyOf(def, p, facing(p)).every(
      (c) => inBounds(grid, c) && canStand(tileAt(grid, c)) && !noStopAt(grid, state, c) && !unitAt(state, c),
    ) &&
    (subOf(grid) === 1 || restsOn(grid, p, d.size ?? 1));
  // the nearest spot first; a tie goes to the upper row, then the left
  const spots: Pos[] = [];
  for (let y = 0; y < grid.height; y++) for (let x = 0; x < grid.width; x++) spots.push({ x, y });
  spots.sort((a, b) => dist(a, at) - dist(b, at));
  const pos = spots.find(fits);
  if (!pos) return null;
  const unit: UnitState = {
    id: `${base}-debug-${n}`,
    def,
    team,
    pos,
    hp: d.hp,
    ct: 0,
    ...(d.speed > 0 && { facing: facing(pos) }),
    ...(d.vars && { vars: { ...d.vars } }),
  };
  state.units.push(unit);
  return unit;
}

// everyone back to full life
export function healAll(state: BattleState) {
  for (const u of state.units) u.hp = UNIT_DEFS[u.def].hp;
}

// the unit on `at` dies as a blow would kill it (combat.ts hurt: its body, its charges, its counters); false when nobody is there
export function killAt(state: BattleState, at: Pos): BattleEvent[] {
  const u = unitAt(state, at);
  const events: BattleEvent[] = [];
  if (u) hurt(state, u, u.hp, events);
  return events;
}

// a fresh history: Undo stops at the change the panel made (the sandbox's rewind, without going back)
export const forgetUndo = (b: Battle) => Object.assign(b, new Battle(b.grid, b.state, b.undosLeft));
