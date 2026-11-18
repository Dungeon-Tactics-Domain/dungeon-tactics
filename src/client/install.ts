// Install the game on the home screen (Fernando, Nov 18): the title offers "Instalar o jogo". Chrome and Edge hand over
// a `beforeinstallprompt` once, whenever they judge the page installable, and it must be kept for the tap: entry.ts
// starts `watchInstall` before the first screen, so the screens that come and go (nav.ts) never lose it. Safari on an
// iPhone or iPad has no such event: there the line opens a sheet that says where the Share menu is.
import { t } from './i18n.ts';

interface InstallEvent extends Event {
  prompt(): Promise<unknown>;
}
export interface InstallEnv {
  installed: boolean; // opened from the home screen (display-mode fullscreen or standalone)
  ios: boolean; // an iPhone or iPad (iPadOS says it is a Mac, with a touch screen)
  prompt: boolean; // the browser handed over its install event and it is still unused
}
// what the title shows: the browser's own install dialog, the how-to sheet, or no line at all (an installed game, a PC
// whose browser never fired the event, any browser that cannot install)
export const installOffer = (e: InstallEnv): 'none' | 'prompt' | 'help' =>
  e.installed ? 'none' : e.prompt ? 'prompt' : e.ios ? 'help' : 'none';

export const INSTALL_LABEL = () => t('Instalar o jogo', 'Install the game');
export const installHelpText = () =>
  t('Toque em Compartilhar e depois em Adicionar à Tela de Início', 'Tap Share and then Add to Home Screen');

let saved: InstallEvent | null = null;
const listeners = new Set<() => void>();
// over a copy: a title that reopens adds its own listener meanwhile
const notify = () => {
  for (const fn of [...listeners]) fn();
};
const standalone = () =>
  matchMedia('(display-mode: fullscreen)').matches ||
  matchMedia('(display-mode: standalone)').matches ||
  !!(navigator as Navigator & { standalone?: boolean }).standalone; // Safari's own flag for the home screen

export const installEnv = (): InstallEnv => ({
  installed: standalone(),
  ios:
    /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
  prompt: !!saved,
});

// entry.ts, once; `onChange` is how a title already on screen learns of an event that came late (or of the install)
export function watchInstall() {
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // no mini-bar: the title's line asks when the player taps
    saved = e as InstallEvent;
    notify();
  });
  addEventListener('appinstalled', () => {
    saved = null;
    notify();
  });
}
export const onInstallChange = (fn: () => void, signal: AbortSignal) => {
  listeners.add(fn);
  signal.addEventListener('abort', () => listeners.delete(fn), { once: true });
};

// the tap: the browser's dialog (one use per event; accepted or not, the event is spent and the line goes until a new one)
export function askInstall() {
  const e = saved;
  saved = null;
  void e
    ?.prompt()
    .catch(() => {})
    .then(() => {
      notify(); // the event is spent: the line goes until the browser fires a new one
    });
}
