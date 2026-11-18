import { describe, expect, it } from 'vitest';
import { angleOf, TWIST_STEP, twist } from '../src/client/gesture.ts';

// Fernando, Nov 18: one finger drags the camera, two fingers turn and zoom it
describe('two fingers: the twist that turns the camera', () => {
  it('reads the angle between two fingers, growing clockwise on screen', () => {
    expect(angleOf({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(0);
    expect(angleOf({ x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(Math.PI / 2);
  });

  it('a small wobble (a pinch) turns nothing and is kept', () => {
    const r = twist(0, 0, 0.2);
    expect(r).toEqual({ acc: 0.2, turn: 0 });
    expect(twist(r.acc, 0.2, 0.1).turn).toBe(0);
  });

  it('turns once per 30 degrees of twist, either way, keeping what is left over', () => {
    const cw = twist(0.4, 1, 1.2);
    expect(cw.turn).toBe(1);
    expect(cw.acc).toBeCloseTo(0.6 - TWIST_STEP);
    const ccw = twist(0, 0, -TWIST_STEP - 0.05);
    expect(ccw.turn).toBe(-1);
    expect(ccw.acc).toBeCloseTo(-0.05);
  });

  it('a quarter turn of the wrist in small moves gives three eighths', () => {
    let acc = 0,
      turns = 0;
    for (let a = 0; a < Math.PI / 2 - 1e-9; a += Math.PI / 60) {
      const r = twist(acc, a, a + Math.PI / 60);
      acc = r.acc;
      turns += r.turn;
    }
    expect(turns).toBe(3);
  });

  it('takes the short way where the angle wraps from π to -π', () => {
    const r = twist(0, Math.PI - 0.1, -Math.PI + 0.1);
    expect(r.turn).toBe(0);
    expect(r.acc).toBeCloseTo(0.2);
  });
});
