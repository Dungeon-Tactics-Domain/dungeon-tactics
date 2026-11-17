// Pure side of the 3D Options (options3d.ts): what each item of the list shows, from the same board the HTML window
// gets (game/options.ts), text already translated. Read the way FFT: The Ivalice Chronicles draws its settings: a
// choice in a box between two arrows, a 0 to 100% value as a bar with its number, a yes or no as a switch (with its word
// beside it: colour is never the only signal). No DOM or Three here; tested in tests/flow3d.test.ts.
import type { OptionsItem } from '../game/options.ts';

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
