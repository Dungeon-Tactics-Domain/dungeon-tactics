// The key hints' live side (Fernando, Nov 17): which input the hints are drawn for right now (the Options' choice in
// dt:glyphs, the input last used, the pad's family), and the HTML hint that redraws itself when that changes. The rules
// are glyphs.ts (pure), the drawing glyph-art.ts; the 3D screens listen with `onShown` and draw with ui3d/caps.ts.
// Also the battle's two help options (Nov 18): Tutorial (dt:tutorial) and Key and button hints (dt:hints), `onHelp`.
import { capCanvas } from './glyph-art.ts';
import {
  type Act,
  type Cap,
  capsOf,
  type Family,
  familyOf,
  type GlyphMode,
  keysText,
  padBusy,
  parseGlyphMode,
  type Shown,
  shownFor,
} from './glyphs.ts';
import { t } from './i18n.ts';
import { el } from './icons.ts';
import { pick } from './option-row.ts';
import { store } from './store.ts';

export const GLYPHS_KEY = 'dt:glyphs';

let mode = parseGlyphMode(store.get(GLYPHS_KEY));
let last: 'key' | 'pad' = 'key';
let family: Family = 'xbox';
let now: Shown = shownFor(mode, last, family);
const heard = new Set<() => void>();
const fills = new WeakMap<Element, () => void>();

export const keysShown = (): Shown => now;
export const getGlyphMode = (): GlyphMode => mode;
export function setGlyphMode(m: GlyphMode) {
  store.set(GLYPHS_KEY, m);
  mode = m;
  settle();
}
// called when what the hints show changes; returns how to stop listening
export function onShown(fn: () => void): () => void {
  heard.add(fn);
  return () => heard.delete(fn);
}

// `force`: tell the listeners even when the icons stay the same (a pad back after a finger: the 3D layer must bring the
// hints back, Nov 18)
function settle(force = false) {
  const next = shownFor(mode, last, family);
  if (next === now && !force) return;
  now = next;
  for (const e of document.querySelectorAll('[data-live]')) fills.get(e)?.();
  for (const fn of heard) fn();
}
// The game's pad loops (battle-input.ts, game/town.ts) hand over the pad they read each frame: one in use turns the
// hints into its family's icons
export function padSeen(gp: Gamepad) {
  if (last === 'pad' && family === familyOf(gp.id) && !touched) return;
  if (
    !padBusy(
      gp.buttons.map((b) => b.pressed),
      [...gp.axes],
    )
  )
    return;
  last = 'pad';
  family = familyOf(gp.id);
  settle(touched);
  touched = false;
}
// a finger played since the pad was last heard: the pad's next press must tell the layer, even with the same icons
let touched = false;
// a key brings the keys back; the mouse changes nothing. Only a real key: the pad's B closes a window through a made-up
// Escape (dialog.ts padDialog)
if (typeof addEventListener !== 'undefined') {
  addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType !== 'mouse') touched = true;
    },
    true,
  );
  addEventListener(
    'keydown',
    (e) => {
      if (!e.isTrusted) return;
      last = 'key';
      settle();
    },
    true,
  );
}

// An element that fills itself again whenever what the hints show changes, for as long as it is on the page
export function live<T extends HTMLElement>(e: T, fill: (e: T, shown: Shown) => void): T {
  e.dataset.live = '';
  fills.set(e, () => fill(e, now));
  fill(e, now);
  return e;
}
// a line of text that names keys: `say` builds it from the table (glyphs.ts hintLine, keysText)
export const liveText = (cls: string, say: (shown: Shown) => string) =>
  live(el('span', { class: cls }), (e, s) => {
    e.textContent = say(s);
  });

const urls = new Map<string, string>();
// drawn at twice the size it shows at (style.css .cap)
function capImage(cap: Cap): HTMLImageElement {
  const font = getComputedStyle(document.documentElement).getPropertyValue('--font').trim() || 'sans-serif';
  const key = JSON.stringify([cap, font]);
  let src = urls.get(key);
  if (!src) urls.set(key, (src = capCanvas(cap, 56, font).toDataURL()));
  return el('img', { class: 'cap', alt: '', src });
}
// The hint of an action beside its button: its keys, or the pad's buttons, drawn; hidden while the pad's icons show and
// the pad has no button for it. `data-act` names the action for whoever copies the hint (town3d/hud3d.ts)
export const hint = (act: Act, cls = 'hint') =>
  live(el('kbd', { class: cls, 'aria-hidden': 'true', 'data-act': act }), (k, s) => {
    const caps = capsOf(act, s);
    k.hidden = !caps;
    k.dataset.keys = keysText(act, s) ?? '';
    k.replaceChildren(...(caps ?? []).map(capImage));
  });

// The battle's teaching lines (Fernando, Nov 18): why a tile is refused ("Não cabe aqui…") and the banner's
// instructions ("Ladino: o que fazer?") are a Tutorial, off unless the player turns it on in Options
export const TUTORIAL_KEY = 'dt:tutorial';
export const parseTutorial = (raw: unknown) => raw === true;
export const tutorialOn = () => parseTutorial(store.json(TUTORIAL_KEY));
// the banner and the foot redraw as soon as either option changes, under the Options window (hints3d.ts)
const helpHeard = new Set<() => void>();
export function onHelp(fn: () => void): () => void {
  helpHeard.add(fn);
  return () => helpHeard.delete(fn);
}
const saveHelp = (key: string, value: string) => {
  store.set(key, value);
  for (const fn of helpHeard) fn();
};
export const setTutorial = (on: boolean) => saveHelp(TUTORIAL_KEY, JSON.stringify(on));

// The button hints at the foot of the battle (Fernando, Nov 18): Automatic shows them only while a key or a pad is the
// input in use, never for a finger; Always and Never hold whatever the input
export type HintsMode = 'auto' | 'always' | 'never';
export const HINTS_KEY = 'dt:hints';
export const parseHintsMode = (raw: unknown): HintsMode => (raw === 'always' || raw === 'never' ? raw : 'auto');
export const hintsMode = () => parseHintsMode(store.get(HINTS_KEY));

// its Options row, beside Key icons
export const hintsOption = () =>
  pick(
    t('Dicas de tecla e botão', 'Key and button hints'),
    t(
      'O rodapé da batalha com o que cada tecla ou botão faz. Automático: só com teclado ou controle em uso, nunca no toque.',
      'The battle’s footer with what each key or button does. Automatic: only while a keyboard or pad is in use, never on touch.',
    ),
    [
      ['auto', t('Automático', 'Automatic')],
      ['always', t('Sempre', 'Always')],
      ['never', t('Nunca', 'Never')],
    ] as [HintsMode, string][],
    hintsMode,
    (m) => saveHelp(HINTS_KEY, m),
  );

// The Options row: Automatic, the keys, or one pad family held whatever is plugged in
export const glyphsOption = () =>
  pick(
    t('Ícones das teclas', 'Key icons'),
    t(
      'O que as dicas de tecla mostram. Automático segue o que você usou por último: um botão do controle traz os ícones dele, uma tecla traz o teclado de volta; o mouse não muda nada.',
      'What the key hints show. Automatic follows what you used last: a pad button brings its icons, a key brings the keyboard back; the mouse changes nothing.',
    ),
    [
      ['auto', t('Automático', 'Automatic')],
      ['keyboard', t('Teclado', 'Keyboard')],
      ['xbox', 'Gamepad Xbox'],
      ['playstation', 'Gamepad PlayStation'],
      ['switch', 'Gamepad Switch'],
    ] as [GlyphMode, string][],
    getGlyphMode,
    setGlyphMode,
  );
