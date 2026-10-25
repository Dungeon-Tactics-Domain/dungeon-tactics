import { describe, expect, it } from 'vitest';
import { ACT_COST, REST_COST, finishTurn, previewOrder, startNextTurn } from '../src/shared/battle/turn-queue.ts';
import type { BattleState } from '../src/shared/battle/types.ts';
import { stateOf } from './battle-helpers.ts';

// joga `n` turnos em que cada ator usa a habilidade dada (sem atraso por padrão) e devolve quem agiu
function play(s: BattleState, n: number, ability: (actor: string) => string | null = () => 'strike'): string[] {
  const order: string[] = [];
  for (let i = 0; i < n; i++) {
    startNextTurn(s);
    order.push(s.turn.actor);
    s.turn.usedAbility = ability(s.turn.actor);
    finishTurn(s);
  }
  return order;
}

const mixed = () => stateOf([
  { id: 'rogue', def: 'rogue', team: 'hero', x: 0, y: 0 }, // velocidade 12
  { id: 'warrior', def: 'warrior', team: 'hero', x: 1, y: 0 }, // 8
  { id: 'brute', def: 'brute', team: 'enemy', x: 2, y: 0 }, // 5
]);

describe('fila de turnos', () => {
  it('quem tem mais velocidade age primeiro e mais vezes', () => {
    const s = mixed();
    const order = play(s, 25);
    expect(order[0]).toBe('rogue');
    const count = (id: string) => order.filter((x) => x === id).length;
    expect(count('rogue')).toBeGreaterThan(count('warrior'));
    expect(count('warrior')).toBeGreaterThan(count('brute'));
  });

  it('habilidade forte atrasa o próximo turno de quem usou', () => {
    const a = stateOf([{ id: 'x', def: 'warrior', team: 'hero', x: 0, y: 0 }, { id: 'y', def: 'warrior', team: 'enemy', x: 1, y: 0 }]);
    const b = structuredClone(a);
    // x usa Golpe pesado (atraso 40) num mundo, Golpe comum no outro; y sempre o comum
    const next = (s: BattleState, ability: string) => {
      startNextTurn(s); // x abre
      s.turn.usedAbility = ability;
      finishTurn(s);
      const seq: string[] = [];
      for (let i = 0; i < 4; i++) { startNextTurn(s); seq.push(s.turn.actor); s.turn.usedAbility = 'strike'; finishTurn(s); }
      return seq;
    };
    expect(next(a, 'strike')).toEqual(['y', 'x', 'y', 'x']);
    expect(next(b, 'heavy_strike')).toEqual(['y', 'y', 'x', 'y']);
  });

  it('terminar o turno sem agir custa menos', () => {
    expect(REST_COST).toBeLessThan(ACT_COST);
    const s = stateOf([{ id: 'x', def: 'rogue', team: 'hero', x: 0, y: 0 }, { id: 'y', def: 'brute', team: 'enemy', x: 1, y: 0 }]);
    const order = play(s, 6, () => null);
    expect(order.filter((i) => i === 'x').length).toBeGreaterThanOrEqual(4);
  });

  it('o alvo sem velocidade nunca tem turno', () => {
    const s = stateOf([{ id: 'h', def: 'warrior', team: 'hero', x: 0, y: 0 }, { id: 'beacon', def: 'beacon', team: 'hero', x: 1, y: 0 }]);
    expect(play(s, 10)).not.toContain('beacon');
    expect(previewOrder(s, 5)).not.toContain('beacon');
  });

  it('quem morre sai da fila', () => {
    const s = mixed();
    s.units = s.units.filter((u) => u.id !== 'rogue');
    expect(play(s, 8)).not.toContain('rogue');
  });

  it('previewOrder não muda o estado e bate com os turnos de verdade', () => {
    const s = mixed();
    startNextTurn(s);
    const before = structuredClone(s);
    const preview = previewOrder(s, 12);
    expect(s).toEqual(before);
    expect(preview[0]).toBe(s.turn.actor); // o primeiro é quem está jogando
    s.turn.usedAbility = 'strike';
    finishTurn(s);
    const real = [preview[0], ...play(s, 11)];
    expect(real).toEqual(preview);
  });
});
