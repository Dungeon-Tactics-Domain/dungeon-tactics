import { describe, expect, it } from 'vitest';
import { parseMotion } from '../src/client/motion.ts';

// Reduce motion (Nov 16): Yes / No / System, System on any doubt
describe('reduce motion preference', () => {
  it('keeps the three choices', () => {
    expect(parseMotion('reduce')).toBe('reduce');
    expect(parseMotion('full')).toBe('full');
    expect(parseMotion('system')).toBe('system');
  });
  it('falls back to System on anything else', () => {
    for (const v of [null, undefined, true, 1, 'yes', {}]) expect(parseMotion(v)).toBe('system');
  });
});
