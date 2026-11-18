import { describe, expect, it } from 'vitest';
import { moreBelow, scrollPick, scrollStep } from '../src/client/window-scroll.ts';

// The Party's page at 1024x768 (Nov 18 tablet review): 644 px seen of 758, scrolled by PgDn, the right stick or the cue
describe('window scroll', () => {
  const page = (top: number) => ({ top, view: 644, height: 758 });
  it('says there is more below until the end, with 2 px of slack', () => {
    expect(moreBelow(page(0))).toBe(true);
    expect(moreBelow(page(111))).toBe(true);
    expect(moreBelow(page(113))).toBe(false); // a zoomed page stops a fraction short
    expect(moreBelow(page(114))).toBe(false);
    expect(moreBelow({ top: 0, view: 588, height: 588 })).toBe(false); // it all fits: no cue
  });
  it('moves the first box that can go that way, the focused one first', () => {
    const list = { top: 0, view: 300, height: 300 }; // the roster fits
    expect(scrollPick([list, page(0)], 1)).toBe(1);
    expect(scrollPick([page(0), list], 1)).toBe(0);
    expect(scrollPick([list, page(0)], -1)).toBe(-1); // nothing above: the key goes on to the browser
    expect(scrollPick([list, page(114)], 1)).toBe(-1);
    expect(scrollPick([list, page(114)], -1)).toBe(1);
  });
  it('steps a page less one row, never less than a row', () => {
    expect(scrollStep(page(0), 1)).toBe(596);
    expect(scrollStep(page(0), -1)).toBe(-596);
    expect(scrollStep({ top: 0, view: 40, height: 400 }, 1)).toBe(48);
  });
});
