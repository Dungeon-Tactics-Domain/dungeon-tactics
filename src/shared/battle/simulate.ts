import { playAiTurn } from './ai.ts';
import { Battle } from './battle.ts';
import type { Scenario } from './scenarios.ts';
import type { BattleEvent, Outcome } from './types.ts';
import { isObjective } from './units.ts';

export interface SimResult {
  outcome: Outcome | 'timeout';
  turns: number;
  heroTurns: number; // heroes' only: it is what the player spends thinking (basis of the minutes estimate)
  heroesAlive: number;
  enemiesAlive: number;
  events: BattleEvent[];
}

// AI against AI until it ends or hits the turn cap (the battle must never hang). Basis of balancing by
// simulation (optional: a number can be measured over several seeds before it changes).
export function simulate(scenario: Scenario, seed: number, maxTurns = 400): SimResult {
  const battle = Battle.start(scenario, seed);
  const events: BattleEvent[] = [];
  let heroTurns = 0;
  while (!battle.over && battle.state.turnsPlayed < maxTurns) {
    if (battle.actor.team === 'hero') heroTurns++;
    events.push(...playAiTurn(battle));
  }
  const alive = (team: string) => battle.state.units.filter((u) => u.team === team && !isObjective(u.def)).length;
  return {
    outcome: battle.over ? battle.state.outcome : 'timeout',
    turns: battle.state.turnsPlayed,
    heroTurns,
    heroesAlive: alive('hero'),
    enemiesAlive: alive('enemy'),
    events,
  };
}
