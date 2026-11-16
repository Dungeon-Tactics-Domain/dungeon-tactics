import { describe, expect, it } from 'vitest';
import { fatal, numberKind, numberPx, parseSlowmo, shoved } from '../src/client/hit-weight.ts';
import type { BattleEvent } from '../src/shared/battle/types.ts';

describe('numberPx: the number grows with the share of life it takes', () => {
  it('keeps the old sizes at 10% and 25% and stops at 56 (x1.4 on a strong strike)', () => {
    expect(numberPx(21, 210)).toBe(26); // 10%
    expect(numberPx(50, 200, false)).toBe(38); // 25%, without the strong look
    expect(numberPx(50, 200)).toBe(53); // 25% is a strong strike: 38 x 1.4
    expect(numberPx(2000, 200)).toBe(78); // capped: 56 x 1.4
    expect(numberPx(5, 500)).toBe(19); // a scratch stays readable
  });
  it('reads the share of life, not the damage: the x5 numbers keep the size, the same damage on 5x life shrinks', () => {
    expect(numberPx(12, 42)).toBe(57); // the old scale: 29% of life, a strong strike
    expect(numberPx(60, 210)).toBe(57); // life and damage x5
    expect(numberPx(60, 1050)).toBe(23); // 60 on five times the life: 6%, a plain hit
  });
});

describe('numberKind: the colour by kind', () => {
  const hit: BattleEvent = { k: 'hit', unit: 'a', dmg: 10, chance: 90 };
  it('white physical, violet magic, green heal, grey miss', () => {
    expect(numberKind(hit, false)).toBe('phys');
    expect(numberKind(hit, true)).toBe('magic');
    expect(numberKind({ k: 'heal', unit: 'a', amount: 5 }, true)).toBe('heal');
    expect(numberKind({ k: 'miss', unit: 'a', chance: 50 }, true)).toBe('miss');
  });
  it('push, wall, fall and spikes are physical even after a spell', () => {
    expect(numberKind({ k: 'bump', unit: 'a', dmg: 25 }, true)).toBe('phys');
    expect(numberKind({ k: 'fall', unit: 'a', levels: 2, dmg: 45 }, true)).toBe('phys');
    expect(numberKind({ k: 'spike', unit: 'a', dmg: 50 }, true)).toBe('phys');
  });
});

describe('fatal: the damage that downs its unit', () => {
  const ev: BattleEvent[] = [
    { k: 'attack', unit: 'h', ability: 'shield_bash', target: { x: 0, y: 0 } },
    { k: 'hit', unit: 'e', dmg: 30, chance: 90 },
    { k: 'push', unit: 'e', to: { x: 1, y: 0 } },
    { k: 'hit', unit: 'f', dmg: 99, chance: 90 },
    { k: 'die', unit: 'f' },
    { k: 'fall', unit: 'e', levels: 3, dmg: 90 },
    { k: 'die', unit: 'e' },
  ];
  it('is the last damage before the death, with pushes and other units between', () => {
    expect(ev.map((_, i) => fatal(ev, i))).toEqual([false, false, false, true, false, true, false]);
  });
});

describe('shoved: a strike whose push moves the body, so it gets no recoil', () => {
  const ev: BattleEvent[] = [
    { k: 'attack', unit: 'h', ability: 'shield_bash', target: { x: 0, y: 0 } },
    { k: 'hit', unit: 'e', dmg: 15, chance: 90 },
    { k: 'hit', unit: 'f', dmg: 15, chance: 90 },
    { k: 'bump', unit: 'f', dmg: 25 },
    { k: 'attack', unit: 'e', ability: 'strike', target: { x: 1, y: 0 } },
    { k: 'hit', unit: 'h', dmg: 9, chance: 90 },
    { k: 'push', unit: 'e', to: { x: 2, y: 0 } },
  ];
  it('looks only until the next attack', () => {
    expect([1, 2, 5].map((i) => shoved(ev, i))).toEqual([false, true, false]);
  });
});

describe('parseSlowmo: the death slow motion option', () => {
  it('is on by default and off only when saved off', () => {
    expect([null, undefined, true, 'false', 0, {}].map(parseSlowmo)).toEqual([true, true, true, true, true, true]);
    expect(parseSlowmo(false)).toBe(false);
  });
});
