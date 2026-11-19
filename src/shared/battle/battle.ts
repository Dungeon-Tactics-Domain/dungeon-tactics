import { ABILITIES, defaultLock } from './abilities.ts';
import { applyItem, itemEffect } from './bag.ts';
import { checkOutcome, counters, type Preview, pay, previewAbility, resolveAbility, spikeAtTurnEnd } from './combat.ts';
import { canCounter, pendingCounters } from './counter.ts';
import { FACING, facingTo, type Grid, posKey, samePos } from './grid.ts';
import { isInt, isObj, parseBattleState } from './parse-state.ts';
import { pathTo, reachable, type Step, unitAt } from './pathing.ts';
import { initialState, SCENARIOS, type Scenario } from './scenarios.ts';
import { finishTurn, startNextTurn } from './turn-queue.ts';
import type { BattleEvent, BattleState, Lock, Pos, UnitState } from './types.ts';
import { UNIT_DEFS } from './units.ts';

export { parseBattleState }; // the tests and old callers read it from here

// Undo per battle (spec: initial value 3, to be measured). It only counts within the current turn: after the turn ends the
// enemy has already acted and the new information does not come back.
export const UNDO_LIMIT = 3;
const SAVE_VERSION = 2; // 2 (Nov 12): charges in the state; an old save starts from scratch

// What undo restores: everything except the RNG. If the rng came back, attacking again would repeat the same die
// and undo would become "try until it hits" (pillar 3: never a hidden miss, but also never a repeated die).
type Frame = Omit<BattleState, 'rng'>;
interface Entry {
  before: Frame;
  paid: boolean; // the attack rolled a die: undoing costs one; moving reveals nothing and is free
}

// Battle aggregate: owner of the state, the undo history and the save. The rules live in pure functions
// (combat, pathing, turn-queue); only what has a lifecycle lives here.
export class Battle {
  readonly grid: Grid;
  state: BattleState;
  undosLeft: number;
  private history: Entry[];

  // explicit fields (no parameter properties): Node only strips types when running the simulation scripts
  constructor(grid: Grid, state: BattleState, undosLeft = UNDO_LIMIT, history: Entry[] = []) {
    this.grid = grid;
    this.state = state;
    this.undosLeft = undosLeft;
    this.history = history;
  }

  static start(scenario: Scenario, seed: number): Battle {
    const state = initialState(scenario, seed);
    startNextTurn(scenario.grid, state);
    return new Battle(scenario.grid, state);
  }

  get actor(): UnitState {
    return this.state.units.find((u) => u.id === this.state.turn.actor)!;
  }
  get over(): boolean {
    return this.state.outcome !== 'ongoing';
  }
  // the last step was free (walking without taking anything): the menu offers "Undo move", also after acting. Starting a
  // charge is free too but is no walk: after "move, charge", Move must stay Move (Nov 15)
  get lastFree(): boolean {
    const last = this.history.at(-1);
    return !!last && !last.paid && last.before.turn.usedAbility === this.state.turn.usedAbility;
  }
  get canUndo(): boolean {
    const last = this.history.at(-1);
    return !!last && (!last.paid || this.undosLeft > 0);
  }

  // since Nov 13 you can walk after starting to charge (Fernando's request: "can move to throw it farther"): the charge is
  // not undone and fires from wherever the unit is; since Nov 15 starting it costs half of what is left (act)
  reach(): Map<string, Step> {
    // over first: a battle that ended on the actor's death has no actor to read
    if (this.over) return new Map();
    const left = UNIT_DEFS[this.actor.def].move - (this.state.turn.spent ?? 0);
    return left <= 0 ? new Map() : reachable(this.grid, this.state, this.actor.id, left);
  }

  preview(abilityId: string, target: Pos): Preview {
    return previewAbility(this.grid, this.state, this.actor.id, abilityId, target);
  }

  move(to: Pos): BattleEvent[] {
    const reach = this.reach();
    const path = pathTo(reach, to);
    if (!path) return [];
    this.remember(false);
    const from = this.actor.pos;
    const id = this.actor.id;
    const owed = pendingCounters(this.grid, this.state, id, to);
    const hit = counters(
      this.grid,
      this.state,
      id,
      owed.filter((c) => samePos(c.at, from)),
    ); // before it leaves
    // took a counter-attack: this move cannot be undone (Nov 13, Fernando's request: "you can only not undo the move if the
    // character takes damage or falls into a trap")
    if (hit.length) this.history = [];
    this.state.outcome = checkOutcome(this.state);
    if (!this.state.units.some((u) => u.id === id) || this.over) return hit; // died to the counter-attack: it never gets to leave
    this.state.turn.spent = (this.state.turn.spent ?? 0) + reach.get(posKey(to))!.cost;
    // with direction, whoever walks ends up looking where they were going
    if (this.actor.facing !== undefined) this.actor.facing = facingTo(path.at(-2) ?? from, to);
    this.actor.pos = to;
    this.state.turn.moved = true;
    // the event carries the starting tile in front (Nov 13): without it the animation began at the 1st step and the model "teleported"
    const walk: BattleEvent = { k: 'move', unit: id, path: [from, ...path] };
    // a shooter it stood too close to fires where it stops (Nov 15, Fernando)
    const shot = counters(
      this.grid,
      this.state,
      id,
      owed.filter((c) => !samePos(c.at, from)),
    );
    if (shot.length) this.history = [];
    this.state.outcome = checkOutcome(this.state);
    return [...hit, walk, ...shot];
  }

