// Form fields of the 3D kit (Fernando, Nov 18: every screen in 3D, forms too): what a field is, where it and its parts
// sit, and where the cursor goes. A screen hands a list of fields; `flowFields` lays them in one scrolling column (a
// value row spans it, so left and right are free to change the value, as in the Options; marks and buttons share a
// row in columns), `fieldParts` cuts a row into its label, its value and its two arrows, `fieldWalk` moves the cursor
// by what is seen (walk.ts). The same boxes place the drawing (flow3d/field-draw.ts) and the real, unseen controls
// under it (field-dom.ts). Sizes follow the page's scale and never go under a 44 px tap or 16 px text. Pure and tested
// (tests/dev3d.test.ts): no DOM, no Three.
import type { Box } from './layout.ts';
import { neighbour, type Way } from './walk.ts';

export type Field =
  | { kind: 'head'; id: string; label: string }
  | { kind: 'note'; id: string; label: string; warn?: boolean } // a line of text; `warn`: what stops the form
  // a whole number between two arrows; `value`, `min` and `max` as shown, `step` apart
  | { kind: 'number'; id: string; label: string; value: number; min: number; max: number; step: number }
  | { kind: 'pick'; id: string; label: string; text: string } // one of a list, between two arrows
  | { kind: 'check'; id: string; label: string; on: boolean }
  | { kind: 'text'; id: string; label: string; value: string; max: number } // `max`: characters
  | { kind: 'area'; id: string; label: string; value: string; rows: number } // lines of text (JSON)
  // `off`: its label says why; `fold`: it opens (true) or closes a group and spans the column; `main`: the way on
  | { kind: 'button'; id: string; label: string; off?: boolean; fold?: boolean; main?: boolean };
export type NumberField = Extract<Field, { kind: 'number' }>;

export const TAP = 44; // style.css --tap
// px on the 1920x1080 reference
export const REF = {
  size: { head: 26, label: 28, value: 26, note: 22 }, // text
  row: 64,
  head: 54,
  line: 34, // a line of an area
  gap: 8,
  inset: 16,
  value: 440, // the value column at a row's right end: arrow, value, arrow
  arrow: 56,
  cell: 300, // the least width of a mark's or a button's column
  mark: 34, // a check's box
};

export interface Metrics {
  s: number;
  w: number; // the column's width
  row: number;
  head: number;
  line: number;
  gap: number;
  inset: number;
  value: number;
  arrow: number;
  mark: number;
  cols: number; // marks and buttons per row
  note: number; // a note's line height and its text size, in page px
  noteSize: number;
}

// `w`: the column's width on the page; `s`: the page's scale (one reference px)
export function metrics(w: number, s: number): Metrics {
  const arrow = Math.max(TAP, REF.arrow * s),
    noteSize = Math.max(16, REF.size.note * s);
  return {
    s,
    w,
    row: Math.max(TAP, REF.row * s),
    head: Math.max(32, REF.head * s),
    line: Math.max(22, REF.line * s),
    gap: Math.max(4, REF.gap * s),
    inset: Math.max(8, REF.inset * s),
    value: Math.min(w * 0.55, Math.max(REF.value * s, 2 * arrow + 200)),
    arrow,
    mark: Math.max(24, REF.mark * s),
    cols: Math.max(1, Math.min(4, Math.floor(w / Math.max(230, REF.cell * s)))),
    note: noteSize * 1.35,
    noteSize,
  };
}

// a mark or a plain button takes one column of a shared row; everything else spans the column
const isCell = (f: Field) => f.kind === 'check' || (f.kind === 'button' && f.fold === undefined);
// where the cursor can stop: not on a heading, a note or a button that is off
export const isStop = (f: Field) => f.kind !== 'head' && f.kind !== 'note' && !(f.kind === 'button' && f.off);

// ponytail: a note's lines are guessed from its length (about half its size per letter, the serif's average), since
// nothing here can measure text; a guess too short lets a long note touch the next row. Measure it if one ever does
const noteLines = (f: Field, m: Metrics) => Math.max(1, Math.ceil((f.label.length * m.noteSize * 0.5) / m.w));
const heightOf = (f: Field, m: Metrics) =>
  f.kind === 'head'
    ? m.head
    : f.kind === 'note'
      ? noteLines(f, m) * m.note
      : f.kind === 'area'
        ? f.rows * m.line + 2 * m.inset
        : m.row;

