// Abilities are data with general stats (range, damage, push, delay, area); none has its own rule against another
// (decision of Oct 21 inherited from Warlock). The data lives in src/content/abilities.ts.
import { ABILITY_LIST } from '../../content/abilities.ts';

export interface AbilityDef {
  id: string;
  name: string;
  en: string;
  range: [min: number, max: number]; // in tiles; [0, 0] = centered on the user
  heightRange: boolean; // +1 max range per level above the target (only ranged attackers)
  needsSight: boolean; // requires line of sight to the target
  radius: number; // 0 = only the target tile; 1 = the tile and its 4 neighbors (the area never hits the user)
  damage: [min: number, max: number]; // [0, 0] = deals no damage
  heal: [min: number, max: number]; // [0, 0] = does not heal; healing targets an ally and never misses
  accuracy: number; // base % before distance, height and cover
  push: number; // tiles of push, away from the ability's center
  // Charge ticks before it fires (FFT slow action, BMG 1.1); 0 = fires immediately. Fernando's decision of Nov 12 ("Like
  // FFT"): a physical hit fires immediately; only spells charge (Fire and Heal ticks, 4, BMG 3.3) and the Aimed Shot, in the role
  // of the Archer's Charge (Charge +1, 4 ticks, BMG 2.2). The old "delay" does not exist in the FFT turn rule.
  charge: number;
  panel?: true; // the charge aims at the tile and misses if the target leaves it (like the Archer's Charge, BMG 2.2); without this, it follows the unit
  magic?: true; // magic: does not get the +50% against whoever is charging (the bonus is for physical attacks, BMG 6, Charging status)
  ally?: true; // targets an ally (or the user, if the range starts at 0) and rolls no hit; the effect comes from Rules.after. Only the study uses it
  cost?: [counter: string, amount: number]; // spends from UnitState.vars on each use; without balance, it cannot be used. Only the study uses it
  pushChance?: number; // % of times the push happens; without the field, always (only the FFT study uses it: ~50%)
}

export const ABILITIES: Record<string, AbilityDef> = Object.fromEntries(ABILITY_LIST.map((a) => [a.id, a]));
