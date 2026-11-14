import { describe, expect, it } from 'vitest';
import { critXa, fallDamage, hitPercent, longbowMaxRange, RAW, stat, turnCt, weaponDamage } from '../src/shared/battle/fft/formulas.ts';
import { CLASSES } from '../src/shared/battle/fft/data.ts';

// FFT reference study (Fernando's request, Nov 11). Each example below comes from the Battle Mechanics Handbook v6.1 by
// Aerostar (docs/game-design/referencia-fft.md); the section is in each test.
describe('FFT: stats from the raw value (BMG 7.1)', () => {
  it('level 1 female Squire has 28 or 29 HP (guide example)', () => {
    expect(stat(RAW.female.hp[0], CLASSES.squire.hpm)).toBe(28);
    expect(stat(RAW.female.hp[1], CLASSES.squire.hpm)).toBe(29);
  });

  it('every woman starts with 11 MP as a Squire (guide example)', () => {
    expect(stat(RAW.female.mp[0], CLASSES.squire.mpm)).toBe(11);
    expect(stat(RAW.female.mp[1], CLASSES.squire.mpm)).toBe(11);
  });

  it('level 1 male Squire: HP 30 to 31, PA 4, Speed 6', () => {
    expect([stat(RAW.male.hp[0], CLASSES.squire.hpm), stat(RAW.male.hp[1], CLASSES.squire.hpm)]).toEqual([30, 31]);
    expect(stat(RAW.male.pa, CLASSES.squire.pam)).toBe(4);
    expect(stat(RAW.male.sp, CLASSES.squire.spm)).toBe(6);
  });

  it('stat never goes below 1', () => {
    expect(stat(1, 1)).toBe(1);
  });
});

describe('FFT: ATTACK damage per weapon (BMG 2.1)', () => {
  const u = { pa: 4, ma: 3, sp: 6, brave: 70 };

  it('sword: PA * WP', () => {
    expect(weaponDamage('sword', u, 4)).toEqual([16, 16]);
  });
  it('knife: [(PA + Sp) / 2] * WP', () => {
    expect(weaponDamage('knife', { ...u, pa: 3 }, 3)).toEqual([12, 12]); // [(3 + 6) / 2] = 4
  });
  it('fist: [(PA * Br) / 100] * PA', () => {
    expect(weaponDamage('fist', u, 0)).toEqual([8, 8]); // [(4 * 70) / 100] = 2
  });
  it('axe and flail: (1..PA) * WP', () => {
    expect(weaponDamage('axe', u, 5)).toEqual([5, 20]);
  });
  it('staff: MA * WP', () => {
    expect(weaponDamage('staff', u, 3)).toEqual([9, 9]);
  });
});

describe('FFT: critical (BMG 2.1)', () => {
  it('critical XA goes from XA to 2 * XA - 1', () => {
    expect(critXa(4, 1)).toBe(4);
    expect(critXa(4, 4)).toBe(7);
  });
});

describe('FFT: physical attack hit chance (BMG 1.4)', () => {
  const ev = { c: 5, s: 10, a: 25, w: 0 };

  it('from the front, class, shield, accessory and weapon count', () => {
    expect(hitPercent(100, ev, 'front')).toBe(64); // [100 * 95 * 90 * 75 * 100 / 10^8] = 64.125
  });
  it('from the side, class evasion doesn\'t count', () => {
    expect(hitPercent(100, ev, 'side')).toBe(67); // [100 * 90 * 75 * 100 / 10^6] = 67.5
  });
  it('from behind only the accessory counts', () => {
    expect(hitPercent(100, ev, 'back')).toBe(75);
  });
  it('Squire without shield or accessory: 95% from the front', () => {
    expect(hitPercent(100, { c: 5, s: 0, a: 0, w: 0 }, 'front')).toBe(95);
  });
});

describe('FFT: CT after the turn (BMG 1.1)', () => {
  it('moving and acting costs 100, one of the two 80, neither 60', () => {
    expect(turnCt(102, true, true)).toBe(2);
    expect(turnCt(102, true, false)).toBe(22);
    expect(turnCt(102, false, true)).toBe(22);
    expect(turnCt(102, false, false)).toBe(42);
  });
  it('the leftover CT never exceeds 60', () => {
    expect(turnCt(130, false, false)).toBe(60);
  });
});

describe('FFT: height (BMG 6.5 and 6.9)', () => {
  it('a fall only hurts beyond Jump: RU{(fall - Jump) * MaxHP / 10}', () => {
    expect(fallDamage(3, 3, 30)).toBe(0);
    expect(fallDamage(5, 3, 31)).toBe(7); // RU{2 * 31 / 10} = RU{6.2}
  });
  it('longbow: 5 + [(shooter height - target height) / 2]', () => {
    expect(longbowMaxRange(0, 0)).toBe(5);
    expect(longbowMaxRange(4, 0)).toBe(7);
    expect(longbowMaxRange(0, 4)).toBe(3);
  });
});
