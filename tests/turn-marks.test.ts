import { describe, expect, it } from 'vitest';
import { freshUi, hoverTile, selectMode } from '../src/client/interaction.ts';
import { turnMarks } from '../src/client/turn-marks.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { flat, stateOf } from './battle-helpers.ts';

const at = (x: number, y = 0) => ({ x, y });
// current archer with a soldier in its line of fire
const scene = () =>
  new Battle(
    flat(8, 3),
    stateOf([
      { id: 'a', def: 'archer', team: 'hero', x: 0, y: 1 },
      { id: 'e', def: 'soldier', team: 'enemy', x: 5, y: 1 },
    ]),
  );

describe('turn marks', () => {
  it('marks nothing while the game is busy or the enemy plays', () => {
    const b = scene();
    const m = turnMarks(b, { k: 'menu', index: 0 }, freshUi(b), at(0, 1), false);
    expect(m).toMatchObject({ hl: null, cursor: null, ring: null, charge: null, counters: null });
  });

  it('on the menu marks only the acting unit, with the ring of its longest range around it', () => {
    const b = scene();
    const m = turnMarks(b, { k: 'menu', index: 0 }, freshUi(b), at(0, 1), true);
    expect(m.hl?.tiles).toEqual([{ pos: at(0, 1), kind: 'actor' }]);
    expect(m.cursor).toEqual(at(0, 1));
    expect(m.ring?.from).toEqual([at(0, 1)]);
  });

  it('choosing where to move, the ring follows a cursor on a tile the move reaches', () => {
    const b = scene();
    const ui = hoverTile(b, selectMode(b, freshUi(b), { k: 'move' }), at(1, 1));
    expect(turnMarks(b, { k: 'map', command: 'move' }, ui, at(1, 1), true).ring?.from).toEqual([at(1, 1)]);
    expect(turnMarks(b, { k: 'map', command: 'move' }, ui, at(7, 0), true).ring?.from).toEqual([at(0, 1)]);
  });

  it('the facing screen draws no range ring', () => {
    const b = scene();
    expect(turnMarks(b, { k: 'facing' }, freshUi(b), at(5, 1), true).ring).toBeNull();
  });
});
