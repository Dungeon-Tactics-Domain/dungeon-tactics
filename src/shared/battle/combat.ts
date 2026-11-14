import { ABILITIES, type AbilityDef } from './abilities.ts';
import { FACING, TERRAIN, canStand, dist, inBounds, isDeep, samePos, sideOf, standH, tileAt, type Grid, type Side } from './grid.ts';
import { MAX_JUMP, distTo, inAbilityRange, nearestTile, shotStop, unitAt } from './pathing.ts';
import { nextRng, rollInt } from './rng.ts';
import { rulesOf } from './rules.ts';
import { SCENARIOS } from './scenarios.ts';
import type { BattleEvent, BattleState, Outcome, Pos, UnitState } from './types.ts';
import { OBJECTIVE_DEF, UNIT_DEFS } from './units.ts';

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
  const p = a.damage[1] > 0 ? UNIT_DEFS[actor.def].power ?? 0 : 0;
  return [a.damage[0] + p, a.damage[1] + p];
};

// healing and support abilities target an ally and never miss
const isHeal = (a: AbilityDef) => a.heal[1] > 0 || !!a.ally;

// `side`: where the hit catches the target (sideOf); magic ignores direction (in FFT it only goes through the magic shield)
export function hitChance(grid: Grid, ability: AbilityDef, from: Pos, to: Pos, side: Side = 'front'): number {
  if (isHeal(ability)) return 100;
  const d = dist(from, to);
  const dh = standH(tileAt(grid, from)) - standH(tileAt(grid, to));
  // cover only counts against ranged attackers: melee sees the whole target
  const cover = d > 1 && TERRAIN[tileAt(grid, to).terrain].cover ? COMBAT.COVER_PENALTY : 0;
  const flank = ability.magic ? 0 : side === 'back' ? COMBAT.BACK_BONUS : side === 'side' ? COMBAT.SIDE_BONUS : 0;
  const raw = ability.accuracy - COMBAT.DIST_PENALTY * Math.max(0, d - 1) + COMBAT.HEIGHT_BONUS * dh - cover + flank;
  return Math.max(COMBAT.MIN_CHANCE, Math.min(COMBAT.MAX_CHANCE, raw));
}

function affected(state: BattleState, actor: UnitState, ability: AbilityDef, center: Pos): UnitState[] {
  const inArea = state.units.filter((u) => u.id !== actor.id && distTo(u, center) <= ability.radius);
  if (ability.radius > 0) return inArea; // an area hits everyone, allies included
  const u = unitAt(state, center);
  // the user is only a target of a support ability whose range starts at 0
  const self = u?.id === actor.id;
  const wanted = u && (isHeal(ability) ? u.team === actor.team && (!self || (!!ability.ally && ability.range[0] === 0)) : !self && u.team !== actor.team);
  return wanted ? [u] : [];
}

// What the ability would do if confirmed, without touching the state: the interface shows this before Confirm (pillar "readable luck").
// Whoever is charging takes 50% more physical attack (BMG 6, Charging status: PA * 3/2). Our damage does not come from PA:
// the bonus goes on the whole damage (adaptation).
const chargingBonus = (state: BattleState, ability: AbilityDef, target: UnitState) =>
  !ability.magic && state.charges.some((c) => c.unit === target.id) ? 1.5 : 1;

