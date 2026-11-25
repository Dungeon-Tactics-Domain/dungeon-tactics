// Who won (split from combat.ts): the battle's own rule, else no enemies left is a victory and the fall of the Beacon or of
// every hero a defeat
import { rulesOf } from './rules.ts';
import { SCENARIOS } from './scenarios.ts';
import type { BattleState, Outcome } from './types.ts';
import { isObjective } from './units.ts';

// Victory: no enemies. Defeat: the target to protect fell or all heroes died.
export function checkOutcome(state: BattleState): Outcome {
  const custom = rulesOf(state).outcome;
  if (custom) return custom(state);
  const heroes = state.units.filter((u) => u.team === 'hero' && !isObjective(u.def));
  // only a map that was born with a Beacon loses by it (Nov 13, review: Wood and Pass in the standalone Battle lost on the 1st turn);
  // a test state outside the list counts as a map with a Beacon
  const hadObjective = SCENARIOS[state.scenario]?.spawns.some((s) => isObjective(s.def)) ?? true;
  const objective = state.units.some((u) => isObjective(u.def));
  if ((hadObjective && !objective) || heroes.length === 0) return 'defeat';
  if (!state.units.some((u) => u.team === 'enemy')) return 'victory';
  return 'ongoing';
}

// the heroes still standing, the Beacon aside (it neither plays nor wins)
const heroesUp = (state: BattleState) => state.units.some((u) => u.team === 'hero' && !isObjective(u.def));
const enemiesUp = (state: BattleState) => state.units.some((u) => u.team === 'enemy');

// Defeat all (a map without a Beacon, the battle builder's choice): no enemies wins, no heroes loses
export const lastStanding = (state: BattleState): Outcome =>
  !heroesUp(state) ? 'defeat' : !enemiesUp(state) ? 'victory' : 'ongoing';

// Survive, as Until Dawn (client survival.ts): hold `turns` turns of everyone, or down every enemy before
export const surviveFor =
  (turns: number) =>
  (state: BattleState): Outcome =>
    !heroesUp(state) ? 'defeat' : !enemiesUp(state) || state.turnsPlayed >= turns ? 'victory' : 'ongoing';
