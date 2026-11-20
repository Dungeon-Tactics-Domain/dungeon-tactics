// The turn's two action slots (Fernando, Nov 19; action points come later): a main action and a secondary (bonus) one. A main
// action needs the main slot; a bonus one takes the secondary, else it may spend the main (two items in one turn)
import type { AbilityDef } from './abilities.ts';
import type { TurnState } from './types.ts';

export type ActionKind = 'main' | 'bonus';

// the ability's own field, else no damage means bonus (a heal, a buff) and the rest main; every item is bonus (bag.ts)
export const abilityKind = (a: AbilityDef): ActionKind => a.action ?? (a.damage[1] === 0 ? 'bonus' : 'main');

// the slot an action of this kind would fill now, or null when none is free
export function freeSlot(turn: TurnState, kind: ActionKind): ActionKind | null {
  if (kind === 'main') return turn.main ? null : 'main';
  return !turn.bonus ? 'bonus' : !turn.main ? 'main' : null;
}

// the slot `a` fills now, `as` the one the player picked (the Agir slot step, Nov 20): a dual action (bonusShare) takes the
// asked slot only, else the main while free, else the secondary; any other ability its kind's slot, never the secondary
// when it is a main one
export function slotFor(turn: TurnState, a: AbilityDef, as?: ActionKind): ActionKind | null {
  const kind = abilityKind(a);
  if (a.bonusShare === undefined) return as === 'bonus' && kind === 'main' ? null : freeSlot(turn, kind);
  if (as) return turn[as] ? null : as;
  return !turn.main ? 'main' : !turn.bonus ? 'bonus' : null;
}

// the damage fraction `a` deals from `slot`: a dual action's share in the secondary, else whole
export const slotScale = (a: AbilityDef, slot: ActionKind | null) =>
  slot === 'bonus' && a.bonusShare !== undefined ? a.bonusShare / 100 : 1;
