import { ABILITIES, type AbilityDef } from './abilities.ts';
import { basicOf, type PendingCounter } from './counter.ts';
import {
  dist,
  FACING,
  facingTo,
  type Grid,
  inBounds,
  isDeep,
  type Side,
  sideOf,
  standH,
  TERRAIN,
  tileAt,
} from './grid.ts';
import { aimEnds, aimTile, areaOf, closest, footprint, inAbilityRange, inArea, unitAt, wholeTiles } from './pathing.ts';
import { simulatePush } from './push.ts';
import { nextRng, rollInt } from './rng.ts';
import { rulesOf } from './rules.ts';
import { SCENARIOS } from './scenarios.ts';
import { traceShot } from './shot.ts';
import type { BattleEvent, BattleState, Outcome, Pos, Shot, UnitState } from './types.ts';
import { dodgeOf, isObjective, resistOf, UNIT_DEFS } from './units.ts';

// Initial numbers from Oct 25; they can be measured in the simulation (scripts/battle-sim.ts), which is optional.
export const COMBAT = {
  DIST_PENALTY: 3, // hit points lost per tile beyond the first
  HEIGHT_BONUS: 5, // points per level above (gains) or below (loses) the target
  COVER_PENALTY: 20, // target on terrain with cover, against a ranged attack
  MIN_CHANCE: 5, // never certain nor impossible: the die always exists
  MAX_CHANCE: 95,
  // bump, fall and spikes x1.75 together with the abilities' damage (Nov 13, "very low damage making the battle slow"):
  // previously 3, 5 and 6; x5 on Nov 15 with life and damage (Fernando's grill), previously 5, 9 and 10
  BUMP_DAMAGE: 25, // push stopped by a wall, unit, edge or high step
  FALL_FREE: 1, // a fall of up to 1 level is just a step
  FALL_DAMAGE: 45, // per level beyond the free step
  SPIKE_DAMAGE: 50, // spikes tile (grid.ts): the same as a weak hit
  // hit from the side and from behind (Nov 13, direction in the game, like FFT: there the side removes the class evasion and the
  // back removes the shield's too); spells too since Nov 15 (Fernando's grill: "yes, for everything"). Initial numbers,
  // measured in the campaign
  SIDE_BONUS: 15,
  BACK_BONUS: 30,
  // % of the target's dodge that counts by where the hit catches it, on top of the bonus above (Nov 15 grill)
  DODGE_BY_SIDE: { front: 100, side: 75, back: 50 } as Record<Side, number>,
  // resistance a charging target loses (Nov 15 grill, in place of FFT's x1.5 on the Charging status, BMG 6)
  CHARGING_PHYS: 50,
  CHARGING_MAG: 25,
  // Friendly fire (Nov 15, Fernando, "no exceptions"): a hit on the caster's own side, aimed or collateral, and a heal on
  // the other side both land at half
  FRIENDLY_FIRE: 0.5,
  UNDEAD_HEAL: 0.5, // a heal on the undead hurts by this share of the amount instead (Nov 15, Fernando)
  COUNTER: 0.5, // the counter-attack's share of the basic attack (Nov 13, Fernando's choice)
};

export interface TargetPreview {
  unit: string;
  chance: number; // hit chance %; healing is always 100
  side: Side; // where the hit catches the target (front without direction); the interface says "from behind" / "from the side"
  dmgMin: number;
  dmgMax: number;
  healMin: number;
  healMax: number;
}

export type PreviewReason = 'unknown' | 'range' | 'sight' | 'no-target' | 'spent' | 'water';
export interface Preview {
  ok: boolean;
  reason?: PreviewReason;
  center: Pos; // tile the ability acts from (the target's, or the user's when it is centered)
  targets: TargetPreview[];
  shot?: Shot; // a flying ability's path (traceShot): the scene's preview and flight draw this one
}

