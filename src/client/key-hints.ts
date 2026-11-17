// The key hints' live side (Fernando, Nov 17): which input the hints are drawn for right now (the Options' choice in
// dt:glyphs, the input last used, the pad's family), and the HTML hint that redraws itself when that changes. The rules
// are glyphs.ts (pure), the drawing glyph-art.ts; the 3D screens listen with `onShown` and draw with ui3d/caps.ts.
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

function settle() {
  const next = shownFor(mode, last, family);
  if (next === now) return;
  now = next;
  for (const e of document.querySelectorAll('[data-live]')) fills.get(e)?.();
  for (const fn of heard) fn();
}
// The game's pad loops (battle-input.ts, game/town.ts) hand over the pad they read each frame: one in use turns the
// hints into its family's icons
export function padSeen(gp: Gamepad) {
  if (last === 'pad' && family === familyOf(gp.id)) return;
  if (
    !padBusy(
      gp.buttons.map((b) => b.pressed),
      [...gp.axes],
    )
  )
    return;
  last = 'pad';
  family = familyOf(gp.id);
  settle();
}
// a key brings the keys back; the mouse changes nothing. Only a real key: the pad's B closes a window through a made-up
// Escape (dialog.ts padDialog)
if (typeof addEventListener !== 'undefined')
  addEventListener(
    'keydown',
    (e) => {
      if (!e.isTrusted) return;
      last = 'key';
      settle();
    },
    true,
  );

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
