// Unit types: the data lives in src/content/units.ts; this file keeps the type and the registry the rules read.
import { UNIT_LIST } from '../../content/units.ts';

export interface UnitDef {
  id: string;
  name: string;
  en: string;
  hp: number;
  speed: number; // CT gained per tick; faster acts earlier and more often
  move: number; // tiles per turn
  // levels it climbs or descends in one step, like the FFT Jump (Nov 13, Fernando's request); without it, MAX_JUMP (1). The maps
  // have drops of 2 on purpose: only whoever jumps 2 takes shortcuts through them (the Rogue and the Minion, the agile ones, 1 more than the
  // others like the FFT Thief). Rogue 3 and archers 2 broke the campaign curve (stage 5 from 35% to 77%)
  jump?: number;
  abilities: string[]; // the first is the basic attack
  info?: Record<string, string | number>; // extra sheet for the status window (weapon, Brave, Faith…); only the study scenario has it
  vars?: Record<string, number>; // counters the unit is born with (see UnitState.vars); only the study scenario uses it
  model?: string; // model in public/models; only the study scenario sets it, the game units are in the scene map
  tint?: string; // the model's own glow color, drawing only: a unit that shares the model with another (the Acolyte uses the mage)
  undead?: true; // a heal hurts it by half its amount instead of healing (Nov 15, Fernando: "healing a skeleton deals damage")
  size?: number;
  power?: number; // extra damage on every ability that hurts (equipment, equipment.ts); without it, 0
  hit?: number; // extra hit points (equipment); without it, 0 // side of the occupied square (2 = 2x2, pathing.ts footprint); without it, 1 tile. A large unit does not walk nor get pushed
  // Attributes of the Nov 15 grill (no XP: every number comes from class, pieces and buffs; the Mechanics lab's
  // equipamento.json). Shown on the sheets; the damage and hit formulas read them in phase B. Without them, 0
  resist?: Partial<Record<Resist, number>>; // % off the damage, negative = weakness; read through resistOf
  dodge?: number; // % of hits avoided; read through dodgeOf
  physPower?: number; // added to martial abilities
  magPower?: number; // added to spells and heals
}

// a % of element on a class, piece or buff is always resistance (defence); an attack takes an element from its ability
export const ELEMENTS = ['fire', 'ice', 'lightning', 'shadow', 'wind', 'light'] as const;
export type Element = (typeof ELEMENTS)[number];
export type Resist = 'phys' | 'mag' | Element;
// limits of the lab's proposal (Nov 15): never immune, and a low cap so stacked pieces stay in check; dodge caps at 50
// (90% to hit from the front becomes 45%)
export const RESIST_RANGE = [-100, 60] as const;
export const DODGE_MAX = 50;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const resistOf = (d: UnitDef, k: Resist) => clamp(d.resist?.[k] ?? 0, ...RESIST_RANGE);
export const dodgeOf = (d: UnitDef) => clamp(d.dodge ?? 0, 0, DODGE_MAX);

export const UNIT_DEFS: Record<string, UnitDef> = Object.fromEntries(UNIT_LIST.map((u) => [u.id, u]));

// the target to protect in the 1st battle; defeat comes from its fall or from the death of all heroes
export const OBJECTIVE_DEF = 'beacon';

// Half tiles (half.ts): every sheet of a split map is a copy named `<id>½` (2x2 token, movement in cells). The rules that ask
// "which sheet is this" read the original through baseDef
export const HALF = '½';
export const baseDef = (def: string) => (def.endsWith(HALF) ? def.slice(0, -HALF.length) : def);
export const isObjective = (def: string) => baseDef(def) === OBJECTIVE_DEF;
