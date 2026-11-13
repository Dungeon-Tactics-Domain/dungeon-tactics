import { describe, expect, it } from 'vitest';
import { Battle, UNDO_LIMIT, parseBattleState } from '../src/shared/battle/battle.ts';
import { SCENARIOS } from '../src/shared/battle/scenarios.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';
import { HIT_SEED, flat, stateOf } from './battle-helpers.ts';

const at = (x: number, y = 0) => ({ x, y });
// guerreiro ao lado de um soldado (a 1 casa de cima), com espaço para andar; o guerreiro é o ator da vez
const duel = (seed = HIT_SEED) => new Battle(flat(6, 3), stateOf([
  { id: 'a', def: 'warrior', team: 'hero', x: 0, y: 1 },
  { id: 'b', def: 'beacon', team: 'hero', x: 0, y: 0 },
  { id: 'f', def: 'soldier', team: 'enemy', x: 1, y: 1 },
], seed));

describe('turno do jogador', () => {
  it('anda uma vez e age uma vez, em qualquer ordem', () => {
    const b = duel();
    expect(b.move(at(1, 2)).length).toBeGreaterThan(0);
    expect(b.state.units[0].pos).toEqual(at(1, 2));
    expect(b.move(at(0, 2))).toEqual([]); // já andou
    expect(b.act('strike', at(1, 1)).length).toBeGreaterThan(0);
    expect(b.act('strike', at(1, 1))).toEqual([]); // já agiu
  });

  it('o evento de andar começa na casa de saída (a animação parte dali, sem pular para o 1º passo)', () => {
    const b = duel();
    const [e] = b.move(at(1, 2));
    expect(e.k === 'move' && e.path).toEqual([at(0, 1), at(0, 2), at(1, 2)]);
  });

  it('recusa destino fora do alcance e habilidade que o ator não tem', () => {
    const b = duel();
    expect(b.move(at(5, 2))).toEqual([]);
    expect(b.act('firebolt', at(1, 1))).toEqual([]);
  });

  it('terminar o turno passa a vez e limpa o que já foi feito', () => {
    const b = duel();
    b.act('strike', at(1, 1));
    const first = b.state.turn.actor;
    b.endTurn();
    expect(b.state.turn.actor).not.toBe(first);
    expect(b.state.turn.moved).toBe(false);
    expect(b.state.turn.usedAbility).toBeNull();
  });

  it('vencer encerra a batalha e trava novas ações', () => {
    const b = duel();
    b.state.units[2].hp = 1;
    b.move(at(1, 2));
    b.act('strike', at(1, 1));
    expect(b.state.outcome).toBe('victory');
    b.endTurn();
    expect(b.act('strike', at(1, 1))).toEqual([]);
  });
});

describe('desfazer', () => {
  it('desfazer um ataque devolve a vida mas NÃO devolve o dado', () => {
    const b = duel();
    const rngBefore = b.state.rng;
    b.act('strike', at(1, 1));
    const rngAfterAct = b.state.rng;
    expect(rngAfterAct).not.toBe(rngBefore);
    expect(b.undo()).toBe(true);
    expect(b.state.units[2].hp).toBe(UNIT_DEFS.soldier.hp);
    expect(b.state.turn.usedAbility).toBeNull();
    expect(b.state.rng).toBe(rngAfterAct); // o sorteio segue em frente
    // o ataque de novo usa as rolagens seguintes, não as mesmas
    b.move(at(1, 2));
    b.act('strike', at(1, 1));
    expect(b.state.rng).not.toBe(rngAfterAct);
  });

  it('desfazer movimento é de graça; desfazer ataque gasta um e acaba no limite', () => {
    const b = duel();
    b.move(at(1, 2));
    expect(b.undo()).toBe(true);
    expect(b.undosLeft).toBe(UNDO_LIMIT);
    expect(b.state.units[0].pos).toEqual(at(0, 1));
    b.move(at(1, 2));
    b.undosLeft = 0;
    b.act('strike', at(1, 1));
    expect(b.undo()).toBe(false); // sem desfazer sobrando o ataque fica
    expect(b.state.turn.usedAbility).toBe('strike');
  });

  it('gasta um desfazer por ataque desfeito', () => {
    const b = duel();
    b.move(at(1, 2));
    b.act('strike', at(1, 1));
    b.undo();
    expect(b.undosLeft).toBe(UNDO_LIMIT - 1);
  });

  it('só desfaz dentro do turno atual', () => {
    const b = duel();
    b.move(at(1, 2));
    b.endTurn();
    expect(b.canUndo).toBe(false);
    expect(b.undo()).toBe(false);
  });

  it('desfaz em ordem: ataque primeiro, depois o movimento', () => {
    const b = duel();
    b.move(at(1, 2));
    b.act('strike', at(1, 1));
    b.undo();
    expect(b.state.units[0].pos).toEqual(at(1, 2));
    b.undo();
    expect(b.state.units[0].pos).toEqual(at(0, 1));
    expect(b.canUndo).toBe(false);
  });
});