// What a unit has left of a counter (mana, stamina; the study's MP and stock): a key absent reads as the sheet's start value,
// so a save or a state from before the pools opens full
export const poolOf = (u: UnitState, k: string) => u.vars?.[k] ?? UNIT_DEFS[u.def].vars?.[k] ?? 0;
// the one reading of the cost: the preview, the AI, the menu and the payment go through these two
export const canPay = (u: UnitState, a: AbilityDef) => !a.cost || poolOf(u, a.cost[0]) >= a.cost[1];
export function pay(u: UnitState, a: AbilityDef): void {
  if (a.cost) u.vars = { ...u.vars, [a.cost[0]]: poolOf(u, a.cost[0]) - a.cost[1] };
}
// Mana and stamina back at the start of each of the unit's turns (the lab's regen by class), never above the sheet's pool
export function regen(u: UnitState): void {
  const d = UNIT_DEFS[u.def];
  for (const [k, n] of Object.entries(d.regen ?? {}))
    u.vars = { ...u.vars, [k]: Math.min(d.vars?.[k] ?? 0, poolOf(u, k) + (n ?? 0)) };
}

// damage range with the user's power (class and equipment): magic on a spell, physical otherwise
const withPower = (actor: UnitState, a: AbilityDef): [number, number] => {
  const d = UNIT_DEFS[actor.def];
  const p = a.damage[1] > 0 ? ((a.magic ? d.magPower : d.physPower) ?? 0) : 0;
  return [a.damage[0] + p, a.damage[1] + p];
};
// heal range with the caster's magic power (Fernando, Nov 15: as the lab, magic power counts on heals too)
const healRange = (actor: UnitState, a: AbilityDef): [number, number] => {
  const p = a.heal[1] > 0 ? (UNIT_DEFS[actor.def].magPower ?? 0) : 0;
  return [a.heal[0] + p, a.heal[1] + p];
};

// healing and support abilities never miss
const isHeal = (a: AbilityDef) => a.heal[1] > 0 || !!a.ally;
// share of a hit (`heal` false) or of a heal that lands on `u`: half on the "wrong" side (COMBAT.FRIENDLY_FIRE)
const sideShare = (actor: UnitState, u: UnitState, heal: boolean) =>
  (u.team === actor.team) !== heal ? COMBAT.FRIENDLY_FIRE : 1;
const healHurts = (a: AbilityDef, u: UnitState) => a.heal[1] > 0 && !!UNIT_DEFS[u.def].undead;
// swimming: the whole square in deep water (a token with a foot on the bank still acts)
const inDeep = (grid: Grid, u: UnitState) => footprint(u).every((c) => isDeep(tileAt(grid, c)));

// `side`: where the hit catches the target (sideOf); spells too since Nov 15 (Fernando's grill)
export function hitChance(grid: Grid, ability: AbilityDef, from: Pos, to: Pos, side: Side = 'front'): number {
  if (isHeal(ability)) return 100;
  const d = wholeTiles(grid, dist(from, to)); // on the split map, the whole tiles the cells stand for
  const dh = standH(tileAt(grid, from)) - standH(tileAt(grid, to));
  // cover only counts against ranged attackers: melee sees the whole target
  const cover = d > 1 && TERRAIN[tileAt(grid, to).terrain].cover ? COMBAT.COVER_PENALTY : 0;
  const flank = side === 'back' ? COMBAT.BACK_BONUS : side === 'side' ? COMBAT.SIDE_BONUS : 0;
  const raw = ability.accuracy - COMBAT.DIST_PENALTY * Math.max(0, d - 1) + COMBAT.HEIGHT_BONUS * dh - cover + flank;
  return Math.max(COMBAT.MIN_CHANCE, Math.min(COMBAT.MAX_CHANCE, raw));
}

function affected(grid: Grid, state: BattleState, actor: UnitState, ability: AbilityDef, center: Pos): UnitState[] {
  // an area hits everyone, allies included
  if (ability.radius > 0) {
    const area = areaOf(grid, state, center);
    return state.units.filter((u) => u.id !== actor.id && inArea(grid, area, ability.radius, footprint(u)));
  }
  const u = unitAt(state, center);
  // the user is only a target of a support ability whose range starts at 0. Hits and heals land on either side (Nov 15,
  // Fernando: "allies can attack allies"), at half on the wrong one (sideShare); support only on its own
  const self = u?.id === actor.id;
  const wanted =
    u &&
    (self ? !!ability.ally && ability.range[0] === 0 : !ability.ally || ability.heal[1] > 0 || u.team === actor.team);
  return wanted ? [u] : [];
}

