import { describe, expect, it } from 'vitest';
import { TERRAIN, inBounds, neighbors, parseGrid, tileAt } from '../src/shared/battle/grid.ts';

describe('grade', () => {
  const grid = parseGrid(['.T#', '...'], ['012', '300']);

  it('lê terreno e altura casa a casa', () => {
    expect(grid.width).toBe(3);
    expect(grid.height).toBe(2);
    expect(tileAt(grid, { x: 1, y: 0 })).toEqual({ terrain: 'forest', h: 1 });
    expect(tileAt(grid, { x: 2, y: 0 })).toEqual({ terrain: 'wall', h: 2 });
    expect(tileAt(grid, { x: 0, y: 1 })).toEqual({ terrain: 'floor', h: 3 });
  });

  it('rejeita linha de largura diferente, símbolo desconhecido e alturas que não casam', () => {
    expect(() => parseGrid(['..', '...'], ['00', '000'])).toThrow(/largura/);
    expect(() => parseGrid(['.?'], ['00'])).toThrow(/símbolo/);
    expect(() => parseGrid(['..'], ['0'])).toThrow(/altura/);
    expect(() => parseGrid(['..'], ['0x'])).toThrow(/altura/);
  });

  it('vizinhos são 4 direções e ficam dentro dos limites', () => {
    expect(neighbors(grid, { x: 0, y: 0 })).toHaveLength(2);
    expect(neighbors(grid, { x: 1, y: 1 })).toHaveLength(3);
    expect(inBounds(grid, { x: 3, y: 0 })).toBe(false);
    expect(inBounds(grid, { x: -1, y: 0 })).toBe(false);
  });

  it('só parede não anda; floresta e parede bloqueiam visão, floresta dá cobertura', () => {
    expect(TERRAIN.wall.walkable).toBe(false);
    expect(TERRAIN.forest.walkable).toBe(true);
    expect(TERRAIN.forest.cover).toBe(true);
    expect(TERRAIN.floor.blocks).toBe(0);
    expect(TERRAIN.forest.blocks).toBeGreaterThan(0);
    expect(TERRAIN.wall.blocks).toBeGreaterThan(TERRAIN.forest.blocks);
  });
});
