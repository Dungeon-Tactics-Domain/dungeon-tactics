import { afterEach, describe, expect, it, vi } from 'vitest';
import { store } from '../src/client/store.ts';
import { getTheme, setTheme, THEME_KEY, THEMES } from '../src/client/theme.ts';

describe('interface theme', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('defaults to FFT Classic, the first listed theme', () => {
    expect(THEMES[0][0]).toBe('fft');
    expect(getTheme()).toBe('fft');
  });

  it('falls back to the default on an unknown or corrupt save', () => {
    for (const bad of ['fft-old', '', '{"x":1}', 'FFT']) {
      store.set(THEME_KEY, bad);
      expect(getTheme()).toBe('fft');
    }
  });

  it('saves the choice and puts it on <html> at once', () => {
    const html = { dataset: {} as Record<string, string> };
    vi.stubGlobal('document', { documentElement: html });
    store.set(THEME_KEY, 'junk');
    setTheme('fft');
    expect(store.get(THEME_KEY)).toBe('fft');
    expect(getTheme()).toBe('fft');
    expect(html.dataset.theme).toBe('fft');
  });
});
