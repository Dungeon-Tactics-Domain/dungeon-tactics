// Fullscreen (Fernando, Nov 18: a phone opened the game under Chrome's bar): one switch and one name for Options, the
// title and the battle's ☰ list, and the rule for how loudly the title offers it. Only where the API exists (an
// iPhone has none). The request settles later, so whoever shows the state reads it again on `fullscreenchange`.
import { t } from './i18n.ts';

export const fullscreenOn = () => !!document.fullscreenElement;
// in fullscreen now, or undefined where the browser has no Fullscreen API (what tool-rows.ts takes)
export const fullscreenNow = () => (document.fullscreenEnabled ? fullscreenOn() : undefined);
// what the shortcut says: what a tap does now
export const fullscreenLabel = (on: boolean) =>
  on ? t('Sair da tela cheia', 'Exit fullscreen') : t('Tela cheia', 'Fullscreen');
export const FULLSCREEN_CTA = () => t('Jogar em tela cheia', 'Play in fullscreen');

export function toggleFullscreen(on = !fullscreenOn()) {
  if (!on) return void document.exitFullscreen().catch(() => {});
  document.documentElement
    .requestFullscreen()
    // a phone plays on its side only; a tablet both ways (mobile-ux.md, section 2), so only a phone is locked
    .then(() => {
      if (Math.min(screen.width, screen.height) < 600) return screen.orientation?.lock?.('landscape');
    })
    .catch(() => {}); // refused (no gesture, or a browser that never locks): the page stays as it was
}

// Fernando, Nov 18 (bug): on a phone the browser's bar came back at each change of screen. Every screen is its own page
// (location.search in crawl.ts goHome and toTitle, title.ts, room-end.ts, expedition-map.ts, saves-ui.ts, i18n.ts), and
// a page that unloads leaves fullscreen with no fullscreenchange (measured in Chrome). So the wish is kept for the tab
// (sessionStorage, not store.ts: it must die with the tab) and the new page's first gesture asks again; a browser only
// grants fullscreen inside one. Leaving it on purpose (Esc, the back gesture, the switch) fires fullscreenchange and
// forgets the wish
const WANT = 'dt:fullscreen';
const wish = (on?: boolean) => {
  try {
    if (on === undefined) return sessionStorage.getItem(WANT) === '1';
    if (on) sessionStorage.setItem(WANT, '1');
    else sessionStorage.removeItem(WANT);
  } catch {} // storage blocked: fullscreen just stays one page long, as before
  return false;
};
export function keepFullscreen() {
  if (!document.fullscreenEnabled) return;
  document.addEventListener('fullscreenchange', () => wish(fullscreenOn()));
  if (!wish() || fullscreenOn()) return;
  // pointerdown carries a mouse's gesture, pointerup a finger's; Escape and the like carry none, so it waits for the next
  const again = () => {
    if (!navigator.userActivation?.isActive) return;
    for (const type of ['pointerdown', 'pointerup', 'keydown']) removeEventListener(type, again, true);
    toggleFullscreen(true);
  };
  for (const type of ['pointerdown', 'pointerup', 'keydown']) addEventListener(type, again, true);
}

export interface FullscreenEnv {
  api: boolean; // document.fullscreenEnabled
  touch: boolean; // a finger points: (pointer: coarse), as confirm3d.ts and talk.ts ask
  installed: boolean; // opened from the home screen (display-mode fullscreen or standalone)
  on: boolean; // in fullscreen now
}
// Fernando, Nov 18: a phone in the browser gets the title's main button ("Jogar em tela cheia"); a PC, an installed
// game or one already in fullscreen gets the quiet shortcut beside the language; no API, nothing
export const fullscreenOffer = (e: FullscreenEnv): 'none' | 'quiet' | 'main' =>
  !e.api ? 'none' : e.touch && !e.installed && !e.on ? 'main' : 'quiet';

export const fullscreenEnv = (): FullscreenEnv => ({
  api: document.fullscreenEnabled,
  touch: matchMedia('(pointer: coarse)').matches,
  installed:
    matchMedia('(display-mode: fullscreen)').matches ||
    matchMedia('(display-mode: standalone)').matches ||
    !!(navigator as Navigator & { standalone?: boolean }).standalone, // Safari's own flag for the home screen
  on: fullscreenOn(),
});
