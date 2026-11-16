import { regen, resolveAbility } from './combat.ts';
import { type Grid, samePos } from './grid.ts';
import { aimTile, nearestTile } from './pathing.ts';
import { rulesOf } from './rules.ts';
import type { BattleEvent, BattleState, Charge, Pos } from './types.ts';
import { UNIT_DEFS } from './units.ts';

// FFT queue (Oct 25 spec; FFT rules on every map since Nov 12, Fernando's request): each unit gains
// `speed` CT per tick and acts on reaching TURN_THRESHOLD. Source: Battle Mechanics Handbook v6.1 (BMG), 1.1 and A.2.
export const TURN_THRESHOLD = 100;
// CT at the end of the turn (BMG 1.1): moving and acting costs 100, only one of the two 80, neither 60 ("Wait" gives the turn back sooner);
// what is left over never exceeds 60. Replaces the Oct 25 "100 plus the ability delay".
export const turnCt = (ct: number, moved: boolean, acted: boolean) =>
  Math.min(60, ct - (moved && acted ? 100 : moved || acted ? 80 : 60));

interface Slot {
  id: string;
  ct: number;
  speed: number;
}

// Advances the ticks until someone reaches the limit and returns who acts. With several at 100 or more, the first in the
// character list acts, not the one with the highest CT (BMG A.2); in FFT the enemies are numbered first, so the list puts enemies first.
function advance(slots: Slot[]): Slot {
  if (!slots.some((s) => s.ct >= TURN_THRESHOLD)) {
    const ticks = Math.min(...slots.map((s) => Math.ceil((TURN_THRESHOLD - s.ct) / s.speed)));
    for (const s of slots) s.ct += ticks * s.speed;
  }
  return slots.find((s) => s.ct >= TURN_THRESHOLD)!;
}

const slotsOf = (state: BattleState): Slot[] => {
  const all = state.units
    .map((u) => ({ id: u.id, team: u.team, ct: u.ct, speed: rulesOf(state).speed?.(u) ?? UNIT_DEFS[u.def].speed }))
    .filter((s) => s.speed > 0);
  return [...all.filter((s) => s.team === 'enemy'), ...all.filter((s) => s.team === 'hero')];
};

// character list order (enemies first, BMG A.2), to resolve charges that fire on the same tick
const listOrder = (state: BattleState, charges: Charge[]) => {
  const rank = (id: string) => {
    const i = state.units.findIndex((u) => u.id === id);
    return (state.units[i]?.team === 'enemy' ? 0 : 1e4) + i;
  };
  return [...charges].sort((a, b) => rank(a.unit) - rank(b.unit));
};

// Opens the next turn following the phases of each FFT tick (BMG A.2): S+ (charges count down 1), SR (those that reach 0
// fire, if the charger is alive), C+ (everyone gains CT) and CR (whoever reached 100 plays). Returns the events of the charges
// that fired along the way, for the client to animate; stops if one of them ends the battle.
export function startNextTurn(grid: Grid, state: BattleState): BattleEvent[] {
  const events: BattleEvent[] = [];
  for (;;) {
    const slots = slotsOf(state);
    const ready = slots.find((s) => s.ct >= TURN_THRESHOLD);
    if (ready) {
      state.turn = { actor: ready.id, moved: false, usedAbility: null };
      regen(state.units.find((u) => u.id === ready.id)!);
      return events;
    }
    const toTurn = slots.length
      ? Math.min(...slots.map((s) => Math.ceil((TURN_THRESHOLD - s.ct) / s.speed)))
      : Infinity;
    const toCharge = state.charges.length ? Math.min(...state.charges.map((c) => c.ticks)) : Infinity;
    if (toTurn === Infinity && toCharge === Infinity) return events;
    // re-read the units: a charge that fired may have killed someone
    const gain = (ticks: number) => {
      for (const s of slotsOf(state)) state.units.find((u) => u.id === s.id)!.ct += ticks * s.speed;
    };
    if (toTurn < toCharge) {
      gain(toTurn);
      for (const c of state.charges) c.ticks -= toTurn;
      continue;
    }
    gain(toCharge - 1);
    for (const c of state.charges) c.ticks -= toCharge;
    const due = listOrder(
      state,
      state.charges.filter((c) => c.ticks <= 0),
    );
    state.charges = state.charges.filter((c) => c.ticks > 0);
    for (const c of due) {
      if (!state.units.some((u) => u.id === c.unit)) continue; // the charger died
      // the shot is traced now, from where the caster stands (Nov 15): one who walked behind cover has it stop there
      const aim = aimTile(grid, state, chargeAim(state, c));
      const out = resolveAbility(grid, state, c.unit, c.ability, aim, true);
      // nobody hit (the target left) and nothing in the way: the charge is lost. A shot stopped short still shows where
      const landed = out.some((e) => e.k !== 'attack') || (out[0]?.k === 'attack' && !samePos(out[0].target, aim));
      events.push(...(landed ? out : [{ k: 'fizzle' as const, unit: c.unit, ability: c.ability }]));
      if (state.outcome !== 'ongoing') return events;
    }
    gain(1);
  }
}

