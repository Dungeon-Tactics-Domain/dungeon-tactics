// The Shop and the Tavern as one counter screen in the layout of a Final Fantasy Tactics shop (Fernando, Nov 16): a
// command list (Buy, Sell, Leave), the list with each price, and a detail box for the picked row with what it gives, how
// many the party owns, what it would change on each member and the action with why it is off. Rules in chest.ts, group.ts.

import { type ItemDef, type Kind, kindOf, type Loadout, SLOTS, type Slot, worn } from '../shared/battle/equipment.ts';
import type { Chest, Equip } from './chest.ts';
import { t } from './i18n.ts';
import { looks3d } from './looks3d.ts';
import { compare, itemName } from './sheet-lines.ts';

// the slot a new piece of this kind would go to: the first empty one of its kind (a 2nd accessory), else the first
export const fitSlot = (load: Loadout, kind: Kind): Slot => {
  const fits = SLOTS.filter((s) => kindOf(s) === kind);
  return fits.find((s) => !worn(load, s)) ?? fits[0];
};

// what wearing the piece would change on one member, as the Equipment window counts it, and the piece it would replace
export function fitLine(cls: string, load: Loadout, it: ItemDef): string {
  const slot = fitSlot(load, it.kind),
    old = worn(load, slot);
  if (old?.id === it.id) return t('já usa', 'already wears it');
  const change = compare(cls, load, slot, it.id);
  return old ? t(`${change} (no lugar de ${itemName(old)})`, `${change} (replacing ${itemName(old)})`) : change;
}

// how many of a piece the party has, loose in the chest and worn by someone
export const ownedOf = (chest: Chest, eq: Equip, id: string): [loose: number, on: number] => [
  chest.items.filter((i) => i === id).length,
  Object.values(eq)
    .flatMap((l) => Object.values(l))
    .filter((i) => i === id).length,
];
export function ownedText([loose, on]: [number, number]): string {
  const n = loose + on;
  return n
    ? t(`${n} (${loose} no baú, ${on} em uso)`, `${n} (${loose} in the chest, ${on} worn)`)
    : t('nenhuma', 'none');
}

// Shop (Nov 13, delivery 2): buy with the chest gold, sell for half (as in FFT). It sells only common pieces (rares and
// epics drop, Nov 16) and lists the consumables, whose Buy stays off until the battle can use them
type ShopTab = 'buy' | 'sell';
export function openShop(back?: () => void, tab: ShopTab = 'buy', sel = '') {
  looks3d.shop?.(back, tab, sel); // drawn by town3d/screens.ts
}

// Tavern (Nov 13, delivery 5 of the design): recruit one person of any class for gold, up to the party cap. `said`: who
// just joined, on the box of the class they came from
export function openBar(back: () => void, sel = '', said = '') {
  looks3d.bar?.(back, sel, said); // drawn by town3d/screens.ts
}
