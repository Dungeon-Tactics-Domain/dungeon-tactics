import { describe, expect, it } from 'vitest';
import { SURVIVE_TURNS, survivalCols } from '../src/client/survival.ts';
import { roomLine, tallyLine } from '../src/client/tally.ts';

const hero = (hp: number) => ({ hp, dmg: 12, kills: 2 });

// the result board's card line, where the lab mockup had the EXP gained (XP and levels are cancelled)
describe('result board card lines', () => {
  it('a standing hero shows what it did; a fallen one says so', () => {
    expect(tallyLine(hero(20))).toEqual(['12 de dano · 2 derrubados', '']);
    expect(tallyLine(hero(0))).toEqual(['Caído', 'fell']);
  });

  it('an expedition room shows the life carried into the next room, the recovery applied', () => {
    expect(roomLine(hero(20), { hp: 35, max: 50 })).toEqual(['Segue com 35/50 de vida', 'gain']);
    expect(roomLine(hero(0), { hp: 13, max: 50 })).toEqual(['Caiu · volta com 13/50 de vida', 'fell']);
  });

  it('with nothing carried (expedition lost or finished) it falls back to the tally', () => {
    expect(roomLine(hero(20))).toEqual(tallyLine(hero(20)));
    expect(roomLine(hero(0))[1]).toBe('fell');
  });

  it("Until Dawn's columns: the turns held, and the record called new only when beaten", () => {
    expect(survivalCols(12, 9)).toEqual([
      ['Turnos', `12 de ${SURVIVE_TURNS}`],
      ['Recorde', '12, novo!'],
    ]);
    expect(survivalCols(8, 9)[1]).toEqual(['Recorde', '9']);
  });
});
