import { describe, expect, it } from 'vitest';
import { nextRng, rollInt } from '../src/shared/battle/rng.ts';

describe('battle rng', () => {
  it('the same seed gives the same sequence', () => {
    const run = (seed: number) => {
      let s = seed;
      return Array.from({ length: 5 }, () => { const [v, n] = nextRng(s); s = n; return v; });
    };
    expect(run(7)).toEqual(run(7));
    expect(run(7)).not.toEqual(run(8));
  });

  it('nextRng does not change the argument and the saved state continues the sequence', () => {
    const [v1, s1] = nextRng(42);
    const [v1b] = nextRng(42);
    expect(v1b).toBe(v1);
    const [v2] = nextRng(s1); // state saved midway
    const [, s1again] = nextRng(42);
    expect(nextRng(s1again)[0]).toBe(v2);
  });

  it('rollInt stays within the range, endpoints included', () => {
    let s = 1;
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) {
      const [v, n] = rollInt(s, 3, 6);
      s = n;
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6]);
  });
});