// share of a hit `u` keeps, in 1/10000 so the sum stays whole (Nov 15 grill): x (1 - physical or magic resistance)
// x (1 - the element's); a charging target loses CHARGING_PHYS / CHARGING_MAG
const defence = (state: BattleState, a: AbilityDef, u: UnitState): number => {
  const d = UNIT_DEFS[u.def];
  const charging = state.charges.some((c) => c.unit === u.id);
  const drop = !charging ? 0 : a.magic ? COMBAT.CHARGING_MAG : COMBAT.CHARGING_PHYS;
  return (100 - resistOf(d, a.magic ? 'mag' : 'phys', -drop)) * (100 - (a.element ? resistOf(d, a.element) : 0));
};
// Damage that lands: the roll (with power) x the defence, the counter's `scale` and the side share, rounded down, at least
// 1. Whole numbers until the last division, so 70 at 30% is 49, not 48.99 rounded down
function landed(state: BattleState, actor: UnitState, a: AbilityDef, u: UnitState, roll: number, scale = 1): number {
  const keep = defence(state, a, u);
  return Math.max(1, Math.floor((roll * keep * scale * sideShare(actor, u, false)) / 10000));
}

// Hit chance after the target's dodge (Nov 15 grill: x (1 - dodge x DODGE_BY_SIDE), spells dodged too), rounded half up
// in whole numbers (85 against 30 from the front is 60; 85 x 0.7 in floating point rounds to 59), never below MIN_CHANCE:
// Fernando's choice of Nov 15, where the lab's formula clamps before the dodge
export const afterDodge = (chance: number, dodge: number, side: Side) =>
  Math.max(COMBAT.MIN_CHANCE, Math.floor((chance * (10000 - dodge * COMBAT.DODGE_BY_SIDE[side]) + 5000) / 10000));

// the range `actor` would deal `u` with `a` before the hit roll, wherever they stand: the preview and the AI's threat read it
export function damageRange(state: BattleState, actor: UnitState, a: AbilityDef, u: UnitState): [number, number] {
  const [lo, hi] = withPower(actor, a);
  const dmg = (d: number) => (d > 0 ? landed(state, actor, a, u, d) : 0);
  return [dmg(lo), dmg(hi)];
}

// What the ability would do if confirmed, without touching the state: the interface shows this before Confirm (pillar "readable luck").

// `charged`: it is the charge firing now; the cost (MP, stock) was already paid when it started
export function previewAbility(
  grid: Grid,
  state: BattleState,
  actorId: string,
  abilityId: string,
  target: Pos,
  charged = false,
): Preview {
  const actor = state.units.find((u) => u.id === actorId);
  const ability = ABILITIES[abilityId];
  let center = ability && ability.range[1] === 0 && actor ? actor.pos : target;
  const fail = (reason: PreviewReason): Preview => ({ ok: false, reason, center, targets: [] });
  if (!actor || !ability || !UNIT_DEFS[actor.def].abilities.includes(abilityId) || !inBounds(grid, center))
    return fail('unknown');
  // on the split map any cell of a tile aims at that whole tile (Nov 14 review), so range, area, sight and push agree
  center = aimTile(grid, state, center);
  if (!charged && !canPay(actor, ability)) return fail('spent');
  // in deep water you can only walk or wait (Nov 13, Fernando's choice; grid.ts isDeep). A charge that fires does not pass here:
  // it was started on firm ground and goes off from wherever its caster walked to (Nov 15)
  if (!charged && inDeep(grid, actor)) return fail('water');
  // a large unit measures range and sight from its tile nearest to the target (for whoever occupies 1 tile it is the same)
  const [from, to] = aimEnds(grid, state, actor, center);
  if (!inAbilityRange(grid, ability, from, to)) return fail('range');
  // Without a clear path the shot fires anyway and stops at the first thing it crosses (Nov 13, Fernando's request: "must allow
  // the attack and the guy loses the attack"; the realistic path of the trajectory grill of Nov 15, bolt spells included); the
  // area, if any, explodes there. And attacking empty ground is allowed (Nov 13): the hit fires without a target. The AI only
  // picks attacks with a target (attackScore adds zero without a target)
  const shot = ability.needsSight ? traceShot(grid, state, actor, center, !!ability.arc) : undefined;
  const stop = shot?.stop;
  if (stop) center = stop.pos;
  // a single-target shot stopped short hits only what stopped it: a unit, whichever side it is on, or the ground (not the
  // unit standing on the ledge it struck)
  const blocker = stop?.unit ? state.units.find((u) => u.id === stop.unit) : undefined;
  const hit = stop && ability.radius === 0 ? (blocker ? [blocker] : []) : affected(grid, state, actor, ability, center);
  const targets = hit.map((u) => {
    // against a large unit, its tile nearest to the attacker (distance and height)
    const [from, at] = closest(footprint(actor), footprint(u));
    const side: Side = u.facing === undefined ? 'front' : sideOf(at, FACING[u.facing!], from);
    const hurts = healHurts(ability, u);
    const [dmgMin, dmgMax] = damageRange(state, actor, ability, u);
    const heal = (h: number) => (hurts ? 0 : Math.floor(h * sideShare(actor, u, true)));
    const [healLo, healHi] = healRange(actor, ability);
    return {
      unit: u.id,
      side,
      chance: isHeal(ability)
        ? 100
        : (rulesOf(state).hitChance?.(grid, state, actor, ability, u) ??
          afterDodge(
            Math.min(COMBAT.MAX_CHANCE, hitChance(grid, ability, from, at, side) + (UNIT_DEFS[actor.def].hit ?? 0)),
            dodgeOf(UNIT_DEFS[u.def]),
            side,
          )),
      dmgMin: hurts ? Math.floor(healLo * COMBAT.UNDEAD_HEAL) : dmgMin,
      dmgMax: hurts ? Math.floor(healHi * COMBAT.UNDEAD_HEAL) : dmgMax,
      healMin: heal(healLo),
      healMax: heal(healHi),
    };
  });
  return { ok: true, center, targets, shot };
}

