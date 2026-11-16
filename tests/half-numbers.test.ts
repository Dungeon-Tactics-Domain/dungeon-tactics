import { describe, expect, it } from 'vitest';
import { itemStats, sheetRows } from '../src/client/sheet-lines.ts';
import { jumpHelp } from '../src/client/town-ui.ts';
import { ITEMS } from '../src/shared/battle/equipment.ts';
import { SUB } from '../src/shared/battle/half.ts';
import { MAX_JUMP } from '../src/shared/battle/pathing.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';

// Nov 15, Fernando: "everything in half tiles": every screen shows the Move and Jump the battle spends
describe('screens show Move and Jump in half tiles', () => {
  it('the Party screen doubles the sheet', () => {
    const rows = Object.fromEntries(sheetRows('rogue', {}).map(([k, v]) => [k, v]));
    expect(rows.Movimento).toBe(String(UNIT_DEFS.rogue.move * SUB));
    expect(rows.Salto).toBe(String((UNIT_DEFS.rogue.jump ?? MAX_JUMP) * SUB));
  });

  it('item stats double move and jump, and leave the rest', () => {
    const any = Object.values(ITEMS)[0];
    const text = itemStats({ ...any, hp: 5, physPower: undefined, hit: undefined, speed: undefined, move: 1, jump: 1 });
    expect(text).toBe('+5 vida · +2 movimento · +2 salto');
  });

  it('How to play quotes the jumps the classes have, in half tiles', () => {
    expect(jumpHelp()).toContain('o Salto do Lanceiro é 6, o do Ladino e do Lacaio 4, o dos outros 2.');
    expect(jumpHelp()).toContain('com Salto 4 ou mais também se voa 1 casa');
    expect((UNIT_DEFS.minion.jump ?? MAX_JUMP) * SUB).toBe(4); // named with the Rogue
  });
});
