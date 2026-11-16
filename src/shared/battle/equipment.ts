// Equipment (Nov 13, Fernando's request: "equipment, shops… just like FFT"; design in
// docs/game-design/towns-party-equipment.md). An item is data with general stats, equal against everything (project rule):
// it adds to the battle sheet, never a rule "item X against ability Y". The items live in src/content/items.ts.
import { ITEM_LIST } from '../../content/items.ts';

export type Slot = 'weapon' | 'armor' | 'accessory';
export interface ItemDef {
  id: string;
  name: string;
  en: string;
  slot: Slot;
  price: number; // gold in the shop (selling returns half)
  hp?: number; // max life
  physPower?: number; // added to the sheet's physical power (martial abilities)
  magPower?: number; // added to the sheet's magic power (spells)
  hit?: number; // hit points
  move?: number;
  jump?: number;
  speed?: number;
}

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(ITEM_LIST.map((i) => [i.id, i]));
export const SLOTS: Slot[] = ['weapon', 'armor', 'accessory'];

export type Loadout = Partial<Record<Slot, string>>;
export interface Bonus {
  hp: number;
  physPower: number;
  magPower: number;
  hit: number;
  move: number;
  jump: number;
  speed: number;
}

// sum of the equipped items; an unknown item or one in the wrong slot does not count (the save is a trust boundary)
export function bonusOf(loadout: Loadout | undefined): Bonus {
  const b: Bonus = { hp: 0, physPower: 0, magPower: 0, hit: 0, move: 0, jump: 0, speed: 0 };
  for (const slot of SLOTS) {
    const it = loadout?.[slot] ? ITEMS[loadout[slot]!] : undefined;
    if (!it || it.slot !== slot) continue;
    for (const k of Object.keys(b) as (keyof Bonus)[]) b[k] += it[k] ?? 0;
  }
  return b;
}
