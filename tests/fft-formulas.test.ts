import { describe, expect, it } from 'vitest';
import { critXa, fallDamage, hitPercent, longbowMaxRange, RAW, stat, turnCt, weaponDamage } from '../src/shared/battle/fft/formulas.ts';
import { CLASSES } from '../src/shared/battle/fft/data.ts';

// Estudo de referência FFT (pedido do Fernando, 11/11). Cada exemplo abaixo sai do Battle Mechanics Handbook v6.1 do
// Aerostar (docs/game-design/referencia-fft.md); a seção vai em cada teste.
describe('FFT: stats a partir do valor bruto (BMG 7.1)', () => {
  it('Escudeira nível 1 tem 28 ou 29 de HP (exemplo do guia)', () => {
    expect(stat(RAW.female.hp[0], CLASSES.squire.hpm)).toBe(28);
    expect(stat(RAW.female.hp[1], CLASSES.squire.hpm)).toBe(29);
  });

  it('toda mulher começa com 11 de MP como Escudeira (exemplo do guia)', () => {
    expect(stat(RAW.female.mp[0], CLASSES.squire.mpm)).toBe(11);
    expect(stat(RAW.female.mp[1], CLASSES.squire.mpm)).toBe(11);
  });

  it('Escudeiro homem nível 1: HP 30 a 31, PA 4, Speed 6', () => {
    expect([stat(RAW.male.hp[0], CLASSES.squire.hpm), stat(RAW.male.hp[1], CLASSES.squire.hpm)]).toEqual([30, 31]);
    expect(stat(RAW.male.pa, CLASSES.squire.pam)).toBe(4);
    expect(stat(RAW.male.sp, CLASSES.squire.spm)).toBe(6);
  });

  it('stat nunca fica abaixo de 1', () => {
    expect(stat(1, 1)).toBe(1);
  });
});

describe('FFT: dano de ATTACK por arma (BMG 2.1)', () => {
  const u = { pa: 4, ma: 3, sp: 6, brave: 70 };

  it('espada: PA * WP', () => {
    expect(weaponDamage('sword', u, 4)).toEqual([16, 16]);
  });
  it('faca: [(PA + Sp) / 2] * WP', () => {
    expect(weaponDamage('knife', { ...u, pa: 3 }, 3)).toEqual([12, 12]); // [(3 + 6) / 2] = 4
  });
  it('punho: [(PA * Br) / 100] * PA', () => {
    expect(weaponDamage('fist', u, 0)).toEqual([8, 8]); // [(4 * 70) / 100] = 2
  });
  it('machado e mangual: (1..PA) * WP', () => {
    expect(weaponDamage('axe', u, 5)).toEqual([5, 20]);
  });
  it('cajado: MA * WP', () => {
    expect(weaponDamage('staff', u, 3)).toEqual([9, 9]);
  });
});

describe('FFT: crítico (BMG 2.1)', () => {
  it('XA do crítico vai de XA até 2 * XA - 1', () => {
    expect(critXa(4, 1)).toBe(4);
    expect(critXa(4, 4)).toBe(7);
  });
});

describe('FFT: acerto de ataque físico (BMG 1.4)', () => {
  const ev = { c: 5, s: 10, a: 25, w: 0 };

  it('de frente contam classe, escudo, acessório e arma', () => {
    expect(hitPercent(100, ev, 'front')).toBe(64); // [100 * 95 * 90 * 75 * 100 / 10^8] = 64,125
  });
  it('de lado a evasão de classe não conta', () => {
    expect(hitPercent(100, ev, 'side')).toBe(67); // [100 * 90 * 75 * 100 / 10^6] = 67,5
  });
  it('pelas costas só o acessório conta', () => {
    expect(hitPercent(100, ev, 'back')).toBe(75);
  });
  it('Escudeiro sem escudo nem acessório: 95% de frente', () => {
    expect(hitPercent(100, { c: 5, s: 0, a: 0, w: 0 }, 'front')).toBe(95);
  });
});

describe('FFT: CT depois do turno (BMG 1.1)', () => {
  it('mover e agir custa 100, um dos dois 80, nenhum 60', () => {
    expect(turnCt(102, true, true)).toBe(2);
    expect(turnCt(102, true, false)).toBe(22);
    expect(turnCt(102, false, true)).toBe(22);
    expect(turnCt(102, false, false)).toBe(42);
  });
  it('o CT que sobra nunca passa de 60', () => {
    expect(turnCt(130, false, false)).toBe(60);
  });
});

describe('FFT: altura (BMG 6.5 e 6.9)', () => {
  it('queda só machuca além do Jump: RU{(queda - Jump) * MaxHP / 10}', () => {
    expect(fallDamage(3, 3, 30)).toBe(0);
    expect(fallDamage(5, 3, 31)).toBe(7); // RU{2 * 31 / 10} = RU{6,2}
  });
  it('arco longo: 5 + [(altura do atirador - altura do alvo) / 2]', () => {
    expect(longbowMaxRange(0, 0)).toBe(5);
    expect(longbowMaxRange(4, 0)).toBe(7);
    expect(longbowMaxRange(0, 4)).toBe(3);
  });
});
