// A unit's sheet in the battle builder (grill, Nov 25: everything the Developer menu edited, plus the starting CT):
// each step gives the unit's whole new sheet, and a field back at its class's value leaves the sheet, so an untouched
// unit reads as its plain class. Pure and tested; the shared setSheet checks and applies it.
import { ABILITY_LIST } from '../../content/abilities.ts';
import { ITEMS, kindOf, type Slot } from '../../shared/battle/equipment.ts';
import { MAX_JUMP } from '../../shared/battle/pathing.ts';
import { UNIT_DEFS } from '../../shared/battle/units.ts';
import { LIMITS, type MapUnit } from '../../shared/mapedit/battle.ts';
import { NAME_MAX, SHEET_KEYS, type Sheet } from '../../shared/mapedit/sheet.ts';

export const NUMBERS = ['hp', 'speed', 'move', 'jump', 'ct'] as const;
export type NumberKey = (typeof NUMBERS)[number];
// one press: life by 10 (1 to 999 by one would take a thousand), the CT by 10 (a tenth of a turn), the rest by 1
export const STEP: Record<NumberKey, number> = { hp: 10, speed: 1, move: 1, jump: 1, ct: 10 };
const MAX_ABILITIES = 8;

export const sheetOfUnit = (u: MapUnit): Sheet =>
  Object.fromEntries(
    [...SHEET_KEYS, 'ct'].flatMap((k) => (u[k as keyof Sheet] === undefined ? [] : [[k, u[k as keyof Sheet]]])),
  );

// the class's own value of a number (the jump a class leaves out is MAX_JUMP, as the rules read it)
export function classValue(def: string, k: Exclude<NumberKey, 'ct'>): number {
  const d = UNIT_DEFS[def];
  return k === 'jump' ? (d.jump ?? MAX_JUMP) : d[k];
}
export const numberOf = (u: MapUnit, k: NumberKey): number | undefined =>
  k === 'ct' ? u.ct : (u[k] ?? classValue(u.def, k));

const without = (s: Sheet, k: keyof Sheet): Sheet => {
  const { [k]: _, ...rest } = s;
  return rest;
};

// A number one step up or down within its limits. The CT starts empty (the usual order): + gives 0, − under 0 empties it
export function stepNumber(u: MapUnit, k: NumberKey, dir: 1 | -1): Sheet {
  const s = sheetOfUnit(u);
  const [lo, hi] = LIMITS[k];
  if (k === 'ct') {
    if (u.ct === undefined) return dir > 0 ? { ...s, ct: 0 } : s;
    const n = u.ct + dir * STEP.ct;
    return n < lo ? without(s, 'ct') : { ...s, ct: Math.min(hi, n) };
  }
  const n = Math.min(hi, Math.max(lo, (numberOf(u, k) ?? 0) + dir * STEP[k]));
  return n === classValue(u.def, k) ? without(s, k) : { ...s, [k]: n };
}

// the typed name; an empty one or the class's own gives the class's name back
export function setName(u: MapUnit, text: string): Sheet {
  const s = sheetOfUnit(u);
  const name = text.trim().slice(0, NAME_MAX);
  return !name || /\p{Cc}/u.test(name) || name === UNIT_DEFS[u.def].name ? without(s, 'name') : { ...s, name };
}

// the pieces a slot may hold, none first
export const piecesFor = (slot: Slot): (string | undefined)[] => [
  undefined,
  ...Object.values(ITEMS)
    .filter((i) => i.kind === kindOf(slot))
    .map((i) => i.id),
];

// the slot's next or previous piece, round the list
export function cycleItem(u: MapUnit, slot: Slot, dir: 1 | -1): Sheet {
  const s = sheetOfUnit(u);
  const list = piecesFor(slot);
  const at = list.indexOf(u.items?.[slot]);
  const next = list[(at + dir + list.length) % list.length];
  const items = { ...u.items, [slot]: next };
  if (next === undefined) delete items[slot];
  return Object.keys(items).length ? { ...s, items } : without(s, 'items');
}

export const abilitiesOf = (u: MapUnit): string[] => u.abilities ?? UNIT_DEFS[u.def].abilities;
const withAbilities = (u: MapUnit, list: string[]): Sheet => {
  const s = sheetOfUnit(u);
  return list.join() === UNIT_DEFS[u.def].abilities.join() ? without(s, 'abilities') : { ...s, abilities: list };
};
// the abilities a unit may still take, in the content's order
export const missingAbilities = (u: MapUnit): string[] =>
  ABILITY_LIST.map((a) => a.id).filter((id) => !abilitiesOf(u).includes(id));

// the last ability never leaves: a unit with none could not act (the Developer menu's empty list broke the battle)
export function dropAbility(u: MapUnit, i: number): Sheet {
  const list = abilitiesOf(u);
  return list.length > 1
    ? withAbilities(
        u,
        list.filter((_, k) => k !== i),
      )
    : sheetOfUnit(u);
}
export function addAbility(u: MapUnit, id: string): Sheet {
  const list = abilitiesOf(u);
  return list.length < MAX_ABILITIES && !list.includes(id) && ABILITY_LIST.some((a) => a.id === id)
    ? withAbilities(u, [...list, id])
    : sheetOfUnit(u);
}
export const canAdd = (u: MapUnit) => abilitiesOf(u).length < MAX_ABILITIES;
