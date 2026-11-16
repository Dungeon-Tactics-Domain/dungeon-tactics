import { ABILITIES, type AbilityDef } from './abilities.ts';
import {
  canStand,
  dist,
  FACING,
  facingTo,
  type Grid,
  inBounds,
  isDeep,
  type Side,
  samePos,
  sideOf,
  standH,
  subOf,
  TERRAIN,
  tileAt,
} from './grid.ts';
import {
  aimEnds,
  aimTile,
  areaOf,
  cellsOf,
  closest,
  footprint,
  inAbilityRange,
  inArea,
  MAX_JUMP,
  nearCells,
  restsOn,
  shotStop,
  sightEnds,
  unitAt,
  wholeTiles,
} from './pathing.ts';
import { nextRng, rollInt } from './rng.ts';
import { rulesOf } from './rules.ts';
import { SCENARIOS } from './scenarios.ts';
import type { BattleEvent, BattleState, Outcome, Pos, UnitState } from './types.ts';
import { baseDef, dodgeOf, isObjective, resistOf, UNIT_DEFS } from './units.ts';

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
  // share of the target's dodge that counts by where the hit catches it, on top of the bonus above (Nov 15 grill)
  DODGE_BY_SIDE: { front: 1, side: 0.75, back: 0.5 } as Record<Side, number>,
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
}

// damage range with the user's power (class and equipment): magic on a spell, physical otherwise; heals get none
const withPower = (actor: UnitState, a: AbilityDef): [number, number] => {
  const d = UNIT_DEFS[actor.def];
  const p = a.damage[1] > 0 ? ((a.magic ? d.magPower : d.physPower) ?? 0) : 0;
  return [a.damage[0] + p, a.damage[1] + p];
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
  // Fernando: "allies can attack allies"), at half on the wrong one (sideShare); support only on its own (the FFT study)
  const self = u?.id === actor.id;
  const wanted =
    u &&
    (self ? !!ability.ally && ability.range[0] === 0 : !ability.ally || ability.heal[1] > 0 || u.team === actor.team);
  return wanted ? [u] : [];
}

// Damage that lands (Nov 15 grill): the roll (with power) x (1 - physical or magic resistance) x (1 - the element's), the
// counter's `scale` and the side share, rounded down, at least 1. A charging target loses CHARGING_PHYS / CHARGING_MAG.
// Whole numbers until the last division, so 70 at 30% is 49, not 48.99 rounded down
function landed(state: BattleState, actor: UnitState, a: AbilityDef, u: UnitState, roll: number, scale = 1): number {
  const d = UNIT_DEFS[u.def];
  const charging = state.charges.some((c) => c.unit === u.id);
  const drop = !charging ? 0 : a.magic ? COMBAT.CHARGING_MAG : COMBAT.CHARGING_PHYS;
  const kind = 100 - resistOf(d, a.magic ? 'mag' : 'phys', -drop);
  const element = 100 - (a.element ? resistOf(d, a.element) : 0);
  return Math.max(1, Math.floor((roll * kind * element * scale * sideShare(actor, u, false)) / 10000));
}