// Plays `owed` counters at the attacker where it stands: those on its start tile before it leaves, the shooters it left in
// contact once it stands on the stop (`Battle.move`)
export function counters(grid: Grid, state: BattleState, actorId: string, owed: PendingCounter[]): BattleEvent[] {
  const events: BattleEvent[] = [];
  for (const c of owed) {
    const foe = state.units.find((u) => u.id === c.unit); // an earlier counter may have killed it (friendly fire)
    const actor = state.units.find((u) => u.id === actorId);
    if (!foe || !actor) continue;
    if (actor.facing !== undefined) actor.facing = facingTo(actor.pos, foe.pos);
    events.push(...resolveAbility(grid, state, c.unit, basicOf(foe.def), actor.pos, true, COMBAT.COUNTER));
    // one counter per foe per turn (Fernando, Nov 16): out, back in and out again no longer draws a second one
    const left = state.turn.engaged?.filter((id) => id !== c.unit);
    state.turn.engaged = left?.length ? left : undefined; // an empty list is not saved
  }
  return events;
}

// Applies the ability to the state (changes units and rng) and returns the events for the client to animate.
// Order of the rolls, per unit hit in list order: hit, then damage. Changing the order changes the tests' hash.
// `scale`: fraction of the damage (the counter-attack comes out at half, counters)
export function resolveAbility(
  grid: Grid,
  state: BattleState,
  actorId: string,
  abilityId: string,
  target: Pos,
  charged = false,
  scale = 1,
): BattleEvent[] {
  const preview = previewAbility(grid, state, actorId, abilityId, target, charged);
  if (!preview.ok) return [];
  const actor = state.units.find((u) => u.id === actorId)!;
  const ability = ABILITIES[abilityId];
  const events: BattleEvent[] = [
    { k: 'attack', unit: actorId, ability: abilityId, target: preview.center, shot: preview.shot },
  ];
  const after = rulesOf(state).after;
  if (!charged) pay(actor, ability);
  for (const t of preview.targets) {
    const unit = state.units.find((u) => u.id === t.unit)!;
    if (isHeal(ability)) {
      if (ability.heal[1] === 0) {
        after?.(state, actor, ability, unit, events);
        continue;
      } // support without healing: only the effect
      let amount: number;
      [amount, state.rng] = rollInt(state.rng, ...healRange(actor, ability));
      // the same single roll either way, so the dice order does not change
      if (healHurts(ability, unit)) {
        const dmg = Math.max(1, Math.floor(amount * COMBAT.UNDEAD_HEAL));
        events.push({ k: 'hit', unit: unit.id, dmg, chance: 100 });
        if (hurt(state, unit, dmg, events)) after?.(state, actor, ability, unit, events);
        continue;
      }
      const healed = Math.min(Math.floor(amount * sideShare(actor, unit, true)), UNIT_DEFS[unit.def].hp - unit.hp);
      unit.hp += healed;
      events.push({ k: 'heal', unit: unit.id, amount: healed });
      after?.(state, actor, ability, unit, events);
      continue;
    }
    let roll: number;
    [roll, state.rng] = nextRng(state.rng);
    if (roll * 100 >= t.chance) {
      events.push({ k: 'miss', unit: unit.id, chance: t.chance });
      continue;
    }
    let dmg: number;
    [dmg, state.rng] =
      rulesOf(state).rollDamage?.(state, actor, ability, state.rng) ?? rollInt(state.rng, ...withPower(actor, ability));
    dmg = landed(state, actor, ability, unit, dmg, scale);
    events.push({ k: 'hit', unit: unit.id, dmg, chance: t.chance });
    if (!hurt(state, unit, dmg, events)) continue;
    after?.(state, actor, ability, unit, events);
    if (ability.push === 0) continue;
    // a push with a chance rolls after the damage; without `pushChance` there is no roll (the game's roll order does not change)
    if (ability.pushChance !== undefined) {
      [roll, state.rng] = nextRng(state.rng);
      if (roll * 100 >= ability.pushChance) continue;
    }
    push(grid, state, unit, preview.center, actor.pos, ability.push, events);
  }
  state.outcome = checkOutcome(state);
  return events;
}

