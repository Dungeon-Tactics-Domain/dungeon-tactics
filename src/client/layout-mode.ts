// How the battle interface is laid out (Nov 16, Fernando: the places of FFT: The Ivalice Chronicles): at the screen
// edges or in a centred 16:9 frame (ui3d/layout.ts holds the places). Picked in Options and saved in dt:layout; the
// address's ?layout=edges|frame wins when the page opens. The data-layout attribute on <html> hands it to the CSS.
import { param, store } from './store.ts';
import { type LayoutMode, parseLayout } from './ui3d/layout.ts';

export const LAYOUT_KEY = 'dt:layout';

let mode = parseLayout(param('layout') ?? store.get(LAYOUT_KEY));

export const getLayout = (): LayoutMode => mode;

// for this page only (a sandbox spec); every open screen follows by CSS, the 3D layer on its next fit
export function showLayout(m: LayoutMode) {
  mode = m;
  document.documentElement.dataset.layout = m;
}
export function setLayout(m: LayoutMode) {
  store.set(LAYOUT_KEY, m);
  showLayout(m);
}

if (typeof document !== 'undefined') showLayout(mode);
