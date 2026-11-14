// Party chest and each member's equipment (Nov 13, delivery 2 of the design docs/game-design/cidades-grupo-equipamento.md):
// gold and items stored in the browser; equipment is kept per base class (each class is one person in the campaign). Pure and
// tested; the saved values are a trust boundary (parseChest/parseEquip reject what they don't know).
import { ITEMS, SLOTS, type Loadout, type Slot } from '../shared/battle/equipment.ts';

export const CHEST_KEY = 'dt:bau';
export const EQUIP_KEY = 'dt:equip';
export interface Chest { gold: number; items: string[] }
export type Equip = Record<string, Loadout>;

export const VICTORY_GOLD = 150; // winning a stage yields 150 (the old 3-star maximum x 50) (initial number; the 1st act shop costs 100 to 240)

export function parseChest(raw: unknown): Chest {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const gold = Number.isInteger(r.gold) && (r.gold as number) >= 0 && (r.gold as number) <= 999999 ? (r.gold as number) : 0;
  const items = Array.isArray(r.items) ? r.items.filter((i): i is string => typeof i === 'string' && Object.hasOwn(ITEMS, i)).slice(0, 99) : [];
  return { gold, items };
}

export function parseEquip(raw: unknown): Equip {
  const out: Equip = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [base, l] of Object.entries(raw as Record<string, unknown>)) {
    if (!l || typeof l !== 'object') continue;
    const load: Loadout = {};
    for (const slot of SLOTS) {
      const id = (l as Record<string, unknown>)[slot];
      if (typeof id === 'string' && ITEMS[id]?.slot === slot) load[slot] = id;
    }
    out[base] = load;
  }
  return out;
}

// purchase: takes the gold and puts the item in the chest; null if there's no gold
export function buy(chest: Chest, id: string): Chest | null {
  const it = ITEMS[id];
  return it && chest.gold >= it.price ? { gold: chest.gold - it.price, items: [...chest.items, id] } : null;
}

// sale: half the price, as in the FFT shops; only what's in the chest (the equipped one must be unequipped first)
export function sell(chest: Chest, id: string): Chest | null {
  const i = chest.items.indexOf(id);
  if (i < 0) return null;
  return { gold: chest.gold + Math.floor(ITEMS[id].price / 2), items: chest.items.filter((_, k) => k !== i) };
}

// equips `id` (from the chest) in its slot on unit `base`, returning to the chest what was there; `id` null only unequips
export function equip(chest: Chest, eq: Equip, base: string, slot: Slot, id: string | null): { chest: Chest; eq: Equip } | null {
  if (id && (ITEMS[id]?.slot !== slot || !chest.items.includes(id))) return null;
  const items = [...chest.items];
  if (id) items.splice(items.indexOf(id), 1);
  const old = eq[base]?.[slot];
  if (old) items.push(old);
  const load: Loadout = { ...eq[base] };
  if (id) load[slot] = id;
  else delete load[slot];
  return { chest: { ...chest, items }, eq: { ...eq, [base]: load } };
}
