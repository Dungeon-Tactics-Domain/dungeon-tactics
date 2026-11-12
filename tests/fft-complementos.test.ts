import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../src/shared/battle/abilities.ts';
import { chooseTurn, playAiTurn } from '../src/shared/battle/ai.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { faithMagic, hitPercent, magicHitPercent, sideOf, statBreakBase, wish } from '../src/shared/battle/fft/formulas.ts';
import { CLASSES_BATTLE, GARILAND, POTION_STOCK, registerFftStudy } from '../src/shared/battle/fft/gariland.ts';
import { FIRST_BATTLE, SCENARIOS } from '../src/shared/battle/scenarios.ts';
import { simulate } from '../src/shared/battle/simulate.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';
import { seedWhere } from './battle-helpers.ts';

// Complementos do estudo do FFT (pedido do Fernando, 11/11): direção, habilidades que faltavam, quatro classes e estoque
// de poções. Fonte das contas: Battle Mechanics Handbook v6.1 (docs/game-design/referencia-fft.md).
registerFftStudy();

describe('FFT: de onde o ataque vem (BMG 1.4, diagrama)', () => {
  it('reproduz o diagrama 5x5 do guia, com o alvo no centro olhando para baixo', () => {
    // linhas de cima para baixo, como no guia; X = o alvo
    const diagram = ['SBBBS', 'SSBSS', 'SSXSS', 'SFFFS', 'FFFFF'];
    const name = { S: 'side', B: 'back', F: 'front' } as const;
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) {
        const c = diagram[row][col] as 'S' | 'B' | 'F' | 'X';
        if (c === 'X') continue;
        expect(sideOf({ x: 2, y: 2 }, { x: 0, y: 1 }, { x: col, y: row }), `${col},${row}`).toBe(name[c]);
      }
    }
  });

  it('exemplo do guia: de lado, escudo de 40% e manto de 40% deixam 36% de acerto', () => {
    expect(hitPercent(100, { c: 10, s: 40, a: 40, w: 0 }, 'side')).toBe(36);
  });

  it('exemplo do guia: Flare contra escudo mágico de 15% e manto de 30% acerta 59%', () => {
    expect(magicHitPercent(100, 15, 30)).toBe(59);
  });
});

describe('FFT: contas das habilidades novas', () => {
  it('Fogo e Cura: [(MA * fé * fé * 14) / 10000] (BMG 3.4)', () => {
    expect(faithMagic(6, 60, 60, 14)).toBe(30); // Mago Negro nível 1, MA 6
    expect(faithMagic(4, 60, 60, 14)).toBe(20); // Mago Branco nível 1, MA 4
    expect(faithMagic(6, 100, 100, 14)).toBe(84); // fé cheia dos dois lados: MA * Q
  });

  it('Desejo cura RU{MaxHP * 2/5} e custa RU{MaxHP / 5} (BMG 3.3)', () => {
    expect(wish(51)).toEqual([21, 11]); // Ramza do estudo
    expect(wish(50)).toEqual([20, 10]);
  });

  it('quebra de atributo parte de (PA + 50)% (BMG 3.6)', () => {
    expect(statBreakBase(6)).toBe(56);
  });
});

const at = (b: Battle, id: string) => b.state.units.find((u) => u.id === id)!;
const put = (b: Battle, id: string, x: number, y: number, facing?: number) => {
  const u = at(b, id);
  u.pos = { x, y };
  if (facing !== undefined) u.facing = facing;
};
const chance = (b: Battle, ability: string, x: number, y: number) => b.preview(ability, { x, y }).targets[0].chance;

