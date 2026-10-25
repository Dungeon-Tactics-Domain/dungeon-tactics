import { describe, expect, it } from 'vitest';
import { finishTurn, previewOrder, startNextTurn, turnCt } from '../src/shared/battle/turn-queue.ts';
import type { BattleState } from '../src/shared/battle/types.ts';
import { flat, stateOf } from './battle-helpers.ts';

const G = flat(8, 8);

// joga `n` turnos em que cada ator usa a habilidade dada (sem atraso por padrão) e devolve quem agiu
function play(s: BattleState, n: number, ability: (actor: string) => string | null = () => 'strike'): string[] {
  const order: string[] = [];
  for (let i = 0; i < n; i++) {
    startNextTurn(G, s);
    order.push(s.turn.actor);
    s.turn.usedAbility = ability(s.turn.actor);
    s.turn.moved = s.turn.usedAbility !== null; // anda e age: o custo que a prévia da fila supõe
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

  // 12/11: regra do FFT em todos os mapas (BMG 1.1); antes, agir custava 100 mais o atraso da habilidade
  it('custo do turno pelo que a unidade fez: mover e agir 100, um dos dois 80, nenhum 60; a sobra nunca passa de 60', () => {
    const cost = (moved: boolean, acted: boolean) => {
      const s = stateOf([{ id: 'x', def: 'warrior', team: 'hero', x: 0, y: 0 }]);
      s.units[0].ct = 120;
      s.turn = { actor: 'x', moved, usedAbility: acted ? 'strike' : null };
      finishTurn(s);
      return s.units[0].ct;
    };
    expect([cost(true, true), cost(true, false), cost(false, true), cost(false, false)]).toEqual([20, 40, 40, 60]);
    expect(turnCt(200, false, false)).toBe(60);
  });

  it('esperar sem agir devolve a vez mais cedo', () => {
    const s = stateOf([{ id: 'x', def: 'rogue', team: 'hero', x: 0, y: 0 }, { id: 'y', def: 'brute', team: 'enemy', x: 1, y: 0 }]);
    const order = play(s, 6, () => null);
    expect(order.filter((i) => i === 'x').length).toBeGreaterThanOrEqual(4);
  });

  it('empate em 100 ou mais: age o primeiro da lista de personagens, e os inimigos vêm antes (BMG A.2)', () => {
    const s = stateOf([{ id: 'h', def: 'warrior', team: 'hero', x: 0, y: 0 }, { id: 'e', def: 'soldier', team: 'enemy', x: 1, y: 0 }]);
    s.units[0].ct = 130; // mais CT não passa na frente
    s.units[1].ct = 100;
    startNextTurn(G, s);
    expect(s.turn.actor).toBe('e');
  });

  it('o alvo sem velocidade nunca tem turno', () => {
    const s = stateOf([{ id: 'h', def: 'warrior', team: 'hero', x: 0, y: 0 }, { id: 'beacon', def: 'beacon', team: 'hero', x: 1, y: 0 }]);
    expect(play(s, 10)).not.toContain('beacon');
    expect(previewOrder(s, 5).map((e) => e.unit)).not.toContain('beacon');
  });

  it('quem morre sai da fila', () => {
    const s = mixed();
    s.units = s.units.filter((u) => u.id !== 'rogue');
    expect(play(s, 8)).not.toContain('rogue');
  });

  it('previewOrder não muda o estado e bate com os turnos de verdade', () => {
    const s = mixed();
    startNextTurn(G, s);
    const before = structuredClone(s);
    const preview = previewOrder(s, 12).map((e) => e.unit);
    expect(s).toEqual(before);
    expect(preview[0]).toBe(s.turn.actor); // o primeiro é quem está jogando
    s.turn.usedAbility = 'strike';
    s.turn.moved = true;
    finishTurn(s);
    const real = [preview[0], ...play(s, 11)];
    expect(real).toEqual(preview);
  });
});
