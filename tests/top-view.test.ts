import { describe, expect, it } from 'vitest';
import { emptyMemory, padActions } from '../src/client/gamepad.ts';
import { gridStep, keyAction } from '../src/client/keyboard.ts';
import { frameBounds } from '../src/client/scene/camera.ts';
import { snapQuarter, topFit, turnStep } from '../src/client/top-view.ts';

const none = { top: 0, bottom: 0, left: 0, right: 0 };
const Q = Math.PI / 2;
const key = (k: string) => keyAction({ key: k, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false });
const press = (i: number) =>
  padActions({ buttons: Array.from({ length: 16 }, (_, b) => b === i), axes: [0, 0, 0, 0] }, emptyMemory(), 0);

describe('top view input (Nov 25)', () => {
  it('T and the right stick press toggle it; V turns the active unit now', () => {
    expect(key('t')).toEqual({ k: 'top' });
    expect(key('T')).toEqual({ k: 'top' });
    expect(key('v')).toEqual({ k: 'face' });
    expect(press(11)).toEqual([{ k: 'top' }]);
  });
  it('F2, L3 and F3 keep their panels', () => {
    expect(key('F2')).toEqual({ k: 'debug' });
    expect(key('F3')).toEqual({ k: 'fps' });
    expect(press(10)).toEqual([{ k: 'debug' }]);
  });
});

describe('top view turning', () => {
  it('snaps to the nearest straight angle from the 8 angles of the usual view', () => {
    expect(snapQuarter(Math.PI / 4 + 0.01)).toBeCloseTo(Q);
    expect(snapQuarter(Math.PI / 4 - 0.01)).toBeCloseTo(0);
    expect(snapQuarter(-3 * Q - 0.2)).toBeCloseTo(-3 * Q);
  });
  it('R turns 90° from above and 45° otherwise: 4 presses from above visit the 4 sides', () => {
    expect(turnStep(true)).toBeCloseTo(Q);
    expect(turnStep(false)).toBeCloseTo(Q / 2);
    let yaw = snapQuarter(Math.PI / 4 + 0.1);
    const seen = new Set<number>();
    for (let i = 0; i < 4; i++) {
      yaw += turnStep(true);
      seen.add(((Math.round(yaw / Q) % 4) + 4) % 4);
    }
    expect(seen).toEqual(new Set([0, 1, 2, 3]));
  });
  it('from above the arrows still follow the camera: a straight grid step at every quarter', () => {
    expect([0, 1, 2, 3].map((q) => gridStep('up', q * Q))).toEqual([
      { x: 0, y: -1 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 0 },
    ]);
    for (let q = 0; q < 4; q++) {
      const u = gridStep('up', q * Q),
        r = gridStep('right', q * Q);
      expect(Math.abs(u.x * r.x + u.y * r.y)).toBe(0); // right is square to up
    }
  });
});

describe('topFit: the whole map from above', () => {
  // world units the frame shows across and down at a view height
  const sides = (w: number, h: number, viewH: number) => {
    const f = frameBounds(w, h, viewH, none);
    return { across: f.right - f.left, down: f.top - f.bottom };
  };
  it('fits a square map with a cell of margin around it, under the corner buttons, on a 1600x900 page', () => {
    // 72 px kept for the buttons at the top, and the same at the bottom since the frame centres between the insets
    expect(topFit({ width: 40, height: 40 }, 0, 1600, 900, none)).toBeCloseTo((42 * 900) / (900 - 144));
  });
  it('a long map swaps its sides at a quarter turn and still fits', () => {
    const map = { width: 60, height: 20 };
    for (const q of [0, 1, 2, 3]) {
      const s = sides(1024, 768, topFit(map, q * Q, 1024, 768, none)),
        odd = q % 2 === 1;
      expect(s.across, `quarter ${q}`).toBeGreaterThanOrEqual((odd ? 20 : 60) + 2 - 1e-9);
      expect(s.down, `quarter ${q}`).toBeGreaterThanOrEqual((odd ? 60 : 20) + 2 - 1e-9);
    }
  });
  it('keeps the map inside the space the HUD leaves', () => {
    const i = { top: 100, bottom: 200, left: 250, right: 0 };
    const px = 900 / topFit({ width: 40, height: 40 }, 0, 1600, 900, i); // px per world unit
    expect(42 * px).toBeLessThanOrEqual(900 - 300 + 1e-6);
    expect(42 * px).toBeLessThanOrEqual(1600 - 250 + 1e-6);
  });
  it('undoes the portrait widening of frameView', () => {
    expect(topFit({ width: 40, height: 40 }, 0, 600, 1000, none)).toBeCloseTo((42 * (1000 / 600) * 0.6) / 1.15);
    // the corner buttons never cover the map's top row: its edge sits at least 72 px down
    const v = topFit({ width: 40, height: 40 }, 0, 1024, 768, none),
      f = frameBounds(1024, 768, v, none);
    expect(((f.top - 21) / (f.top - f.bottom)) * 768).toBeGreaterThanOrEqual(72 - 1e-6);
  });
});
