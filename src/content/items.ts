// Equipment of the game (data; the type, the registry and the bonus sum live in src/shared/battle/equipment.ts). The
// pieces, slots, rarities and numbers are the Mechanics lab's table (dungeon-tactics-labs, mecanicas/equipamento.json,
// Nov 15), a starting point Fernando tunes by playing. A rarity is a budget of points (common 2, rare 4, epic 6; an epic
// may take one negative stat that gives points back); tests/content.test.ts checks every piece against it. Move and jump
// are whole tiles like the sheets (+1 shows +2 in half tiles). Shop prices: the lab gives commons 100 to 150 (each one
// below is our pick); rares 300 and epics 600 only count for selling, at half. Mana and stamina raise the pool's
// max and the regens add to the class's (equipment.ts withGear). The old ids stay (saves point to them)
import type { ItemDef } from '../shared/battle/equipment.ts';
import type { Element, Resist } from '../shared/battle/units.ts';

export const ITEM_LIST: ItemDef[] = [
  // main hand
  {
    id: 'iron_blade',
    name: 'Lâmina de ferro',
    en: 'Iron blade',
    kind: 'main',
    rarity: 'common',
    price: 120,
    physPower: 20,
  },
  {
    id: 'hunter_bow',
    name: 'Arco de caça',
    en: 'Hunter bow',
    kind: 'main',
    rarity: 'common',
    price: 140,
    physPower: 10,
    hit: 5,
  },
  {
    id: 'ash_staff',
    name: 'Cajado de freixo',
    en: 'Ash staff',
    kind: 'main',
    rarity: 'common',
    price: 150,
    magPower: 20,
  },
  {
    id: 'watch_spear',
    name: 'Lança do vigia',
    en: 'Watch spear',
    kind: 'main',
    rarity: 'rare',
    price: 300,
    physPower: 30,
    hit: 5,
  },
  {
    id: 'ember_scepter',
    name: 'Cetro da brasa',
    en: 'Ember scepter',
    kind: 'main',
    rarity: 'epic',
    price: 600,
    magPower: 40,
    resist: { fire: 40, ice: -20 },
    manaRegen: 3,
  },
  // off hand
  {
    id: 'buckler',
    name: 'Broquel',
    en: 'Buckler',
    kind: 'off',
    rarity: 'common',
    price: 120,
    resist: { phys: 10 },
    dodge: 5,
  },
  {
    id: 'worn_grimoire',
    name: 'Grimório gasto',
    en: 'Worn grimoire',
    kind: 'off',
    rarity: 'common',
    price: 120,
    mana: 20,
    manaRegen: 3,
  },
  {
    id: 'leather_quiver',
    name: 'Aljava de couro',
    en: 'Leather quiver',
    kind: 'off',
    rarity: 'rare',
    price: 300,
    physPower: 20,
    hit: 5,
    stamina: 20,
  },
  {
    id: 'veil_shield',
    name: 'Escudo do Véu',
    en: 'Veil shield',
    kind: 'off',
    rarity: 'epic',
    price: 600,
    resist: { phys: 30, mag: 30, shadow: 40 },
    speed: -1,
  },
  // head
  { id: 'hood', name: 'Capuz', en: 'Hood', kind: 'head', rarity: 'common', price: 100, dodge: 5, hit: 5 },
  {
    id: 'iron_helm',
    name: 'Elmo de ferro',
    en: 'Iron helm',
    kind: 'head',
    rarity: 'common',
    price: 120,
    resist: { phys: 10 },
    hp: 25,
  },
  {
    id: 'dawn_circlet',
    name: 'Tiara da aurora',
    en: 'Dawn circlet',
    kind: 'head',
    rarity: 'rare',
    price: 300,
    resist: { mag: 10, light: 40 },
    manaRegen: 3,
  },
  // body
  {
    id: 'leather_vest',
    name: 'Gibão de couro',
    en: 'Leather vest',
    kind: 'body',
    rarity: 'common',
    price: 100,
    hp: 25,
    dodge: 5,
  },
  {
    id: 'chain_mail',
    name: 'Cota de malha',
    en: 'Chain mail',
    kind: 'body',
    rarity: 'rare',
    price: 300,
    resist: { phys: 20 },
    hp: 50,
  },
  {
    id: 'warded_robe',
    name: 'Manto guardado',
    en: 'Warded robe',
    kind: 'body',
    rarity: 'rare',
    price: 300,
    resist: { mag: 20 },
    hp: 25,
    mana: 20,
  },
  {
    id: 'colossus_plate',
    name: 'Couraça do colosso',
    en: 'Colossus plate',
    kind: 'body',
    rarity: 'epic',
    price: 600,
    resist: { phys: 30 },
    hp: 125,
    hpRegen: 10, // 10 life regen a point since Fernando's Nov 16 answer (the lab first said 5)
    move: -1,
  },
  // legs
  {
    id: 'spring_greaves',
    name: 'Grevas de mola',
    en: 'Spring greaves',
    kind: 'legs',
    rarity: 'common',
    price: 150,
    jump: 1,
  },
  {
    id: 'padded_trousers',
    name: 'Calças acolchoadas',
    en: 'Padded trousers',
    kind: 'legs',
    rarity: 'common',
    price: 120,
    resist: { phys: 10 },
    hp: 25,
  },
  {
    id: 'swift_boots',
    name: 'Botas ligeiras',
    en: 'Swift boots',
    kind: 'legs',
    rarity: 'rare',
    price: 300,
    move: 1,
    dodge: 5,
  },
  // accessories
  {
    id: 'ember_ring',
    name: 'Anel de brasa',
    en: 'Ember ring',
    kind: 'accessory',
    rarity: 'common',
    price: 130,
    resist: { fire: 20 },
    magPower: 10,
  },
  {
    id: 'sleepstone',
    name: 'Pedra-do-sono',
    en: 'Sleepstone',
    kind: 'accessory',
    rarity: 'common',
    price: 130,
    hpRegen: 10, // 10 life regen a point since Fernando's Nov 16 answer (the lab first said 5)
    hp: 25,
  },
  {
    id: 'quick_charm',
    name: 'Amuleto ligeiro',
    en: 'Quick charm',
    kind: 'accessory',
    rarity: 'rare',
    price: 300,
    speed: 1,
    hit: 5,
    dodge: 5,
  },
  {
    id: 'bone_talisman',
    name: 'Talismã de osso',
    en: 'Bone talisman',
    kind: 'accessory',
    rarity: 'rare',
    price: 300,
    resist: { shadow: 40, mag: 20 },
  },
];