// the range `actor` would deal `u` with `a` before the hit roll, wherever they stand: the preview and the AI's threat read it
export function damageRange(state: BattleState, actor: UnitState, a: AbilityDef, u: UnitState): [number, number] {
  const [lo, hi] = rulesOf(state).damage?.(actor, a) ?? withPower(actor, a);
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
  if (!charged && ability.cost && (actor.vars?.[ability.cost[0]] ?? 0) < ability.cost[1]) return fail('spent');
  // in deep water you can only walk or wait (Nov 13, Fernando's choice; grid.ts isDeep). A charge that fires does not pass here:
  // it was started on firm ground and goes off from wherever its caster walked to (Nov 15)
  if (!charged && inDeep(grid, actor)) return fail('water');
  // a large unit measures range and sight from its tile nearest to the target (for whoever occupies 1 tile it is the same)
  const [from, to] = aimEnds(grid, state, actor, center);
  if (!inAbilityRange(grid, ability, from, to)) return fail('range');
  // Without sight the shot fires anyway and stops at the first obstacle on the path (Nov 13, Fernando's request: "must allow the
  // attack and the guy loses the attack"); the area, if any, explodes there. And attacking empty ground is allowed (Nov 13): the hit fires
  // without a target. The AI only picks attacks with a target (attackScore adds zero without a target)
  // a model on the path only blocks what flies straight (arrow, knife): magic passes over heads
  const stop = ability.needsSight
    ? shotStop(grid, state, ...sightEnds(grid, state, actor, center), actor.id, !ability.magic)
    : null;
  if (stop) center = stop.pos;
  // hit a model on the path: it takes the hit, whichever side it is on (without area: only it)
  const blocker = stop?.unit ? state.units.find((u) => u.id === stop.unit) : undefined;
  const hit = blocker && ability.radius === 0 ? [blocker] : affected(grid, state, actor, ability, center);
  const targets = hit.map((u) => {
    // against a large unit, its tile nearest to the attacker (distance and height)
    const [from, at] = closest(footprint(actor), footprint(u));
    const side: Side = u.facing === undefined ? 'front' : sideOf(at, FACING[u.facing], from);
    const hurts = healHurts(ability, u);
    // then the target's dodge, by where the hit lands (Nov 15 grill: spells are dodged too); whole, so the shown % is the rolled one
    const dodged = (c: number) => Math.round(c * (1 - (dodgeOf(UNIT_DEFS[u.def]) * COMBAT.DODGE_BY_SIDE[side]) / 100));
    const [dmgMin, dmgMax] = damageRange(state, actor, ability, u);
    const heal = (h: number) => (hurts ? 0 : Math.floor(h * sideShare(actor, u, true)));
    return {
      unit: u.id,
      side,
      chance: isHeal(ability)
        ? 100
        : (rulesOf(state).hitChance?.(grid, state, actor, ability, u) ??
          dodged(
            Math.min(COMBAT.MAX_CHANCE, hitChance(grid, ability, from, at, side) + (UNIT_DEFS[actor.def].hit ?? 0)),
          )),
      dmgMin: hurts ? Math.floor(ability.heal[0] * COMBAT.UNDEAD_HEAL) : dmgMin,
      dmgMax: hurts ? Math.floor(ability.heal[1] * COMBAT.UNDEAD_HEAL) : dmgMax,
      healMin: heal(ability.heal[0]),
      healMax: heal(ability.heal[1]),
    };
  });
  return { ok: true, center, targets };
}