describe('FFT Gariland: direção', () => {
  const start = () => {
    const b = Battle.start(GARILAND, 1);
    b.state.turn.actor = 'ramza';
    return b;
  };

  it('heróis nascem olhando para +y e inimigos para -y; nos mapas do jogo ninguém tem direção nem contadores', () => {
    const b = start();
    expect(at(b, 'ramza').facing).toBe(0);
    expect(at(b, 'e-squire-1').facing).toBe(2);
    const game = Battle.start(FIRST_BATTLE, 1).state.units;
    expect(game.every((u) => u.facing === undefined && u.vars === undefined)).toBe(true);
  });

  it('Escudeiro (evasão de classe 5, sem escudo): 95% de frente, 100% de lado e pelas costas', () => {
    const b = start();
    put(b, 'ramza', 2, 5);
    put(b, 'e-squire-1', 3, 5, 3); // olhando para o Ramza
    expect(chance(b, 'fft_ramza_attack', 3, 5)).toBe(95);
    at(b, 'e-squire-1').facing = 0;
    expect(chance(b, 'fft_ramza_attack', 3, 5)).toBe(100);
    at(b, 'e-squire-1').facing = 1; // de costas
    expect(chance(b, 'fft_ramza_attack', 3, 5)).toBe(100);
  });

  it('quem anda termina olhando para onde ia, quem ataca vira para o alvo e o jogador escolhe ao fim do turno', () => {
    const b = start();
    put(b, 'ramza', 3, 5);
    put(b, 'e-squire-1', 4, 6);
    b.move({ x: 4, y: 5 });
    expect(b.actor.facing).toBe(1); // andou para +x
    b.act('fft_ramza_attack', { x: 4, y: 6 });
    expect(b.actor.facing).toBe(0); // alvo em +y
    b.face(2);
    expect(b.actor.facing).toBe(2);
    b.face(7); // direção que não existe: ignora
    expect(b.actor.facing).toBe(2);
  });

  it('a IA termina o turno de frente para o inimigo mais próximo', () => {
    const b = Battle.start(GARILAND, 3);
    const id = b.actor.id;
    playAiTurn(b);
    const me = at(b, id);
    const foe = b.state.units.filter((u) => u.team !== me.team).reduce((a, c) => (Math.abs(c.pos.x - me.pos.x) + Math.abs(c.pos.y - me.pos.y) < Math.abs(a.pos.x - me.pos.x) + Math.abs(a.pos.y - me.pos.y) ? c : a));
    expect(sideOf(me.pos, [{ x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: -1, y: 0 }][me.facing!], foe.pos)).toBe('front');
  });

  it('salvar e carregar guarda direção e contadores; save sem eles é recusado', () => {
    const b = start();
    b.face(3);
    at(b, 'ramza').vars!.pa = 2;
    expect(Battle.load(b.save())?.state).toEqual(b.state);
    const raw = JSON.parse(b.save());
    delete raw.state.units[0].facing;
    expect(Battle.load(JSON.stringify(raw))).toBeNull();
  });
});