// The consumables (the lab's buffs table): listed in the shop with their price, not sold yet. In battle the Item command
// spends the turn's action on one (src/shared/battle/bag.ts, Nov 19); `heal` and `mana` are what it gives back, never
// above the sheet's max. `buff` is a timed effect on the target (src/shared/battle/effects.ts): it lasts `turns` of that
// unit's own turns; `move` is in whole tiles like the sheets
export interface Consumable {
  id: string;
  name: string;
  en: string;
  price: number;
  use: [pt: string, en: string];
  heal?: number;
  mana?: number;
  buff?: Buff;
}
export interface Buff {
  turns: number;
  physPower?: number; // added to a martial ability's damage
  element?: Element; // a martial hit takes this element (the target's resistance to it applies)
  resist?: Partial<Record<Resist, number>>;
  move?: number;
}
export const CONSUMABLES: Consumable[] = [
  { id: 'life_potion', name: 'Poção de vida', en: 'Life potion', price: 40, use: ['cura 100', 'heals 100'], heal: 100 },
  { id: 'ether', name: 'Éter', en: 'Ether', price: 60, use: ['+30 de mana', '+30 mana'], mana: 30 },
  {
    id: 'fire_oil',
    name: 'Óleo de fogo',
    en: 'Fire oil',
    price: 50,
    use: [
      'ataques físicos viram fogo, +10 de poder físico, 3 turnos',
      'physical attacks turn to fire, +10 physical power, 3 turns',
    ],
    buff: { turns: 3, physPower: 10, element: 'fire' },
  },
  {
    id: 'stone_potion',
    name: 'Poção de pedra',
    en: 'Stone potion',
    price: 50,
    // the lab's −1 move in whole tiles, shown in half tiles like every Move on screen
    use: ['+30% de resistência física, −2 de movimento, 3 turnos', '+30% physical resistance, −2 move, 3 turns'],
    buff: { turns: 3, resist: { phys: 30 }, move: -1 },
  },
];
// Every item reaches the user or an ally up to 3 whole tiles away (Fernando, Nov 19: one range for all, a throw included)
export const ITEM_RANGE = 3;
// What the party's bag holds when a descent starts (Fernando, Nov 19: a fixed start, then 1 item per chest)
export const START_BAG: Record<string, number> = { life_potion: 2, ether: 1 };