// Where a charge aims when it fires: the locked tile, or the followed unit's tile nearest to its caster (a large unit's
// corner one could be out of range; 1 tile: the same)
export function chargeAim(state: BattleState, c: Charge): Pos {
  const followed = c.follow ? state.units.find((u) => u.id === c.follow) : undefined;
  const caster = state.units.find((u) => u.id === c.unit);
  return followed ? (caster ? nearestTile(followed, caster.pos) : followed.pos) : c.target;
}

// Charges the actor's turn cost for what it did (BMG 1.1)
export function finishTurn(state: BattleState): void {
  const actor = state.units.find((u) => u.id === state.turn.actor);
  if (actor) actor.ct = turnCt(actor.ct, state.turn.moved, !!state.turn.usedAbility);
  state.turnsPlayed++;
}

export interface QueueEntry {
  unit: string;
  charge?: string; // the charged ability that fires at this point of the queue
}

// The next `n` in the queue at the top of the screen, starting with whoever plays now, with the charges at the point where they fire (like the
// FFT turn list). A projection: assumes each one walks and acts (cost 100, the highest) and does not change the state.
// `now` is what the one acting now does this turn, when known (the HUD's preview while aiming, Nov 15)
export function previewOrder(
  state: BattleState,
  n: number,
  now: { moved: boolean; acted: boolean } = { moved: true, acted: true },
): QueueEntry[] {
  const slots = slotsOf(state);
  const charges = listOrder(state, state.charges).map((c) => ({ ...c }));
  const order: QueueEntry[] = [];
  const current = slots.find((s) => s.id === state.turn.actor);
  if (current) {
    order.push({ unit: current.id });
    current.ct = turnCt(current.ct, now.moved, now.acted);
  }
  while (order.length < n && (slots.length || charges.length)) {
    const toTurn = slots.some((s) => s.ct >= TURN_THRESHOLD)
      ? 0
      : slots.length
        ? Math.min(...slots.map((s) => Math.ceil((TURN_THRESHOLD - s.ct) / s.speed)))
        : Infinity;
    const toCharge = charges.length ? Math.min(...charges.map((c) => c.ticks)) : Infinity;
    if (toCharge <= toTurn) {
      for (const s of slots) s.ct += (toCharge - 1) * s.speed;
      for (const c of charges) c.ticks -= toCharge;
      for (const c of charges.filter((x) => x.ticks <= 0)) order.push({ unit: c.unit, charge: c.ability });
      charges.splice(0, charges.length, ...charges.filter((x) => x.ticks > 0));
      for (const s of slots) s.ct += s.speed;
      continue;
    }
    for (const c of charges) c.ticks -= toTurn;
    const next = advance(slots);
    order.push({ unit: next.id });
    next.ct = turnCt(next.ct, true, true);
  }
  return order.slice(0, n);
}
