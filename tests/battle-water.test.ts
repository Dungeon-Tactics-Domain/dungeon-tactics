import { describe, expect, it } from 'vitest';
import { chooseTurn } from '../src/shared/battle/ai.ts';
import { hitChance, simulatePush } from '../src/shared/battle/combat.ts';
import { ABILITIES } from '../src/shared/battle/abilities.ts';
import { type Grid } from '../src/shared/battle/grid.ts';
import { reachable } from '../src/shared/battle/pathing.ts';
import { flat, stateOf } from './battle-helpers.ts';

// Água rasa e funda (decisão do Fernando de 12/11, "como no FFT", BMG 6.5): rasa custa 2 de movimento, 2h ou mais não
// deixa entrar, e quem está na água fica mais baixo (altura da casa menos a profundidade).
const withWater = (g: Grid, cells: [x: number, y: number, depth: number][]) => {
  for (const [x, y, depth] of cells) g.tiles[y * g.width + x] = { ...g.tiles[y * g.width + x], depth };
  return g;
};

describe('água', () => {
  it('rasa custa 2 de movimento; com 4 pontos o Guerreiro atravessa só 2 casas de água', () => {
    const g = withWater(flat(8, 3), [[2, 1, 1], [3, 1, 1], [4, 1, 1], [5, 1, 1]]);
    const s = stateOf([{ id: 'a', def: 'warrior', team: 'hero', x: 1, y: 1 }]);
    const reach = reachable(g, s, 'a');
    expect(reach.get('2,1')?.cost).toBe(2);
    expect(reach.get('3,1')?.cost).toBe(4);
    expect(reach.has('4,1')).toBe(false);
  });

  it('funda (2 ou mais) não deixa entrar', () => {
    const g = withWater(flat(5, 3), [[2, 1, 2]]);
    const s = stateOf([{ id: 'a', def: 'warrior', team: 'hero', x: 1, y: 1 }]);
    expect(reachable(g, s, 'a').has('2,1')).toBe(false);
  });

  it('quem está na água fica mais baixo: sair dela pede mais salto e o atacante de fora ganha altura', () => {
    // corredor de 1 casa de largura, para não haver volta por fora da água
    const g = withWater(flat(5, 1), [[2, 0, 1]]);
    g.tiles[3] = { ...g.tiles[3], h: 1 }; // margem 1 nível acima do chão; da água (0 - 1 = -1) são 2
    const s = stateOf([{ id: 'a', def: 'warrior', team: 'hero', x: 2, y: 0 }]);
    expect(reachable(g, s, 'a').has('3,0')).toBe(false); // salto 1 não sobe 2
    const strike = ABILITIES.strike;
    expect(hitChance(g, strike, { x: 1, y: 0 }, { x: 2, y: 0 })).toBe(Math.min(95, strike.accuracy + 5)); // 1 nível acima
  });

  it('empurrão para na água funda, como numa parede (suposição nossa)', () => {
    const g = withWater(flat(5, 3), [[3, 1, 2]]);
    const s = stateOf([{ id: 'a', def: 'warrior', team: 'hero', x: 1, y: 1 }, { id: 'b', def: 'soldier', team: 'enemy', x: 2, y: 1 }]);
    const r = simulatePush(g, s, s.units[1], { x: 2, y: 1 }, { x: 1, y: 1 }, 2);
    expect(r.to).toEqual({ x: 2, y: 1 });
    expect(r.events[0]).toMatchObject({ k: 'bump' });
  });

  it('a IA mede a distância a pé: dá a volta em vez de ficar parada atrás da água funda', () => {
    // muro de água funda entre os dois, com passagem embaixo; em linha reta ele já está "a 2 casas" e antes não andava
    const g = withWater(flat(5, 5), [[2, 0, 2], [2, 1, 2], [2, 2, 2], [2, 3, 2]]);
    const s = stateOf([
      { id: 'a', def: 'soldier', team: 'enemy', x: 1, y: 1 },
      { id: 'b', def: 'warrior', team: 'hero', x: 3, y: 1 },
      { id: 'beacon', def: 'beacon', team: 'hero', x: 4, y: 4 },
    ]);
    const plan = chooseTurn(g, s, 'a');
    expect(plan.moveTo?.y).toBeGreaterThan(1); // desce em direção à passagem
  });
});
