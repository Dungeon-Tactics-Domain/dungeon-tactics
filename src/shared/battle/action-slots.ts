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
