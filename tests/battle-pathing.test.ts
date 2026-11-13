import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../src/shared/battle/abilities.ts';
import { inAbilityRange, leaps, lineOfSight, pathTo, reachable } from '../src/shared/battle/pathing.ts';
import { flat, gridOf, stateOf } from './battle-helpers.ts';

const keys = (m: Map<string, unknown>) => [...m.keys()].sort();

describe('movimento', () => {
  it('anda até o limite de casas e não fica onde está', () => {
    const g = flat(9, 1);
    const s = stateOf([{ id: 'a', def: 'mage', team: 'hero', x: 0, y: 0 }]); // move 3
    expect(keys(reachable(g, s, 'a'))).toEqual(['1,0', '2,0', '3,0']);
  });

  it('salto de quem não diz o seu é 1 nível: sobe e desce 1, não 2', () => {
    const g = gridOf(['....'], ['0124']);
    const s = stateOf([{ id: 'a', def: 'warrior', team: 'hero', x: 0, y: 0 }]); // move 4, sem jump
    expect(keys(reachable(g, s, 'a'))).toEqual(['1,0', '2,0']);
    const down = gridOf(['....'], ['4210']);
    const s2 = stateOf([{ id: 'a', def: 'warrior', team: 'hero', x: 3, y: 0 }]);
    expect(keys(reachable(down, s2, 'a'))).toEqual(['1,0', '2,0']);
  });

  it('cada classe salta o seu (UnitDef.jump): o Ladino sobe e desce 2, o Guerreiro não', () => {
    const g = gridOf(['....'], ['0247']); // 2 sobe, 3 não
    expect(keys(reachable(g, stateOf([{ id: 'a', def: 'rogue', team: 'hero', x: 0, y: 0 }]), 'a'))).toEqual(['1,0', '2,0']);
    expect(keys(reachable(g, stateOf([{ id: 'a', def: 'warrior', team: 'hero', x: 0, y: 0 }]), 'a'))).toEqual([]);
    const down = gridOf(['...'], ['420']);
    expect(keys(reachable(down, stateOf([{ id: 'a', def: 'rogue', team: 'hero', x: 0, y: 0 }]), 'a'))).toEqual(['1,0', '2,0']);
  });

  it('vão do FFT ([Jump/2] casas): salto 2 voa 1 casa de água funda, salto 1 não; parede e queda grande barram', () => {
    const g = gridOf(['...'], ['000']);
    g.tiles[1] = { ...g.tiles[1], depth: 2 }; // água funda no meio
    const rogue = stateOf([{ id: 'a', def: 'rogue', team: 'hero', x: 0, y: 0 }]); // salto 2
    const r = reachable(g, rogue, 'a');
    expect(keys(r)).toEqual(['2,0']);
    expect(r.get('2,0')?.cost).toBe(2); // a casa voada conta 1
    expect(pathTo(r, { x: 2, y: 0 })).toEqual([{ x: 2, y: 0 }]); // o caminho pula direto
    expect(keys(reachable(g, stateOf([{ id: 'a', def: 'warrior', team: 'hero', x: 0, y: 0 }]), 'a'))).toEqual([]);
    expect(leaps(gridOf(['.#.'], ['000']), { x: 0, y: 0 }, 2)).toEqual([]); // parede não é vão
    expect(leaps(gridOf(['...'], ['010']), { x: 0, y: 0 }, 2)).toEqual([]); // casa mais alta no meio não é vão
    const high = gridOf(['...'], ['003']);
    high.tiles[1] = { ...high.tiles[1], depth: 2 };
    expect(leaps(high, { x: 0, y: 0 }, 2)).toEqual([]); // pousar 3 acima passa do salto
  });

  it('parede e árvore bloqueiam o caminho (árvore desde 13/11)', () => {
    const g = gridOf(['.#...', '.....']);
    const s = stateOf([{ id: 'a', def: 'warrior', team: 'hero', x: 0, y: 0 }]); // move 4
    const r = reachable(g, s, 'a');
    expect(r.has('1,0')).toBe(false);
    expect(r.get('2,0')?.cost).toBe(4); // dá a volta por baixo
    const f = gridOf(['.T..']);
    expect(reachable(f, stateOf([{ id: 'a', def: 'mage', team: 'hero', x: 0, y: 0 }]), 'a').size).toBe(0);
  });

  it('inimigo bloqueia, aliado só deixa passar (não dá para parar em cima)', () => {
    const g = flat(5, 1);
    const s = stateOf([
      { id: 'a', def: 'mage', team: 'hero', x: 0, y: 0 },
      { id: 'ally', def: 'mage', team: 'hero', x: 1, y: 0 },
      { id: 'foe', def: 'soldier', team: 'enemy', x: 3, y: 0 },
    ]);
    const r = reachable(g, s, 'a');
    expect(r.has('1,0')).toBe(false);
    expect(r.has('2,0')).toBe(true); // passou pelo aliado
    expect(r.has('3,0')).toBe(false);
    expect(r.has('4,0')).toBe(false); // o inimigo fecha o corredor
  });

  it('pathTo devolve as casas do caminho sem a de saída, na ordem', () => {
    const g = flat(5, 1);
    const s = stateOf([{ id: 'a', def: 'mage', team: 'hero', x: 0, y: 0 }]);
    expect(pathTo(reachable(g, s, 'a'), { x: 3, y: 0 })).toEqual([{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }]);
    expect(pathTo(reachable(g, s, 'a'), { x: 4, y: 0 })).toBeNull();
  });

  it('unidade sem velocidade (o alvo a proteger) não anda', () => {
    const s = stateOf([{ id: 'b', def: 'beacon', team: 'hero', x: 1, y: 1 }]);
    expect(reachable(flat(3, 3), s, 'b').size).toBe(0);
  });
});

