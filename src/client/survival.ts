// Modo "Até o amanhecer" (noite de 12/11, pedido de modos novos): na Batalha avulsa, os 4 heróis resistem no Bosque
// das Cinzas a inimigos mais fortes que eles até a fila chegar a SURVIVE_TURNS turnos (de todos, como a lista de turnos
// conta). Derrubar todos também vence. Fica fora da campanha: fase nova no meio mudaria os saves e a ordem do mapa.
import type { Scenario } from '../shared/battle/scenarios.ts';
import type { BattleState } from '../shared/battle/types.ts';
import { buildDevScenario, unitFrom, type DevUnit } from './dev-roster.ts';

export const SURVIVAL_ID = 'survival';
// medido em 13/11 (MEDIR=300, IA nos dois lados): 40 turnos 100%, 60 80%, 64 60%, 68 43%, 72 20%, 80 5%. Quase toda
// vitória vem do amanhecer (derrubar todos é raro). 64 fica no meio da campanha (Ato I de 83% a 37%)
export const SURVIVE_TURNS = 64;
// vida 1,5x: sem o reforço, derrubar todos antes do fim era o caminho comum e o modo virava uma batalha qualquer
const tough = (base: string): DevUnit => {
  const u = unitFrom(base);
  return { ...u, hp: Math.round(u.hp * 1.5) };
};

export const turnsLeft = (state: BattleState) => Math.max(0, SURVIVE_TURNS - state.turnsPlayed);
// Recorde (para ter motivo de rejogar): quantos turnos o grupo aguentou na melhor partida, até SURVIVE_TURNS. Fica no
// navegador; o valor salvo é fronteira de confiança (inteiro entre 0 e SURVIVE_TURNS, senão 0).
export const BEST_KEY = 'dt:amanhecer';
export function parseBest(raw: unknown): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= SURVIVE_TURNS ? n : 0;
}
export const survived = (state: BattleState) => Math.min(state.turnsPlayed, SURVIVE_TURNS);

export const survivalGoal =(say: (pt: string, en: string) => string) =>
  say(`Resista até o amanhecer: ${SURVIVE_TURNS} turnos!`, `Hold out until dawn: ${SURVIVE_TURNS} turns!`);

// `turns`: só a medição (tests/survival.test.ts) troca, para achar o número de turnos que dá a dificuldade certa
export function survivalScenario(turns = SURVIVE_TURNS): Scenario {
  const s = buildDevScenario({
    map: 'ash_wood',
    heroes: ['warrior', 'archer', 'mage', 'rogue'].map((b) => unitFrom(b)),
    enemies: ['brute', 'skeleton_archer', 'dark_mage', 'brute'].map(tough),
  }, SURVIVAL_ID, ['Até o amanhecer', 'Until Dawn']);
  // a regra própria troca a padrão inteira (que perde sem Farol): por isso repete heróis caídos e inimigos derrubados
  s.rules = {
    outcome: (st) => !st.units.some((u) => u.team === 'hero') ? 'defeat'
      : !st.units.some((u) => u.team === 'enemy') || st.turnsPlayed >= turns ? 'victory'
      : 'ongoing',
  };
  return s;
}
