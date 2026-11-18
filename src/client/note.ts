// A notice window: a title, a legend of marks, paragraphs, a figure and one to three buttons (the expedition map's
// Information and opened chest, the expedition lost, a room that would not open, a save refused). With the 3D look
// (window3d/note3d.ts, ?note=3d, the default) it is drawn on the 3D layer; else `html` opens the window of always, or
// the plain one below for a notice that never had its own. This file is all the rest of the client names.
import { dialog } from './dialog.ts';
import { button, el } from './icons.ts';

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
type Win = { overlay: HTMLElement; close(): void };
export type NoteHtml = () => Win; // the HTML window

let show3d: ((n: Note, html: NoteHtml) => boolean) | undefined;
let open: { n: Note; html: NoteHtml; win: Win } | undefined;

// The 3D look arrives after the page (hud-skin.ts): it takes the notice already open and every one opened after;
// false from it (a page too small for the sheet) leaves the HTML window
export function setNote3d(show?: (n: Note, html: NoteHtml) => boolean) {
  show3d = show;
  const o = open;
  if (!show || !o?.win.overlay.isConnected) return;
  o.win.close(); // first: a seen HTML window keeps the notice in HTML
  if (!show(o.n, o.html)) o.win = o.html();
}

// The notice as a plain window of dialog.ts: its paragraphs and its buttons (the notices that were a native alert until
// Nov 18: a room that would not open, a save refused)
function plain(n: Note): Win {
  const d = dialog(
    'title',
    n.title,
    [
      ...(n.text ?? []).map((p) => el('p', {}, p)),
      el(
        'div',
        { class: 'menu-actions' },
        ...n.buttons.map((b) =>
          button('primary', b.label, () => {
            d.close();
            b.run?.();
          }),
        ),
      ),
    ],
    { fixed: n.fixed, onBack: n.onBack },
  );
  d.overlay.querySelector<HTMLButtonElement>('.primary')!.focus();
  return d;
}

export function noteWindow(n: Note, html: NoteHtml = () => plain(n)) {
  if (show3d?.(n, html)) return;
  open = { n, html, win: html() };
}
