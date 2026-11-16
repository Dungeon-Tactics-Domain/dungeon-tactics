import { describe, expect, it } from 'vitest';
import {
  abilityDetail,
  attrRows,
  regenLine,
  shortOf,
  spendNote,
  unitStatus,
} from '../src/client/battle-text.ts';
import { cursorInfo, tileInfo } from '../src/client/tile-info.ts';
import { ABILITIES } from '../src/shared/battle/abilities.ts';
import { GARILAND, registerFftStudy } from '../src/shared/battle/fft/gariland.ts';
import { tileAt } from '../src/shared/battle/grid.ts';
import { halve } from '../src/shared/battle/half.ts';
import { initialState, SCENARIOS } from '../src/shared/battle/scenarios.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';
import { flat, HIT_SEED, stateOf } from './battle-helpers.ts';

// Status window and tile info (Nov 12, FFT style): what shows for each unit and tile
registerFftStudy();

describe('mana and stamina in words (Nov 16)', () => {
  it('Status shows the pool left, its max and regen; the cost and what is missing read in words', () => {
    const s = initialState(SCENARIOS.skirmish, 1);
    const w = s.units.find((u) => u.id === 'h-warrior')!;
    w.vars = { stamina: 20 };
    expect(Object.fromEntries(unitStatus(s, 'h-warrior')).Stamina).toBe('20/50, +5 de stamina por turno');
    expect(shortOf(w, ABILITIES.heavy_strike)).toBe('faltam 10 de stamina');
    expect(spendNote(w, ABILITIES.shield_bash)).toBe('Gasta 10 stamina: 20 → 10');
    expect(abilityDetail('heal')).toContain('gasta 20 mana');
    expect(regenLine(UNIT_DEFS.mage)).toBe('+8 de mana por turno');
  });
});

describe('status window', () => {
  it('game unit: side, health, CT, speed, movement, jump and abilities', () => {
    const s = initialState(SCENARIOS.skirmish, 1);
    const rows = Object.fromEntries(unitStatus(s, 'h-warrior'));
    expect(rows).toMatchObject({
      Lado: 'herói',
      Vida: '210/210',
      CT: '0/100',
      Velocidade: '8',
      Movimento: '4',
      Salto: '1',
      'Poder físico': '0',
      'Poder mágico': '0',
      'Resistência física': '+10%',
      'Resistência mágica': '0%',
      Esquiva: '5%',
    });
    expect(rows.Elementos).toBeUndefined(); // only when the unit has one
    expect(rows.Habilidades).toBe('Golpe, Golpe pesado, Escudada, Giro');
    expect(rows.Brave).toBeUndefined();
  });

  // the Nov 15 grill's attributes, from the Mechanics lab's sheet: a weakness shows with its minus sign
  it('enemy: resistances, weaknesses and elements', () => {
    const rows = Object.fromEntries(unitStatus(initialState(SCENARIOS.skirmish, 1), 'e-mage'));
    expect(rows).toMatchObject({
      'Resistência física': '−10%',
      'Resistência mágica': '+30%',
      Esquiva: '0%',
      Elementos: 'sombra +50% · luz −25%',
    });
  });

  // the sheet shows each power apart (Nov 15 grill: physical on martial abilities, magic on spells)
  it('physical and magic power show apart', () => {
    const rows = Object.fromEntries(attrRows({ ...UNIT_DEFS.warrior, physPower: 10, magPower: 15 }));
    expect(rows).toMatchObject({ 'Poder físico': '10', 'Poder mágico': '15' });
  });

  it('FFT study: Brave, Faith, weapon, gained bonus and the charge in progress', () => {
    const s = initialState(GARILAND, 1);
    const ramza = s.units.find((u) => u.id === 'ramza')!;
    ramza.vars!.pa = 1;
    s.charges = [{ unit: 'ramza', ability: 'fft_ramza_dash', target: { x: 7, y: 2 }, follow: null, ticks: 3 }];
    const rows = Object.fromEntries(unitStatus(s, 'ramza'));
    expect(rows).toMatchObject({
      Brave: '60',
      Fé: '60',
      Arma: 'broad sword',
      'Força (PA)': '5 (+1)',
      Salto: '3',
      'Olhando para': 'sul',
    });
    expect(rows.Carregando).toBe('Investida, sai em 3 tiques');
  });

  it('a half-tile token shows Move and Jump in cells, doubled (Nov 15)', () => {
    const s = initialState(halve(SCENARIOS.skirmish), 1);
    expect(Object.fromEntries(unitStatus(s, 'h-warrior'))).toMatchObject({ Movimento: '8', Salto: '2' });
    expect(Object.fromEntries(unitStatus(initialState(halve(GARILAND), 1), 'ramza')).Salto).toBe('6');
  });

  it('Chemist shows the potion stock', () => {
    const rows = Object.fromEntries(unitStatus(initialState(GARILAND, 1), 'chemist'));
    expect(rows.Poções).toBe('4');
  });
});

describe('tile info', () => {
  it('position, height, ramp and floor of the map', () => {
    expect(tileInfo(GARILAND.grid, { x: 4, y: 2 })).toBe('Casa 4,2 · altura 6 (rampa) · telhado');
    expect(tileInfo(GARILAND.grid, { x: 2, y: 0 })).toBe('Casa 2,0 · altura 5 · árvore · não dá para pisar');
    expect(tileInfo(SCENARIOS.skirmish.grid, { x: 2, y: 1 })).toBe('Casa 2,1 · altura 0 · árvore · não dá para pisar');
  });

  it('deep and shallow water (same drawing) are told apart by the text', () => {
    expect(tileInfo(SCENARIOS.crypt_heart.grid, { x: 0, y: 3 })).toBe(
      'Casa 0,3 · altura 0 · água · funda: não se age nela',
    );
    expect(tileInfo(SCENARIOS.crypt_heart.grid, { x: 0, y: 7 })).toBe('Casa 0,7 · altura 0 · água · rasa');
  });
});

// a token's square is hit by a charge if any of its cells is in the area (combat.ts) and hurt by spikes on any cell (battle.ts)
describe('cursor info for a square', () => {
  const g = flat(8, 8);
  tileAt(g, { x: 3, y: 2 }).spikes = true;
  const state = stateOf([{ id: 'b', def: 'soldier', team: 'enemy', x: 6, y: 6 }], HIT_SEED);
  state.charges = [{ unit: 'b', ability: 'strike', target: { x: 2, y: 3 }, follow: null, ticks: 3 }];

  it('warns of a charge or spikes under any cell of the square, not only its corner', () => {
    expect(cursorInfo(g, state, { x: 2, y: 2 })).toBe('Casa 2,2 · altura 0 · chão');
    const square = cursorInfo(g, state, { x: 2, y: 2 }, 2);
    expect(square).toContain('espinhos');
    expect(square).toContain('vai cair aqui');
  });

  it('the part of the square off the map is ignored', () => {
    expect(cursorInfo(g, state, { x: 7, y: 7 }, 2)).toBe('Casa 7,7 · altura 0 · chão');
  });
});
