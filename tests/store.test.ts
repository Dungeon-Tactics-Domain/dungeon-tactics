import { afterEach, describe, expect, it, vi } from 'vitest';
import { migrate, store } from '../src/client/store.ts';

const saves = (init: Record<string, string>) => {
  const m = new Map(Object.entries(init));
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
};

describe('save migration', () => {
  it('moves the Portuguese keys to the English ones, keeping the values', () => {
    const s = saves({ 'dt:grupo': '{"deployed":[]}', 'dt:bau': '{"gold":150}', 'dt:lang': 'en' });
    migrate(s);
    expect(Object.fromEntries(s.m)).toEqual({
      'dt:party': '{"deployed":[]}',
      'dt:chest': '{"gold":150}',
      'dt:lang': 'en',
      'dt:migrated': '6',
      // the progress kept becomes save slot 1 (saves.ts)
      'dt:saves': JSON.stringify({
        active: 1,
        slots: [{ id: 1, data: { 'dt:party': '{"deployed":[]}', 'dt:chest': '{"gold":150}' } }],
      }),
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

describe('campaign saves', () => {
  it('are dropped with the campaign, under the old names too, and the rest stays', () => {
    const s = saves({
      'dt:migrated': '2',
      'dt:world': '4',
      'dt:campaign': '3',
      'dt:hero': '{"name":"Ayla"}',
      'dt:quests': '["road-rats"]',
      'dt:mundo': '2',
      'dt:battle:camp2': '{}',
      'dt:battle:quest-road-rats': '{}',
      'dt:battle:missao-cripta-rasa': '{}',
      'dt:battle': '{}',
      'dt:battle:expedition': '{}',
      'dt:party': '{}',
    });
    migrate(s);
    expect([...s.m.keys()].sort()).toEqual(['dt:migrated', 'dt:party', 'dt:saves']);
    expect(s.m.get('dt:migrated')).toBe('6');
  });
});

describe('life x5 (Nov 15)', () => {
  it('drops the battles saved mid-fight at the old scale and nothing else', () => {
    const s = saves({
      'dt:migrated': '4',
      'dt:battle': '{}',
      'dt:battle:crawl': '{}',
      'dt:battle:expedition': '{}',
      'dt:battles': '{}',
      'dt:party': '{}',
    });
    migrate(s);
    expect([...s.m.keys()].sort()).toEqual(['dt:battles', 'dt:migrated', 'dt:party']);
  });
});

// Nov 19 audit: a write a full storage refused read back the older stored value (an expedition's gold came back as the old
// chest); this tab's memory must win until a write is kept again
describe('store with a full browser storage', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('reads back what it was asked to write, and the stored value again once a write is kept', () => {
    const s = saves({ 'dt:chest': 'old' });
    let full = true;
    vi.stubGlobal('localStorage', {
      ...s,
      setItem: (k: string, v: string) => {
        if (full) throw new Error('QuotaExceededError');
        s.setItem(k, v);
      },
    });
    store.set('dt:chest', 'new');
    expect(store.get('dt:chest')).toBe('new');
    expect(store.saved('dt:chest')).toBe('old'); // the refusal still shows to the save slots (saves.ts)
    full = false;
    store.set('dt:chest', 'kept');
    s.setItem('dt:chest', 'other tab'); // another tab writes after it
    expect(store.get('dt:chest')).toBe('other tab');
  });
});
