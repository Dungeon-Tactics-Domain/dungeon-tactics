import { describe, expect, it } from 'vitest';
import { frameBounds } from '../src/client/scene/camera.ts';

const none = { top: 0, bottom: 0, left: 0, right: 0 };
// screen x (px) where the world point x = 0 (the focus) lands in a frame
const focusX = (f: { left: number; right: number }, w: number) => (-f.left / (f.right - f.left)) * w;
const focusY = (f: { top: number; bottom: number }, h: number) => (f.top / (f.top - f.bottom)) * h;

describe('frameBounds', () => {
  it('centers the focus on the page with no HUD', () => {
    const f = frameBounds(1600, 900, 10, none);
    expect(f).toEqual({ left: -800 / 90, right: 800 / 90, top: 5, bottom: -5 });
  });

  it('puts the focus in the middle of the space right of the turn list', () => {
    const f = frameBounds(1024, 768, 10, { ...none, left: 250 });
    expect(focusX(f, 1024)).toBeCloseTo((250 + 1024) / 2);
    expect(f.right - f.left).toBeCloseTo((10 * 1024) / 768); // same width: the zoom does not change
    expect(focusY(f, 768)).toBeCloseTo(384);
  });

  it('a right inset pushes the focus left, and both sides cancel out', () => {
    expect(focusX(frameBounds(1000, 500, 8, { ...none, right: 200 }), 1000)).toBeCloseTo(400);
    expect(focusX(frameBounds(1000, 500, 8, { ...none, left: 100, right: 100 }), 1000)).toBeCloseTo(500);
  });

  it('keeps the vertical offset between the top and bottom HUD', () => {
    const f = frameBounds(1600, 900, 10, { ...none, top: 100, bottom: 300, left: 400 });
    expect(focusY(f, 900)).toBeCloseTo((100 + 600) / 2);
    expect(focusX(f, 1600)).toBeCloseTo(1000);
  });

  it('portrait phone: a folded list of faces shifts by half its width', () => {
    const f = frameBounds(390, 844, 30, { ...none, left: 60 });
    expect(focusX(f, 390)).toBeCloseTo(225);
  });
});
