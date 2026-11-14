import { ABILITIES, type AbilityDef } from './abilities.ts';
import type { Battle } from './battle.ts';
import { basicOf, COMBAT, previewAbility, simulatePush } from './combat.ts';
import {
  canStand,
  dist,
  facingTo,
  type Grid,
  neighbors,
  posKey,
  standH,
  stepCost,
  subOf,
  TERRAIN,
  tileAt,
} from './grid.ts';
import { cellsOf, footprint, gap, jumpOf, leaps, reachable, type Step, squareMoves } from './pathing.ts';
import { TURN_THRESHOLD } from './turn-queue.ts';
import type { BattleEvent, BattleState, Pos, UnitState } from './types.ts';
import { isObjective, UNIT_DEFS } from './units.ts';

// Initial weights from Oct 25 (in "expected life points"): the AI is greedy for one turn and has no rolls, so with the same
// situation it plays the same. The player sees its reach; the intent only shows on its turn (spec).
const W = {
  KILL: 8, // bonus for killing (times the chance)
  OBJECTIVE: 1.5, // multiplies the value of hitting the target to protect
  FRIENDLY: 1.5, // multiplies the loss from hurting an ally
  CHARGE: 0.5, // per charge tick (the target may leave the tile); it was 0.05 per delay point, 10 delay = 1 tick
  COVER: 1,
  HEIGHT: 0.4, // per tile level
  APPROACH: 0.35, // per tile of distance from the most interesting target
  OBJECTIVE_PULL: 3, // how much the target to protect "pulls" the enemies (as if it were closer)
  THREAT: 0.25, // per point of average damage of whoever reaches the tile
  ADVANCE: 1.2, // per tile of distance when there is nobody to hit this turn
  GUARD: 2, // per tile the hero moves away from the target to protect beyond the guard radius
  // Aimed Shot (charge on the tile) against whoever plays before it fires is worth 40% (they may leave). Measured on Nov 12 (1,000
  // seeds): Hill 72.8% → 72.7% for the heroes, Skirmish 45.2% → 43.7%. Applying it to every charge was a mistake: the spell
  // follows the unit, and the AI stopped using the Blast on fast targets (Hill dropped to 64.1%)
  ESCAPE: 0.4,
};
// How far the AI hero leaves the target to protect to go meet the enemy. Measured on Nov 11 on the 20x20
// (1,000 seeds): with 10 the heroes hold the middle hill and win 53.3%; with 7 they stay in the open (29%) and with no
// limit they spread out (41%). The result is sensitive to this number: if the map changed, measure again.
export const GUARD_RADIUS = 10;

export interface Plan {
  moveTo: Pos | null;
  ability: { id: string; target: Pos } | null;
  score: number;
}

const avg = ([lo, hi]: [number, number]) => (lo + hi) / 2;

function attackScore(grid: Grid, state: BattleState, actor: UnitState, abilityId: string, target: Pos): number {
  const ability = ABILITIES[abilityId];
  const p = previewAbility(grid, state, actor.id, abilityId, target);
  if (!p.ok) return -Infinity;
  let total = -W.CHARGE * ability.charge;
  for (const t of p.targets) {
    const u = state.units.find((x) => x.id === t.unit)!;
    const chance = t.chance / 100;
    if (ability.heal[1] > 0) {
      // area healing catches whoever is in it: healing an enemy counts against (on the game maps healing only catches allies)
      const healed = chance * Math.min(avg(ability.heal), UNIT_DEFS[u.def].hp - u.hp);
      total += u.team === actor.team ? healed : -healed * W.FRIENDLY;
      continue;
    }
    const pushDmg = ability.push > 0 ? simulatePush(grid, state, u, p.center, actor.pos, ability.push).dmg : 0;
    const dmg = (t.dmgMin + t.dmgMax) / 2; // from the preview: it is the same range the roll uses
    const expected = chance * (Math.min(dmg + pushDmg, u.hp) + (dmg + pushDmg >= u.hp ? W.KILL : 0));
    const foe = u.team !== actor.team;
    // a charge that aims at the tile (panel, the Aimed Shot): whoever plays before it fires probably leaves and the hit lands on
    // nothing (Nov 12). A spell with charge follows the unit (abilities.ts) and loses nothing from this
    const leaves = ability.panel && u.ct + UNIT_DEFS[u.def].speed * ability.charge >= TURN_THRESHOLD ? W.ESCAPE : 1;
    total += (foe ? expected * (isObjective(u.def) ? W.OBJECTIVE : 1) : -expected * W.FRIENDLY) * leaves;
  }
  return total;
}