describe('clonar e salvar', () => {
  it('o clone é independente do original', () => {
    const b = duel();
    const c = b.clone();
    c.move(at(1, 2));
    expect(b.state.units[0].pos).toEqual(at(0, 1));
    expect(c.state.units[0].pos).toEqual(at(1, 2));
  });

  it('salvar e carregar volta ao mesmo estado, inclusive o desfazer', () => {
    const b = Battle.start(SCENARIOS.skirmish, 99);
    const start = b.actor.pos;
    b.move([...b.reach().values()][0].pos);
    const loaded = Battle.load(b.save())!;
    expect(loaded.state).toEqual(b.state);
    expect(loaded.undosLeft).toBe(b.undosLeft);
    expect(loaded.undo()).toBe(true);
    expect(loaded.actor.pos).toEqual(start);
  });
});

describe('save torto não derruba o jogo', () => {
  const good = () => JSON.parse(Battle.start(SCENARIOS.skirmish, 1).save());
  const mutate = (fn: (s: any) => void) => {
    const s = good();
    fn(s.state);
    return parseBattleState(s.state);
  };

  it('lixo e JSON inválido viram null', () => {
    expect(Battle.load('não é json')).toBeNull();
    expect(Battle.load('null')).toBeNull();
    expect(Battle.load('[]')).toBeNull();
    expect(Battle.load('{}')).toBeNull();
    expect(parseBattleState(42)).toBeNull();
  });

  it('cenário, unidade, vida, posição e ator inválidos são recusados', () => {
    expect(parseBattleState(good().state)).not.toBeNull();
    expect(mutate((s) => (s.scenario = 'inexistente'))).toBeNull();
    expect(mutate((s) => (s.units[0].def = 'dragao'))).toBeNull();
    expect(mutate((s) => (s.units[1].hp = -3))).toBeNull();
    expect(mutate((s) => (s.units[1].hp = 9999))).toBeNull();
    expect(mutate((s) => (s.units[1].pos = { x: 99, y: 0 }))).toBeNull();
    expect(mutate((s) => (s.units[1].pos = { x: 0.5, y: 0 }))).toBeNull();
    expect(mutate((s) => (s.turn.actor = 'ninguem'))).toBeNull();
    expect(mutate((s) => (s.outcome = 'empate'))).toBeNull();
    expect(mutate((s) => (s.rng = 'x'))).toBeNull();
    expect(mutate((s) => (s.units[1].id = s.units[2].id))).toBeNull();
    expect(mutate((s) => (s.units[1].pos = { ...s.units[2].pos }))).toBeNull();
    expect(mutate((s) => (s.turn.usedAbility = 'fogo_infinito'))).toBeNull();
  });
});

describe('save com unidade grande (revisão de 13/11)', () => {
  it('recusa Colosso com casa fora do mapa ou em cima de outra unidade', () => {
    const base = Battle.start(SCENARIOS.skirmish, 1).state;
    const st = { ...base, units: [
      { id: 'h', def: 'warrior', team: 'hero' as const, pos: { x: 0, y: 7 }, hp: 42, ct: 0, facing: 2 },
      { id: 'b', def: 'beacon', team: 'hero' as const, pos: { x: 3, y: 7 }, hp: 50, ct: 0 },
      { id: 'c', def: 'colossus', team: 'enemy' as const, pos: { x: 0, y: 0 }, hp: 160, ct: 0, facing: 0 },
    ], turn: { actor: 'h', moved: false, usedAbility: null }, charges: [] };
    const copy = () => JSON.parse(JSON.stringify(st));
    expect(parseBattleState(copy())).not.toBeNull();
    const out = copy();
    out.units[2].pos = { x: 7, y: 0 }; // 2x2 a partir da última coluna: metade fora do mapa
    expect(parseBattleState(out)).toBeNull();
    const over = copy();
    over.units[0].pos = { x: 1, y: 1 }; // o guerreiro dentro do quadrado do Colosso
    expect(parseBattleState(over)).toBeNull();
  });
});
