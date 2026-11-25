// A battle-builder unit's own sheet (grill, Nov 25: the Developer menu's life, speed, move, jump, equipment and
// abilities): which fields a unit sets, the battle sheet they make, and their trust boundary.
import { ABILITY_LIST } from '../../content/abilities.ts';
import { ITEMS, kindOf, type Loadout, SLOTS, type Slot, withGear } from '../battle/equipment.ts';
import { isObjective, UNIT_DEFS, type UnitDef } from '../battle/units.ts';
import { LIMITS, type MapUnit } from './battle.ts';

export const SHEET_KEYS = ['name', 'hp', 'speed', 'move', 'jump', 'items', 'abilities'] as const;
export type Sheet = Pick<MapUnit, (typeof SHEET_KEYS)[number] | 'ct'>;
export const NAME_MAX = 24; // the Developer menu's
const MAX_ABILITIES = 8;
const ABILITY_IDS = new Set(ABILITY_LIST.map((a) => a.id));

export const ownSheet = (u: MapUnit) => SHEET_KEYS.some((k) => u[k] !== undefined);

// The battle sheet of a unit with its own fields, on top of its class, then its equipment (as dev-roster.ts does)
export function sheetOf(u: MapUnit, id: string): UnitDef {
  const d = UNIT_DEFS[u.def];
  return withGear(
    {
      ...d,
      id,
      name: u.name ?? d.name,
      en: u.name ?? d.en,
      hp: u.hp ?? d.hp,
      speed: u.speed ?? d.speed,
      move: u.move ?? d.move,
      ...(u.jump !== undefined && { jump: u.jump }),
      abilities: [...(u.abilities ?? d.abilities)],
    },
    u.items,
  );
}

const isInt = (v: unknown, [lo, hi]: readonly [number, number]): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

// each slot holds a known piece of its kind; any doubt gives null
export function parseLoadout(v: unknown): Loadout | null {
  if (!isObj(v)) return null;
  const out: Loadout = {};
  for (const [k, id] of Object.entries(v)) {
    if (!(SLOTS as readonly string[]).includes(k) || typeof id !== 'string' || !Object.hasOwn(ITEMS, id)) return null;
    if (ITEMS[id].kind !== kindOf(k as Slot)) return null;
    out[k as Slot] = id;
  }
  return out;
}

// The sheet fields of a saved unit, each absent or valid; null on any doubt. The Beacon takes none: a sheet of its own
// would lose its objective id, and speed would give it turns
export function parseSheet(v: Record<string, unknown>, def: string): Sheet | null {
  const own = [...SHEET_KEYS, 'ct'].filter((k) => v[k] !== undefined);
  if (own.length && isObjective(def)) return null;
  const n = v.name;
  if (n !== undefined && !(typeof n === 'string' && n.trim() && n.length <= NAME_MAX && !/\p{Cc}/u.test(n)))
    return null;
  for (const k of ['hp', 'speed', 'move', 'jump', 'ct'] as const)
    if (v[k] !== undefined && !isInt(v[k], LIMITS[k])) return null;
  const items = v.items === undefined ? {} : parseLoadout(v.items);
  if (!items) return null;
  const a = v.abilities;
  if (
    a !== undefined &&
    !(
      Array.isArray(a) &&
      a.length > 0 &&
      a.length <= MAX_ABILITIES &&
      new Set(a).size === a.length &&
      a.every((x) => typeof x === 'string' && ABILITY_IDS.has(x))
    )
  )
    return null;
  return {
    ...(typeof n === 'string' && { name: n.trim() }),
    ...(v.hp !== undefined && { hp: v.hp as number }),
    ...(v.speed !== undefined && { speed: v.speed as number }),
    ...(v.move !== undefined && { move: v.move as number }),
    ...(v.jump !== undefined && { jump: v.jump as number }),
    ...(Object.keys(items).length > 0 && { items }),
    ...(Array.isArray(a) && { abilities: [...(a as string[])] }),
    ...(v.ct !== undefined && { ct: v.ct as number }),
  };
}