// where the ability can be aimed: each unit's tile and, for an area, the neighbors (the blast may graze)
function candidateTargets(grid: Grid, state: BattleState, actor: UnitState, ability: AbilityDef): Pos[] {
  if (ability.range[1] === 0) return [actor.pos];
  const out = new Map<string, Pos>();
  for (const u of state.units) {
    if (u.id === actor.id) continue;
    // large unit: any of its tiles (footprint); for whoever occupies 1 tile, the same order as before
    for (const f of footprint(u)) {
      out.set(posKey(f), f);
      if (ability.radius > 0) for (const n of neighbors(grid, f)) out.set(posKey(n), n);
    }
  }
  return [...out.values()];
}

// Tile value. When attacking, it weighs the threat (hitting from a safe place). With nobody in reach, the threat does not count and the
// distance weighs more: on the 20x20 map the enemy fled the heroes' reach instead of advancing and the battle did not move
// (measured on Nov 11: 28 of 40 enemy turns without attacking). The hero advances only up to the guard radius of the target to protect.
// On-foot distance from each tile to the nearest enemy, in movement points (stepCost), and the jump is that of whoever
// walks (units on the path do not count). It used to be the straight-line distance: in Gariland, two units on neighboring
// rooftops thought they were "2 tiles away" and nobody went down to go around; with shallow water (Nov 12) there were 35 stuck battles
// in 1,000 in the class study. The search starts from the enemies: the cost of each step is that of entering the tile it comes from.
export function walkMap(grid: Grid, state: BattleState, actor: UnitState): Map<string, number> {
  const jump = jumpOf(state, actor.def);
  const size = UNIT_DEFS[actor.def].size ?? 1;
  const best = new Map<string, number>();
  const queue: { p: Pos; cost: number }[] = [];
  for (const o of state.units) {
    if (o.team === actor.team) continue;
    const cost = isObjective(o.def) ? -W.OBJECTIVE_PULL * subOf(grid) : 0;
    if ((best.get(posKey(o.pos)) ?? Infinity) <= cost) continue;
    best.set(posKey(o.pos), cost);
    queue.push({ p: o.pos, cost });
  }
  for (let i = 0; i < queue.length; i++) {
    const { p, cost } = queue[i];
    if (cost > (best.get(posKey(p)) ?? Infinity)) continue;
    // a token (half tiles) walks as its square, like `reachable`: a 1-cell walker slipped through gaps it cannot pass (Nov 14
    // review). Moves are symmetric, and the gap is read from the enemy side as on whole tiles
    if (size > 1) {
      for (const { to, cost: step } of squareMoves(grid, p, size, jump, () => false)) {
        if ((best.get(posKey(to)) ?? Infinity) <= cost + step) continue;
        best.set(posKey(to), cost + step);
        queue.push({ p: to, cost: cost + step });
      }
      continue;
    }
    const here = tileAt(grid, p);
    for (const n of neighbors(grid, p)) {
      const t = tileAt(grid, n);
      const next = cost + stepCost(here);
      if (!canStand(t) || Math.abs(t.h - here.h) > jump || (best.get(posKey(n)) ?? Infinity) <= next) continue; // jump by the surface, like reachable
      best.set(posKey(n), next);
      queue.push({ p: n, cost: next });
    }
    // gap (pathing.ts leaps): the rule is the same in both directions, so it serves the search that starts from the enemies
    for (const { to: n, over } of leaps(grid, p, jump)) {
      const next = cost + over.length + stepCost(here);
      if ((best.get(posKey(n)) ?? Infinity) <= next) continue;
      best.set(posKey(n), next);
      queue.push({ p: n, cost: next });
    }
  }
  return best;
}

function positionScore(
  grid: Grid,
  state: BattleState,
  actor: UnitState,
  at: Pos,
  attacking: boolean,
  walk: Map<string, number>,
): number {
  const tile = tileAt(grid, at);
  // the weights are per whole tile: on the split map (half.ts) the cells between the corners are counted back in tiles
  const tiles = (d: number) => d / subOf(grid);
  // spikes: ending the turn there costs their damage (grid.ts)
  // a spike that kills whoever ends the turn on it counts as their own death (Nov 13, review: the Brute with 5 life stopped there)
  const spike = !tile.spikes ? 0 : actor.hp <= COMBAT.SPIKE_DAMAGE ? 1000 : COMBAT.SPIKE_DAMAGE;
  let score = (TERRAIN[tile.terrain].cover ? W.COVER : 0) + W.HEIGHT * standH(tile) - spike;
  let nearest = Infinity;
  for (const o of state.units) {
    if (o.team === actor.team) {
      if (!attacking && isObjective(o.def)) score -= W.GUARD * Math.max(0, tiles(dist(at, o.pos)) - GUARD_RADIUS);
      continue;
    }
    nearest = Math.min(nearest, tiles(dist(at, o.pos)) - (isObjective(o.def) ? W.OBJECTIVE_PULL : 0));
    const def = UNIT_DEFS[o.def];
    if (!attacking || def.speed === 0 || !def.abilities.length) continue;
    const reach = tiles(def.move) + Math.max(...def.abilities.map((a) => ABILITIES[a].range[1]));
    if (tiles(dist(at, o.pos)) <= reach)
      score -= W.THREAT * Math.max(...def.abilities.map((a) => avg(ABILITIES[a].damage)));
  }
  // on foot when there is a path; in a straight line only if no enemy is reachable by walking
  const walked = walk.get(posKey(at));
  if (walked !== undefined) nearest = tiles(walked);
  return score - (attacking ? W.APPROACH : W.ADVANCE) * (Number.isFinite(nearest) ? nearest : 0);
}

