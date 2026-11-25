import { describe, expect, it } from 'vitest';
import { PALETTE, type PaletteEntry } from '../src/content/map-palette.ts';
import { ASH_WOOD } from '../src/content/maps/ash-wood.ts';
import type { Tile } from '../src/shared/battle/grid.ts';
import { MAPS } from '../src/shared/battle/scenarios.ts';
import { blankDoc, docFromScenario, type MapDoc } from '../src/shared/mapedit/doc.ts';
import { autoRamps, cycleRamp, fixRamps, paint, raise, setHeight } from '../src/shared/mapedit/edit.ts';
import { record, redo, startHistory, UNDO_STEPS, undo } from '../src/shared/mapedit/history.ts';
import { growEdge, resize } from '../src/shared/mapedit/size.ts';

const entry = (id: string): PaletteEntry => PALETTE.find((e) => e.id === id)!;
const at = (d: MapDoc, x: number, y: number): Tile => d.tiles[y * d.width + x];
// a 4x4 grass map with the given heights, row by row
const hills = (rows: string[]): MapDoc => {
  const d = blankDoc(4, 4);
  return { ...d, tiles: d.tiles.map((t, i) => ({ ...t, h: Number(rows[Math.floor(i / 4)][i % 4]) })) };
};

describe('paint', () => {
  it('sets every kind field of the entry and keeps the height', () => {
    const d = setHeight(blankDoc(4, 4), { x: 1, y: 1 }, 3);
    const p = paint(d, { x: 1, y: 1 }, entry('water_deep'));
    expect(at(p, 1, 1)).toEqual({ terrain: 'floor', look: 'water', depth: 2, h: 3 });
    // painting grass back clears the water depth
    expect(at(paint(p, { x: 1, y: 1 }, entry('grass')), 1, 1)).toEqual({ terrain: 'floor', look: 'grass', h: 3 });
  });

  it('returns the same document when nothing changes, so an empty stroke records no step', () => {
    const d = blankDoc(4, 4);
    expect(paint(d, { x: 0, y: 0 }, entry('grass'))).toBe(d);
    expect(paint(d, { x: 9, y: 0 }, entry('rock'))).toBe(d);
  });

  it('keeps a ramp on ground that still takes one, drops it under a wall', () => {
    const d = cycleRamp(hills(['0100', '0000', '0000', '0000']), { x: 0, y: 0 });
    expect(at(d, 0, 0).ramp).toEqual([1, 1]);
    expect(at(paint(d, { x: 0, y: 0 }, entry('sand')), 0, 0).ramp).toEqual([1, 1]);
    expect(at(paint(d, { x: 0, y: 0 }, entry('rock')), 0, 0).ramp).toBeUndefined();
  });
});

describe('height', () => {
  it('raises, lowers and sets, clamped to 0..9', () => {
    const d = blankDoc(4, 4);
    expect(at(raise(d, { x: 0, y: 0 }, -1), 0, 0).h).toBe(0);
    expect(raise(d, { x: 0, y: 0 }, -1)).toBe(d);
    expect(at(setHeight(d, { x: 0, y: 0 }, 12), 0, 0).h).toBe(9);
    expect(at(raise(raise(d, { x: 0, y: 0 }, 1), { x: 0, y: 0 }, 1), 0, 0).h).toBe(2);
  });

  it('re-rises a ramp when the neighbour above grows and drops it when the step is gone', () => {
    const d = cycleRamp(hills(['0100', '0000', '0000', '0000']), { x: 0, y: 0 });
    expect(at(setHeight(d, { x: 1, y: 0 }, 3), 0, 0).ramp).toEqual([1, 3]);
    expect(at(setHeight(d, { x: 1, y: 0 }, 0), 0, 0).ramp).toBeUndefined();
    expect(at(setHeight(d, { x: 0, y: 0 }, 1), 0, 0).ramp).toBeUndefined();
  });
});

describe('ramp tool', () => {
  it('rotates through the higher neighbours in facing order, then clears', () => {
    // (1,1) at 0 with (1,2) below at 2 (facing 0, +y) and (2,1) at 1 (facing 1, +x)
    let d = hills(['0000', '0010', '0200', '0000']);
    d = cycleRamp(d, { x: 1, y: 1 });
    expect(at(d, 1, 1).ramp).toEqual([0, 2]);
    d = cycleRamp(d, { x: 1, y: 1 });
    expect(at(d, 1, 1).ramp).toEqual([1, 1]);
    d = cycleRamp(d, { x: 1, y: 1 });
    expect(at(d, 1, 1).ramp).toBeUndefined();
  });

  it('does nothing on flat ground, water or toward a wall', () => {
    const flat = blankDoc(4, 4);
    expect(cycleRamp(flat, { x: 1, y: 1 })).toBe(flat);
    const wet = paint(hills(['0100', '0000', '0000', '0000']), { x: 0, y: 0 }, entry('water_shallow'));
    expect(cycleRamp(wet, { x: 0, y: 0 })).toBe(wet);
    const walled = paint(hills(['0100', '0000', '0000', '0000']), { x: 1, y: 0 }, entry('rock'));
    expect(cycleRamp(walled, { x: 0, y: 0 })).toBe(walled);
  });
});

