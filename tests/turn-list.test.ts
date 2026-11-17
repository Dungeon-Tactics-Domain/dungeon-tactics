import { describe, expect, it } from 'vitest';
import { t } from '../src/client/i18n.ts';
import {
  anchorScroll,
  keepInView,
  pageStep,
  roundLength,
  statsText,
  twoRounds,
  unitStats,
} from '../src/client/turn-list.ts';
import { withGear } from '../src/shared/battle/equipment.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';
import { stateOf } from './battle-helpers.ts';

// Life and CT on each row (Nov 17, Fernando): the number, what comes back each turn and what the CT gains each tick
describe('turn list unit stats', () => {
  const unit = (def: string, hp: number, ct: number) => {
    const u = stateOf([{ id: 'u', def, team: 'hero', x: 0, y: 0 }]).units[0];
    return { ...u, hp, ct };
  };

  it('reads life, its max, CT and the CT gained each tick (the speed) from the unit and its sheet', () => {
    const d = UNIT_DEFS.mage;
    expect(unitStats(unit('mage', 53, 40))).toEqual({
      hp: 53,
      hpMax: d.hp,
      hpRegen: 0,
      ct: 40,
      ctMax: 100,
      ctGain: d.speed,
    });
  });

  it('keeps CT within 0 and 100 and life at 0 or more, as the sheet shows them', () => {
    expect(unitStats(unit('mage', -5, 130))).toMatchObject({ hp: 0, ct: 100 });
    expect(unitStats(unit('mage', 10, -20))).toMatchObject({ ct: 0 });
  });

  it('takes the life regen and the speed of the sheet with its pieces on', () => {
    UNIT_DEFS['test-regen'] = { ...withGear(UNIT_DEFS.mage, undefined), id: 'test-regen', hpRegen: 4, speed: 9 };
    try {
      expect(unitStats(unit('test-regen', 53, 40))).toMatchObject({ hpRegen: 4, ctGain: 9 });
    } finally {
      delete UNIT_DEFS['test-regen'];
    }
  });

  it('writes the short lines with a "+" only for what the unit gains, and says per turn and per tick in the long one', () => {
    const s = { hp: 53, hpMax: 120, hpRegen: 4, ct: 40, ctMax: 100, ctGain: 8 };
    const life = t('Vida', 'HP');
    expect(statsText(s)).toEqual({
      hp: `${life} 53/120 +4`,
      ct: 'CT 40/100 +8',
      long: `${life} 53/120${t(' (+4 por turno)', ' (+4 per turn)')} · CT 40/100${t(' (+8 por tique)', ' (+8 per tick)')}`,
    });
    const none = statsText({ ...s, hpRegen: 0 });
    expect(none.hp).toBe(`${life} 53/120`);
    expect(none.long).not.toContain('+4');
  });
});

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

describe('turn list rounds', () => {
  it('marks the current round and the next, and stops at the end of the next', () => {
    const rows = [
      { unit: 'a' },
      { unit: 'b' },
      { unit: 'c', charge: 'blast' },
      { unit: 'a' },
      { unit: 'c' },
      { unit: 'a' },
      { unit: 'b' },
      { unit: 'c' },
      { unit: 'a' },
      { unit: 'b' },
    ];
    expect(twoRounds(rows).map((r) => r.round)).toEqual([1, 1, 1, 1, 1, 2, 2, 2]);
    // a fired charge does not come back: round 2 waits only for the units
    expect(twoRounds([{ unit: 'a' }, { unit: 'a', charge: 'x' }, { unit: 'a' }])).toEqual([
      { unit: 'a', round: 1 },
      { unit: 'a', charge: 'x', round: 1 },
      { unit: 'a', round: 2 },
    ]);
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

  it('after a redraw: the charge row in view, else a new turn goes back to NOW and the same turn keeps the scroll', () => {
    expect(anchorScroll(150, 200, false, null)).toBe(150);
    expect(anchorScroll(150, 200, true, null)).toBe(0);
    expect(anchorScroll(0, 200, true, { top: 400, height: 40 })).toBe(240);
    expect(anchorScroll(300, 200, false, { top: 340, height: 40 })).toBe(300);
  });

  it('a page step leaves one row of the last page in view, and never moves less than a row', () => {
    expect(pageStep(500, 46)).toBe(454);
    expect(pageStep(30, 46)).toBe(46);
  });
});
