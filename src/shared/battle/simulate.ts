import { playAiTurn } from './ai.ts';
import { Battle } from './battle.ts';
import type { Scenario } from './scenarios.ts';
import type { BattleEvent, Outcome } from './types.ts';

export interface SimResult {
  outcome: Outcome | 'timeout';
  turns: number;
  heroTurns: number; // só os dos heróis: é o que o jogador gasta pensando (base da estimativa de minutos)
  heroesAlive: number;
  enemiesAlive: number;
  events: BattleEvent[];
}

// IA contra IA até acabar ou bater no teto de turnos (a batalha nunca pode travar). Base do balanceamento por
// simulação (spec: número só muda depois de medido em várias sementes).
export function simulate(scenario: Scenario, seed: number, maxTurns = 400): SimResult {
  const battle = Battle.start(scenario, seed);
  const events: BattleEvent[] = [];
  let heroTurns = 0;
  while (!battle.over && battle.state.turnsPlayed < maxTurns) {
    if (battle.actor.team === 'hero') heroTurns++;
    events.push(...playAiTurn(battle));
  }
  const alive = (team: string) => battle.state.units.filter((u) => u.team === team && u.def !== 'beacon').length;
  return {
    outcome: battle.over ? battle.state.outcome : 'timeout',
    turns: battle.state.turnsPlayed,
    heroTurns,
    heroesAlive: alive('hero'),
    enemiesAlive: alive('enemy'),
    events,
  };
}