describe('linha de visão', () => {
  it('chão aberto vê; parede no meio tapa', () => {
    expect(lineOfSight(flat(5, 1), { x: 0, y: 0 }, { x: 4, y: 0 })).toBe(true);
    expect(lineOfSight(gridOf(['..#..']), { x: 0, y: 0 }, { x: 4, y: 0 })).toBe(false);
  });

  it('floresta tapa no mesmo nível, mas quem está 2 níveis acima enxerga por cima', () => {
    expect(lineOfSight(gridOf(['.T..']), { x: 0, y: 0 }, { x: 3, y: 0 })).toBe(false);
    expect(lineOfSight(gridOf(['.T..'], ['2000']), { x: 0, y: 0 }, { x: 3, y: 0 })).toBe(true);
  });

  it('um morro entre dois no chão tapa a visão', () => {
    expect(lineOfSight(gridOf(['...'], ['020']), { x: 0, y: 0 }, { x: 2, y: 0 })).toBe(false);
  });

  it('é simétrica e a diagonal funciona', () => {
    const g = gridOf(['.....', '.#...', '.....', '.....']);
    for (const [a, b] of [[{ x: 0, y: 0 }, { x: 4, y: 3 }], [{ x: 0, y: 3 }, { x: 4, y: 0 }]] as const) {
      expect(lineOfSight(g, a, b)).toBe(lineOfSight(g, b, a));
    }
  });
});

describe('alcance das habilidades', () => {
  const shot = ABILITIES.shot; // 2 a 6, ganha alcance em cima
  it('respeita mínimo e máximo', () => {
    const g = flat(9, 1);
    expect(inAbilityRange(g, shot, { x: 0, y: 0 }, { x: 1, y: 0 })).toBe(false);
    expect(inAbilityRange(g, shot, { x: 0, y: 0 }, { x: 6, y: 0 })).toBe(true);
    expect(inAbilityRange(g, shot, { x: 0, y: 0 }, { x: 7, y: 0 })).toBe(false);
  });

  it('+1 de alcance por nível acima do alvo, só para quem tem heightRange', () => {
    const g = gridOf(['.........'], ['200000000']);
    expect(inAbilityRange(g, shot, { x: 0, y: 0 }, { x: 8, y: 0 })).toBe(true); // 8 casas = 6 + 2 níveis
    expect(inAbilityRange(flat(9, 1), shot, { x: 0, y: 0 }, { x: 8, y: 0 })).toBe(false); // no plano só 6
    expect(inAbilityRange(g, ABILITIES.gust, { x: 0, y: 0 }, { x: 5, y: 0 })).toBe(false); // Rajada: 4 e sem bônus
  });
});