// Each field's box in the column's own space (x from its left, y from the content's top), in the fields' order
export function flowFields(fields: readonly Field[], m: Metrics): { boxes: Box[]; height: number } {
  const boxes: Box[] = [],
    cw = (m.w - (m.cols - 1) * m.gap) / m.cols;
  let y = 0,
    col = 0;
  const endCells = () => {
    if (col) y += m.row + m.gap;
    col = 0;
  };
  for (const f of fields) {
    if (isCell(f)) {
      boxes.push({ x: col * (cw + m.gap), y, w: cw, h: m.row });
      if (++col === m.cols) endCells();
      continue;
    }
    endCells();
    if (f.kind === 'head' && boxes.length) y += 2 * m.gap;
    const h = heightOf(f, m);
    boxes.push({ x: 0, y, w: m.w, h });
    y += h + m.gap;
  }
  endCells();
  return { boxes, height: Math.max(0, y - m.gap) };
}

// A field's parts inside its box `b`: the name, the value's well, and the two arrows of a number or a pick
export interface Parts {
  label: Box;
  value?: Box;
  less?: Box;
  more?: Box;
}
export function fieldParts(f: Field, b: Box, m: Metrics): Parts {
  const at = (x: number, w: number): Box => ({ x, y: b.y, w, h: b.h }),
    right = b.x + b.w,
    name = at(b.x, b.w - m.value);
  if (f.kind === 'number' || f.kind === 'pick')
    return {
      label: name,
      less: at(right - m.value, m.arrow),
      value: at(right - m.value + m.arrow, m.value - 2 * m.arrow),
      more: at(right - m.arrow, m.arrow),
    };
  if (f.kind === 'text') return { label: name, value: at(right - m.value, m.value) };
  if (f.kind === 'area') return { label: b, value: b };
  if (f.kind === 'check') {
    const value = { x: b.x + m.inset, y: b.y + (b.h - m.mark) / 2, w: m.mark, h: m.mark };
    return { label: at(value.x + m.mark + m.inset, b.w - m.mark - 2 * m.inset), value };
  }
  return { label: b };
}

// A number as the field takes it: the nearest step inside its limits; nothing readable is its floor
export const clampNumber = (f: Pick<NumberField, 'min' | 'max' | 'step'>, v: number) =>
  Math.min(f.max, Math.max(f.min, Math.round((v || f.min) / f.step) * f.step));

// What a sideways arrow does on a field: changes its value, moves its caret, or walks to the field beside it
export const sideways = (f: Field): 'step' | 'caret' | 'walk' =>
  f.kind === 'number' || f.kind === 'pick' ? 'step' : f.kind === 'text' || f.kind === 'area' ? 'caret' : 'walk';

// Where an arrow or the d-pad takes the cursor from field `at`: the nearest stop seen that way, the same one with
// nothing there; from no field, the first stop (-1 with none). Sideways only along the field's own row: a row that
// spans the column lies above or below, never beside (walk.ts alone would take one for a neighbour on a slant). Up and
// down from a row that spans the column go by its left end, so the cursor lands on the first column of a row of marks
// or buttons (where reading starts), not on the middle one
export function fieldWalk(fields: readonly Field[], boxes: readonly Box[], at: number, way: Way): number {
  const here = boxes[at],
    flat = way === 'left' || way === 'right';
  if (!here || !isStop(fields[at])) return fields.findIndex(isStop);
  const beside = (b: Box) => b.y < here.y + here.h && here.y < b.y + b.h;
  const stops = fields.flatMap((f, i) => (i === at || (isStop(f) && (!flat || beside(boxes[i]))) ? [i] : []));
  const narrow = Math.min(...stops.map((i) => boxes[i].w));
  return stops[
    neighbour(
      stops.map((i) => (i === at && !flat ? { ...here, w: narrow } : boxes[i])),
      stops.indexOf(at),
      way,
    )
  ];
}

// the caret's line and column in a text of several lines
export function caretOf(value: string, at: number): { line: number; col: number } {
  const before = value.slice(0, at).split('\n');
  return { line: before.length - 1, col: before[before.length - 1].length };
}

// how much a row `h` tall at `top` (px under the window's top) shows, 0 to 1: it fades as it leaves a window `win`
// tall, gone by the time half of it is out (as the Options' list)
export const shown = (win: number, top: number, h: number) =>
  Math.max(0, Math.min(1, ((Math.min(top + h, win) - Math.max(top, 0)) / h) * 2 - 1));
// the scroll mark at the window's right edge: nothing when everything fits
export function thumb(win: Box, content: number, scroll: number, s: number): Box | null {
  if (content <= win.h + 1) return null;
  const h = (win.h * win.h) / content;
  return {
    x: win.x + win.w + Math.max(4, 12 * s),
    y: win.y + (scroll / (content - win.h)) * (win.h - h),
    w: Math.max(3, 5 * s),
    h,
  };
}
