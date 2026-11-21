// A unit's pools (mana, stamina; the study's MP and stock): what is left, paying an ability's cost and the regen at the
// start of its turns (split from combat.ts)
import type { AbilityDef } from './abilities.ts';
import type { BattleEvent, UnitState } from './types.ts';
import { UNIT_DEFS } from './units.ts';

// What a unit has left of a counter (mana, stamina; the study's MP and stock): a key absent reads as the sheet's start value,
// so a save or a state from before the pools opens full
export const poolOf = (u: UnitState, k: string) => u.vars?.[k] ?? UNIT_DEFS[u.def].vars?.[k] ?? 0;
// the one reading of the cost: the preview, the AI, the menu and the payment go through these two
export const canPay = (u: UnitState, a: AbilityDef) => !a.cost || poolOf(u, a.cost[0]) >= a.cost[1];
export function pay(u: UnitState, a: AbilityDef): void {
  if (a.cost) u.vars = { ...u.vars, [a.cost[0]]: poolOf(u, a.cost[0]) - a.cost[1] };
}
// Mana, stamina and life back at the start of each of the unit's turns (the lab's regen by class, pieces), never above
// the sheet's max. Life regen is not a heal: no magic power, no friendly-fire share, the undead gain it too. No roll
export function regen(u: UnitState): BattleEvent[] {
  const d = UNIT_DEFS[u.def];
  for (const [k, n] of Object.entries(d.regen ?? {}))
    u.vars = { ...u.vars, [k]: Math.min(d.vars?.[k] ?? 0, poolOf(u, k) + (n ?? 0)) };
  const amount = Math.min(d.hpRegen ?? 0, d.hp - u.hp);
  if (amount <= 0) return []; // at full life it says nothing, or every turn would flash
  u.hp += amount;
  return [{ k: 'regen', unit: u.id, amount }];
}
