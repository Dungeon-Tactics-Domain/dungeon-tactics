import { describe, expect, it } from 'vitest';
import { migrate } from '../src/client/store.ts';

const saves = (init: Record<string, string>) => {
  const m = new Map(Object.entries(init));
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};

describe('save migration', () => {
  it('moves the Portuguese keys to the English ones, keeping the values', () => {
    const s = saves({ 'dt:heroi': '{"name":"Ayla"}', 'dt:mundo': '4', 'dt:bau': '{"gold":150}', 'dt:lang': 'en' });
    migrate(s);
    expect(Object.fromEntries(s.m)).toEqual({
      'dt:hero': '{"name":"Ayla"}',
      'dt:world': '4',
      'dt:chest': '{"gold":150}',
      'dt:lang': 'en',
      'dt:migrated': '1',
    });
  });

  it('keeps pixel2 and discards the pre-pixel2 setting and the dead stars', () => {
    const s = saves({ 'dt:pixel': '{"size":3}', 'dt:pixel2': '{"size":2}', 'dt:estrelas': '[3]' });
    migrate(s);
    expect(s.m.get('dt:pixel')).toBe('{"size":2}');
    expect([...s.m.keys()].sort()).toEqual(['dt:migrated', 'dt:pixel']);
    const stale = saves({ 'dt:pixel': '{"size":3}' });
    migrate(stale);
    expect(stale.m.has('dt:pixel')).toBe(false);
  });

  it('runs once: a later save under the new name is not touched again', () => {
    const s = saves({ 'dt:pixel2': '{"size":2}' });
    migrate(s);
    s.setItem('dt:pixel', '{"size":4}');
    migrate(s);
    expect(s.m.get('dt:pixel')).toBe('{"size":4}');
  });
});
