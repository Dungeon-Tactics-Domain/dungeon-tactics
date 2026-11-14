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
  boss?: true; // stage boss (campaign): only the crown in the drawing; the victory rule comes from the scenario
  tint?: string; // the model's own glow color, drawing only: a unit that shares the model with another (the Acolyte uses the mage)
  size?: number;
  power?: number; // extra damage on every ability that hurts (equipment, equipment.ts); without it, 0
  hit?: number; // extra hit points (equipment); without it, 0 // side of the occupied square (2 = 2x2, pathing.ts footprint); without it, 1 tile. A large unit does not walk nor get pushed
}

export const UNIT_DEFS: Record<string, UnitDef> = Object.fromEntries(UNIT_LIST.map((u) => [u.id, u]));

// the target to protect in the 1st battle; defeat comes from its fall or from the death of all heroes
export const OBJECTIVE_DEF = 'beacon';
