// Who answers a strike with a counter, which counters a move owes, and `counters`, which plays them (from combat.ts, Nov 20).
import { ABILITIES } from './abilities.ts';
import { COMBAT, type Preview, previewAbility, resolveAbility } from './combat.ts';
import { dist, facingTo, type Grid } from './grid.ts';
import { aimEnds, nearCells, turnedTo } from './pathing.ts';
import type { BattleEvent, BattleState, Pos, UnitState } from './types.ts';
import { UNIT_DEFS } from './units.ts';

// the unit's basic attack (the 1st ability): it is the one that fires on the counter-attack; ranged if it reaches more than 1 tile
export const basicOf = (def: string) => UNIT_DEFS[def].abilities[0];
export const isRanged = (abilityId: string) => ABILITIES[abilityId].range[1] > 1;
// Nov 15, Fernando: only a single-target strike counters for now; an area one (the Colossus' Shadow Wave) never does
const answersSingle = (def: string) => !!basicOf(def) && ABILITIES[basicOf(def)].radius === 0;

// Who gains a counter when `actor` strikes `u` with `abilityId` (Nov 13): a unit of the other side with a single-target basic
// attack, whatever the strike's kind (Nov 15, Fernando: a ranged unit also answers the melee one that hit it); not the
// Beacon, and not from a heal, a support ability or a charge (it lands later: the aim must not promise a counter the rule
// never owes)
export function canCounter(actor: UnitState, abilityId: string, u: UnitState): boolean {
  const a = ABILITIES[abilityId];
  return (
    a.charge === 0 &&
    !(a.heal[1] > 0 || a.ally) &&
    u.team !== actor.team &&
    answersSingle(u.def) &&
    UNIT_DEFS[u.def].speed > 0
  );
}

export interface PendingCounter {
  unit: string; // who strikes back
  at: Pos; // where it finds the attacker: the tile it leaves, or the stop for a shooter it leaves in contact
  preview: Preview; // that strike, from the counter's own rule (shot path, friendly fire)
}

// `pos` is closer to `foe` than its basic attack's minimum range, measured like the aim (`state` has the unit there)
export function inContact(grid: Grid, state: BattleState, foe: UnitState, pos: Pos): boolean {
  const [from, to] = aimEnds(grid, state, foe, pos);
  return dist(from, to) < nearCells(grid, ABILITIES[basicOf(foe.def)].range[0]);
}

// Counter-attack (Nov 13, Fernando's request; half damage, his choice; redefined on Nov 15 after he was struck by a unit he
// had not attacked that turn): a unit `actorId` struck this turn (turn.engaged) strikes back at half on each move order that
// starts in the reach of its basic attack and ends out of it, hit before the attacker leaves, so cover or a unit in the way
// catches the shot. A shooter it stood too close to (Nov 15, Fernando: an archer answers the melee that hit it and walked
// away) fires instead once a move takes the attacker out of that contact, at the stop, if it is in its range. The attacker
// turns to face it, so a counter never gets the side or back bonus. Read by the rule, the AI and the move preview alike
export function pendingCounters(grid: Grid, state: BattleState, actorId: string, to: Pos): PendingCounter[] {
  const actor = state.units.find((u) => u.id === actorId);
  if (!actor || state.turn.actor !== actorId) return [];
  const out: PendingCounter[] = [];
  for (const id of state.turn.engaged ?? []) {
    const foe = state.units.find((u) => u.id === id);
    if (!foe || !answersSingle(foe.def)) continue; // an area one owed by a save from before the single-target rule
    // the attacker at `pos`, facing the counter; charged: the counter-attack pays no MP or stock
    const at = (pos: Pos) => {
      const facing = actor.facing === undefined ? undefined : turnedTo(grid, state, actor, pos, facingTo(pos, foe.pos));
      const moved = { ...state, units: state.units.map((u) => (u === actor ? { ...u, pos, facing } : u)) };
      return previewAbility(grid, moved, foe.id, basicOf(foe.def), pos, true);
    };
    const [here, there] = [at(actor.pos), at(to)];
    if (here.ok && !there.ok) out.push({ unit: foe.id, at: actor.pos, preview: here });
    // a stop still in contact is out of its range too, so `there.ok` already means the attacker left that contact
    else if (there.ok && inContact(grid, state, foe, actor.pos)) out.push({ unit: foe.id, at: to, preview: there });
  }
  return out;
}

// Plays `owed` counters at the attacker where it stands: those on its start tile before it leaves, the shooters it left in
// contact once it stands on the stop (`Battle.move`)
export function counters(grid: Grid, state: BattleState, actorId: string, owed: PendingCounter[]): BattleEvent[] {
  const events: BattleEvent[] = [];
  for (const c of owed) {
    const foe = state.units.find((u) => u.id === c.unit); // an earlier counter may have killed it (friendly fire)
    const actor = state.units.find((u) => u.id === actorId);
    if (!foe || !actor) continue;
    if (actor.facing !== undefined)
      actor.facing = turnedTo(grid, state, actor, actor.pos, facingTo(actor.pos, foe.pos));
    events.push(...resolveAbility(grid, state, c.unit, basicOf(foe.def), actor.pos, true, COMBAT.COUNTER));
    // one counter per foe per turn (Fernando, Nov 16): out, back in and out again no longer draws a second one
    const left = state.turn.engaged?.filter((id) => id !== c.unit);
    state.turn.engaged = left?.length ? left : undefined; // an empty list is not saved
  }
  return events;
}
