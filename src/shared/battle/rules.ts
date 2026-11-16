import type { AbilityDef } from './abilities.ts';
import type { Grid } from './grid.ts';
import { SCENARIOS } from './scenarios.ts';
import type { BattleEvent, BattleState, Outcome, UnitState } from './types.ts';

// Rules a scenario can swap (Nov 11; made for the FFT reference study, removed Nov 16). A scenario without `rules`
// uses each module's default rule; each field is optional and replaces a single calculation. In use: `outcome` (survival
// night, Beacon-less developer battle) and `jump` (crawl verifier); `hitChance`, `fallDamage` and `rollDamage` only in
// tests/battle-rules.test.ts; `after` has no user since the study left.
export interface Rules {
  hitChance?(grid: Grid, state: BattleState, actor: UnitState, ability: AbilityDef, target: UnitState): number; // hit chance %
  rollDamage?(state: BattleState, actor: UnitState, ability: AbilityDef, rng: number): [dmg: number, rng: number];
  fallDamage?(levels: number, def: string): number; // damage from being pushed down `levels` levels
  jump?(def: string): number; // levels the unit climbs or descends per step
  outcome?(state: BattleState): Outcome;
  after?(state: BattleState, actor: UnitState, ability: AbilityDef, target: UnitState, events: BattleEvent[]): void; // extra effect after hitting or healing the target
}

// `?.`: a test state uses a scenario that is not in the list
export const rulesOf = (state: BattleState): Rules => SCENARIOS[state.scenario]?.rules ?? {};
