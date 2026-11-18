// Pure side of the 3D Options (options3d.ts): what each item of the list shows, from the same board the HTML window
// gets (game/options.ts), text already translated. Read the way FFT: The Ivalice Chronicles draws its settings: a
// choice in a box between two arrows, a 0 to 100% value as a bar with its number, a yes or no as a switch (with its word
// beside it: colour is never the only signal), and the hints on the band at the foot. No DOM or Three here; tested in
// tests/flow3d.test.ts.
import type { OptionsItem } from '../game/options.ts';
import { type Act, hintLine, type Shown } from '../glyphs.ts';
import { t } from '../i18n.ts';
import type { Zone } from './options-layout.ts';

export interface RowView {
  kind: 'head' | 'pick' | 'bar' | 'toggle' | 'link';
  label: string;
  text: string; // the value as written
  fill: number; // bar: 0 to 1
  on: boolean; // toggle
}

export const optionsView = (items: OptionsItem[]): RowView[] =>
  items.map((it) => {
    const row: RowView = { kind: 'head', label: '', text: '', fill: 0, on: false };
    if ('head' in it) return { ...row, label: it.head };
    if ('link' in it) return { ...row, kind: 'link', label: it.link };
    const o = it.option;
    return {
      kind: o.bar ? 'bar' : o.on ? 'toggle' : 'pick',
      label: o.label,
      text: o.text(),
      fill: o.bar ? Math.max(0, Math.min(1, o.bar.fill() / 100)) : 0,
      on: o.on?.() ?? false,
    };
  });

// The band at the foot: what the keys do where the cursor is, from the one table (glyphs.ts: a hint the pad has no
// button for leaves the line); a touch screen, which shows no key, is told the two taps instead
export function optionsHints(zone: Zone, shown: Shown, keys: boolean): string {
  if (!keys) return t('Toque numa categoria e depois numa opção', 'Tap a category, then an option');
  const does: Record<Zone, [Act, string][]> = {
    cat: [
      ['confirm', t('abrir', 'open')],
      ['cancel', t('voltar', 'back')],
    ],
    row: [
      ['sides', t('mudar o valor', 'change the value')],
      ['cancel', t('voltar às categorias', 'back to categories')],
    ],
    cmd: [
      ['confirm', t('escolher', 'choose')],
      ['cancel', t('voltar', 'back')],
    ],
  };
  return hintLine(shown, [['tabs', t('trocar de categoria', 'change category')], ...does[zone]]);
}