// `charged`: it is the charge firing now; the cost (MP, stock) was already paid when it started
export function previewAbility(grid: Grid, state: BattleState, actorId: string, abilityId: string, target: Pos, charged = false): Preview {
  const actor = state.units.find((u) => u.id === actorId);
  const ability = ABILITIES[abilityId];
  let center = ability && ability.range[1] === 0 && actor ? actor.pos : target;
  const fail = (reason: PreviewReason): Preview => ({ ok: false, reason, center, targets: [] });
  if (!actor || !ability || !UNIT_DEFS[actor.def].abilities.includes(abilityId) || !inBounds(grid, center)) return fail('unknown');
  if (!charged && ability.cost && (actor.vars?.[ability.cost[0]] ?? 0) < ability.cost[1]) return fail('spent');
  // in deep water you can only walk or wait (Nov 13, Fernando's choice; grid.ts isDeep). A charge that already fired does not pass here:
  // whoever charges does not walk and a push does not enter deep water
  if (!charged && isDeep(tileAt(grid, actor.pos))) return fail('water');
  // a large unit measures range and sight from its tile nearest to the target (for whoever occupies 1 tile it is the same)
  const from = nearestTile(actor, center);
  if (!inAbilityRange(grid, ability, from, center)) return fail('range');
  // Without sight the shot fires anyway and stops at the first obstacle on the path (Nov 13, Fernando's request: "must allow the
  // attack and the guy loses the attack"); the area, if any, explodes there. And attacking empty ground is allowed (Nov 13): the hit fires
  // without a target. The AI only picks attacks with a target (attackScore adds zero without a target)
  // a model on the path only blocks what flies straight (arrow, knife): magic passes over heads
  const stop = ability.needsSight ? shotStop(grid, state, from, center, actor.id, !ability.magic) : null;
  if (stop) center = stop.pos;
  // hit a model on the path: it takes the hit, whichever side it is on (without area: only it)
  const blocker = stop?.unit ? state.units.find((u) => u.id === stop.unit) : undefined;
  const hit = blocker && ability.radius === 0 ? [blocker] : affected(state, actor, ability, center);
  const [dmgMin, dmgMax] = rulesOf(state).damage?.(actor, ability) ?? withPower(actor, ability);
  const targets = hit.map((u) => {
    // against a large unit, its tile nearest to the attacker (distance and height)
    const at = nearestTile(u, actor.pos), from = nearestTile(actor, at);
    const side: Side = u.facing === undefined ? 'front' : sideOf(at, FACING[u.facing], from);
    return {
      unit: u.id,
      side,
      chance: isHeal(ability) ? 100 : rulesOf(state).hitChance?.(grid, state, actor, ability, u) ?? Math.min(COMBAT.MAX_CHANCE, hitChance(grid, ability, from, at, side) + (UNIT_DEFS[actor.def].hit ?? 0)),
      dmgMin: Math.floor(dmgMin * chargingBonus(state, ability, u)),
      dmgMax: Math.floor(dmgMax * chargingBonus(state, ability, u)),
      healMin: ability.heal[0],
      healMax: ability.heal[1],
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

// Counter-attack (Nov 13, Fernando's request; half damage, his choice): whoever was attacked this turn retaliates when the
// attacker walks, with the basic attack and half the damage, before it leaves the tile. Melee only retaliates if it moves
// away (ends more than 1 tile away); ranged retaliates at any step. Each attacked unit retaliates once per turn
export function counters(grid: Grid, state: BattleState, actorId: string, to: Pos): BattleEvent[] {
  const events: BattleEvent[] = [];
  const left: { unit: string; ranged: boolean }[] = [];
  for (const e of state.turn.engaged ?? []) {
    const actor = state.units.find((u) => u.id === actorId);
    const foe = state.units.find((u) => u.id === e.unit);
    if (!actor || !foe) continue;
    if (!e.ranged && distTo(foe, to) <= 1) { left.push(e); continue; } // stayed adjacent: it can still retaliate if it leaves later
    const basic = basicOf(foe.def);
    // charged: the counter-attack pays no MP or stock
    if (previewAbility(grid, state, foe.id, basic, actor.pos, true).ok) events.push(...resolveAbility(grid, state, foe.id, basic, actor.pos, true, 0.5));
  }
  state.turn.engaged = left;
  return events;
}

export function resolveAbility(grid: Grid, state: BattleState, actorId: string, abilityId: string, target: Pos, charged = false, scale = 1): BattleEvent[] {
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
      if (ability.heal[1] === 0) { after?.(state, actor, ability, unit, events); continue; } // support without healing: only the effect
      let amount: number;
      [amount, state.rng] = rollInt(state.rng, ability.heal[0], ability.heal[1]);
      const healed = Math.min(amount, UNIT_DEFS[unit.def].hp - unit.hp);
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
    [dmg, state.rng] = rulesOf(state).rollDamage?.(state, actor, ability, state.rng) ?? rollInt(state.rng, ...withPower(actor, ability));
    dmg = Math.max(1, Math.floor(dmg * chargingBonus(state, ability, unit) * scale));
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
  state.charges = state.charges.filter((c) => c.unit !== unit.id).map((c) => (c.follow === unit.id ? { ...c, follow: null, target: unit.pos } : c));
  events.push({ k: 'die', unit: unit.id });
  return false;
}

// End of the turn on spikes (grid.ts): hurts whoever plays now. No roll (the hash of games without spikes does not change)
export function spikeAtTurnEnd(grid: Grid, state: BattleState): BattleEvent[] {
  const actor = state.units.find((u) => u.id === state.turn.actor);
  if (!actor || !tileAt(grid, actor.pos).spikes) return [];
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
export function simulatePush(grid: Grid, state: BattleState, unit: UnitState, center: Pos, origin: Pos, steps: number): PushResult {
  const result: PushResult = { to: unit.pos, dmg: 0, events: [] };
  if ((UNIT_DEFS[unit.def].size ?? 1) > 1) return result; // a large unit does not move
  const from = samePos(unit.pos, center) ? origin : center;
  let dx = unit.pos.x - from.x;
  let dy = unit.pos.y - from.y;
  if (dx === 0 && dy === 0) return result;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  dx = horizontal ? Math.sign(dx) : 0;
  dy = horizontal ? 0 : Math.sign(dy);
  for (let i = 0; i < steps; i++) {
    const cur = result.to;
    const next = { x: cur.x + dx, y: cur.y + dy };
    // deep water holds a push like a wall (our assumption: the guide does not say what happens)
    // deep water holds a push like a wall (our assumption, kept when it started letting units enter, Nov 13)
    const blocked = !inBounds(grid, next) || !canStand(tileAt(grid, next)) || isDeep(tileAt(grid, next)) || !!tileAt(grid, next).noStop || !!unitAt(state, next)
      || standH(tileAt(grid, next)) - standH(tileAt(grid, cur)) > MAX_JUMP;
    if (blocked) {
      result.events.push({ k: 'bump', unit: unit.id, dmg: COMBAT.BUMP_DAMAGE });
      result.dmg += COMBAT.BUMP_DAMAGE;
      return result;
    }
    const levels = standH(tileAt(grid, cur)) - standH(tileAt(grid, next));
    result.to = next;
    result.events.push({ k: 'push', unit: unit.id, to: next });
    const dmg = levels <= 0 ? 0 : rulesOf(state).fallDamage?.(levels, unit.def) ?? Math.max(0, levels - COMBAT.FALL_FREE) * COMBAT.FALL_DAMAGE;
    if (dmg > 0) {
      result.events.push({ k: 'fall', unit: unit.id, levels, dmg });
      result.dmg += dmg;
    }
    if (tileAt(grid, next).spikes) {
      result.events.push({ k: 'spike', unit: unit.id, dmg: COMBAT.SPIKE_DAMAGE });
      result.dmg += COMBAT.SPIKE_DAMAGE;
    }
  }
  return result;
}

function push(grid: Grid, state: BattleState, unit: UnitState, center: Pos, origin: Pos, steps: number, events: BattleEvent[]) {
  const r = simulatePush(grid, state, unit, center, origin, steps);
  unit.pos = r.to;
  events.push(...r.events);
  if (r.dmg > 0) hurt(state, unit, r.dmg, events);
}

// Victory: no enemies. Defeat: the target to protect fell or all heroes died.
export function checkOutcome(state: BattleState): Outcome {
  const custom = rulesOf(state).outcome;
  if (custom) return custom(state);
  const heroes = state.units.filter((u) => u.team === 'hero' && u.def !== OBJECTIVE_DEF);
  // only a map that was born with a Beacon loses by it (Nov 13, review: Wood and Pass in the standalone Battle lost on the 1st turn);
  // a test state outside the list counts as a map with a Beacon
  const hadObjective = SCENARIOS[state.scenario]?.spawns.some((s) => s.def === OBJECTIVE_DEF) ?? true;
  const objective = state.units.some((u) => u.def === OBJECTIVE_DEF);
  if ((hadObjective && !objective) || heroes.length === 0) return 'defeat';
  if (!state.units.some((u) => u.team === 'enemy')) return 'victory';
  return 'ongoing';
}
