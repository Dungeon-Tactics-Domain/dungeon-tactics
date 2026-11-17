import { describe, expect, it } from 'vitest';
import { nextSpot } from '../src/client/spot-walk.ts';

// The cursor that walks by where things are on screen (Fernando, Nov 17): one test per direction, one per edge
const box = (x: number, y: number, width = 50, height = 50) => ({ x: x - width / 2, y: y - height / 2, width, height });

describe('nextSpot: the cursor goes to what is straight that way on screen', () => {
  const cross = [box(300, 300), box(300, 100), box(300, 500), box(100, 300), box(500, 300)];
  it('goes up, down, left and right to the box in line that way', () => {
    expect(nextSpot(cross, 0, 'up')).toBe(1);
    expect(nextSpot(cross, 0, 'down')).toBe(2);
    expect(nextSpot(cross, 0, 'left')).toBe(3);
    expect(nextSpot(cross, 0, 'right')).toBe(4);
  });

  it('stays at an edge, each way: nothing there, no wrap', () => {
    expect(nextSpot(cross, 1, 'up')).toBe(1);
    expect(nextSpot(cross, 2, 'down')).toBe(2);
    expect(nextSpot(cross, 3, 'left')).toBe(3);
    expect(nextSpot(cross, 4, 'right')).toBe(4);
    expect(nextSpot([box(0, 0)], 0, 'down')).toBe(0);
    expect(nextSpot([], 0, 'down')).toBe(0);
  });

  it('never goes on a slant: a box below and off to the side is neither below nor beside', () => {
    const slant = [box(300, 300), box(400, 372), box(230, 228)];
    for (const d of ['up', 'down', 'left', 'right'] as const) expect(nextSpot(slant, 0, d)).toBe(0);
  });

  it('takes the nearest in line, past a row that has nothing in this column', () => {
    const col = [box(300, 100), box(500, 172), box(300, 244), box(300, 316)];
    expect(nextSpot(col, 0, 'down')).toBe(2);
    expect(nextSpot(col, 3, 'up')).toBe(2);
    expect(nextSpot([box(100, 100), box(300, 100), box(500, 100)], 0, 'right')).toBe(1);
  });

  it('a box a few px off its row or column is still in line', () => {
    const row = [box(100, 100), box(300, 110)];
    expect(nextSpot(row, 0, 'right')).toBe(1);
    expect(nextSpot(row, 0, 'down')).toBe(0);
  });

  it('a wide plaque is beside every place level with it, and none above or below it', () => {
    const plaque = box(186, 436, 372, 112);
    const spots = [plaque, box(556, 470), box(703, 470), box(703, 300)];
    expect(nextSpot(spots, 0, 'right')).toBe(1);
    expect(nextSpot(spots, 2, 'left')).toBe(1);
    expect(nextSpot(spots, 1, 'left')).toBe(0);
    expect(nextSpot(spots, 0, 'up')).toBe(0);
    expect(nextSpot(spots, 3, 'left')).toBe(3); // over the plaque's top: nothing beside it
  });
});
