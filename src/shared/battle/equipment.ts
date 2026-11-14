// Equipment (Nov 13, Fernando's request: "equipment, shops… just like FFT"; design in
// docs/game-design/cidades-grupo-equipamento.md). An item is data with general stats, equal against everything (project rule):
// it adds to the battle sheet, never a rule "item X against ability Y". Initial numbers, to be measured before they become a shop.
export type Slot = 'weapon' | 'armor' | 'accessory';
export interface ItemDef {
  id: string;
  name: string;
  en: string;
  slot: Slot;
  price: number; // gold in the shop (selling returns half)
  hp?: number; // max life
  power?: number; // added to both ends of the damage range of every ability that hurts
  hit?: number; // hit points
  move?: number;
  jump?: number;
  speed?: number;
}

const LIST: ItemDef[] = [
  { id: 'iron_blade', name: 'Lâmina de ferro', en: 'Iron blade', slot: 'weapon', price: 120, power: 2 },
  { id: 'hunter_bow', name: 'Arco de caça', en: 'Hunter bow', slot: 'weapon', price: 140, power: 1, hit: 8 },
  { id: 'ash_staff', name: 'Cajado de freixo', en: 'Ash staff', slot: 'weapon', price: 150, power: 3 },
  { id: 'leather_vest', name: 'Gibão de couro', en: 'Leather vest', slot: 'armor', price: 100, hp: 6 },
  { id: 'chain_mail', name: 'Cota de malha', en: 'Chain mail', slot: 'armor', price: 220, hp: 12, speed: -1 },
  { id: 'warded_robe', name: 'Manto guardado', en: 'Warded robe', slot: 'armor', price: 160, hp: 8 },
  { id: 'swift_boots', name: 'Botas ligeiras', en: 'Swift boots', slot: 'accessory', price: 200, move: 1 },
  { id: 'spring_greaves', name: 'Grevas de mola', en: 'Spring greaves', slot: 'accessory', price: 180, jump: 1 },
  { id: 'quick_charm', name: 'Amuleto ligeiro', en: 'Quick charm', slot: 'accessory', price: 240, speed: 1 },
];
export const ITEMS: Record<string, ItemDef> = Object.fromEntries(LIST.map((i) => [i.id, i]));
export const SLOTS: Slot[] = ['weapon', 'armor', 'accessory'];

export type Loadout = Partial<Record<Slot, string>>;
export interface Bonus {
  hp: number;
  power: number;
  hit: number;
  move: number;
  jump: number;
  speed: number;
}

// sum of the equipped items; an unknown item or one in the wrong slot does not count (the save is a trust boundary)
export function bonusOf(loadout: Loadout | undefined): Bonus {
  const b: Bonus = { hp: 0, power: 0, hit: 0, move: 0, jump: 0, speed: 0 };
  for (const slot of SLOTS) {
    const it = loadout?.[slot] ? ITEMS[loadout[slot]!] : undefined;
    if (!it || it.slot !== slot) continue;
    for (const k of Object.keys(b) as (keyof Bonus)[]) b[k] += it[k] ?? 0;
  }
  return b;
}
