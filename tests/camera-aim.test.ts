import { describe, expect, it } from 'vitest';
import { bodyOf, drawnTop, fitBoth, frameBounds, hiddenAt, revealYaw } from '../src/client/camera-aim.ts';
import { parseGrid } from '../src/shared/battle/grid.ts';

const none = { top: 0, bottom: 0, left: 0, right: 0 };
const Q = Math.PI / 4;
// a 5x5 floor at height 0 with one wall in the middle of the row below the centre (cell 2,3)
const grid = parseGrid(['.....', '.....', '.....', '..#..', '.....'], ['00000', '00000', '00000', '00000', '00000']);
// the centre cell's middle, half a world unit up its body (TileSpace.world: x - width/2 + 0.5, ground at (h + 1) * step)
const centre = { x: 0, y: 0.5 + 0.5, z: 0 };

describe('fitBoth: zoom out until actor and target fit (Nov 25)', () => {
  it('two points 10 apart across the screen ask for 10 plus the margins, in view height', () => {
    // yaw 0: the screen's right is the world's x
    expect(fitBoth({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 0, 0.56, { w: 1000, h: 500 }, none, 1, 0)).toBeCloseTo(
      6,
    );
  });
  it('the view it returns shows exactly that width in the frame', () => {
    const v = fitBoth({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 0, 0.56, { w: 1000, h: 500 }, none, 1, 0),
      f = frameBounds(1000, 500, v, none);
    expect(f.right - f.left).toBeCloseTo(12);
  });
  it('a HUD covering half the width doubles it; the body height counts on the vertical', () => {
    const half = { ...none, left: 500 };
    expect(fitBoth({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 0, 0.56, { w: 1000, h: 500 }, half, 1, 0)).toBeCloseTo(
      12,
    );
    // the same two points along the screen's depth at a 90° pitch: straight up the screen, 10 + 2 margins + 3 of body
    expect(
      fitBoth({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 10 }, 0, Math.PI / 2, { w: 1000, h: 500 }, none, 1, 3),
    ).toBeCloseTo(15);
  });
  it('a portrait page undoes frameView widening it', () => {
    const v = fitBoth({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 0, 0.56, { w: 500, h: 1000 }, none, 1, 0);
    expect((v * 1.15) / 0.5).toBeCloseTo(24);
  });
});

describe('hiddenAt and revealYaw: turn to see a unit behind a wall (Nov 25)', () => {
  it('a wall is drawn two levels above its tile', () => {
    expect(drawnTop(grid, 0.5, { x: 2, y: 3 })).toBeCloseTo(1.5);
    expect(drawnTop(grid, 0.5, { x: 2, y: 2 })).toBeCloseTo(0.5);
  });
  it('the wall between the unit and the camera hides it; from the other side it does not', () => {
    expect(hiddenAt(grid, 0.5, centre, 0, (32 * Math.PI) / 180)).toBe(true); // camera toward +z, over the wall
    expect(hiddenAt(grid, 0.5, centre, Math.PI, (32 * Math.PI) / 180)).toBe(false);
  });
  it('a steep enough camera sees over it', () => {
    expect(hiddenAt(grid, 0.5, centre, 0, (80 * Math.PI) / 180)).toBe(false);
  });
  it('keeps the angle when nothing hides; else the nearest step that shows it', () => {
    const hidden = (yaw: number) => hiddenAt(grid, 0.5, centre, yaw, (32 * Math.PI) / 180);
    expect(revealYaw(Math.PI, Q, hidden)).toBe(Math.PI);
    expect(revealYaw(0, Q, hidden)).toBeCloseTo(Q);
  });
  it('no angle helps: it does not turn', () => {
    expect(revealYaw(1, Q, () => true)).toBe(1);
  });
});

describe('bodyOf', () => {
  it('a bare tile is one cell with no height', () => {
    expect(bodyOf({ x: 3, y: 4 })).toEqual({ p: { x: 3, y: 4 }, size: 1, h: 0 });
  });
});
