import type { AbilityDef } from './abilities.ts';
import type { Grid } from './grid.ts';
import { SCENARIOS } from './scenarios.ts';
import type { BattleEvent, BattleState, Outcome, UnitState } from './types.ts';

// Rules a scenario can swap (Nov 11). It exists so the FFT reference study runs on the same engine without touching
// the game rules: a scenario without `rules` uses each module's default rule. Each field is optional and replaces a single calculation.
export interface Rules {
  hitChance?(grid: Grid, state: BattleState, actor: UnitState, ability: AbilityDef, target: UnitState): number; // hit chance %
  rollDamage?(state: BattleState, actor: UnitState, ability: AbilityDef, rng: number): [dmg: number, rng: number];
  fallDamage?(levels: number, def: string): number; // damage from being pushed down `levels` levels
  jump?(def: string): number; // levels the unit climbs or descends per step
  outcome?(state: BattleState): Outcome;
  facing?: true; // units have a direction (UnitState.facing): they turn when walking and acting, and the player chooses at the end of the turn
  speed?(unit: UnitState): number; // CT gained per tick
  damage?(actor: UnitState, ability: AbilityDef): [min: number, max: number]; // damage range shown in the preview and used by the AI
  // share of a hit the target keeps, in 1/10000 (the game: its resistances, combat.ts `defence`)
  defence?(state: BattleState, ability: AbilityDef, target: UnitState): number;
  spellsIgnoreSide?: true; // a spell always catches the front: no side or back bonus to show (FFT: magic ignores facing)
  after?(state: BattleState, actor: UnitState, ability: AbilityDef, target: UnitState, events: BattleEvent[]): void; // extra effect after hitting or healing the target
}

// `?.`: a test state uses a scenario that is not in the list
export const rulesOf = (state: BattleState): Rules => SCENARIOS[state.scenario]?.rules ?? {};
