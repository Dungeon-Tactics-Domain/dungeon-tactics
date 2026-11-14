import { describe, expect, it } from 'vitest';
import { TERRAIN, inBounds, neighbors, parseGrid, tileAt } from '../src/shared/battle/grid.ts';

describe('grid', () => {
  const grid = parseGrid(['.T#', '...'], ['012', '300']);

  it('reads terrain and height tile by tile', () => {
    expect(grid.width).toBe(3);
    expect(grid.height).toBe(2);
    expect(tileAt(grid, { x: 1, y: 0 })).toEqual({ terrain: 'forest', h: 1 });
    expect(tileAt(grid, { x: 2, y: 0 })).toEqual({ terrain: 'wall', h: 2 });
    expect(tileAt(grid, { x: 0, y: 1 })).toEqual({ terrain: 'floor', h: 3 });
  });

  it('rejects a line of different width, an unknown symbol and heights that do not match', () => {
    expect(() => parseGrid(['..', '...'], ['00', '000'])).toThrow(/largura/);
    expect(() => parseGrid(['.?'], ['00'])).toThrow(/símbolo/);
    expect(() => parseGrid(['..'], ['0'])).toThrow(/altura/);
    expect(() => parseGrid(['..'], ['0x'])).toThrow(/altura/);
  });

  it('neighbors are 4 directions and stay within bounds', () => {
    expect(neighbors(grid, { x: 0, y: 0 })).toHaveLength(2);
    expect(neighbors(grid, { x: 1, y: 1 })).toHaveLength(3);
    expect(inBounds(grid, { x: 3, y: 0 })).toBe(false);
    expect(inBounds(grid, { x: -1, y: 0 })).toBe(false);
  });

  it('wall and tree are not walkable (Nov 13); rubble is walkable and gives cover; tree and wall block sight', () => {
    expect(TERRAIN.wall.walkable).toBe(false);
    expect(TERRAIN.forest.walkable).toBe(false);
    expect(TERRAIN.rubble.walkable).toBe(true);
    expect(TERRAIN.rubble.cover).toBe(true);
    expect(TERRAIN.floor.blocks).toBe(0);
    expect(TERRAIN.forest.blocks).toBeGreaterThan(0);
    expect(TERRAIN.wall.blocks).toBeGreaterThan(TERRAIN.forest.blocks);
  });
});
