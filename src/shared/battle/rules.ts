import type { AbilityDef } from './abilities.ts';
import type { Grid } from './grid.ts';
import { SCENARIOS } from './scenarios.ts';
import type { BattleEvent, BattleState, Outcome, UnitState } from './types.ts';

// Regras que um cenário pode trocar (11/11). Existe para o estudo de referência do FFT rodar no mesmo motor sem tocar
// nas regras do jogo: cenário sem `rules` usa a regra padrão de cada módulo. Cada campo é opcional e substitui uma só conta.
export interface Rules {
  hitChance?(grid: Grid, state: BattleState, actor: UnitState, ability: AbilityDef, target: UnitState): number; // % de acerto
  rollDamage?(state: BattleState, actor: UnitState, ability: AbilityDef, rng: number): [dmg: number, rng: number];
  fallDamage?(levels: number, def: string): number; // dano de cair `levels` níveis empurrado
  jump?(def: string): number; // níveis que a unidade sobe ou desce por passo
  outcome?(state: BattleState): Outcome;
  facing?: true; // as unidades têm direção (UnitState.facing): viram ao andar e ao agir, e o jogador escolhe ao fim do turno
  speed?(unit: UnitState): number; // CT ganho por tique
  damage?(actor: UnitState, ability: AbilityDef): [min: number, max: number]; // faixa de dano mostrada na prévia e usada pela IA
  after?(state: BattleState, actor: UnitState, ability: AbilityDef, target: UnitState, events: BattleEvent[]): void; // efeito extra depois de acertar ou curar o alvo
}

// `?.`: estado de teste usa um cenário que não está na lista
export const rulesOf = (state: BattleState): Rules => SCENARIOS[state.scenario]?.rules ?? {};
