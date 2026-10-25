// Baú do grupo e equipamento de cada um (13/11, entrega 2 do desenho docs/game-design/cidades-grupo-equipamento.md):
// ouro e itens guardados no navegador; o equipamento fica pela classe base (cada classe é uma pessoa na campanha). Puro e
// testado; os valores salvos são fronteira de confiança (parseChest/parseEquip recusam o que não conhecem).
import { ITEMS, SLOTS, type Loadout, type Slot } from '../shared/battle/equipment.ts';

export const CHEST_KEY = 'dt:bau';
export const EQUIP_KEY = 'dt:equip';
export interface Chest { gold: number; items: string[] }
export type Equip = Record<string, Loadout>;

export const VICTORY_GOLD = 150; // vencer uma fase rende 150 (o antigo máximo de 3 estrelas x 50) (número inicial; a loja do 1º ato custa 100 a 240)

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

// compra: tira o ouro e põe o item no baú; null se não tem ouro
export function buy(chest: Chest, id: string): Chest | null {
  const it = ITEMS[id];
  return it && chest.gold >= it.price ? { gold: chest.gold - it.price, items: [...chest.items, id] } : null;
}

// venda: metade do preço, como nas lojas do FFT; só o que está no baú (o equipado precisa ser tirado antes)
export function sell(chest: Chest, id: string): Chest | null {
  const i = chest.items.indexOf(id);
  if (i < 0) return null;
  return { gold: chest.gold + Math.floor(ITEMS[id].price / 2), items: chest.items.filter((_, k) => k !== i) };
}

// equipa `id` (do baú) no espaço dele na unidade `base`, devolvendo ao baú o que estava ali; `id` null só tira
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