// Applies the ability to the state (changes units and rng) and returns the events for the client to animate.
// Order of the rolls, per unit hit in list order: hit, then damage. Changing the order changes the tests' hash.
// `scale`: fraction of the damage (the counter-attack comes out at half, counters)
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
      const facing = actor.facing === undefined ? undefined : facingTo(pos, foe.pos);
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
    if (actor.facing !== undefined) actor.facing = facingTo(actor.pos, foe.pos);
    events.push(...resolveAbility(grid, state, c.unit, basicOf(foe.def), actor.pos, true, COMBAT.COUNTER));
  }
  return events;
}

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
  const events: BattleEvent[] = [{ k: 'attack', unit: actorId, ability: abilityId, target: preview.center }];
  const after = rulesOf(state).after;
  if (ability.cost && !charged) actor.vars![ability.cost[0]] -= ability.cost[1];
  for (const t of preview.targets) {
    const unit = state.units.find((u) => u.id === t.unit)!;
    if (isHeal(ability)) {
      if (ability.heal[1] === 0) {
        after?.(state, actor, ability, unit, events);
        continue;
      } // support without healing: only the effect
      let amount: number;
      [amount, state.rng] = rollInt(state.rng, ability.heal[0], ability.heal[1]);
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

export interface PushResult {
  to: Pos;
  dmg: number; // bump and fall added together
  events: BattleEvent[]; // push, bump and fall, in order
}

// Pushes along the axis of greatest difference relative to the ability's center. If the victim is at the center (area), it moves away
// from the user. Each tile is checked: wall, unit, edge and high step stop it (bump); going down is a fall, with damage
// from 2 levels up. It does not change the state: the AI uses this to value pushes before choosing the move.
// On the split map (half.ts) the token is pushed `steps` whole tiles in cells, its whole square checked on each cell; the
// direction goes from the middle of the squares and the height of a square is its highest cell. It ends only where the
// square rests on even ground (restsOn): a fall onto it, or a bump back to where it last rested
export function simulatePush(
  grid: Grid,
  state: BattleState,
  unit: UnitState,
  center: Pos,
  origin: Pos,
  steps: number,
): PushResult {
  const result: PushResult = { to: unit.pos, dmg: 0, events: [] };
  const size = UNIT_DEFS[unit.def].size ?? 1;
  if ((UNIT_DEFS[baseDef(unit.def)].size ?? 1) > 1) return result; // a large unit does not move
  const cells = (p: Pos) => cellsOf(p, size);
  // twice the middle of the square, so it stays whole
  const mid = (p: Pos, n: number) => ({ x: 2 * p.x + n - 1, y: 2 * p.y + n - 1 });
  const sub = subOf(grid);
  const from = cells(unit.pos).some((c) => samePos(c, center)) ? mid(origin, sub) : mid(center, sub);
  let dx = mid(unit.pos, size).x - from.x;
  let dy = mid(unit.pos, size).y - from.y;
  if (dx === 0 && dy === 0) return result;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  dx = horizontal ? Math.sign(dx) : 0;
  dy = horizontal ? 0 : Math.sign(dy);
  const height = (p: Pos) => Math.max(...cells(p).map((c) => standH(tileAt(grid, c))));
  const spiky = (p: Pos) => cells(p).some((c) => tileAt(grid, c).spikes);
  // one cell of the push from `cur`: null where it is blocked
  const move = (cur: Pos): PushResult | null => {
    const next = { x: cur.x + dx, y: cur.y + dy };
    // deep water holds a push like a wall (our assumption, kept when it started letting units enter, Nov 13)
    const blocked =
      cells(next).some((c) => {
        if (!inBounds(grid, c)) return true;
        const t = tileAt(grid, c),
          o = unitAt(state, c);
        return !canStand(t) || isDeep(t) || !!t.noStop || (!!o && o.id !== unit.id);
      }) || height(next) - height(cur) > MAX_JUMP;
    if (blocked) return null;
    const out: PushResult = { to: next, dmg: 0, events: [{ k: 'push', unit: unit.id, to: next }] };
    const levels = height(cur) - height(next);
    const dmg =
      levels <= 0
        ? 0
        : (rulesOf(state).fallDamage?.(levels, unit.def) ??
          Math.max(0, levels - COMBAT.FALL_FREE) * COMBAT.FALL_DAMAGE);
    if (dmg > 0) {
      out.events.push({ k: 'fall', unit: unit.id, levels, dmg });
      out.dmg += dmg;
    }
    // spikes hurt when the square reaches them, not again on each cell over the same patch
    if (spiky(next) && (size === 1 || !spiky(cur))) {
      out.events.push({ k: 'spike', unit: unit.id, dmg: COMBAT.SPIKE_DAMAGE });
      out.dmg += COMBAT.SPIKE_DAMAGE;
    }
    return out;
  };
  const add = (m: PushResult) => {
    result.to = m.to;
    result.dmg += m.dmg;
    result.events.push(...m.events);
  };
  const rests = (p: Pos) => restsOn(grid, p, size);
  let even: PushResult = { ...result, events: [] }; // where the square last rested (the start, at first)
  let bumped = false;
  for (let i = 0; i < steps * sub && !bumped; i++) {
    const m = move(result.to);
    if (!m) bumped = true;
    else {
      add(m);
      if (rests(result.to)) even = { ...result, events: [...result.events] };
    }
  }
  // A push never leaves the square on uneven ground (Nov 15, Fernando: "it tie-breaks by making the guy fall, or hit a
  // wall"): one more cell when it drops onto even ground, or when the square is level and only ramp, terrain or spikes
  // kept it from resting (Fernando, after the review); else back to where it last rested, with the bump. A square that
  // started uneven (a sandbox placement, an old save) goes back to its start
  if (!rests(result.to)) {
    const m = move(result.to);
    const level = new Set(cells(result.to).map((c) => standH(tileAt(grid, c)))).size === 1;
    if (m && rests(m.to) && (level || height(m.to) < height(result.to))) add(m);
    else {
      Object.assign(result, even);
      bumped = true;
    }
  }
  if (bumped) {
    result.events.push({ k: 'bump', unit: unit.id, dmg: COMBAT.BUMP_DAMAGE });
    result.dmg += COMBAT.BUMP_DAMAGE;
  }
  return result;
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
