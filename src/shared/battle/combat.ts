import { ABILITIES, type AbilityDef } from './abilities.ts';
import {
  canStand,
  dist,
  FACING,
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
  gap,
  inAbilityRange,
  inArea,
  MAX_JUMP,
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
import { baseDef, isObjective, UNIT_DEFS } from './units.ts';

// Initial numbers from Oct 25; they can be measured in the simulation (scripts/battle-sim.ts), which is optional.
export const COMBAT = {
  DIST_PENALTY: 3, // hit points lost per tile beyond the first
  HEIGHT_BONUS: 5, // points per level above (gains) or below (loses) the target
  COVER_PENALTY: 20, // target on terrain with cover, against a ranged attack
  MIN_CHANCE: 5, // never certain nor impossible: the die always exists
  MAX_CHANCE: 95,
  // bump, fall and spikes x1.75 together with the abilities' damage (Nov 13, "very low damage making the battle slow"):
  // previously 3, 5 and 6
  BUMP_DAMAGE: 5, // push stopped by a wall, unit, edge or high step
  FALL_FREE: 1, // a fall of up to 1 level is just a step
  FALL_DAMAGE: 9, // per level beyond the free step
  SPIKE_DAMAGE: 10, // spikes tile (grid.ts): the same as a weak hit
  // physical hit from the side and from behind (Nov 13, direction in the game, like FFT: there the side removes the class evasion and the
  // back removes the shield's too). Our hit chance has no evasion: it becomes a bonus. Initial numbers, measured in the campaign
  SIDE_BONUS: 15,
  BACK_BONUS: 30,
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

// damage range with the user's equipment (UnitDef.power); without equipment it is the ability's range, and the roll does not change
const withPower = (actor: UnitState, a: AbilityDef): [number, number] => {
  const p = a.damage[1] > 0 ? (UNIT_DEFS[actor.def].power ?? 0) : 0;
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

// `side`: where the hit catches the target (sideOf); magic ignores direction (in FFT it only goes through the magic shield)
export function hitChance(grid: Grid, ability: AbilityDef, from: Pos, to: Pos, side: Side = 'front'): number {
  if (isHeal(ability)) return 100;
  const d = wholeTiles(grid, dist(from, to)); // on the split map, the whole tiles the cells stand for
  const dh = standH(tileAt(grid, from)) - standH(tileAt(grid, to));
  // cover only counts against ranged attackers: melee sees the whole target
  const cover = d > 1 && TERRAIN[tileAt(grid, to).terrain].cover ? COMBAT.COVER_PENALTY : 0;
  const flank = ability.magic ? 0 : side === 'back' ? COMBAT.BACK_BONUS : side === 'side' ? COMBAT.SIDE_BONUS : 0;
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

// What the ability would do if confirmed, without touching the state: the interface shows this before Confirm (pillar "readable luck").
// Whoever is charging takes 50% more physical attack (BMG 6, Charging status: PA * 3/2). Our damage does not come from PA:
// the bonus goes on the whole damage (adaptation).
const chargingBonus = (state: BattleState, ability: AbilityDef, target: UnitState) =>
  !ability.magic && state.charges.some((c) => c.unit === target.id) ? 1.5 : 1;

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
  const [dmgMin, dmgMax] = rulesOf(state).damage?.(actor, ability) ?? withPower(actor, ability);
  const targets = hit.map((u) => {
    // against a large unit, its tile nearest to the attacker (distance and height)
    const [from, at] = closest(footprint(actor), footprint(u));
    const side: Side = u.facing === undefined ? 'front' : sideOf(at, FACING[u.facing], from);
    const hurts = healHurts(ability, u);
    const dmg = (d: number) => Math.floor(d * chargingBonus(state, ability, u) * sideShare(actor, u, false));
    const heal = (h: number) => (hurts ? 0 : Math.floor(h * sideShare(actor, u, true)));
    return {
      unit: u.id,
      side,
      chance: isHeal(ability)
        ? 100
        : (rulesOf(state).hitChance?.(grid, state, actor, ability, u) ??
          Math.min(COMBAT.MAX_CHANCE, hitChance(grid, ability, from, at, side) + (UNIT_DEFS[actor.def].hit ?? 0))),
      dmgMin: hurts ? Math.floor(ability.heal[0] * COMBAT.UNDEAD_HEAL) : dmg(dmgMin),
      dmgMax: hurts ? Math.floor(ability.heal[1] * COMBAT.UNDEAD_HEAL) : dmg(dmgMax),
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

// Who gains a counter when `actor` strikes `u` with `abilityId` (Nov 13): a unit of the other side that can strike back the
// same way (melee against melee, ranged against ranged) with a single-target basic attack; not the Beacon, and not from a
// heal, a support ability or a charge (it lands later: the aim must not promise a counter the rule never owes)
export function canCounter(actor: UnitState, abilityId: string, u: UnitState): boolean {
  const a = ABILITIES[abilityId];
  return (
    a.charge === 0 &&
    !(a.heal[1] > 0 || a.ally) &&
    u.team !== actor.team &&
    answersSingle(u.def) &&
    UNIT_DEFS[u.def].speed > 0 &&
    isRanged(basicOf(u.def)) === isRanged(abilityId)
  );
}

export interface PendingCounter {
  unit: string; // who strikes back
  ranged: boolean;
  at: Pos; // where it aims: the tile the attacker leaves (melee) or stops on (ranged)
  preview: Preview; // the shot as it would land, from the counter's own rule (shot path, friendly fire)
}

// Counter-attack (Nov 13, Fernando's request; half damage, his choice; Nov 15, Fernando: also when the attacker moves on its
// next turn): each unit owed a counter by `actorId` (BattleState.engaged) strikes back once per move order, with its basic
// attack at half. Melee only when the attacker ends the move out of its reach, hit before it leaves; ranged at the tile the
// attacker stops on (Nov 15: before, the tile it left), so cover or a unit in the way catches the shot. Read by the rule, the
// AI and the move preview alike
export function pendingCounters(grid: Grid, state: BattleState, actorId: string, to: Pos): PendingCounter[] {
  const actor = state.units.find((u) => u.id === actorId);
  if (!actor) return [];
  const moved = { ...state, units: state.units.map((u) => (u === actor ? { ...u, pos: to } : u)) };
  const out: PendingCounter[] = [];
  for (const e of state.engaged ?? []) {
    const foe = e.by === actorId ? state.units.find((u) => u.id === e.unit) : undefined;
    if (!foe || !answersSingle(foe.def)) continue; // an area one owed by a save from before the single-target rule
    if (!e.ranged && gap(footprint(foe), cellsOf(to, UNIT_DEFS[actor.def].size ?? 1)) <= 1) continue; // stays in reach
    const at = e.ranged ? to : actor.pos;
    // charged: the counter-attack pays no MP or stock
    const preview = previewAbility(grid, e.ranged ? moved : state, foe.id, basicOf(foe.def), at, true);
    if (preview.ok) out.push({ unit: foe.id, ranged: e.ranged, at, preview });
  }
  return out;
}

// Plays the melee counters before the attacker leaves (`ranged` false) or the ranged ones once it stands on `to` (true)
export function counters(grid: Grid, state: BattleState, actorId: string, to: Pos, ranged: boolean): BattleEvent[] {
  const events: BattleEvent[] = [];
  for (const c of pendingCounters(grid, state, actorId, to)) {
    const foe = state.units.find((u) => u.id === c.unit); // an earlier counter may have killed it (friendly fire)
    if (!foe || c.ranged !== ranged || !state.units.some((u) => u.id === actorId)) continue;
    events.push(...resolveAbility(grid, state, c.unit, basicOf(foe.def), c.at, true, COMBAT.COUNTER));
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
    dmg = Math.max(1, Math.floor(dmg * chargingBonus(state, ability, unit) * scale * sideShare(actor, unit, false)));
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
