import { describe, expect, it } from 'vitest';
import { chooseTurn, GUARD_RADIUS } from '../src/shared/battle/ai.ts';
import { dist } from '../src/shared/battle/grid.ts';
import { flat, stateOf } from './battle-helpers.ts';

// Marco 3 (11/11): no mapa 20x20 o inimigo fugia da ameaça em vez de avançar (28 dos 40 turnos sem atacar)
describe('IA sem alvo ao alcance', () => {
  const grid = flat(20, 20);
  const beacon = { id: 'beacon', def: 'beacon', team: 'hero' as const, x: 2, y: 17 };

  it('o inimigo avança para o farol mesmo entrando no alcance de um herói', () => {
    const soldier = { id: 'e', def: 'soldier', team: 'enemy' as const, x: 14, y: 4 };
    const state = stateOf([soldier, beacon, { id: 'h', def: 'rogue', team: 'hero', x: 10, y: 9 }]);
    const plan = chooseTurn(grid, state, 'e');
    expect(plan.ability).toBeNull();
    expect(dist(plan.moveTo!, beacon)).toBeLessThan(dist(soldier, beacon));
    expect(dist(plan.moveTo!, soldier)).toBe(4); // anda tudo o que pode
  });

  it('o herói vai ao encontro do inimigo, mas não larga o farol', () => {
    const state = stateOf([{ id: 'h', def: 'rogue', team: 'hero', x: 4, y: 15 }, beacon, { id: 'e', def: 'soldier', team: 'enemy', x: 16, y: 2 }]);
    const plan = chooseTurn(grid, state, 'h');
    const at = plan.moveTo ?? { x: 4, y: 15 };
    expect(dist(at, beacon)).toBeLessThanOrEqual(GUARD_RADIUS);
    expect(dist(at, { x: 16, y: 2 })).toBeLessThan(dist({ x: 4, y: 15 }, { x: 16, y: 2 }));
  });
});
