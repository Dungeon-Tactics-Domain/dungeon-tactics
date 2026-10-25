import { resolveAbility } from './combat.ts';
import { nearestTile } from './pathing.ts';
import type { Grid } from './grid.ts';
import { rulesOf } from './rules.ts';
import type { BattleEvent, BattleState, Charge } from './types.ts';
import { UNIT_DEFS } from './units.ts';

// Fila do FFT (spec de 25/10; regras do FFT em todos os mapas desde 12/11, pedido do Fernando): cada unidade ganha
// `speed` de CT por tique e age ao chegar em TURN_THRESHOLD. Fonte: Battle Mechanics Handbook v6.1 (BMG), 1.1 e A.2.
export const TURN_THRESHOLD = 100;
// CT ao fim do turno (BMG 1.1): mover e agir custa 100, só um dos dois 80, nenhum 60 ("Esperar" devolve a vez mais cedo);
// o que sobra nunca passa de 60. Substitui o "100 mais o atraso da habilidade" de 25/10.
export const turnCt = (ct: number, moved: boolean, acted: boolean) => Math.min(60, ct - (moved && acted ? 100 : moved || acted ? 80 : 60));

interface Slot {
  id: string;
  ct: number;
  speed: number;
}

// Avança os tiques até alguém chegar ao limite e devolve quem age. Com várias em 100 ou mais, age a primeira da lista
// de personagens, não a de maior CT (BMG A.2); no FFT os inimigos são numerados antes, então a lista põe inimigos primeiro.
function advance(slots: Slot[]): Slot {
  if (!slots.some((s) => s.ct >= TURN_THRESHOLD)) {
    const ticks = Math.min(...slots.map((s) => Math.ceil((TURN_THRESHOLD - s.ct) / s.speed)));
    for (const s of slots) s.ct += ticks * s.speed;
  }
  return slots.find((s) => s.ct >= TURN_THRESHOLD)!;
}

const slotsOf = (state: BattleState): Slot[] => {
  const all = state.units.map((u) => ({ id: u.id, team: u.team, ct: u.ct, speed: rulesOf(state).speed?.(u) ?? UNIT_DEFS[u.def].speed })).filter((s) => s.speed > 0);
  return [...all.filter((s) => s.team === 'enemy'), ...all.filter((s) => s.team === 'hero')];
};

// ordem da lista de personagens (inimigos antes, BMG A.2), para resolver cargas que saem no mesmo tique
const listOrder = (state: BattleState, charges: Charge[]) => {
  const rank = (id: string) => {
    const i = state.units.findIndex((u) => u.id === id);
    return (state.units[i]?.team === 'enemy' ? 0 : 1e4) + i;
  };
  return [...charges].sort((a, b) => rank(a.unit) - rank(b.unit));
};

// Abre o próximo turno seguindo as fases de cada tique do FFT (BMG A.2): S+ (as cargas descontam 1), SR (as que chegam a 0
// saem, se quem carrega está vivo), C+ (todos ganham CT) e CR (quem chegou a 100 joga). Devolve os eventos das cargas
// que saíram no caminho, para o cliente animar; para se uma delas acabar a batalha.
export function startNextTurn(grid: Grid, state: BattleState): BattleEvent[] {
  const events: BattleEvent[] = [];
  for (;;) {
    const slots = slotsOf(state);
    const ready = slots.find((s) => s.ct >= TURN_THRESHOLD);
    if (ready) {
      state.turn = { actor: ready.id, moved: false, usedAbility: null };
      return events;
    }
    const toTurn = slots.length ? Math.min(...slots.map((s) => Math.ceil((TURN_THRESHOLD - s.ct) / s.speed))) : Infinity;
    const toCharge = state.charges.length ? Math.min(...state.charges.map((c) => c.ticks)) : Infinity;
    if (toTurn === Infinity && toCharge === Infinity) return events;
    // relê as unidades: uma carga que saiu pode ter matado alguém
    const gain = (ticks: number) => {
      for (const s of slotsOf(state)) state.units.find((u) => u.id === s.id)!.ct += ticks * s.speed;
    };
    if (toTurn < toCharge) {
      gain(toTurn);
      for (const c of state.charges) c.ticks -= toTurn;
      continue;
    }
    gain(toCharge - 1);
    for (const c of state.charges) c.ticks -= toCharge;
    const due = listOrder(state, state.charges.filter((c) => c.ticks <= 0));
    state.charges = state.charges.filter((c) => c.ticks > 0);
    for (const c of due) {
      if (!state.units.some((u) => u.id === c.unit)) continue; // quem carregava morreu
      const followed = c.follow && state.units.find((u) => u.id === c.follow);
      const caster = state.units.find((u) => u.id === c.unit)!;
      // unidade grande seguida: a casa dela mais perto de quem lança (a de canto podia estar fora do alcance); 1 casa: a mesma
      const out = resolveAbility(grid, state, c.unit, c.ability, followed ? nearestTile(followed, caster.pos) : c.target, true);
      // sem ninguém atingido (o alvo saiu dali): a carga se perde
      const landed = out.some((e) => e.k !== 'attack');
      events.push(...(landed ? out : [{ k: 'fizzle' as const, unit: c.unit, ability: c.ability }]));
      if (state.outcome !== 'ongoing') return events;
    }
    gain(1);
  }
}

// Cobra o custo do turno do ator pelo que ele fez (BMG 1.1)
export function finishTurn(state: BattleState): void {
  const actor = state.units.find((u) => u.id === state.turn.actor);
  if (actor) actor.ct = turnCt(actor.ct, state.turn.moved, !!state.turn.usedAbility);
  state.turnsPlayed++;
}

export interface QueueEntry {
  unit: string;
  charge?: string; // a habilidade carregada que sai neste ponto da fila
}

// Os próximos `n` na fila do topo da tela, começando por quem joga agora, com as cargas no ponto em que saem (como a
// lista de turnos do FFT). Projeção: supõe que cada um anda e age (custo 100, o maior) e não muda o estado.
export function previewOrder(state: BattleState, n: number): QueueEntry[] {
  const slots = slotsOf(state);
  const charges = listOrder(state, state.charges).map((c) => ({ ...c }));
  const order: QueueEntry[] = [];
  const current = slots.find((s) => s.id === state.turn.actor);
  if (current) {
    order.push({ unit: current.id });
    current.ct = turnCt(current.ct, true, true);
  }
  while (order.length < n && (slots.length || charges.length)) {
    const toTurn = slots.some((s) => s.ct >= TURN_THRESHOLD) ? 0 : slots.length ? Math.min(...slots.map((s) => Math.ceil((TURN_THRESHOLD - s.ct) / s.speed))) : Infinity;
    const toCharge = charges.length ? Math.min(...charges.map((c) => c.ticks)) : Infinity;
    if (toCharge <= toTurn) {
      for (const s of slots) s.ct += (toCharge - 1) * s.speed;
      for (const c of charges) c.ticks -= toCharge;
      for (const c of charges.filter((x) => x.ticks <= 0)) order.push({ unit: c.unit, charge: c.ability });
      charges.splice(0, charges.length, ...charges.filter((x) => x.ticks > 0));
      for (const s of slots) s.ct += s.speed;
      continue;
    }
    for (const c of charges) c.ticks -= toTurn;
    const next = advance(slots);
    order.push({ unit: next.id });
    next.ct = turnCt(next.ct, true, true);
  }
  return order.slice(0, n);
}
