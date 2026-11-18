import { describe, expect, it } from 'vitest';
import {
  ANNOUNCE,
  announceStretch,
  CONFETTI,
  confettiSlips,
  fpsBox,
  numberLook,
  numberPose,
  slipAt,
} from '../src/client/hints3d/effects-view.ts';

// The effects over the battle on the 3D layer (hints3d/effects3d.ts; Nov 18): the pure parts behind the drawing
describe('3D effects: a floating number', () => {
  it('reads the kind and the strong strike from the classes the scene gives', () => {
    expect(numberLook('phys')).toEqual({ kind: 'phys', crit: false });
    expect(numberLook('phys crit')).toEqual({ kind: 'phys', crit: true });
    expect(numberLook('magic crit')).toEqual({ kind: 'magic', crit: true });
    expect(numberLook('heal')).toEqual({ kind: 'heal', crit: false });
    expect(numberLook('miss')).toEqual({ kind: 'miss', crit: false });
  });

  it('jumps out of the chest, holds still to be read and leaves upwards, as the CSS did', () => {
    expect(numberPose(0, false)).toEqual({ rise: 0, scale: 0.6, alpha: 0 });
    expect(numberPose(0.08, false)).toEqual({ rise: 0.9, scale: 1.15, alpha: 1 });
    for (const k of [0.28, 0.5, 0.75]) expect(numberPose(k, false)).toEqual({ rise: 0.5, scale: 1, alpha: 1 });
    expect(numberPose(1, false)).toEqual({ rise: 0.8, scale: 1, alpha: 0 });
    const half = numberPose(0.875, false); // half way out
    expect(half.rise).toBeCloseTo(0.65);
    expect(half.alpha).toBeCloseTo(0.5);
  });

  it('never leaves its range on a late or an early frame', () => {
    expect(numberPose(-1, false)).toEqual(numberPose(0, false));
    expect(numberPose(3, false)).toEqual(numberPose(1, false));
  });

  it('stands readable the whole time under reduced motion', () => {
    for (const k of [0, 0.05, 0.5, 1]) expect(numberPose(k, true)).toEqual({ rise: 0.5, scale: 1, alpha: 1 });
  });
});

describe('3D effects: the objective banner', () => {
  it('stretches in over its first 12% and then stays whole', () => {
    expect(announceStretch(0, false)).toBeCloseTo(0.3);
    expect(announceStretch(0.06, false)).toBeGreaterThan(0.65);
    expect(announceStretch(0.12, false)).toBe(1);
    expect(announceStretch(ANNOUNCE.out, false)).toBe(1);
    expect(announceStretch(0, true)).toBe(1); // reduced motion
  });
});

describe('3D effects: the victory confetti', () => {
  // a fixed sequence in place of Math.random
  const fixed = () => {
    let n = 0;
    return () => (n++ % 10) / 10;
  };
  const slips = confettiSlips(fixed());

  it('drops 60 slips in the five colours, each with its own start and pace', () => {
    expect(slips).toHaveLength(60);
    expect(new Set(slips.map((s) => s.color))).toEqual(new Set([0, 1, 2, 3, 4]));
    for (const s of slips) {
      expect(s.delay).toBeLessThanOrEqual(0.8);
      expect(s.fall).toBeGreaterThanOrEqual(1.6);
      expect(s.delay + s.fall).toBeLessThanOrEqual(CONFETTI.ms / 1000); // all down before the effect ends
    }
  });

  it('a slip waits above the screen, falls past its foot and is gone', () => {
    const s = { ...slips[0], delay: 0.5, fall: 2, sway: 0 };
    expect(slipAt(s, 0.4, 800, 400)).toBeNull();
    expect(slipAt(s, 0.5, 800, 400)?.y).toBe(-12);
    expect(slipAt(s, 2.5, 800, 400)?.y).toBeCloseTo(420); // 105% of the height
    expect(slipAt(s, 2.6, 800, 400)).toBeNull();
    expect(slipAt(s, 1, 800, 400)?.x).toBe(s.x * 800);
    expect(slipAt(s, 1, 800, 400)?.rx).toBe(0.5 * s.spin[0]); // it tumbles as it falls
  });
});

describe('3D effects: the performance counter', () => {
  // what the browser measured on the HTML counter (Nov 18, the day before the plate stopped reading it): five lines,
  // the widest 307.891 px, on a 1920 px page and on a 540 px one
  const widths = [140.75, 307.891, 246.313, 281.5, 79.172];
  it('hangs under the corner menu on the right edge, as wide as its widest line', () => {
    for (const [pageW, x] of [
      [1920, 1584.109],
      [540, 204.109],
    ]) {
      const b = fpsBox(pageW, { top: 0, right: 0 }, widths);
      expect(b.x).toBeCloseTo(x, 2);
      expect(b.y).toBe(72);
      expect(b.w).toBeCloseTo(323.891, 2);
      expect(b.h).toBeCloseTo(115.969, 2);
    }
  });
  it('keeps clear of the notch', () => {
    const b = fpsBox(844, { top: 10, right: 47 }, [100]);
    expect(b.y).toBe(82);
    expect(b.x + b.w).toBe(844 - 12 - 47);
  });
});
