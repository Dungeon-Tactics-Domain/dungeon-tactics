// Idioma do jogo: português ou inglês. Lido uma vez ao carregar; trocar grava e recarrega a página (herdado do Warlock).
// Texto curto: t('pt', 'en') no ponto de uso. Nomes de unidade e habilidade: o campo `en` ao lado do pt em src/shared/battle.
import { ABILITIES } from '../shared/battle/abilities.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';
import { store } from './store.ts';

export type Lang = 'pt' | 'en';
export const LANG_KEY = 'dt:lang';

// escolha salva vale; sem ela, navegador em português (pt, pt-BR, pt-PT) abre em português e o resto em inglês
export const pickLang = (saved: string | null, nav: string | undefined): Lang =>
  saved === 'pt' || saved === 'en' ? saved : /^pt\b/i.test(nav ?? '') ? 'pt' : 'en';

export const LANG: Lang = pickLang(store.get(LANG_KEY), typeof navigator === 'undefined' ? undefined : navigator.language);
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
