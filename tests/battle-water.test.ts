import { describe, expect, it } from 'vitest';
import { chooseTurn } from '../src/shared/battle/ai.ts';
import { hitChance, previewAbility, simulatePush } from '../src/shared/battle/combat.ts';
import { ABILITIES } from '../src/shared/battle/abilities.ts';
import { type Grid } from '../src/shared/battle/grid.ts';
import { lineOfSight, reachable } from '../src/shared/battle/pathing.ts';
import { flat, stateOf } from './battle-helpers.ts';

// Água rasa e funda (decisão do Fernando de 12/11, "como no FFT", BMG 6.5): rasa custa 2 de movimento, 2h ou mais não
// deixa entrar; desde 13/11 a rasa não rebaixa quem está de pé (só custa movimento).
const withWater = (g: Grid, cells: [x: number, y: number, depth: number][]) => {
  for (const [x, y, depth] of cells) g.tiles[y * g.width + x] = { ...g.tiles[y * g.width + x], depth };
  return g;
};

describe('água', () => {
  it('água custa 1 de movimento desde 13/11 (escolha do Fernando: menos amarras); com 4 pontos o Guerreiro atravessa 4 casas', () => {
    const g = withWater(flat(8, 3), [[2, 1, 1], [3, 1, 1], [4, 1, 1], [5, 1, 1]]);
    const s = stateOf([{ id: 'a', def: 'warrior', team: 'hero', x: 1, y: 1 }]);
    const reach = reachable(g, s, 'a');
    expect(reach.get('2,1')?.cost).toBe(1);
    expect(reach.get('5,1')?.cost).toBe(4);
    expect(reach.has('6,1')).toBe(false);
  });

  it('funda (2 ou mais) deixa entrar desde 13/11 (escolha do Fernando): custa 1 e o salto 1 basta, medido pela superfície', () => {
    const g = withWater(flat(5, 3), [[2, 1, 2], [3, 1, 2]]);
    const s = stateOf([{ id: 'a', def: 'warrior', team: 'hero', x: 1, y: 1 }]);
    const reach = reachable(g, s, 'a');
    expect(reach.get('2,1')?.cost).toBe(1);
    expect(reach.get('3,1')?.cost).toBe(2);
  });

  it('na água funda só se anda ou espera: nenhuma habilidade sai dali', () => {
    const g = withWater(flat(5, 3), [[2, 1, 2]]);
    const s = stateOf([{ id: 'a', def: 'warrior', team: 'hero', x: 2, y: 1 }, { id: 'b', def: 'soldier', team: 'enemy', x: 3, y: 1 }]);
    expect(previewAbility(g, s, 'a', 'strike', { x: 3, y: 1 })).toMatchObject({ ok: false, reason: 'water' });
    const dry = stateOf([{ id: 'a', def: 'warrior', team: 'hero', x: 1, y: 1 }, { id: 'b', def: 'soldier', team: 'enemy', x: 2, y: 1 }]);
    expect(previewAbility(g, dry, 'a', 'strike', { x: 2, y: 1 }).ok).toBe(true); // de fora, quem nada leva golpe normal
  });

  it('água rasa não rebaixa quem está de pé (13/11, pedido do Fernando): da margem 1 acima se desce e se sobe com salto 1', () => {
    const g = withWater(flat(5, 1), [[2, 0, 1]]);
    g.tiles[3] = { ...g.tiles[3], h: 1 }; // margem 1 nível acima da água
    const s = stateOf([{ id: 'a', def: 'warrior', team: 'hero', x: 2, y: 0 }]);
    expect(reachable(g, s, 'a').has('3,0')).toBe(true);
    const strike = ABILITIES.strike;
    expect(hitChance(g, strike, { x: 1, y: 0 }, { x: 2, y: 0 })).toBe(Math.min(95, strike.accuracy)); // mesmo nível
  });

  it('quem nada na funda é visto de longe pela superfície (revisão de 13/11: a 3 casas ou mais ficava invisível)', () => {
    const g = withWater(flat(8, 1), [[6, 0, 2]]);
    for (let x = 0; x <= 4; x++) expect(lineOfSight(g, { x, y: 0 }, { x: 6, y: 0 })).toBe(true);
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
