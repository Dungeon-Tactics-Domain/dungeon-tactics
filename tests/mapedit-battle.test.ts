import { describe, expect, it } from 'vitest';
import { PALETTE } from '../src/content/map-palette.ts';
import { type BattleDoc, blankBattle } from '../src/shared/mapedit/battle.ts';
import { blankDoc } from '../src/shared/mapedit/doc.ts';
import { paint } from '../src/shared/mapedit/edit.ts';
import { record, startHistory, undo } from '../src/shared/mapedit/history.ts';
import { placeUnit, removeUnit, setLife, turnUnit, unitOn } from '../src/shared/mapedit/units.ts';

// Units belong to the battle document on a ready map (the future battle builder), never to the map itself
const battle = (w = 6, h = 6): BattleDoc => blankBattle(blankDoc(w, h));
const rock = PALETTE.find((e) => e.id === 'rock')!;

describe('battle document units', () => {
  it('places, turns, sets life and removes', () => {
    let d = placeUnit(battle(), { x: 1, y: 1 }, 'warrior', 'hero');
    d = placeUnit(d, { x: 1, y: 4 }, 'soldier', 'enemy');
    expect(unitOn(d, { x: 1, y: 1 })).toMatchObject({ def: 'warrior', team: 'hero', facing: 0 }); // faces the soldier, +y
    d = turnUnit(d, { x: 1, y: 1 }, 1);
    expect(unitOn(d, { x: 1, y: 1 })!.facing).toBe(1);
    expect(turnUnit(d, { x: 1, y: 1 }, 4)).toBe(d);
    d = turnUnit(d, { x: 1, y: 1 }, -2);
    expect(unitOn(d, { x: 1, y: 1 })!.facing).toBe(3);
    d = setLife(d, { x: 1, y: 1 }, 40);
    expect(unitOn(d, { x: 1, y: 1 })!.hp).toBe(40);
    expect(setLife(d, { x: 1, y: 1 }, 40)).toBe(d);
    d = setLife(d, { x: 1, y: 1 }, undefined);
    expect(unitOn(d, { x: 1, y: 1 })!.hp).toBeUndefined();
    d = removeUnit(d, { x: 1, y: 1 });
    expect(unitOn(d, { x: 1, y: 1 })).toBeUndefined();
    expect(d.units).toHaveLength(1);
  });

  it('gives each placed unit its own id and replaces whoever stood there', () => {
    let d = placeUnit(battle(), { x: 1, y: 1 }, 'warrior', 'hero');
    d = placeUnit(d, { x: 2, y: 1 }, 'archer', 'hero');
    expect(new Set(d.units.map((u) => u.id)).size).toBe(2);
    d = placeUnit(d, { x: 1, y: 1 }, 'mage', 'hero');
    expect(d.units.map((u) => u.def).sort()).toEqual(['archer', 'mage']);
  });

  it('refuses a wall, an unknown class, a big unit off the edge, and a life outside 1..999', () => {
    const d = blankBattle(paint(blankDoc(4, 4), { x: 0, y: 0 }, rock));
    expect(placeUnit(d, { x: 0, y: 0 }, 'warrior', 'hero')).toBe(d);
    expect(placeUnit(d, { x: 1, y: 1 }, 'nobody', 'hero')).toBe(d);
    expect(placeUnit(d, { x: 3, y: 3 }, 'colossus', 'enemy')).toBe(d);
    const one = placeUnit(d, { x: 1, y: 1 }, 'warrior', 'hero');
    expect(setLife(one, { x: 1, y: 1 }, 0)).toBe(one);
    expect(setLife(one, { x: 1, y: 1 }, 1000)).toBe(one);
  });

  it('finds a big unit from any tile of its square', () => {
    const d = placeUnit(battle(), { x: 2, y: 2 }, 'colossus', 'enemy');
    expect(unitOn(d, { x: 3, y: 3 })?.def).toBe('colossus');
  });

  it('undoes a placement with the same history as the map builder', () => {
    const d = battle();
    const h = undo(record(startHistory(d), placeUnit(d, { x: 1, y: 1 }, 'warrior', 'hero')));
    expect(h.present).toBe(d);
  });
});
