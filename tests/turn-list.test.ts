import { describe, expect, it } from 'vitest';
import { keepInView, roundLength } from '../src/client/turn-list.ts';

// Turn list showing every unit (Nov 15, Fernando's decision), scrolling within its column
describe('turn list round', () => {
  it('runs until every unit and every queued charge has shown once', () => {
    const rows = [
      { unit: 'a' },
      { unit: 'b' },
      { unit: 'a' },
      { unit: 'c', charge: 'blast' },
      { unit: 'a' },
      { unit: 'd' },
      { unit: 'b' },
      { unit: 'a' },
    ];
    expect(roundLength(rows)).toBe(6);
    // a charge is its own row, apart from its caster's turns
    expect(roundLength([{ unit: 'a' }, { unit: 'a', charge: 'blast' }, { unit: 'a' }])).toBe(2);
    expect(roundLength([])).toBe(0);
  });
});

describe('turn list scroll', () => {
  // view of 200 px scrolled to 100: rows from 100 to 300 show
  it('leaves the scroll alone when the row already shows', () => {
    expect(keepInView(100, 200, 100, 40)).toBe(100);
    expect(keepInView(100, 200, 260, 40)).toBe(100);
  });

  it('moves the least that brings the row in, above or below', () => {
    expect(keepInView(100, 200, 60, 40)).toBe(60);
    expect(keepInView(100, 200, 280, 40)).toBe(120);
    expect(keepInView(0, 200, 500, 40)).toBe(340);
  });

  it('shows the top of a row taller than the view', () => {
    expect(keepInView(0, 30, 100, 40)).toBe(100);
  });
});
