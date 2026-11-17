// The windows the title and Options open (saved games, quick battle, how to play, credits, tile marks, controls)
// as data: what each one holds, written once and shown by either look, the HTML window (built here from the
// blocks) or the 3D sheet drawn over it (flow3d/sheet3d.ts; Fernando, Nov 17: what was left in HTML outside the battle
// goes 3D). The window stays the owner of every key, tap, pad button and of the screen reader; the 3D only draws.
import { el } from '../icons.ts';

// a window's reading text, top to bottom
export type Block =
  | { k: 'head'; str: string } // a section's name
  | { k: 'item'; str: string; mark?: string } // a line of a list; `mark`: the tile mark whose swatch stands before it
  | { k: 'text'; str: string } // a paragraph
  | { k: 'key'; key: string; str: string }; // a key and what it does

// a row of a window's command list: a saved game (number, face, who and where, gold and date) or a plain command
export interface SheetRow {
  no?: string;
  face?: string; // the unit sheet whose face shows
  name: string;
  sub?: string; // small, under the name
  right?: string; // at the row's right end
  rightSub?: string;
  side?: boolean; // the row has a second button at its right end (Delete), which says its own text
}
export interface Sheet {
  title: string;
  note?: string; // at the title's right, as the HTML window's
  rows?: SheetRow[]; // one per button of the window's list (two with `side`), in its order
  blocks?: Block[];
}

// the blocks as the HTML windows always had them: a heading, a legend list, paragraphs, a table of keys
export function blocksHtml(blocks: Block[]): HTMLElement[] {
  const out: HTMLElement[] = [];
  const into = (tag: 'ul' | 'dl', cls: string) => {
    const last = out.at(-1);
    if (last?.tagName.toLowerCase() === tag) return last;
    out.push(el(tag, { class: cls }));
    return out.at(-1)!;
  };
  for (const b of blocks) {
    if (b.k === 'head') out.push(el('h3', {}, b.str));
    else if (b.k === 'text') out.push(el('p', {}, b.str));
    else if (b.k === 'item')
      into('ul', 'legend').append(el('li', {}, b.mark ? el('i', { class: `sw ${b.mark}` }) : null, b.str));
    else into('dl', 'keys').append(el('dt', {}, b.key), el('dd', {}, b.str));
  }
  return out;
}

// The 3D sheet takes a window as it opens, and the one already open when the layer arrives (it comes with the battle,
// after the title's first window). Called last by each opener, with the window already focused
type Take = (overlay: HTMLElement, sheet: Sheet) => void;
let take: Take | undefined;
let open: [HTMLElement, Sheet] | undefined;
export function showSheet(overlay: HTMLElement, sheet: Sheet) {
  open = [overlay, sheet];
  take?.(overlay, sheet);
}
export function setSheet3d(fn?: Take) {
  take = fn;
  if (open?.[0].isConnected) fn?.(...open);
}