describe('FFT Gariland: habilidades que faltavam (BMG 3.3)', () => {
  const start = () => {
    const b = Battle.start(GARILAND, 1);
    b.state.turn.actor = 'ramza';
    put(b, 'ramza', 2, 5);
    put(b, 'delita', 2, 6);
    put(b, 'e-squire-1', 3, 5, 3);
    return b;
  };

  it('listas: Escudeiro com Acumular; Ramza também com Desejo e Grito', () => {
    expect(UNIT_DEFS.fft_squire.abilities).toEqual(['fft_squire_attack', 'fft_squire_stone', 'fft_squire_dash', 'fft_squire_accumulate']);
    expect(UNIT_DEFS.fft_ramza.abilities.slice(3)).toEqual(['fft_ramza_accumulate', 'fft_ramza_wish', 'fft_ramza_yell']);
  });

  it('Acumular dá PA +1 a quem usa: a espada do Ramza passa de 20 para 24 na prévia e no golpe', () => {
    const b = start();
    expect(b.preview('fft_ramza_attack', { x: 3, y: 5 }).targets[0]).toMatchObject({ dmgMin: 20, dmgMax: 20 });
    expect(b.act('fft_ramza_accumulate', { x: 2, y: 5 }).map((e) => e.k)).toEqual(['attack']);
    expect(at(b, 'ramza').vars!.pa).toBe(1);
    b.state.turn.usedAbility = null;
    expect(b.preview('fft_ramza_attack', { x: 3, y: 5 }).targets[0]).toMatchObject({ dmgMin: 24, dmgMax: 24 });
    b.state.rng = seedWhere((v) => v < 0.9); // acerta (95%)
    const hit = b.act('fft_ramza_attack', { x: 3, y: 5 }).find((e) => e.k === 'hit');
    expect(hit && 'dmg' in hit && hit.dmg).toBeGreaterThanOrEqual(24); // 24, ou mais se sair crítico
  });

  it('Grito dá Speed +1 ao alvo (pode ser quem usa): ele passa a ganhar 7 de CT por tique', () => {
    const b = start();
    b.act('fft_ramza_yell', { x: 2, y: 6 });
    expect(at(b, 'delita').vars!.sp).toBe(1);
    expect(GARILAND.rules!.speed!(at(b, 'delita'))).toBe(7);
    expect(GARILAND.rules!.speed!(at(b, 'ramza'))).toBe(6);
    const self = start();
    expect(self.preview('fft_ramza_yell', { x: 2, y: 5 }).ok).toBe(true);
  });

  it('Desejo cura 21 no aliado ao lado e tira 11 do Ramza; nunca o deixa abaixo de 1', () => {
    const b = start();
    at(b, 'delita').hp = 10;
    const events = b.act('fft_ramza_wish', { x: 2, y: 6 });
    expect(at(b, 'delita').hp).toBe(31);
    expect(at(b, 'ramza').hp).toBe(40);
    expect(events).toContainEqual({ k: 'hit', unit: 'ramza', dmg: 11, chance: 100 });
    const low = start();
    at(low, 'ramza').hp = 5;
    at(low, 'delita').hp = 10;
    low.act('fft_ramza_wish', { x: 2, y: 6 });
    expect(at(low, 'ramza').hp).toBe(1);
    expect(low.actor.id).toBe('ramza');
  });

  it(`Poção: cada Químico tem ${POTION_STOCK} (suposição); sem estoque não dá para usar`, () => {
    const b = start();
    b.state.turn.actor = 'chemist';
    put(b, 'chemist', 2, 7);
    at(b, 'delita').hp = 10;
    expect(at(b, 'chemist').vars!.potions).toBe(POTION_STOCK);
    b.act('fft_chemist_potion', { x: 2, y: 6 });
    expect(at(b, 'chemist').vars!.potions).toBe(POTION_STOCK - 1);
    at(b, 'chemist').vars!.potions = 0;
    b.state.turn.usedAbility = null;
    expect(b.preview('fft_chemist_potion', { x: 2, y: 6 })).toMatchObject({ ok: false, reason: 'spent' });
  });
});

describe('FFT classes básicas (BMG 7.4): fichas de nível 1', () => {
  const hp = (id: string) => UNIT_DEFS[id].hp;
  const dmg = (id: string) => ABILITIES[id].damage;

  it('vida: Cavaleiro 57 (37 + elmo e armadura de couro), Arqueiro 43, Mago Branco 37, Mago Negro 36', () => {
    expect([hp('fft_knight'), hp('fft_archer'), hp('fft_priest'), hp('fft_wizard')]).toEqual([57, 43, 37, 36]);
  });

  it('ataque: espada do Cavaleiro PA 6 * 4, arco [(5 + 6) / 2] * 4, cajado MA 4 * 3, vara PA 3 * 3', () => {
    expect([dmg('fft_knight_attack'), dmg('fft_archer_attack'), dmg('fft_priest_attack'), dmg('fft_wizard_attack')]).toEqual([[24, 24], [20, 20], [12, 12], [9, 9]]);
    expect(ABILITIES.fft_archer_attack.range).toEqual([3, 5]);
  });

  it('Carga +1 e +2 somam K ao PA e ao Speed na conta do arco (BMG 2.2)', () => {
    expect([dmg('fft_archer_charge1'), dmg('fft_archer_charge2')]).toEqual([[24, 24], [28, 28]]); // [(6+7)/2]*4 e [(7+8)/2]*4
  });

  it('Fogo tira 30 em área e Cura devolve 20, cada um por 6 de MP; 17 de MP dão 2 usos', () => {
    expect(ABILITIES.fft_wizard_fire).toMatchObject({ damage: [30, 30], radius: 1, range: [1, 4], cost: ['mp', 6] });
    expect(ABILITIES.fft_priest_cure).toMatchObject({ heal: [20, 20], radius: 1, cost: ['mp', 6] });
    expect([UNIT_DEFS.fft_wizard.vars!.mp, UNIT_DEFS.fft_priest.vars!.mp]).toEqual([17, 17]);
  });
});

