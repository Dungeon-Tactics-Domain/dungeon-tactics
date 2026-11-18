import { describe, expect, it } from 'vitest';
import { awayFactor, wentAway } from '../src/client/away.ts';

// Fernando, Nov 18 (phone and tablet): the game pauses while the tab or the app is in the background
describe('back from the background', () => {
  it('a frame counts its whole time while the page was never away', () => {
    expect(awayFactor(false)).toBe(1);
  });

  it('the first frame back drops the time away, the next ones count again', () => {
    wentAway();
    expect(awayFactor(false)).toBe(0);
    expect(awayFactor(false)).toBe(1);
  });

  it('a frame drawn while still hidden does not use the skip up', () => {
    wentAway();
    expect(awayFactor(true)).toBe(1);
    expect(awayFactor(false)).toBe(0);
  });
});
