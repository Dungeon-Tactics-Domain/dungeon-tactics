import { describe, expect, it } from 'vitest';
import { checkOutcome, previewAbility, resolveAbility } from '../src/shared/battle/combat.ts';
import { reachable } from '../src/shared/battle/pathing.ts';
import { SCENARIOS } from '../src/shared/battle/scenarios.ts';
import { finishTurn } from '../src/shared/battle/turn-queue.ts';
import { flat, gridOf, stateOf } from './battle-helpers.ts';

// Regras por cenário (11/11): o estudo do FFT troca acerto, custo do turno, salto e fim da batalha sem tocar nas regras
// do jogo. Cenário sem `rules` (todos os do jogo) segue como antes; é o que os outros testes já cobrem.
describe('regras do cenário', () => {
  const grid = flat(6, 6);
  const withRules = (rules: object, units: Parameters<typeof stateOf>[0]) => {
    SCENARIOS.test_rules = { id: 'test_rules', name: '', en: '', grid, spawns: [], rules };
    return { ...stateOf(units), scenario: 'test_rules' };
  };
  const duel = [{ id: 'a', def: 'warrior', team: 'hero' as const, x: 1, y: 1 }, { id: 'b', def: 'soldier', team: 'enemy' as const, x: 2, y: 1 }];

  it('acerto: a regra do cenário substitui a conta de distância, altura e cobertura', () => {
    const state = withRules({ hitChance: () => 42 }, duel);
    expect(previewAbility(grid, state, 'a', 'strike', { x: 2, y: 1 }).targets[0].chance).toBe(42);
  });

  it('custo do turno: a regra recebe o CT e o que a unidade fez', () => {
    const state = withRules({ turnCt: (ct: number, moved: boolean, acted: boolean) => ct - (moved ? 7 : 0) - (acted ? 30 : 0) }, duel);
    state.units[0].ct = 100;
    state.turn = { actor: 'a', moved: true, usedAbility: 'strike' };
    finishTurn(state);
    expect(state.units[0].ct).toBe(63);
  });

  it('salto: a regra diz quantos níveis a unidade sobe ou desce por passo', () => {
    const cliff = gridOf(['...', '...', '...'], ['003', '003', '003']);
    const climber = [{ id: 'a', def: 'warrior', team: 'hero' as const, x: 1, y: 1 }];
    SCENARIOS.test_rules = { id: 'test_rules', name: '', en: '', grid: cliff, spawns: [], rules: { jump: () => 3 } };
    expect(reachable(cliff, { ...stateOf(climber), scenario: 'test_rules' }, 'a').has('2,1')).toBe(true);
    expect(reachable(cliff, stateOf(climber), 'a').has('2,1')).toBe(false);
  });

  it('fim da batalha: a regra decide (sem alvo a proteger, derrota só com todos os heróis caídos)', () => {
    const state = withRules({ outcome: () => 'ongoing' as const }, duel);
    expect(checkOutcome(state)).toBe('ongoing');
    expect(checkOutcome(stateOf(duel))).toBe('defeat'); // regra do jogo: sem farol é derrota
  });

  it('queda: a regra diz o dano de cair empurrado', () => {
    const cliff = gridOf(['....'], ['5500']);
    const pair = [{ id: 'a', def: 'warrior', team: 'hero' as const, x: 0, y: 0 }, { id: 'b', def: 'soldier', team: 'enemy' as const, x: 1, y: 0 }];
    SCENARIOS.test_rules = { id: 'test_rules', name: '', en: '', grid: cliff, spawns: [], rules: { hitChance: () => 100, fallDamage: (levels: number) => levels * 2 } };
    const fall = resolveAbility(cliff, { ...stateOf(pair), scenario: 'test_rules' }, 'a', 'shield_bash', { x: 1, y: 0 }).find((e) => e.k === 'fall');
    expect(fall).toMatchObject({ levels: 5, dmg: 10 });
  });

  it('dano: a regra pode sortear o dano (crítico do FFT)', () => {
    const state = withRules({ hitChance: () => 100, rollDamage: (_s: unknown, _a: unknown, _ab: unknown, rng: number) => [3, rng] }, duel);
    const hit = resolveAbility(grid, state, 'a', 'strike', { x: 2, y: 1 }).find((e) => e.k === 'hit');
    expect(hit).toMatchObject({ dmg: 3 });
  });
});