describe('FFT classes básicas: regras no motor', () => {
  const start = () => {
    const b = Battle.start(CLASSES_BATTLE, 1);
    b.state.turn.actor = 'knight';
    put(b, 'knight', 2, 5);
    put(b, 'e-knight', 3, 5, 3); // de frente para o herói
    return b;
  };

  it('escudo do Cavaleiro (10%) vale de frente e de lado, não pelas costas: 81%, 90% e 100%', () => {
    const b = start();
    expect(chance(b, 'fft_knight_attack', 3, 5)).toBe(81); // [100 * 90 * 90 / 10000]
    at(b, 'e-knight').facing = 0;
    expect(chance(b, 'fft_knight_attack', 3, 5)).toBe(90);
    at(b, 'e-knight').facing = 1;
    expect(chance(b, 'fft_knight_attack', 3, 5)).toBe(100);
  });

  it('Quebra de velocidade: (PA 6 + 50)% antes da evasão, tira 2 de Speed de quem leva', () => {
    const b = start();
    at(b, 'e-knight').facing = 1; // pelas costas: os 56% inteiros
    expect(chance(b, 'fft_knight_speed_break', 3, 5)).toBe(56);
    b.state.rng = seedWhere((v) => v < 0.5);
    b.act('fft_knight_speed_break', { x: 3, y: 5 });
    expect(at(b, 'e-knight').vars!.sp).toBe(-2);
  });

  it('Quebra de força tira 3 de PA: a espada do alvo cai de 24 para 12', () => {
    const b = start();
    at(b, 'e-knight').vars!.pa = -3;
    b.state.turn.actor = 'e-knight';
    expect(b.preview('fft_knight_attack', { x: 2, y: 5 }).targets[0]).toMatchObject({ dmgMin: 12, dmgMax: 12 });
  });

  it('Fogo passa só pelo escudo mágico (97% no Cavaleiro) e acaba com o MP depois de 2 usos', () => {
    const b = start();
    b.state.turn.actor = 'wizard';
    put(b, 'wizard', 0, 5);
    expect(chance(b, 'fft_wizard_fire', 3, 5)).toBe(97);
    at(b, 'wizard').vars!.mp = 5;
    expect(b.preview('fft_wizard_fire', { x: 3, y: 5 }).reason).toBe('spent');
  });

  it('IA não lança Cura em área num inimigo ferido (12/11: curava inimigos 4 701 vezes em 1 000 batalhas)', () => {
    const b = Battle.start(CLASSES_BATTLE, 1);
    b.state.turn.actor = 'priest';
    b.state.units = b.state.units.filter((u) => ['priest', 'e-knight'].includes(u.id));
    put(b, 'priest', 2, 5);
    put(b, 'e-knight', 5, 5);
    at(b, 'e-knight').hp = 10;
    expect(chooseTurn(b.grid, b.state, 'priest').ability?.id).not.toBe('fft_priest_cure');
  });

  it('fica na lista de cenários e a IA termina a batalha', () => {
    expect(SCENARIOS['fft-classes']).toBe(CLASSES_BATTLE);
    for (const seed of [1, 2, 3, 4, 5, 6]) expect(simulate(CLASSES_BATTLE, seed, 300).outcome).not.toBe('timeout');
  });
});
