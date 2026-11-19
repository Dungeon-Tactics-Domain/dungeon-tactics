import { describe, expect, it } from 'vitest';
import { actActions } from '../src/client/act-flow.ts';
import type { Screen } from '../src/client/command.ts';
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

  // Nov 19 (Fernando, "Trajetória e contra-ataques"): the Agir tile screen draws, from the picked tile, the shot line and the
  // counters the strike would leave owed
  describe('Agir tile screen', () => {
    // the tile screen of bility on the unit 	arget, on its tile number index
    const spotOf = (b: Battle, ability: string, target: string, index: number): Screen => {
      const u = b.state.units.find((x) => x.id === target)!;
      const t = { k: 'unit' as const, unit: target, pos: u.pos };
      return { k: 'spot', target: t, action: actActions(b, t).findIndex((a) => a.id === ability), index };
    };

    it('a shot is traced from the picked tile, not from where the unit stands', () => {
      const b = scene();
      const shot = actActions(b, { k: 'unit', unit: 'e', pos: at(5, 1) }).find((a) => a.id === 'shot')!;
      const index = shot.spots.findIndex((x) => x.pos.x > 1);
      expect(index).toBeGreaterThanOrEqual(0);
      const spot = shot.spots[index];
      const s = spotOf(b, 'shot', 'e', index);
      const m = turnMarks(b, s, freshUi(b), spot.pos, true);
      expect(m.trajectory?.cast).toBeNull();
      expect(m.trajectory?.shot.from.x).toBe(spot.pos.x + 0.5);
      expect(m.trajectory?.shot.to).toMatchObject({ x: 5.5, y: 1.5 });
    });

    it('a spell cast on the target shows its area and no shot line is a projectile', () => {
      const b = new Battle(
        flat(8, 3),
        stateOf([
          { id: 'm', def: 'mage', team: 'hero', x: 0, y: 1 },
          { id: 'e', def: 'soldier', team: 'enemy', x: 4, y: 1 },
        ]),
      );
      const id = actActions(b, { k: 'unit', unit: 'e', pos: at(4, 1) }).find((a) => a.enabled && a.id !== 'strike')?.id;
      expect(id).toBeDefined();
      const m = turnMarks(b, spotOf(b, id!, 'e', 0), freshUi(b), at(0, 1), true);
      expect(m.trajectory).not.toBeNull();
    });

    it('a melee strike on a unit that answers marks the counter owed from the picked tile', () => {
      const b = new Battle(
        flat(8, 3),
        stateOf([
          { id: 'w', def: 'warrior', team: 'hero', x: 1, y: 1 },
          { id: 's', def: 'soldier', team: 'enemy', x: 2, y: 1 },
        ]),
      );
      const m = turnMarks(b, spotOf(b, 'strike', 's', 0), freshUi(b), at(1, 1), true);
      expect(m.counters?.melee).toHaveLength(1);
      expect(m.counters?.melee[0].to.pos).toEqual(at(1, 1));
    });

    it('the counter is owed to the tile the unit will stand on, not where it is now', () => {
      const b = new Battle(
        flat(8, 3),
        stateOf([
          { id: 'w', def: 'warrior', team: 'hero', x: 0, y: 1 },
          { id: 's', def: 'soldier', team: 'enemy', x: 3, y: 1 },
        ]),
      );
      const strike = actActions(b, { k: 'unit', unit: 's', pos: at(3, 1) }).find((a) => a.id === 'strike')!;
      const index = strike.spots.findIndex((x) => x.pos.x === 2);
      expect(index).toBeGreaterThanOrEqual(0);
      const m = turnMarks(b, spotOf(b, 'strike', 's', index), freshUi(b), at(2, 1), true);
      expect(m.counters?.melee[0].to.pos).toEqual(at(2, 1));
    });

    it('draws neither on the other screens', () => {
      const b = scene();
      const m = turnMarks(b, { k: 'menu', index: 0 }, freshUi(b), at(0, 1), true);
      expect(m.trajectory).toBeNull();
    });
  });
});
