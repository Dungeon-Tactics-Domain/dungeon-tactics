// Placar da batalha para o destaque no fim (noite de 12/11): dano causado e inimigos derrubados por unidade. Lê os
// eventos na ordem em que a cena toca: tudo depois de um "attack" é de quem atacou (golpe, batida, queda e espinho do
// empurrão), até o próximo "attack". Só conta dano no outro lado (espinho no fim da própria vez não é mérito de ninguém).
// Puro e testado; o Game junta os eventos a cada animação. Salvar e reabrir no meio zera o placar (fica só na memória).
import type { BattleEvent, Team } from '../shared/battle/types.ts';

export interface Score { dmg: number; kills: number }
export interface Tally { by: string | null; scores: Record<string, Score> }

export const emptyTally = (): Tally => ({ by: null, scores: {} });

export function addEvents(t: Tally, events: BattleEvent[], team: Record<string, Team>): void {
  // espinho sem empurrão logo antes (de quem terminou a vez em cima dele) é mérito de ninguém, nem a morte que vem dele;
  // sem isto ia para quem atacou por último, talvez turnos antes (achado da revisão de 13/11)
  const ownFault = new Set<string>();
  events.forEach((e, i) => {
    const prev = events[i - 1];
    if (e.k === 'spike' && !(prev?.k === 'push' && prev.unit === e.unit)) ownFault.add(e.unit);
  });
  for (const e of events) {
    if (e.k === 'attack') t.by = e.unit;
    if ((e.k === 'spike' || e.k === 'die') && ownFault.has(e.unit)) continue;
    if (!t.by || team[e.unit] === undefined || team[e.unit] === team[t.by]) continue;
    const s = (t.scores[t.by] ??= { dmg: 0, kills: 0 });
    if ('dmg' in e) s.dmg += e.dmg;
    if (e.k === 'die') s.kills++;
  }
}

// quem do time mais fez: mais derrubados, empate pelo dano; null se ninguém do time pontuou
export function mvp(t: Tally, team: Record<string, Team>, side: Team): [id: string, s: Score] | null {
  const list = Object.entries(t.scores).filter(([id, s]) => team[id] === side && (s.dmg > 0 || s.kills > 0));
  list.sort(([, a], [, b]) => b.kills - a.kills || b.dmg - a.dmg);
  return list[0] ?? null;
}
