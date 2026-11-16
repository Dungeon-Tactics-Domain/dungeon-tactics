import { describe, expect, it } from 'vitest';
import { placeBeside } from '../src/client/place-beside.ts';

// Command menu beside the unit, as in FFT (Nov 13, Fernando's request)
const area = { left: 12, top: 72, right: 1268, bottom: 560 }; // 1280x720 without the top strip and the bottom panels
const clear = (p: { left: number }, w: number, x: number, r: number) => p.left + w <= x - r || p.left >= x + r; // doesn't cover the unit

describe('menu beside the unit', () => {
  it('to the right of the unit, centered on its height', () => {
    const p = placeBeside({ x: 400, y: 300, r: 20 }, 220, 200, area);
    expect(p).toEqual({ left: 432, top: 200, side: 'right', free: true });
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
    expect(q).toEqual({ left: 148, top: 260, side: 'left', free: true }); // on the left, but below the list
    expect(placeBeside({ x: 500, y: 200, r: 20 }, 220, 150, area, 'left', [queue]).top).toBe(125); // already beside the list: stays in the middle
  });

  it('says when no spot is clear, so "Execute?" can retry keeping only the turn list clear', () => {
    // a tall window beside a unit with its target right of it and the list on the left: nothing is clear of both
    const queue = { left: 12, top: 56, right: 144, bottom: 560 };
    const target = { left: 650, top: 165, right: 710, bottom: 255 };
    const a = { x: 520, y: 190, r: 20 };
    expect(placeBeside(a, 460, 215, { ...area, bottom: 430 }, 'left', [queue, target]).free).toBe(false);
    const p = placeBeside(a, 460, 215, { ...area, bottom: 430 }, 'left', [queue]);
    expect(p).toMatchObject({ side: 'right', free: true }); // clear of the list, over the target (its numbers are in the strips)
  });

  // Nov 16 (touch audit): on a phone or a 768 px tablet a wide window fits on neither side and sat on the acting unit
  it('with room on neither side, goes below the unit, or above it, never on it', () => {
    const tablet = { left: 12, top: 72, right: 756, bottom: 886 }; // 768x1024
    const a = { x: 400, y: 400, r: 30 };
    const p = placeBeside(a, 460, 108, tablet, 'left');
    expect(p).toMatchObject({ left: 170, top: 400 + 45 + 12, free: false }); // centred under the unit
    // no room below: above
    expect(placeBeside(a, 460, 108, { ...tablet, bottom: 500 }, 'left').top).toBe(400 - 45 - 12 - 108);
    // the target right under the unit: above, clear of it
    const target = { left: 380, top: 450, right: 440, bottom: 540 };
    expect(placeBeside(a, 460, 108, tablet, 'left', [target]).top).toBe(400 - 45 - 12 - 108);
    // room for neither row: the old clamp, inside the area
    const tight = placeBeside(a, 460, 400, { ...tablet, bottom: 600 }, 'left');
    expect(tight.top).toBeGreaterThanOrEqual(72);
    expect(tight.top + 400).toBeLessThanOrEqual(600);
  });

  it('the "Executar?" (Execute?) prompt prefers the side opposite the target', () => {
    expect(placeBeside({ x: 600, y: 300, r: 20 }, 420, 200, area, 'left').side).toBe('left');
    // no room on the left, stays on the right anyway
    expect(placeBeside({ x: 200, y: 300, r: 20 }, 420, 200, area, 'left').side).toBe('right');
  });
});
