import { describe, expect, it } from 'vitest';
import { placeBeside } from '../src/client/hud.ts';

// Command menu beside the unit, as in FFT (Nov 13, Fernando's request)
const area = { left: 12, top: 72, right: 1268, bottom: 560 }; // 1280x720 without the top strip and the bottom panels
const clear = (p: { left: number }, w: number, x: number, r: number) => p.left + w <= x - r || p.left >= x + r; // doesn't cover the unit

describe('menu beside the unit', () => {
  it('to the right of the unit, centered on its height', () => {
    const p = placeBeside({ x: 400, y: 300, r: 20 }, 220, 200, area);
    expect(p).toEqual({ left: 432, top: 200, side: 'right' });
    expect(clear(p, 220, 400, 20)).toBe(true);
  });

  it('no room on the right, goes to the left without covering the unit', () => {
    const p = placeBeside({ x: 1150, y: 300, r: 20 }, 220, 200, area);
    expect(p.side).toBe('left');
    expect(p.left).toBe(1150 - 20 - 12 - 220);
    expect(clear(p, 220, 1150, 20)).toBe(true);
  });

  it('never leaves the free area (top, bottom and with the unit off screen)', () => {
    expect(placeBeside({ x: 400, y: 20, r: 20 }, 220, 200, area).top).toBe(72);
    expect(placeBeside({ x: 400, y: 700, r: 20 }, 220, 200, area).top).toBe(360);
    const off = placeBeside({ x: 1500, y: 300, r: 20 }, 220, 200, area);
    expect(off.left).toBeGreaterThanOrEqual(area.left);
    expect(off.left + 220).toBeLessThanOrEqual(area.right);
  });

  it('moves down or up beside the unit to avoid covering the target or the turn list, as close as possible', () => {
    const target = { left: 460, top: 260, right: 500, bottom: 320 };
    const p = placeBeside({ x: 200, y: 300, r: 20 }, 420, 150, area, 'left', [target]);
    expect(p.side).toBe('right'); // doesn't fit on the left
    expect(p.left).toBe(232);
    expect(p.top).toBe(target.bottom + 12); // right below the target, still beside the unit
    expect(clear(p, 420, 200, 20)).toBe(true);
    const queue = { left: 12, top: 56, right: 242, bottom: 248 };
    const q = placeBeside({ x: 400, y: 200, r: 20 }, 220, 150, area, 'left', [queue]);
    expect(q).toEqual({ left: 148, top: 260, side: 'left' }); // on the left, but below the list
    expect(placeBeside({ x: 500, y: 200, r: 20 }, 220, 150, area, 'left', [queue]).top).toBe(125); // already beside the list: stays in the middle
  });

  it('the "Executar?" (Execute?) prompt prefers the side opposite the target', () => {
    expect(placeBeside({ x: 600, y: 300, r: 20 }, 420, 200, area, 'left').side).toBe('left');
    // no room on the left, stays on the right anyway
    expect(placeBeside({ x: 200, y: 300, r: 20 }, 420, 200, area, 'left').side).toBe('right');
  });
});
