// The numbers a unit sheet and a piece show: one line per stat, each total as the battle counts it and where it comes from.

import { COMBAT } from '../shared/battle/combat.ts';
import {
  type ItemDef,
  type Kind,
  type Loadout,
  type Rarity,
  SLOTS,
  type Slot,
  withGear,
  worn,
} from '../shared/battle/equipment.ts';
import { SUB } from '../shared/battle/half.ts';
import { MAX_JUMP } from '../shared/battle/pathing.ts';
import { dodgeOf, ELEMENTS, resistOf, UNIT_DEFS, type UnitDef } from '../shared/battle/units.ts';
import { ELEMENT_NAME, signed } from './battle-text.ts';
import { CHEST_KEY, EQUIP_KEY, parseChest, parseEquip } from './chest.ts';
import { t, unitName } from './i18n.ts';
import { store } from './store.ts';

export const KIND_NAME: Record<Kind, () => string> = {
  main: () => t('Mão principal', 'Main hand'),
  off: () => t('Mão secundária', 'Off hand'),
  head: () => t('Cabeça', 'Head'),
  body: () => t('Corpo', 'Body'),
  legs: () => t('Pernas', 'Legs'),
  accessory: () => t('Acessório', 'Accessory'),
};
export const slotName = (s: Slot) =>
  s === 'acc1' || s === 'acc2' ? `${KIND_NAME.accessory()} ${s.at(-1)}` : KIND_NAME[s]();
// rarity in words (a piece, "peça", is feminine in Portuguese): never by colour alone
export const RARITY: Record<Rarity, () => string> = {
  common: () => t('comum', 'common'),
  rare: () => t('rara', 'rare'),
  epic: () => t('épica', 'epic'),
};
export const itemName = (it: ItemDef) => t(it.name, it.en);

