// A notice window: a title, a legend of marks, paragraphs, a figure and one to three buttons (the expedition map's
// Information and opened chest, the expedition lost, a room that would not open, a save refused), drawn on the 3D
// layer by window3d/note3d.ts. This file is all the rest of the client names.
import { looks3d } from './looks3d.ts';

// a legend's mark, after the expedition map's seals: `look` is the place's state, `square` the chest's shape
export interface NoteMark {
  glyph: string;
  look: 'open' | 'ahead' | 'cleared' | 'skipped' | 'flag';
  square?: boolean;
}
export interface Note {
  title: string;
  legend?: [mark: NoteMark, text: string][];
  text?: string[]; // paragraphs
  figure?: [label: string, value: string]; // a number with its name (the gold found)
  buttons: { label: string; run?: () => void }[]; // 1 to 3; the first takes the focus; each closes the window first
  onBack?: () => void; // after Esc, the pad's B, the ✕ or a tap outside
  fixed?: boolean; // only a button closes it
}

export const noteWindow = (n: Note) => looks3d.note?.(n);
