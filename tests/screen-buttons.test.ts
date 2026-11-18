import { describe, expect, it } from 'vitest';
import { buttonsOn, parseButtons } from '../src/client/screen-buttons.ts';

// Fernando, Nov 18 night: Undo and ↺ ↻ on the screen by default where a finger points, off on a PC; Options keeps the pick
describe('screen buttons: on by device until Options picks', () => {
  it('nothing saved: on for a finger, off for a mouse', () => {
    expect(buttonsOn(null, true)).toBe(true);
    expect(buttonsOn(null, false)).toBe(false);
  });
  it('a saved pick wins on any device', () => {
    for (const coarse of [true, false]) {
      expect(buttonsOn(true, coarse)).toBe(true);
      expect(buttonsOn(false, coarse)).toBe(false);
    }
  });
  it('only a yes or a no is a pick', () => {
    expect([parseButtons(true), parseButtons(false)]).toEqual([true, false]);
    for (const v of [null, undefined, 'true', 1, {}]) expect(parseButtons(v)).toBeNull();
  });
});
