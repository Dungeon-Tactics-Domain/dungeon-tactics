import { describe, expect, it } from 'vitest';
import { Battle } from '../src/shared/battle/battle.ts';
import { forgetUndo, healAll, killAt, spawnClasses, spawnUnit } from '../src/shared/battle/debug.ts';
import { halfDef, halve } from '../src/shared/battle/half.ts';
import { footprint } from '../src/shared/battle/pathing.ts';
import { HALF, UNIT_DEFS } from '../src/shared/battle/units.ts';
import { flat, gridOf, stateOf } from './battle-helpers.ts';

// The debug panel's changes to a live battle (shared/battle/debug.ts; Fernando, Nov 25)

const split = halve({ id: 't-debug', name: 't', en: 't', grid: flat(6, 6), spawns: [] }).grid;
const HERO = halfDef('warrior');

describe('creating a unit mid-battle', () => {
  it('stands on the tile asked, full life, ct 0, looking at the nearest foe', () => {
    const s = stateOf([{ id: 'h', def: 'warrior', team: 'hero', x: 0, y: 0 }]);
    const u = spawnUnit(flat(6, 6), s, 'rat', 'enemy', { x: 4, y: 0 });
    expect(u).toMatchObject({ def: 'rat', team: 'enemy', pos: { x: 4, y: 0 }, hp: UNIT_DEFS.rat.hp, ct: 0, facing: 3 });
    expect(s.units.at(-1)).toBe(u);
  });
  it('goes to the nearest free spot when the tile is taken or cannot be stood on', () => {
    const s = stateOf([{ id: 'h', def: 'warrior', team: 'hero', x: 1, y: 1 }]);
    expect(spawnUnit(flat(3, 3), s, 'rat', 'enemy', { x: 1, y: 1 })?.pos).toEqual({ x: 1, y: 0 });
    const walled = gridOf(['.#.', '...']); // a wall on 1,0
    const t = stateOf([{ id: 'h', def: 'warrior', team: 'hero', x: 0, y: 1 }]);
    expect(spawnUnit(walled, t, 'rat', 'enemy', { x: 1, y: 0 })?.pos).toEqual({ x: 0, y: 0 });
  });
  it('on a split map a person takes a 2x2 token and a rat one cell, and none overlaps another', () => {
    const s = stateOf([{ id: 'h', def: HERO, team: 'hero', x: 0, y: 0 }]);
    const rat = spawnUnit(split, s, 'rat', 'enemy', { x: 1, y: 1 })!;
    expect(rat.def).toBe(`rat${HALF}`);
    expect(footprint(rat)).toHaveLength(1);
    const man = spawnUnit(split, s, 'warrior', 'enemy', { x: 0, y: 0 })!;
    expect(footprint(man)).toHaveLength(4);
    const cells = s.units.flatMap((u) => footprint(u).map((c) => `${c.x},${c.y}`));
    expect(new Set(cells).size).toBe(cells.length);
  });
  it('gives each new unit an id no live or fallen unit has, and returns null with no room', () => {
    const s = stateOf([{ id: 'h', def: 'warrior', team: 'hero', x: 0, y: 0 }]);
    expect(spawnUnit(flat(3, 1), s, 'rat', 'enemy', { x: 1, y: 0 }, ['rat-debug-1'])?.id).toBe('rat-debug-2');
    expect(spawnUnit(flat(3, 1), s, 'rat', 'enemy', { x: 1, y: 0 })?.id).toBe('rat-debug-1');
    expect(spawnUnit(flat(3, 1), s, 'rat', 'enemy', { x: 1, y: 0 })).toBeNull();
  });
  it('offers the written classes only: no half-tile token, runtime sheet or Beacon', () => {
    const list = spawnClasses();
    expect(list).toContain('rat');
    expect(list).toContain('warrior');
    expect(list.some((id) => id.endsWith(HALF) || id.startsWith('dev-') || id === 'beacon')).toBe(false);
  });
  it('leaves out a built battle’s own sheets (mapedit_<map>-h0)', () => {
    UNIT_DEFS['mapedit_test-h0'] = { ...UNIT_DEFS.warrior, id: 'mapedit_test-h0' };
    try {
      expect(spawnClasses()).not.toContain('mapedit_test-h0');
    } finally {
      delete UNIT_DEFS['mapedit_test-h0'];
    }
  });
});

describe('heal, kill and the undo', () => {
  it('heals everyone to full and kills the unit on a tile as a blow would', () => {
    const s = stateOf([
      { id: 'h', def: 'warrior', team: 'hero', x: 0, y: 0, hp: 1 },
      { id: 'e', def: 'rat', team: 'enemy', x: 2, y: 0, hp: 1 },
    ]);
    healAll(s);
    expect(s.units.map((u) => u.hp)).toEqual([UNIT_DEFS.warrior.hp, UNIT_DEFS.rat.hp]);
    expect(killAt(s, { x: 2, y: 0 })).toEqual([{ k: 'die', unit: 'e' }]);
    expect(s.units.map((u) => u.id)).toEqual(['h']);
    expect(killAt(s, { x: 5, y: 5 })).toEqual([]);
  });
  it('Undo does not take a spawn back: the history before it is forgotten', () => {
    const g = flat(6, 6);
    const b = new Battle(g, stateOf([{ id: 'h', def: 'warrior', team: 'hero', x: 0, y: 0 }]));
    b.move({ x: 1, y: 0 });
    expect(b.canUndo).toBe(true);
    spawnUnit(g, b.state, 'rat', 'enemy', { x: 5, y: 5 });
    forgetUndo(b);
    expect(b.canUndo).toBe(false);
    expect(b.state.units).toHaveLength(2);
  });
});
