import { describe, expect, it } from 'vitest';
import { abilityDetail, abilityPages, attrRows, regenLine, shortOf, unitStatus } from '../src/client/battle-text.ts';
import { cursorInfo, tileHeight, tileInfo } from '../src/client/tile-info.ts';
import { ABILITIES } from '../src/shared/battle/abilities.ts';
import { tileAt } from '../src/shared/battle/grid.ts';
import { halve } from '../src/shared/battle/half.ts';
import { initialState, SCENARIOS } from '../src/shared/battle/scenarios.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';
import { flat, HIT_SEED, stateOf } from './battle-helpers.ts';

// Status window and tile info (Nov 12, FFT style): what shows for each unit and tile

describe('mana and stamina in words (Nov 16)', () => {
  it('Status shows the pool left, its max and regen; the cost and what is missing read in words', () => {
    const s = initialState(SCENARIOS.skirmish, 1);
    const w = s.units.find((u) => u.id === 'h-warrior')!;
    w.vars = { stamina: 20 };
    expect(Object.fromEntries(unitStatus(s, 'h-warrior')).Stamina).toBe('20/50, +5 de stamina por turno');
    expect(shortOf(w, ABILITIES.heavy_strike)).toBe('faltam 10 de stamina');
    expect(abilityDetail('heal')).toContain('gasta 20 mana');
    expect(regenLine(UNIT_DEFS.mage)).toBe('+8 de mana por turno · +3 de stamina por turno');
  });

  it('life regen from the pieces shows on Status and on the party sheet line', () => {
    const s = initialState(SCENARIOS.skirmish, 1);
    const w = s.units.find((u) => u.id === 'h-warrior')!;
    UNIT_DEFS.t_status_regen = { ...UNIT_DEFS.warrior, id: 't_status_regen', hpRegen: 10 };
    w.def = 't_status_regen';
    expect(Object.fromEntries(unitStatus(s, 'h-warrior')).Vida).toBe('210/210, +10 de vida por turno');
    expect(regenLine(UNIT_DEFS.t_status_regen)).toBe(
      '+3 de mana por turno · +5 de stamina por turno · +10 de vida por turno',
    );
    expect(Object.fromEntries(unitStatus(initialState(SCENARIOS.skirmish, 1), 'h-warrior')).Vida).toBe('210/210');
  });
});

describe('ability facts in three groups', () => {
  it('splits the help line facts in three groups without changing the line', () => {
    const [hit, , cost] = abilityPages('heal');
    expect(hit.some((l) => l.startsWith('cura'))).toBe(true);
    expect(cost[0]).toBe('gasta 20 mana');
    for (const id of Object.keys(ABILITIES)) expect(abilityPages(id).flat().join(' · ')).toBe(abilityDetail(id));
    expect(abilityPages('strike')[1]).toEqual([]);
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
      Velocidade: '8 de CT por tique',
      Movimento: '4 casas',
      Salto: '1 casa',
      'Poder físico': '0',
      'Poder mágico': '0',
      'Resistência física': '+10%',
      'Resistência mágica': '0%',
      Esquiva: '5%',
    });
    expect(rows.Elementos).toBeUndefined(); // only when the unit has one
    expect(rows.Habilidades).toBe('Golpe, Golpe pesado, Escudada, Giro, Rajada');
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

  it('Status shows where the unit faces and the charge in progress', () => {
    const s = initialState(SCENARIOS.skirmish, 1);
    const mage = s.units.find((u) => u.def === 'mage')!;
    mage.facing = 0;
    s.charges = [{ unit: mage.id, ability: 'blast', target: { x: 0, y: 0 }, follow: null, ticks: 3 }];
    const rows = Object.fromEntries(unitStatus(s, mage.id));
    expect(rows['Olhando para']).toBe('sul');
    expect(rows.Carregando).toBe('Explosão, sai em 3 tiques');
  });

  it('a half-tile token shows Move and Jump in cells, doubled (Nov 15)', () => {
    const s = initialState(halve(SCENARIOS.skirmish), 1);
    // with their unit (Nov 18 review: "Movimento 10" said nothing)
    expect(Object.fromEntries(unitStatus(s, 'h-warrior'))).toMatchObject({
      Movimento: '8 meias casas',
      Salto: '2 meias casas',
    });
  });
});

describe('tile info', () => {
  // Fernando, Nov 18: X, Y and Z by name; Z is the Height corner's number (tileHeight)
  it('X, Y, Z, ramp and floor of the map', () => {
    expect(tileInfo(SCENARIOS.beacon_hill.grid, { x: 0, y: 1 })).toBe('X 0 · Y 1 · Z 1 (rampa) · grama');
    expect(tileInfo(SCENARIOS.skirmish.grid, { x: 2, y: 1 })).toBe('X 2 · Y 1 · Z 0 · árvore · não dá para pisar');
  });

  it('deep and shallow water (same drawing) are told apart by the text', () => {
    expect(tileInfo(SCENARIOS.crypt_heart.grid, { x: 0, y: 3 })).toBe(
      'X 0 · Y 3 · Z 0 · água · funda: não se age nela',
    );
    expect(tileInfo(SCENARIOS.crypt_heart.grid, { x: 0, y: 7 })).toBe('X 0 · Y 7 · Z 0 · água · rasa');
    // the number alone, for the reference's "Height" corner: the same one the line says
    expect(tileHeight(SCENARIOS.beacon_hill.grid, { x: 0, y: 1 })).toBe(1);
    expect(tileHeight(SCENARIOS.crypt_heart.grid, { x: 0, y: 7 })).toBe(0);
  });
});

// a token's square is hit by a charge if any of its cells is in the area (combat.ts) and hurt by spikes on any cell (battle.ts)
describe('cursor info for a square', () => {
  const g = flat(8, 8);
  tileAt(g, { x: 3, y: 2 }).spikes = true;
  const state = stateOf([{ id: 'b', def: 'soldier', team: 'enemy', x: 6, y: 6 }], HIT_SEED);
  state.charges = [{ unit: 'b', ability: 'strike', target: { x: 2, y: 3 }, follow: null, ticks: 3 }];

  it('warns of a charge or spikes under any cell of the square, not only its corner', () => {
    expect(cursorInfo(g, state, { x: 2, y: 2 })).toBe('X 2 · Y 2 · Z 0 · chão');
    const square = cursorInfo(g, state, { x: 2, y: 2 }, 2);
    expect(square).toContain('espinhos');
    expect(square).toContain('vai cair aqui');
  });

  it('the part of the square off the map is ignored', () => {
    expect(cursorInfo(g, state, { x: 7, y: 7 }, 2)).toBe('X 7 · Y 7 · Z 0 · chão');
  });
});
