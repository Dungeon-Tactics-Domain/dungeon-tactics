// Party chest and each member's equipment (Nov 13, delivery 2 of the design docs/game-design/towns-party-equipment.md):
// gold and items stored in the browser; equipment is kept per party member (group.ts ids). Pure and tested; the saved values are a trust boundary (parseChest/parseEquip reject what they don't know).
import { STARTING_WEAPON } from '../content/party.ts';
import { ITEMS, kindOf, type Loadout, SLOTS, type Slot } from '../shared/battle/equipment.ts';

export const CHEST_KEY = 'dt:chest';
export const EQUIP_KEY = 'dt:equip';
export interface Chest {
  gold: number;
  items: string[];
}
export type Equip = Record<string, Loadout>;

export function parseChest(raw: unknown): Chest {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const gold =
    Number.isInteger(r.gold) && (r.gold as number) >= 0 && (r.gold as number) <= 999999 ? (r.gold as number) : 0;
  const items = Array.isArray(r.items)
    ? r.items.filter((i): i is string => typeof i === 'string' && Object.hasOwn(ITEMS, i)).slice(0, 99)
    : [];
  return { gold, items };
}

// No equipment saved yet is a new game (New game starts an empty slot and writes nothing): each story member holds the
// common weapon of their class. Once saved, an unequipped hand stays empty
export const startingEquip = (): Equip =>
  Object.fromEntries(Object.entries(STARTING_WEAPON).map(([id, w]) => [id, { main: w }]));

// Every known piece goes to a slot of its own kind, the saved one first, else the first free one: the 3 slots before
// Nov 16 (weapon, armor, accessory) land on main, body, legs or an accessory with nothing lost, in the live keys and in
// a save slot's copy alike, since both are read here
export function parseEquip(raw: unknown): Equip {
  if (raw === null) return startingEquip();
  const out: Equip = {};
  if (typeof raw !== 'object') return out;
  for (const [base, l] of Object.entries(raw as Record<string, unknown>)) {
    if (!l || typeof l !== 'object') continue;
    const load: Loadout = {};
    for (const [key, id] of Object.entries(l as Record<string, unknown>)) {
      const it = typeof id === 'string' && Object.hasOwn(ITEMS, id) ? ITEMS[id] : undefined;
      const at = it && ([key, ...SLOTS] as Slot[]).find((s) => SLOTS.includes(s) && kindOf(s) === it.kind && !load[s]);
      if (it && at) load[at] = it.id;
    }
    out[base] = load;
  }
  return out;
}

// purchase: takes the gold and puts the item in the chest; null if there's no gold or the shop does not sell it (the
// lab's rares and epics only drop)
export function buy(chest: Chest, id: string): Chest | null {
  const it = ITEMS[id];
  return it?.rarity === 'common' && chest.gold >= it.price
    ? { gold: chest.gold - it.price, items: [...chest.items, id] }
    : null;
}

// sale: half the price, as in the FFT shops; only what's in the chest (the equipped one must be unequipped first)
export function sell(chest: Chest, id: string): Chest | null {
  const i = chest.items.indexOf(id);
  if (i < 0) return null;
  return { gold: chest.gold + Math.floor(ITEMS[id].price / 2), items: chest.items.filter((_, k) => k !== i) };
}

// equips `id` (from the chest) in `slot` on unit `base`, returning to the chest what was there; `id` null only unequips
export function equip(
  chest: Chest,
  eq: Equip,
  base: string,
  slot: Slot,
  id: string | null,
): { chest: Chest; eq: Equip } | null {
  if (id && (ITEMS[id]?.kind !== kindOf(slot) || !chest.items.includes(id))) return null;
  const items = [...chest.items];
  if (id) items.splice(items.indexOf(id), 1);
  const old = eq[base]?.[slot];
  if (old) items.push(old);
  const load: Loadout = { ...eq[base] };
  if (id) load[slot] = id;
  else delete load[slot];
  return { chest: { ...chest, items }, eq: { ...eq, [base]: load } };
}
