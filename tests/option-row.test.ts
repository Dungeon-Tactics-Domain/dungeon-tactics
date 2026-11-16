import { describe, expect, it } from 'vitest';
import { cycle, pctAt, percent, pick } from '../src/client/option-row.ts';

describe('Options rows', () => {
  it('cycles a value forward and back around the ends', () => {
    const v = ['off', 'light', 'strong'] as const;
    expect(cycle(v, 'off', 1)).toBe('light');
    expect(cycle(v, 'strong', 1)).toBe('off');
    expect(cycle(v, 'off', -1)).toBe('strong');
    // a single value (one theme today) stays put
    expect(cycle(['fft'], 'fft', 1)).toBe('fft');
  });

  it('turns a share of the bar into 5% steps inside the floor and 100', () => {
    expect(pctAt(0.3)).toBe(30);
    expect(pctAt(0.32)).toBe(30);
    expect(pctAt(0.33)).toBe(35);
    expect(pctAt(-0.2)).toBe(0);
    expect(pctAt(1.4)).toBe(100);
    expect(pctAt(0.1, 40)).toBe(40);
  });

  it('steps a percent row by 5 and stops at its ends', () => {
    let v = 95;
    const row = percent(
      'Music',
      '',
      () => v,
      (n) => (v = n),
      40,
    );
    row.step(1);
    row.step(1);
    expect(v).toBe(100);
    expect(row.text()).toBe('100%');
    v = 45;
    row.step(-1);
    row.step(-1);
    expect(v).toBe(40);
    row.bar?.set(72);
    expect(v).toBe(70);
  });

  it('shows the chosen value by its text and steps to the next', () => {
    let v = 0;
    const row = pick<number>(
      'Pixel size',
      '',
      [
        [0, 'Off'],
        [2, '2 px'],
        [3, '3 px'],
      ],
      () => v,
      (n) => (v = n),
    );
    expect(row.text()).toBe('Off');
    row.step(-1);
    expect(row.text()).toBe('3 px');
    row.step(1);
    expect(v).toBe(0);
  });
});
