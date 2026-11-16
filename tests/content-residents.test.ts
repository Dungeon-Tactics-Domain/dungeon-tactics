import { describe, expect, it } from 'vitest';
import { OTHER_PRISONERS, RESIDENTS } from '../src/content/crawl/residents.ts';

// the residents who keep a place of the town; the others only carry rumours
const KEY = ['hesk', 'marta', 'garrick', 'sela', 'wren'];
const key = RESIDENTS.filter((r) => KEY.includes(r.id));
const texts = RESIDENTS.flatMap((r) => [r.role, ...r.lines.map((l) => l.text)]);
// retired terms (the i18n review of Nov 16: the activity is the expedition), as whole words so "request" passes
const RETIRED = /(?<!\p{L})(quest|descida|descent)(?!\p{L})/iu;

describe('town residents', () => {
  it('ids are unique, the other prisoners included', () => {
    const ids = [...RESIDENTS, ...OTHER_PRISONERS].map((r) => r.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  it('every key resident has exactly 3 lines and a place of their own', () => {
    expect(key.map((r) => r.id)).toEqual(KEY);
    for (const r of key) expect(r.lines, r.id).toHaveLength(3);
    expect(new Set(key.map((r) => r.place)).size).toBe(KEY.length);
  });

  it('every resident speaks and every text is a non-empty pair', () => {
    for (const r of RESIDENTS) expect(r.lines.length, r.id).toBeGreaterThan(0);
    for (const pair of texts) {
      expect(pair).toHaveLength(2);
      for (const s of pair) expect(s.trim()).not.toBe('');
    }
    for (const r of [...RESIDENTS, ...OTHER_PRISONERS]) expect(r.name.trim()).not.toBe('');
  });

  it('no text uses a retired term', () => {
    expect(texts.flat().filter((s) => RETIRED.test(s))).toEqual([]);
  });
});
