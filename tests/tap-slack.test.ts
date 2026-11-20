import { describe, expect, it } from 'vitest';
import { nearestTap, TAP_SLACK_PX } from '../src/client/tap-slack.ts';

describe('nearestTap: a tap near a small body takes it', () => {
  const at = { x: 100, y: 100 };
  it('takes a body centre within 22 px and none beyond', () => {
    expect(TAP_SLACK_PX).toBe(22);
    expect(nearestTap(at, [{ id: 'rat', x: 122, y: 100 }])).toBe('rat'); // exactly on the edge
    expect(nearestTap(at, [{ id: 'rat', x: 116, y: 116 }])).toBe(null); // 22.6 px away
    expect(nearestTap(at, [])).toBe(null);
  });
  it('the nearest wins, whatever the order', () => {
    const pts = [
      { id: 'far', x: 115, y: 100 },
      { id: 'near', x: 95, y: 104 },
    ];
    expect(nearestTap(at, pts)).toBe('near');
    expect(nearestTap(at, [...pts].reverse())).toBe('near');
  });
  it('a tie keeps the first listed', () => {
    expect(
      nearestTap(at, [
        { id: 'a', x: 110, y: 100 },
        { id: 'b', x: 90, y: 100 },
      ]),
    ).toBe('a');
  });
});
