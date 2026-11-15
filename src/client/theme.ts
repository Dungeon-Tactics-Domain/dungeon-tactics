// Interface theme (Nov 15, Fernando's request: swappable themes, FFT Classic first): each theme is a block of tokens under
// :root[data-theme="<id>"] in style.css, picked by the data-theme attribute on <html>. Saved in dt:theme.
import { store } from './store.ts';

export const THEME_KEY = 'dt:theme';
// id, Portuguese and English name; the first one is the default
export const THEMES = [['parchment', 'Pergaminho', 'Parchment']] as const;
export type Theme = (typeof THEMES)[number][0];

// a missing, unknown or corrupt save falls back to the default
export function getTheme(): Theme {
  const saved = store.get(THEME_KEY);
  return THEMES.find(([id]) => id === saved)?.[0] ?? THEMES[0][0];
}

// applies at once: the tokens change and every screen follows, no reload
export function setTheme(id: Theme) {
  store.set(THEME_KEY, id);
  document.documentElement.dataset.theme = id;
}

// on import: index.html already copied the raw save before the first paint; this replaces an unknown value with the default
if (typeof document !== 'undefined') document.documentElement.dataset.theme = getTheme();