describe('auto-ramps', () => {
  it('ramps every one-level step on plain ground, first direction in facing order, never a step of 2', () => {
    const d = autoRamps(hills(['0120', '0000', '0000', '0000']));
    expect(at(d, 0, 0).ramp).toEqual([1, 1]);
    expect(at(d, 1, 0).ramp).toEqual([1, 1]);
    // (1,1) below the 1 at (1,0): rises toward -y
    expect(at(d, 1, 1).ramp).toEqual([2, 1]);
    // (2,1) sits under the 2 at (2,0): a step of 2, no ramp
    expect(at(d, 2, 1).ramp).toBeUndefined();
  });

  it('keeps the ramps already placed and is idempotent', () => {
    const d = autoRamps(hills(['0120', '0000', '0000', '0000']));
    expect(autoRamps(d)).toBe(d);
  });

  it('leaves every game map ramp valid (the builder agrees with the maps)', () => {
    for (const m of MAPS) {
      const doc = docFromScenario(m);
      expect(fixRamps(doc), m.id).toBe(doc);
    }
  });
});

describe('size', () => {
  it('resizes from the top-left corner, new tiles as plain grass', () => {
    const d = resize(blankDoc(4, 4), 6, 5);
    expect(d).toMatchObject({ width: 6, height: 5 });
    expect(at(d, 5, 4)).toEqual({ terrain: 'floor', look: 'grass', h: 0 });
    expect(resize(d, 3, 5)).toBe(d);
    expect(resize(d, 25, 5)).toBe(d);
  });

  it('adds and cuts a row or column on any edge, moving the tiles with it', () => {
    const d = setHeight(blankDoc(5, 5), { x: 0, y: 0 }, 4);
    const left = growEdge(d, 'left', 1);
    expect(left.width).toBe(6);
    expect(at(left, 1, 0).h).toBe(4);
    expect(growEdge(d, 'top', -1).height).toBe(4);
    expect(at(growEdge(d, 'top', -1), 0, 0).h).toBe(0);
    expect(at(growEdge(d, 'bottom', 1), 0, 5).h).toBe(0);
    expect(growEdge(d, 'right', -1).width).toBe(4);
  });

  it('drops the ramps the cut takes away', () => {
    let d = setHeight(blankDoc(5, 5), { x: 4, y: 0 }, 1);
    d = cycleRamp(d, { x: 3, y: 0 });
    expect(at(d, 3, 0).ramp).toEqual([1, 1]);
    expect(at(growEdge(d, 'right', -1), 3, 0).ramp).toBeUndefined();
  });

  it('gets the cut tiles back through undo', () => {
    const d = setHeight(blankDoc(5, 5), { x: 4, y: 0 }, 7);
    let h = startHistory(d);
    h = record(h, growEdge(d, 'right', -1));
    expect(h.present.width).toBe(4);
    h = undo(h);
    expect(h.present).toBe(d);
  });
});

describe('undo history', () => {
  it('one stroke of many tiles is one step; redo gives it back; a new edit clears redo', () => {
    const d = blankDoc(4, 4);
    let stroke = d;
    for (let x = 0; x < 4; x++) stroke = paint(stroke, { x, y: 0 }, entry('sand'));
    let h = record(startHistory(d), stroke);
    expect(h.past).toHaveLength(1);
    h = undo(h);
    expect(h.present).toBe(d);
    h = redo(h);
    expect(h.present).toBe(stroke);
    h = record(undo(h), raise(d, { x: 0, y: 0 }, 1));
    expect(h.future).toEqual([]);
  });

  it('records nothing for an unchanged document and stops at the ends', () => {
    const d = blankDoc(4, 4);
    const h = startHistory(d);
    expect(record(h, d)).toBe(h);
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });

  it(`keeps the last ${UNDO_STEPS} steps`, () => {
    let h = startHistory(blankDoc(4, 4));
    for (let i = 0; i < UNDO_STEPS + 10; i++) h = record(h, setHeight(h.present, { x: 0, y: 0 }, i % 2 ? 0 : 1));
    expect(h.past).toHaveLength(UNDO_STEPS);
  });

  it('works on a real map', () => {
    const d = docFromScenario(ASH_WOOD);
    const h = undo(record(startHistory(d), autoRamps(d)));
    expect(h.present).toBe(d);
  });
});
