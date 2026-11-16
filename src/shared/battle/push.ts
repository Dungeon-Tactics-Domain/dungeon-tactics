// Where a push ends and what it costs: bump, fall and the events, without touching the state (the AI prices pushes with it).
import { COMBAT } from './combat.ts';
import { canStand, type Grid, inBounds, isDeep, samePos, standH, subOf, tileAt } from './grid.ts';
import { cellsOf, MAX_JUMP, noStopAt, restsOn, unitAt } from './pathing.ts';
import { rulesOf } from './rules.ts';
import type { BattleEvent, BattleState, Pos, UnitState } from './types.ts';
import { baseDef, UNIT_DEFS } from './units.ts';

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
        return !canStand(t) || isDeep(t) || noStopAt(grid, state, c) || (!!o && o.id !== unit.id);
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
