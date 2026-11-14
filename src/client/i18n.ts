// Game language: Portuguese or English. Read once on load; switching saves and reloads the page (inherited from the Warlock).
// Short text: t('pt', 'en') at the point of use. Unit and ability names: the `en` field beside the pt in src/shared/battle.
import { ABILITIES } from '../shared/battle/abilities.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';
import { store } from './store.ts';

export type Lang = 'pt' | 'en';
export const LANG_KEY = 'dt:lang';

// saved choice wins; without it, a Portuguese browser (pt, pt-BR, pt-PT) opens in Portuguese and the rest in English
export const pickLang = (saved: string | null, nav: string | undefined): Lang =>
  saved === 'pt' || saved === 'en' ? saved : /^pt\b/i.test(nav ?? '') ? 'pt' : 'en';

export const LANG: Lang = pickLang(
  store.get(LANG_KEY),
  typeof navigator === 'undefined' ? undefined : navigator.language,
);
export const LOCALE = LANG === 'en' ? 'en-US' : 'pt-BR';
if (typeof document !== 'undefined') document.documentElement.lang = LOCALE;

export const t = (pt: string, en: string) => (LANG === 'en' ? en : pt);

export function setLang(l: Lang) {
  if (l === LANG) return;
  store.set(LANG_KEY, l);
  location.reload();
}

export const unitName = (def: string) => t(UNIT_DEFS[def].name, UNIT_DEFS[def].en);
export const abilityName = (id: string) => t(ABILITIES[id].name, ABILITIES[id].en);
