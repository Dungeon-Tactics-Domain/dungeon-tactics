// Where the 3D "Execute?" window puts its head, its notes and its two choices (confirm3d.ts), with no DOM: the sizes
// are the drawing's, in px of the reference, and a note is as tall as the lines its words take. The unseen HTML window
// under the drawing is seated from these same numbers. Pure and tested (tests/confirm-layout.test.ts) against what the
// browser measured before the numbers moved here.
import { type Box, lu, textPx } from '../ui3d/layout.ts';

// text sizes in px of the reference (never under 16 px on the page: layout.ts textPx)
export const SIZE = { head: 26, note: 18, choice: 24 };
const W = 440; // the window, in px of the reference
const EDGE = 2; // its frame, and the rule under the head: whole px at every scale
const ICON = 32; // the ability's icon beside the title: the head is never shorter
const LINE = 1.3; // line height of the head and of the notes
const TAP = 44; // a finger's target (design system, section 8)

export interface ConfirmLayout extends Box {
  head: Box; // from the window's top left, like every box here
  notes: Box[];
  choices: Box[];
}

// `lines`: how many lines `str` takes at `px` in `width` (the 3D kit's own wrap); `coarse`: a finger points, the
// choices keep its 44 px
export function confirmLayout(
  parts: { title: string; notes: string[]; choices: number },
  s: number,
  coarse: boolean,
  lines: (str: string, px: number, width: number) => number,
): ConfirmLayout {
  const u = (v: number) => lu(v * s),
    w = u(W),
    side = EDGE + u(12),
    inner = w - 2 * side,
    line = (size: number) => lu(LINE * textPx(size, s));
  const title = lines(parts.title, textPx(SIZE.head, s), inner - 2 * u(14) - ICON - 10);
  const head = { x: side, y: EDGE, w: inner, h: 2 * u(10) + Math.max(ICON, title * line(SIZE.head)) + EDGE };
  let y = head.y + head.h;
  const notes = parts.notes.map((str) => {
    const box = { x: side + u(6), y: y + u(8), w: inner - 2 * u(6), h: 0 };
    box.h = lines(str, textPx(SIZE.note, s), box.w) * line(SIZE.note);
    y = box.y + box.h;
    return box;
  });
  // the choices side by side, 6 px apart, 8 px in from the window's padding and 10 px under what comes before; each
  // starts on 1/64 px, as the browser lays a row out, so two halves may differ by that much
  const at = (i: number) => Math.round(i * (cw + 6) * 64) / 64;
  const cw = (inner - 16 - 6 * (parts.choices - 1)) / parts.choices,
    ch = Math.max(u(52), coarse ? TAP : 0),
    choices = Array.from({ length: parts.choices }, (_, i) => ({
      x: side + 8 + at(i),
      y: y + 10,
      w: at(i + 1) - at(i) - 6,
      h: ch,
    }));
  return { x: 0, y: 0, w, h: y + 10 + ch + u(12) + EDGE, head, notes, choices };
}
