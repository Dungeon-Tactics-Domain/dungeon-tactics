// Unit types: the data lives in src/content/units.ts; this file keeps the type and the registry the rules read.
import { UNIT_LIST } from '../../content/units.ts';
import type { Side } from './grid.ts';

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
  // counters the unit is born with (see UnitState.vars): the study's MP and stock, and since Nov 16 every sheet's mana and
  // stamina pools (RESOURCES), whose start value is also their max
  vars?: Record<string, number>;
  regen?: Partial<Record<Resource, number>>; // pool points back at the start of each of its turns (the lab's regen by class)
  // life back at the start of each of its turns (Nov 15 grill): pieces and buffs give it, no class has it. Apart from
  // `regen`, whose keys are pools in `vars`
  hpRegen?: number;
  model?: string; // model in public/models; only the study scenario sets it, the game units are in the scene map
  tint?: string; // the model's own glow color, drawing only: a unit that shares the model with another (the Acolyte uses the mage)
  undead?: true; // a heal hurts it by half its amount instead of healing (Nov 15, Fernando: "healing a skeleton deals damage")
  size?: number;
  hit?: number; // extra hit points (equipment); without it, 0 // side of the occupied square (2 = 2x2, pathing.ts footprint); without it, 1 tile. A large unit does not walk nor get pushed
  // Attributes of the Nov 15 grill (no XP: every number comes from class, pieces and buffs; the Mechanics lab's
  // equipamento.json), read by the damage and hit formulas in combat.ts. Without them, 0
  resist?: Partial<Record<Resist, number>>; // % off the damage, negative = weakness; read through resistOf
  dodge?: number; // % of hits avoided from the front; read through dodgeOf
  physPower?: number; // added to both ends of a martial ability's damage (class and equipment)
  magPower?: number; // added to both ends of a spell's damage or heal (Fernando, Nov 15, as the lab)
  // % more (or, negative, less) damage by where the hit catches the target, on every ability (combat.ts landed); the
  // Rogue's since Nov 20. Without it, the same from every side
  flankDamage?: Partial<Record<Side, number>>;
}

// a % of element on a class, piece or buff is always resistance (defence); an attack takes an element from its ability
export const ELEMENTS = ['fire', 'ice', 'lightning', 'shadow', 'wind', 'light'] as const;
export type Element = (typeof ELEMENTS)[number];
export type Resist = 'phys' | 'mag' | Element;
// Nov 15 grill: a spell spends mana, a martial ability stamina (AbilityDef.cost names which); the basic attack and the
// counter are free. Kept in UnitState.vars like the study's counters, never below 0 nor above the sheet's start value
export const RESOURCES = ['mana', 'stamina'] as const;
export type Resource = (typeof RESOURCES)[number];
// limits of the lab's proposal (Nov 15): never immune, and a low cap so stacked pieces stay in check; dodge caps at 50
// (90% to hit from the front becomes 45%)
export const RESIST_RANGE = [-100, 60] as const;
export const DODGE_MAX = 50;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
// `shift`: a change on top of the sheet (charging), added and then clamped once: the lab gives the limits per resistance
export const resistOf = (d: UnitDef, k: Resist, shift = 0) => clamp((d.resist?.[k] ?? 0) + shift, ...RESIST_RANGE);
export const dodgeOf = (d: UnitDef) => clamp(d.dodge ?? 0, 0, DODGE_MAX);

export const UNIT_DEFS: Record<string, UnitDef> = Object.fromEntries(UNIT_LIST.map((u) => [u.id, u]));

// the target to protect in the 1st battle; defeat comes from its fall or from the death of all heroes
export const OBJECTIVE_DEF = 'beacon';

// Half tiles (half.ts): every sheet of a split map is a copy named `<id>½` (2x2 token, movement in cells). The rules that ask
// "which sheet is this" read the original through baseDef
export const HALF = '½';
export const baseDef = (def: string) => (def.endsWith(HALF) ? def.slice(0, -HALF.length) : def);
export const isObjective = (def: string) => baseDef(def) === OBJECTIVE_DEF;
