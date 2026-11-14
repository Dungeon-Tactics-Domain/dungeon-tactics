import { ABILITIES } from './abilities.ts';
import {
  basicOf,
  checkOutcome,
  counters,
  isRanged,
  previewAbility,
  resolveAbility,
  spikeAtTurnEnd,
  type Preview,
} from './combat.ts';
import { FACING, canStand, faceNearest, facingTo, inBounds, posKey, samePos, tileAt, type Grid } from './grid.ts';
import { pathTo, reachable, unitAt, type Step } from './pathing.ts';
import { SCENARIOS, initialState, type Scenario } from './scenarios.ts';
import { finishTurn, startNextTurn } from './turn-queue.ts';
import type { BattleEvent, BattleState, Charge, Pos, UnitState } from './types.ts';
import { UNIT_DEFS } from './units.ts';

// Undo per battle (spec: initial value 3, to be measured). It only counts within the current turn: after the turn ends the
// enemy has already acted and the new information does not come back.
export const UNDO_LIMIT = 3;
const SAVE_VERSION = 2; // 2 (Nov 12): charges in the state; an old save starts from scratch
const MAX_UNITS = 64;

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
  // the last step was free (walking without taking anything): the menu offers "Undo move", also after acting
  get lastFree(): boolean {
    const last = this.history.at(-1);
    return !!last && !last.paid;
  }
  get canUndo(): boolean {
    const last = this.history.at(-1);
    return !!last && (!last.paid || this.undosLeft > 0);
  }

  // since Nov 13 you can walk after starting to charge (Fernando's request: "can move to throw it farther"):
  // the charge is not undone and fires from wherever the unit is
  reach(): Map<string, Step> {
    const left = UNIT_DEFS[this.actor.def].move - (this.state.turn.spent ?? 0);
    return this.over || left <= 0 ? new Map() : reachable(this.grid, this.state, this.actor.id, left);
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
    const hit = counters(this.grid, this.state, id, to);
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
    return [...hit, { k: 'move', unit: this.actor.id, path: [from, ...path] }];
  }

  act(abilityId: string, target: Pos): BattleEvent[] {
    if (this.over || this.state.turn.usedAbility || !this.preview(abilityId, target).ok) return [];
    // declaring a charge rolls no die: undo costs nothing (Nov 13, review; the roll comes when it fires)
    this.remember(ABILITIES[abilityId].charge === 0);
    if (this.actor.facing !== undefined && !samePos(target, this.actor.pos))
      this.actor.facing = facingTo(this.actor.pos, target); // turns toward the target
    const ability = ABILITIES[abilityId];
    let events: BattleEvent[];
    if (ability.charge > 0) {
      // slow action: pays the cost now and joins the queue; a new charge replaces the previous one of the same unit
      if (ability.cost) this.actor.vars![ability.cost[0]] -= ability.cost[1];
      const follow = ability.panel ? null : (unitAt(this.state, target)?.id ?? null);
      this.state.charges = [
        ...this.state.charges.filter((c) => c.unit !== this.actor.id),
        { unit: this.actor.id, ability: abilityId, target, follow, ticks: ability.charge },
      ];
      events = [{ k: 'charge', unit: this.actor.id, ability: abilityId, target }];
    } else {
      events = resolveAbility(this.grid, this.state, this.actor.id, abilityId, target);
      // whoever took the hit and can retaliate the same way (melee or ranged) keeps watch: if the actor walks
      // afterwards, it counter-attacks (counters)
      if (!(ability.heal[1] > 0 || ability.ally)) {
        const ranged = isRanged(abilityId);
        for (const e of events) {
          if (e.k !== 'hit' && e.k !== 'miss') continue;
          const foe = this.state.units.find((u) => u.id === e.unit);
          if (
            !foe ||
            foe.team === this.actor.team ||
            !basicOf(foe.def) ||
            UNIT_DEFS[foe.def].speed === 0 ||
            isRanged(basicOf(foe.def)) !== ranged
          )
            continue; // the Beacon does not retaliate
          if (!(this.state.turn.engaged ?? []).some((x) => x.unit === foe.id))
            (this.state.turn.engaged ??= []).push({ unit: foe.id, ranged });
        }
      }
    }
    this.state.turn.usedAbility = abilityId;
    return events;
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
    const history: Entry[] = [];
    for (const e of raw.history) {
      if (!isObj(e) || typeof e.paid !== 'boolean' || !isObj(e.before)) return null;
      const frame = parseBattleState({ ...e.before, rng: 0 });
      if (!frame) return null;
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

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

// Save trust boundary: rebuilds the state only with known fields and checks limits (map, life, duplicates).
export function parseBattleState(raw: unknown): BattleState | null {
  if (!isObj(raw) || typeof raw.scenario !== 'string' || !Object.hasOwn(SCENARIOS, raw.scenario)) return null;
  const grid = SCENARIOS[raw.scenario].grid;
  if (!isInt(raw.rng) || !isInt(raw.turnsPlayed) || raw.turnsPlayed < 0) return null;
  if (raw.outcome !== 'ongoing' && raw.outcome !== 'victory' && raw.outcome !== 'defeat') return null;
  if (!Array.isArray(raw.units) || raw.units.length > MAX_UNITS) return null;
  const units: UnitState[] = [];
  const ids = new Set<string>();
  const cells = new Set<string>();
  for (const u of raw.units) {
    if (!isObj(u) || typeof u.id !== 'string' || typeof u.def !== 'string' || !Object.hasOwn(UNIT_DEFS, u.def))
      return null;
    if (u.team !== 'hero' && u.team !== 'enemy') return null;
    if (!isObj(u.pos) || !isInt(u.pos.x) || !isInt(u.pos.y)) return null;
    const pos = { x: u.pos.x, y: u.pos.y };
    // all the unit's tiles (a large one occupies 2x2 from `pos`): inside the map, walkable and empty (Nov 13,
    // review: only the corner tile was checked, and a Colossus covered the Beacon or left the map)
    const size = UNIT_DEFS[u.def].size ?? 1;
    const tiles = Array.from({ length: size * size }, (_, i) => ({
      x: pos.x + (i % size),
      y: pos.y + Math.floor(i / size),
    }));
    if (!tiles.every((p) => inBounds(grid, p) && canStand(tileAt(grid, p)) && !cells.has(`${p.x},${p.y}`))) return null;
    if (!isInt(u.hp) || u.hp < 1 || u.hp > UNIT_DEFS[u.def].hp || !isInt(u.ct) || Math.abs(u.ct) > 10000) return null;
    if (ids.has(u.id)) return null;
    ids.add(u.id);
    for (const p of tiles) cells.add(`${p.x},${p.y}`);
    // direction: every map has it since Nov 13; an older save (without it) opens facing the nearest enemy (filled in
    // after the loop). Counters only with the sheet's keys
    if (u.facing !== undefined && (!isInt(u.facing) || !FACING[u.facing])) return null;
    const defVars = UNIT_DEFS[u.def].vars;
    let vars: Record<string, number> | undefined;
    if (defVars) {
      if (!isObj(u.vars)) return null;
      vars = {};
      for (const k of Object.keys(defVars)) {
        const v = u.vars[k];
        if (!isInt(v) || Math.abs(v) > 9999) return null;
        vars[k] = v;
      }
    } else if (u.vars !== undefined) return null;
    units.push({
      id: u.id,
      def: u.def,
      team: u.team,
      pos,
      hp: u.hp,
      ct: u.ct,
      ...(u.facing !== undefined && { facing: u.facing as number }),
      ...(vars && { vars }),
    });
  }
  for (const u of units)
    if (UNIT_DEFS[u.def].speed > 0)
      u.facing ??= faceNearest(
        u.pos,
        units.filter((o) => o.team !== u.team).map((o) => o.pos),
      );
  const t = raw.turn;
  if (!isObj(t) || typeof t.actor !== 'string' || typeof t.moved !== 'boolean') return null;
  const actor = units.find((u) => u.id === t.actor);
  if (!actor) return null;
  let usedAbility: string | null = null;
  if (t.usedAbility !== null) {
    if (
      typeof t.usedAbility !== 'string' ||
      !Object.hasOwn(ABILITIES, t.usedAbility) ||
      !UNIT_DEFS[actor.def].abilities.includes(t.usedAbility)
    )
      return null;
    usedAbility = t.usedAbility;
  }
  if (!Array.isArray(raw.charges) || raw.charges.length > MAX_UNITS) return null;
  const charges: Charge[] = [];
  for (const c of raw.charges) {
    if (
      !isObj(c) ||
      typeof c.unit !== 'string' ||
      typeof c.ability !== 'string' ||
      !isInt(c.ticks) ||
      c.ticks < 1 ||
      c.ticks > 99
    )
      return null;
    const caster = units.find((u) => u.id === c.unit);
    if (!caster || !UNIT_DEFS[caster.def].abilities.includes(c.ability) || charges.some((x) => x.unit === c.unit))
      return null;
    if (
      !isObj(c.target) ||
      !isInt(c.target.x) ||
      !isInt(c.target.y) ||
      !inBounds(grid, { x: c.target.x, y: c.target.y })
    )
      return null;
    if (c.follow !== null && (typeof c.follow !== 'string' || !units.some((u) => u.id === c.follow))) return null;
    charges.push({
      unit: c.unit,
      ability: c.ability,
      target: { x: c.target.x, y: c.target.y },
      follow: c.follow,
      ticks: c.ticks,
    });
  }
  if (t.spent !== undefined && (!isInt(t.spent) || t.spent < 0 || t.spent > 99)) return null;
  const engaged: { unit: string; ranged: boolean }[] = [];
  if (t.engaged !== undefined) {
    if (!Array.isArray(t.engaged) || t.engaged.length > MAX_UNITS) return null;
    for (const e of t.engaged) {
      if (
        !isObj(e) ||
        typeof e.unit !== 'string' ||
        typeof e.ranged !== 'boolean' ||
        !units.some((u) => u.id === e.unit)
      )
        return null;
      engaged.push({ unit: e.unit, ranged: e.ranged });
    }
  }
  const turn = {
    actor: actor.id,
    moved: t.moved,
    usedAbility,
    ...(t.spent !== undefined && { spent: t.spent as number }),
    ...(t.engaged !== undefined && { engaged }),
  };
  return {
    scenario: raw.scenario,
    units,
    rng: raw.rng,
    turn,
    charges,
    outcome: raw.outcome,
    turnsPlayed: raw.turnsPlayed,
  };
}