  // `lock`: where a charge stays aimed, picked by the player after the aim (Nov 15); without it, the ability's default
  act(abilityId: string, target: Pos, lock?: Lock): BattleEvent[] {
    if (this.over || this.state.turn.usedAbility || !this.preview(abilityId, target).ok) return [];
    // declaring a charge rolls no die: undo costs nothing (Nov 13, review; the roll comes when it fires)
    this.remember(ABILITIES[abilityId].charge === 0);
    if (this.actor.facing !== undefined && !samePos(target, this.actor.pos))
      this.actor.facing = facingTo(this.actor.pos, target); // turns toward the target
    const ability = ABILITIES[abilityId];
    let events: BattleEvent[];
    if (ability.charge > 0) {
      // slow action: pays the cost now and joins the queue; a new charge replaces the previous one of the same unit
      pay(this.actor, ability);
      // it may still walk, with half of what is left, rounded down (Nov 15, Fernando: "loses half, rounded up")
      const left = Math.max(0, UNIT_DEFS[this.actor.def].move - (this.state.turn.spent ?? 0));
      this.state.turn.spent = (this.state.turn.spent ?? 0) + Math.ceil(left / 2);
      const follow = (lock ?? defaultLock(ability)) === 'unit' ? (unitAt(this.state, target)?.id ?? null) : null;
      this.state.charges = [
        ...this.state.charges.filter((c) => c.unit !== this.actor.id),
        { unit: this.actor.id, ability: abilityId, target, follow, ticks: ability.charge },
      ];
      events = [{ k: 'charge', unit: this.actor.id, ability: abilityId, target }];
    } else {
      events = resolveAbility(this.grid, this.state, this.actor.id, abilityId, target);
      // whoever took the hit and can retaliate keeps watch for the rest of this turn: if the actor walks out of its reach,
      // it counter-attacks (counters)
      const owed = new Set(this.state.turn.engaged);
      for (const e of events) {
        const foe = (e.k === 'hit' || e.k === 'miss') && this.state.units.find((u) => u.id === e.unit);
        if (foe && canCounter(this.actor, abilityId, foe)) owed.add(foe.id);
      }
      if (owed.size) this.state.turn.engaged = [...owed];
    }
    this.state.turn.usedAbility = abilityId;
    return events;
  }

  // The Item command (bag.ts): no die, so undoing it is free and gives the item back
  useItem(item: string, target: Pos): BattleEvent[] {
    if (this.over || !itemEffect(this.grid, this.state, this.actor.id, item, target)) return [];
    this.remember(false);
    if (this.actor.facing !== undefined && !samePos(target, this.actor.pos))
      this.actor.facing = facingTo(this.actor.pos, target);
    return applyItem(this.grid, this.state, this.actor.id, item, target);
  }

  // Chooses where the current unit looks (only in a scenario with direction). Free and without undo: it reveals nothing.
  face(dir: number): void {
    if (!this.over && this.actor.facing !== undefined && FACING[dir]) this.actor.facing = dir;
  }

  // returns the events of the charges that fired before the next turn
  endTurn(): BattleEvent[] {
    this.history = [];
    if (this.over) return [];
    const spiked = spikeAtTurnEnd(this.grid, this.state);
    finishTurn(this.state);
    this.state.outcome = checkOutcome(this.state);
    return [...spiked, ...(this.over ? [] : startNextTurn(this.grid, this.state))];
  }

  undo(): boolean {
    if (!this.canUndo) return false;
    const { before, paid } = this.history.pop()!;
    if (paid) this.undosLeft--;
    this.state = { ...structuredClone(before), rng: this.state.rng };
    return true;
  }

  clone(): Battle {
    return new Battle(this.grid, structuredClone(this.state), this.undosLeft, structuredClone(this.history));
  }

  save(): string {
    return JSON.stringify({ v: SAVE_VERSION, state: this.state, undosLeft: this.undosLeft, history: this.history });
  }

  // A save in the browser may be old, edited or broken: any doubt returns null and the game starts from scratch.
  static load(json: string): Battle | null {
    let raw: unknown;
    try {
      raw = JSON.parse(json);
    } catch {
      return null;
    }
    if (!isObj(raw) || raw.v !== SAVE_VERSION) return null;
    const state = parseBattleState(raw.state);
    if (!state || !isInt(raw.undosLeft) || raw.undosLeft < 0 || raw.undosLeft > UNDO_LIMIT) return null;
    if (!Array.isArray(raw.history) || raw.history.length > 4) return null;
    let history: Entry[] = [];
    for (const e of raw.history) {
      if (!isObj(e) || typeof e.paid !== 'boolean' || !isObj(e.before)) return null;
      const frame = parseBattleState({ ...e.before, rng: 0 });
      if (!frame) return null;
      // history only lives inside one turn (endTurn clears it): a frame of another map or actor is not this battle's,
      // so only the undo history is dropped and the rest of the save loads as it is
      if (frame.scenario !== state.scenario || frame.turn.actor !== state.turn.actor) {
        history = [];
        break;
      }
      const { rng: _rng, ...before } = frame;
      history.push({ before, paid: e.paid });
    }
    return new Battle(SCENARIOS[state.scenario].grid, state, raw.undosLeft, history);
  }

  private remember(paid: boolean): void {
    const { rng: _rng, ...before } = this.state;
    this.history.push({ before: structuredClone(before), paid });
  }
}
