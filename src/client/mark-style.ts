// How the marks on the board are drawn (Nov 17, Fernando: "nothing flat": relief, texture and light on the ground lines
// and the rings round the characters): `simples` is the flat drawing of before, `luz` light etched in the ground, `pedra`
// stone and metal pieces, `neon` tubes of light. Picked in Options and saved in dt:marks; the address's
// ?marks=simples|luz|pedra|neon wins when the page opens. No automatic fallback: the player picks. The scene reads it
// when it builds its marks and hears a change through `onMarkStyle`. The choice itself is pure and tested.
import { param, store } from './store.ts';

export const MARK_STYLES = ['simples', 'luz', 'pedra', 'neon'] as const;
export type MarkStyle = (typeof MARK_STYLES)[number];
export const MARKS_KEY = 'dt:marks';
// Luz: measured on the bench (docs/game-design/client-scene.md, "Mark styles") at the same frame time as the flat marks
export const MARK_DEFAULT: MarkStyle = 'luz';

export const parseMarkStyle = (v: unknown): MarkStyle =>
  (MARK_STYLES as readonly unknown[]).includes(v) ? (v as MarkStyle) : MARK_DEFAULT;

// the address beats what is saved, and a value that is not a style falls to the next source
export const pickMarkStyle = (flag: string | null, saved: string | null): MarkStyle =>
  parseMarkStyle((MARK_STYLES as readonly unknown[]).includes(flag) ? flag : saved);

let style = pickMarkStyle(param('marks'), store.get(MARKS_KEY));
let heard: (() => void) | null = null;

export const getMarkStyle = (): MarkStyle => style;

// the open battle redraws its marks (one battle at a time: the last listener stays)
export function onMarkStyle(redraw: (() => void) | null) {
  heard = redraw;
}
// for this page only (a sandbox spec)
export function showMarkStyle(s: MarkStyle) {
  style = s;
  heard?.();
}
export function setMarkStyle(s: MarkStyle) {
  store.set(MARKS_KEY, s);
  showMarkStyle(s);
}
