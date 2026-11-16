// Abilities are data with general stats (range, damage, push, delay, area); none has its own rule against another
// (decision of Oct 21 inherited from Warlock). The data lives in src/content/abilities.ts.
import { ABILITY_LIST } from '../../content/abilities.ts';
import type { Lock } from './types.ts';
import type { Element } from './units.ts';

export interface AbilityDef {
  id: string;
  name: string;
  en: string;
  range: [min: number, max: number]; // in tiles; [0, 0] = centered on the user
  heightRange: boolean; // +1 max range per level above the target (only ranged attackers)
  // flies to the target and stops at the first thing its path crosses (pathing.ts traceShot); without it the ability lands
  // where it is aimed, like a melee blow or a spell cast on the target (the trajectory grill of Nov 15: no line of sight)
  needsSight: boolean;
  // the path is a curve, as a bow's or a thrown axe's (the trajectory grill of Nov 15: the weapon gives it); without it a
  // flying ability goes straight, as a crossbow, a thrown dagger or a bolt spell
  arc?: true;
  radius: number; // 0 = only the target tile; 1 = the tile and its 4 neighbors (the area never hits the user)
  damage: [min: number, max: number]; // [0, 0] = deals no damage
  heal: [min: number, max: number]; // [0, 0] = does not heal; healing targets an ally and never misses
  accuracy: number; // base % before distance, height and cover
  push: number; // tiles of push, away from the ability's center
  // Charge ticks before it fires (FFT slow action, BMG 1.1); 0 = fires immediately. Fernando's decision of Nov 12 ("Like
  // FFT"): a physical hit fires immediately; only spells charge (Fire and Heal ticks, 4, BMG 3.3) and the Aimed Shot, in the role
  // of the Archer's Charge (Charge +1, 4 ticks, BMG 2.2). The old "delay" does not exist in the FFT turn rule.
  charge: number;
  // the lock the charge offers first (like the Archer's Charge, BMG 2.2, which aims at the tile); without this, the
  // character. Since Nov 15 the player picks either (Battle.act `lock`); the AI keeps this one
  panel?: true;
  // a spell: magic power and magic resistance instead of physical (Nov 15 grill)
  magic?: true;
  element?: Element; // the target's resistance to it applies too (the Mechanics lab's equipamento.json); heals ignore it
  ally?: true; // targets an ally (or the user, if the range starts at 0) and rolls no hit; the effect comes from Rules.after. Only the study uses it
  // spends from UnitState.vars on each use, paid when a charge starts; without balance, it cannot be used. The game's
  // abilities spend 'mana' (spells) or 'stamina' (martial; Nov 15 grill), the study's MP and stock
  cost?: [counter: string, amount: number];
  pushChance?: number; // % of times the push happens; without the field, always (no game ability sets it today)
}

export const ABILITIES: Record<string, AbilityDef> = Object.fromEntries(ABILITY_LIST.map((a) => [a.id, a]));

export const defaultLock = (a: AbilityDef): Lock => (a.panel ? 'tile' : 'unit');
