// Equipment of the game (data; the type, the registry and the bonus sum live in src/shared/battle/equipment.ts). Initial
// numbers, to be measured before they become a shop. Life and damage (`hp`, power) x5 on Nov 15 with the units' life and the abilities'
// damage (Fernando's grill: piece power on the same scale); the old power split the same day into physical (the blade and
// the bow, worn by martial classes) and magic (the staff, worn by the mage). The lab's piece table comes in a later slice
import type { ItemDef } from '../shared/battle/equipment.ts';

export const ITEM_LIST: ItemDef[] = [
  { id: 'iron_blade', name: 'Lâmina de ferro', en: 'Iron blade', slot: 'weapon', price: 120, physPower: 10 },
  { id: 'hunter_bow', name: 'Arco de caça', en: 'Hunter bow', slot: 'weapon', price: 140, physPower: 5, hit: 8 },
  { id: 'ash_staff', name: 'Cajado de freixo', en: 'Ash staff', slot: 'weapon', price: 150, magPower: 15 },
  { id: 'leather_vest', name: 'Gibão de couro', en: 'Leather vest', slot: 'armor', price: 100, hp: 30 },
  { id: 'chain_mail', name: 'Cota de malha', en: 'Chain mail', slot: 'armor', price: 220, hp: 60, speed: -1 },
  { id: 'warded_robe', name: 'Manto guardado', en: 'Warded robe', slot: 'armor', price: 160, hp: 40 },
  { id: 'swift_boots', name: 'Botas ligeiras', en: 'Swift boots', slot: 'accessory', price: 200, move: 1 },
  { id: 'spring_greaves', name: 'Grevas de mola', en: 'Spring greaves', slot: 'accessory', price: 180, jump: 1 },
  { id: 'quick_charm', name: 'Amuleto ligeiro', en: 'Quick charm', slot: 'accessory', price: 240, speed: 1 },
];