// The sheet's numbers, one line each (Nov 16, slice 3): `of` reads the battle sheet as the rules do (resistOf and dodgeOf
// clamp), `piece` what one piece adds, Move and Jump in half tiles like every screen; `more` is shown only when something
// gives it
interface Line {
  name: () => string; // after a piece's number: "+10% física"
  label?: () => string; // the sheet row, when not the name with a capital
  unit?: '%';
  signed?: true; // a resistance: "−10%" and "+0%" on the sheet
  of: (d: UnitDef) => number;
  // the same reading on a charging unit (physical and magic resistance): the drop comes off the raw sum before the cap,
  // so a resistance past the cap still counts there (combat.ts; whether that is right is Fernando's call)
  charging?: (d: UnitDef) => number;
  piece: (it: ItemDef) => number;
  more?: true;
}
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const LINES: Line[] = [
  { name: () => t('vida', 'HP'), of: (d) => d.hp, piece: (it) => it.hp ?? 0 },
  { name: () => t('poder físico', 'physical power'), of: (d) => d.physPower ?? 0, piece: (it) => it.physPower ?? 0 },
  { name: () => t('poder mágico', 'magic power'), of: (d) => d.magPower ?? 0, piece: (it) => it.magPower ?? 0 },
  { name: () => t('acerto', 'hit'), of: (d) => d.hit ?? 0, piece: (it) => it.hit ?? 0 },
  { name: () => t('esquiva', 'dodge'), unit: '%', of: dodgeOf, piece: (it) => it.dodge ?? 0 },
  {
    name: () => t('física', 'physical'),
    label: () => t('Resistência física', 'Physical resistance'),
    unit: '%',
    signed: true,
    of: (d) => resistOf(d, 'phys'),
    charging: (d) => resistOf(d, 'phys', -COMBAT.CHARGING_PHYS),
    piece: (it) => it.resist?.phys ?? 0,
  },
  {
    name: () => t('mágica', 'magic'),
    label: () => t('Resistência mágica', 'Magic resistance'),
    unit: '%',
    signed: true,
    of: (d) => resistOf(d, 'mag'),
    charging: (d) => resistOf(d, 'mag', -COMBAT.CHARGING_MAG),
    piece: (it) => it.resist?.mag ?? 0,
  },
  ...ELEMENTS.map(
    (e): Line => ({
      name: ELEMENT_NAME[e],
      label: () => t(`Resistência a ${ELEMENT_NAME[e]()}`, `${cap(ELEMENT_NAME[e]())} resistance`),
      unit: '%',
      signed: true,
      more: true,
      of: (d) => resistOf(d, e),
      piece: (it) => it.resist?.[e] ?? 0,
    }),
  ),
  { name: () => t('movimento', 'move'), of: (d) => d.move * SUB, piece: (it) => (it.move ?? 0) * SUB },
  { name: () => t('salto', 'jump'), of: (d) => (d.jump ?? MAX_JUMP) * SUB, piece: (it) => (it.jump ?? 0) * SUB },
  { name: () => t('velocidade', 'speed'), of: (d) => d.speed, piece: (it) => it.speed ?? 0 },
  // the pools' max and the regens per turn (Nov 16, slice 1 of the equipment rollout)
  { name: () => 'mana', more: true, of: (d) => d.vars?.mana ?? 0, piece: (it) => it.mana ?? 0 },
  { name: () => 'stamina', more: true, of: (d) => d.vars?.stamina ?? 0, piece: (it) => it.stamina ?? 0 },
  {
    name: () => t('regeneração de mana', 'mana regen'),
    more: true,
    of: (d) => d.regen?.mana ?? 0,
    piece: (it) => it.manaRegen ?? 0,
  },
  {
    name: () => t('regeneração de vida', 'HP regen'),
    more: true,
    of: (d) => d.hpRegen ?? 0,
    piece: (it) => it.hpRegen ?? 0,
  },
];
// a piece's number or a change, with its sign (the HUD's minus); the sheet's total
const plus = (l: Line, v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}${l.unit ?? ''}`;
const total = (l: Line, v: number) => (l.signed ? signed(v) : `${v}${l.unit ?? ''}`);
const stat = (l: Line, v: number) => `${plus(l, v)} ${l.name()}`;
// what each worn piece adds to a line, in slot order
const pieces = (l: Line, load: Loadout | undefined) =>
  SLOTS.flatMap((s) => {
    const it = worn(load, s);
    const v = it ? l.piece(it) : 0;
    return it && v ? [{ it, v }] : [];
  });
const lineValue = (l: Line, def: UnitDef, load: Loadout | undefined) => l.of(withGear(def, load));

// "+20 poder físico · +5 acerto": only what the item changes, in the sheet's wording
export const itemStats = (it: ItemDef) =>
  LINES.filter((l) => l.piece(it))
    .map((l) => stat(l, l.piece(it)))
    .join(' · ');

// The Sheet's numbers (Nov 16, slice 3): each total as the battle counts it and, when a piece changes it, where it comes
// from: ["Vida", "235", "Guerreiro 210 · Elmo de ferro +25"]. When a limit took part of it (dodge 50, resistances 60) it
// says so with the raw sum, and for a resistance a charging unit loses, what is left then: the drop comes off the raw
// sum, so past the cap the pieces still count there (the coordinator's review of Nov 16: "capped" alone misled)
export function sheetRows(cls: string, load: Loadout | undefined): [label: string, total: string, from: string][] {
  const def = UNIT_DEFS[cls];
  return LINES.flatMap((l): [string, string, string][] => {
    const from = pieces(l, load),
      v = lineValue(l, def, load),
      own = l.of(def),
      raw = own + from.reduce((s, p) => s + p.v, 0);
    if (l.more && !v && !own && !from.length) return [];
    const parts = [`${unitName(cls)} ${total(l, own)}`, ...from.map((p) => `${itemName(p.it)} ${plus(l, p.v)}`)];
    if (raw !== v) {
      const when = l.charging ? `; ${t('carregando', 'charging')}, ${total(l, l.charging(withGear(def, load)))}` : '';
      parts.push(`${t('no limite', 'capped')} (${t('bruto', 'raw')} ${total(l, raw)}${when})`);
    }
    return [[l.label?.() ?? cap(l.name()), total(l, v), from.length ? parts.join(' · ') : '']];
  });
}

// what equipping `id` in `slot` (null: taking it off) changes on the sheet, as the rules read it: past a cap the
// change is what is left of it, and a resistance's change on a charging unit, read before the cap, comes apart when it
// differs
export function compare(cls: string, load: Loadout, slot: Slot, id: string | null): string {
  const def = UNIT_DEFS[cls],
    next: Loadout = { ...load, [slot]: id ?? undefined };
  const parts = LINES.flatMap((l) => {
    const d = lineValue(l, def, next) - lineValue(l, def, load);
    const c = l.charging ? l.charging(withGear(def, next)) - l.charging(withGear(def, load)) : d;
    return [...(d ? [stat(l, d)] : []), ...(c !== d ? [`${stat(l, c)} ${t('carregando', 'while charging')}`] : [])];
  });
  return parts.join(' · ') || t('nada muda', 'no change');
}
export const loadChest = () => parseChest(store.json(CHEST_KEY));
export const loadEquip = () => parseEquip(store.json(EQUIP_KEY));
