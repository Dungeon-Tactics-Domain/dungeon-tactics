// Equipment (Nov 13, Fernando's request: "equipment, shops… just like FFT"; design in
// docs/game-design/towns-party-equipment.md). An item is data with general stats, equal against everything (project rule):
// it adds to the battle sheet, never a rule "item X against ability Y". The items live in src/content/items.ts.
// Since Nov 16 (slice 3 of the Nov 15 grill, the Mechanics lab's equipamento.json): no XP, every number past the class's
// comes from the pieces; 7 slots (main and off hand, head, body, legs, 2 accessories) and 3 fixed rarities
import { ITEM_LIST } from '../../content/items.ts';
import { MAX_JUMP } from './pathing.ts';
import type { Resist, UnitDef } from './units.ts';

// what a piece is; an accessory fits either accessory slot
export type Kind = 'main' | 'off' | 'head' | 'body' | 'legs' | 'accessory';
export const SLOTS = ['main', 'off', 'head', 'body', 'legs', 'acc1', 'acc2'] as const;
export type Slot = (typeof SLOTS)[number];
export const kindOf = (s: Slot): Kind => (s === 'acc1' || s === 'acc2' ? 'accessory' : s);
// the lab's budget per rarity (2, 4, 6 points); only commons are sold in the shop, rares and epics come from drops
export type Rarity = 'common' | 'rare' | 'epic';

// the stats a piece may give, all whole numbers added to the sheet; resistances are a record of their own
export const STATS = [
  'hp',
  'physPower',
  'magPower',
  'hit',
  'dodge',
  'move',
  'jump',
  'speed',
  'mana',
  'stamina',
  'manaRegen',
  'hpRegen',
] as const;
export type Stat = (typeof STATS)[number];
// mana, stamina and the two regens are the lab's numbers for slice 2 (mana and stamina as resources): carried as data,
// summed, but no battle reads them yet
export const PENDING: readonly Stat[] = ['mana', 'stamina', 'manaRegen', 'hpRegen'];

export interface ItemDef extends Partial<Record<Stat, number>> {
  id: string;
  name: string;
  en: string;
  kind: Kind;
  rarity: Rarity;
  price: number; // shop gold of a common; a rare or epic is never sold, its price is only for selling (half)
  resist?: Partial<Record<Resist, number>>; // % like the class's (units.ts), negative = weakness
}

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(ITEM_LIST.map((i) => [i.id, i]));

export type Loadout = Partial<Record<Slot, string>>;
export type Bonus = Record<Stat, number> & { resist: Partial<Record<Resist, number>> };

// the piece worn in a slot; an unknown item or one of another kind does not count (the save is a trust boundary)
export const worn = (loadout: Loadout | undefined, s: Slot): ItemDef | undefined => {
  const it = loadout?.[s] ? ITEMS[loadout[s]] : undefined;
  return it?.kind === kindOf(s) ? it : undefined;
};

// sum of the equipped items, raw: resistOf and dodgeOf clamp the sheet's total once, where the battle reads it
export function bonusOf(loadout: Loadout | undefined): Bonus {
  const b = { ...(Object.fromEntries(STATS.map((k) => [k, 0])) as Record<Stat, number>), resist: {} } as Bonus;
  for (const s of SLOTS) {
    const it = worn(loadout, s);
    if (!it) continue;
    for (const k of STATS) b[k] += it[k] ?? 0;
    for (const [k, v] of Object.entries(it.resist ?? {}) as [Resist, number][]) b.resist[k] = (b.resist[k] ?? 0) + v;
  }
  return b;
}

// the battle sheet with the pieces on: what the hit, damage and turn rules read (combat.ts, turn-queue.ts). A stat with no
// piece stays as the class has it, so a bare sheet is the class's own
export function withGear(d: UnitDef, loadout: Loadout | undefined): UnitDef {
  const b = bonusOf(loadout);
  const resist = { ...d.resist };
  for (const [k, v] of Object.entries(b.resist) as [Resist, number][]) resist[k] = (resist[k] ?? 0) + v;
  const add = (k: 'dodge' | 'physPower' | 'magPower' | 'hit') => (b[k] ? { [k]: (d[k] ?? 0) + b[k] } : {});
  return {
    ...d,
    hp: d.hp + b.hp,
    speed: b.speed ? Math.max(1, d.speed + b.speed) : d.speed, // speed 0 never plays (turn-queue.ts)
    move: d.move + b.move,
    ...(b.jump && { jump: (d.jump ?? MAX_JUMP) + b.jump }),
    ...(Object.keys(resist).length && { resist }),
    ...add('dodge'),
    ...add('physPower'),
    ...add('magPower'),
    ...add('hit'),
  };
}