// Best move of the turn: tests each reachable tile (and staying put) with each ability and each target, and picks the one with the
// highest expected value (expected damage and kills, hurting an ally and delay count against, plus position). It only reads the state.
export function chooseTurn(grid: Grid, state: BattleState, unitId: string): Plan {
  const actor = state.units.find((u) => u.id === unitId)!;
  const spots = [actor.pos, ...[...reachable(grid, state, unitId).values()].map((s) => s.pos)];
  const walk = walkMap(grid, state, actor);
  let best: Plan = { moveTo: null, ability: null, score: -Infinity };
  for (const spot of spots) {
    const moved = { ...state, units: state.units.map((u) => (u === actor ? { ...u, pos: spot } : u)) };
    const me = moved.units.find((u) => u.id === unitId)!;
    let attack: Plan['ability'] = null;
    let attackBest = 0; // attacking is only worth it if the balance is positive
    for (const id of UNIT_DEFS[actor.def].abilities) {
      for (const target of candidateTargets(grid, moved, me, ABILITIES[id])) {
        const s = attackScore(grid, moved, me, id, target);
        if (s > attackBest) {
          attackBest = s;
          attack = { id, target };
        }
      }
    }
    const score = attackBest + positionScore(grid, moved, me, spot, !!attack, walk);
    if (score > best.score) best = { moveTo: spot === actor.pos ? null : spot, ability: attack, score };
  }
  return best;
}

// Retreat after acting: each still-reachable tile is worth its position (positionScore, as for an attacker) minus the expected damage
// of the counter-attack the step provokes (half of the basic attack of whoever was attacked, by the hit chance); it stays put if nothing
// is worth more than the current tile
function chooseRetreat(grid: Grid, state: BattleState, unitId: string, reach: Map<string, Step>): Pos | null {
  const me = state.units.find((u) => u.id === unitId)!;
  const walk = walkMap(grid, state, me);
  const value = (spot: Pos) => {
    const moved = { ...state, units: state.units.map((u) => (u === me ? { ...u, pos: spot } : u)) };
    let s = positionScore(grid, moved, moved.units.find((u) => u.id === unitId)!, spot, true, walk);
    if (spot === me.pos) return s;
    for (const e of state.turn.engaged ?? []) {
      const foe = state.units.find((u) => u.id === e.unit);
      if (!foe || (!e.ranged && gap(footprint(foe), cellsOf(spot, UNIT_DEFS[me.def].size ?? 1)) <= 1)) continue;
      const p = previewAbility(grid, state, foe.id, basicOf(foe.def), me.pos, true);
      if (p.ok && p.targets[0]) s -= (p.targets[0].chance / 100) * ((p.targets[0].dmgMin + p.targets[0].dmgMax) / 4);
    }
    return s;
  };
  let best: Pos | null = null,
    bestScore = value(me.pos);
  for (const step of reach.values()) {
    const v = value(step.pos);
    if (v > bestScore + 0.5) {
      bestScore = v;
      best = step.pos;
    } // margin: it does not dance around for almost nothing
  }
  return best;
}

// Plays the whole turn of the current unit (walk, act and pass the turn) and returns the events for the client to animate.
export function playAiTurn(battle: Battle): BattleEvent[] {
  const plan = chooseTurn(battle.grid, battle.state, battle.actor.id);
  const events: BattleEvent[] = [];
  if (plan.moveTo) events.push(...battle.move(plan.moveTo));
  if (plan.ability) events.push(...battle.act(plan.ability.id, plan.ability.target));
  // with movement left after acting (Nov 13, movement in parts), it retreats if the new tile is worth more than the counter-attack
  if (!battle.over && plan.ability) {
    const to = chooseRetreat(battle.grid, battle.state, battle.actor.id, battle.reach());
    if (to) events.push(...battle.move(to));
  }
  // with direction: ends the turn facing the nearest enemy (our own choice; the FFT AI has no source)
  // whoever retreated may have died to the counter-attack: without an actor, no turning
  if (
    !battle.over &&
    battle.state.units.some((u) => u.id === battle.state.turn.actor) &&
    battle.actor.facing !== undefined
  ) {
    const me = battle.actor;
    const foes = battle.state.units.filter((u) => u.team !== me.team);
    if (foes.length)
      battle.face(facingTo(me.pos, foes.reduce((a, b) => (dist(me.pos, b.pos) < dist(me.pos, a.pos) ? b : a)).pos));
  }
  events.push(...battle.endTurn());
  return events;
}