// removes life; returns false if the unit died (and leaves the list)
function hurt(state: BattleState, unit: UnitState, dmg: number, events: BattleEvent[]): boolean {
  unit.hp -= dmg;
  if (unit.hp > 0) return true;
  state.units = state.units.filter((u) => u !== unit);
  // nor does it owe a counter (a friendly shot may kill it mid-move), and a save naming it would not load
  state.turn.engaged = state.turn.engaged?.filter((id) => id !== unit.id);
  // the charge of whoever dies no longer fires; the one that followed the dead unit now aims at the tile where it was
  state.charges = state.charges
    .filter((c) => c.unit !== unit.id)
    .map((c) => (c.follow === unit.id ? { ...c, follow: null, target: unit.pos } : c));
  events.push({ k: 'die', unit: unit.id });
  return false;
}

// End of the turn on spikes (grid.ts): hurts whoever plays now. No roll (the hash of games without spikes does not change)
export function spikeAtTurnEnd(grid: Grid, state: BattleState): BattleEvent[] {
  const actor = state.units.find((u) => u.id === state.turn.actor);
  if (!actor || !footprint(actor).some((c) => tileAt(grid, c).spikes)) return [];
  const events: BattleEvent[] = [{ k: 'spike', unit: actor.id, dmg: COMBAT.SPIKE_DAMAGE }];
  hurt(state, actor, COMBAT.SPIKE_DAMAGE, events);
  return events;
}

function push(
  grid: Grid,
  state: BattleState,
  unit: UnitState,
  center: Pos,
  origin: Pos,
  steps: number,
  events: BattleEvent[],
) {
  const r = simulatePush(grid, state, unit, center, origin, steps);
  unit.pos = r.to;
  events.push(...r.events);
  if (r.dmg > 0) hurt(state, unit, r.dmg, events);
}

// Victory: no enemies. Defeat: the target to protect fell or all heroes died.
export function checkOutcome(state: BattleState): Outcome {
  const custom = rulesOf(state).outcome;
  if (custom) return custom(state);
  const heroes = state.units.filter((u) => u.team === 'hero' && !isObjective(u.def));
  // only a map that was born with a Beacon loses by it (Nov 13, review: Wood and Pass in the standalone Battle lost on the 1st turn);
  // a test state outside the list counts as a map with a Beacon
  const hadObjective = SCENARIOS[state.scenario]?.spawns.some((s) => isObjective(s.def)) ?? true;
  const objective = state.units.some((u) => isObjective(u.def));
  if ((hadObjective && !objective) || heroes.length === 0) return 'defeat';
  if (!state.units.some((u) => u.team === 'enemy')) return 'victory';
  return 'ongoing';
}
