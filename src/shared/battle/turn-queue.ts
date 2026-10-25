import { ABILITIES } from './abilities.ts';
import type { BattleState } from './types.ts';
import { UNIT_DEFS } from './units.ts';

// Fila estilo FFT (spec, 25/10): cada unidade ganha `speed` de CT por tique e age ao chegar em TURN_THRESHOLD.
// Valores iniciais de 25/10 (a fórmula é "a decidir" na spec): agir custa 100 mais o atraso da habilidade, passar a vez 60.
export const TURN_THRESHOLD = 100;
export const ACT_COST = 100;
export const REST_COST = 60;

interface Slot {
  id: string;
  ct: number;
  speed: number;
}

// Avança os tiques até alguém chegar ao limite e devolve quem age. Empate: maior CT, depois a ordem da lista (determinístico).
function advance(slots: Slot[]): Slot {
  const ticks = Math.max(0, Math.min(...slots.map((s) => Math.ceil((TURN_THRESHOLD - s.ct) / s.speed))));
  for (const s of slots) s.ct += ticks * s.speed;
  return slots.reduce((best, s) => (s.ct > best.ct ? s : best));
}

const slotsOf = (state: BattleState): Slot[] =>
  state.units.map((u) => ({ id: u.id, ct: u.ct, speed: UNIT_DEFS[u.def].speed })).filter((s) => s.speed > 0);

// Abre o próximo turno: avança o CT de todos e põe o escolhido como ator da vez.
export function startNextTurn(state: BattleState): void {
  const slots = slotsOf(state);
  const actor = advance(slots);
  for (const s of slots) state.units.find((u) => u.id === s.id)!.ct = s.ct;
  state.turn = { actor: actor.id, moved: false, usedAbility: null };
}

// Cobra o custo do turno do ator: habilidade forte atrasa o próximo turno dele (pilar de planejamento, spec).
export function finishTurn(state: BattleState): void {
  const actor = state.units.find((u) => u.id === state.turn.actor);
  if (actor) {
    const used = state.turn.usedAbility;
    actor.ct -= used ? ACT_COST + ABILITIES[used].delay : REST_COST;
  }
  state.turnsPlayed++;
}

// Os próximos `n` a agir, começando por quem joga agora, para a fila no topo da tela. Projeção: supõe que cada um gasta
// o custo base (não sabe a habilidade que será usada) e não muda o estado.
export function previewOrder(state: BattleState, n: number): string[] {
  const slots = slotsOf(state);
  const order: string[] = [];
  const current = slots.find((s) => s.id === state.turn.actor);
  if (current) {
    order.push(current.id);
    current.ct -= ACT_COST;
  }
  while (order.length < n && slots.length) {
    const next = advance(slots);
    order.push(next.id);
    next.ct -= ACT_COST;
  }
  return order.slice(0, n);
}
