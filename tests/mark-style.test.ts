import { describe, expect, it } from 'vitest';
import { parseSpec } from '../src/client/dev/sandbox-spec.ts';
import { MARK_DEFAULT, MARK_STYLES, parseMarkStyle, pickMarkStyle } from '../src/client/mark-style.ts';
import { barYOf, MARKER, unitHeight } from '../src/client/markers.ts';
import { turnOrder } from '../src/client/turn-list.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';

// Nov 17 (Fernando): the board's marks in three lit styles plus the flat one, picked in Options with no automatic
// fallback, and each unit's place in the turn list as a number beside its health bar
describe('mark style: which one draws the board', () => {
  it('a saved style is kept, anything else is the default', () => {
    expect(MARK_STYLES).toEqual(['simples', 'luz', 'pedra', 'neon']);
    expect(MARK_STYLES.map(parseMarkStyle)).toEqual([...MARK_STYLES]);
    expect([null, '', 'Luz', 'flat', 3].map(parseMarkStyle)).toEqual(Array(5).fill(MARK_DEFAULT));
    expect(MARK_DEFAULT).toBe('luz');
  });

  it("the address's ?marks= beats the saved choice, and a typo in it falls back to the saved one", () => {
    expect(pickMarkStyle('neon', 'pedra')).toBe('neon');
    expect(pickMarkStyle(null, 'pedra')).toBe('pedra');
    expect(pickMarkStyle('neom', 'pedra')).toBe('pedra');
    expect(pickMarkStyle('', null)).toBe(MARK_DEFAULT);
    expect(pickMarkStyle(null, 'simples')).toBe('simples'); // the flat marks stay for whoever picked them
  });

  it('a spec names the style, a typo fails it, and the bench scenes are valid', () => {
    expect(parseSpec({ scenario: 'ash_wood', marks: 'pedra' }).problems).toEqual([]);
    expect(parseSpec({ scenario: 'ash_wood', marks: 'stone' }).problems).toEqual([
      'marks must be one of simples, luz, pedra, neon',
    ]);
    const scenes = import.meta.glob<{ marks: string }>('../scripts/sandbox/bench/marks-*.json', {
      import: 'default',
      eager: true,
    });
    // each style on Ash Wood and on Beacon Hill's steps
    expect(Object.keys(scenes)).toHaveLength(2 * MARK_STYLES.length);
    for (const [file, scene] of Object.entries(scenes)) {
      expect(parseSpec(scene).problems, file).toEqual([]);
      expect(file, file).toContain(`-${scene.marks}.json`);
    }
  });
});

describe('turn order on the map', () => {
  it("each unit carries the number of its next turn's row, as the list counts them", () => {
    const rows = [{ unit: 'a' }, { unit: 'b' }, { unit: 'c' }, { unit: 'a' }, { unit: 'b' }];
    expect([...turnOrder(rows)]).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
  });

  it("a charge's row counts in the list but is not its caster's turn", () => {
    // the mage's spell fires in row 2; the mage itself plays again in row 4
    const rows = [{ unit: 'a' }, { unit: 'mage', charge: 'blast' }, { unit: 'b' }, { unit: 'mage' }];
    expect(turnOrder(rows).get('mage')).toBe(4);
    expect(turnOrder(rows).get('b')).toBe(3);
  });

  it('a unit that never plays has no number, and an ended battle has none at all', () => {
    expect(turnOrder([{ unit: 'a' }]).has('beacon')).toBe(false);
    expect(turnOrder([]).size).toBe(0);
  });

  it("the number stands clear of every unit's head, the Brute and the Colossus included", () => {
    // centred on the bar's height, left of it
    for (const def of Object.keys(UNIT_DEFS))
      expect(barYOf(def) - MARKER.orderH / 2, def).toBeGreaterThan(unitHeight(def));
  });

  it("the number sits beside the bar, away from the acting unit's arrow over it", () => {
    // the arrow's cone is 0.16 wide each side of the unit's middle; the number starts past the bar's left end
    expect(MARKER.barHalfW + MARKER.orderGap).toBeGreaterThan(0.16);
    // big: at least 16 px at the whole-map zoom of a 1080p page, where a metre is about 57 px (measured, Nov 17)
    expect(MARKER.orderH * 57).toBeGreaterThanOrEqual(16);
  });
});
