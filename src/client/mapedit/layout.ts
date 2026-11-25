// Where the map builder's pieces sit (Nov 25, layout A): the tool bar along the bottom of the map with the key hints over
// it, the side panel on the right (category tabs, the category's rows, a help line, and at its foot the brush, undo and
// redo and the camera), so the map stays in view between them. No DOM: the 3D screen draws these boxes and the unseen buttons are seated on
// them. Pure and tested (tests/mapedit-screen.test.ts).
import type { Box } from '../ui3d/layout.ts';

export const TAP = 44; // a finger's target (design system, section 8): no control is smaller
export const GAP = 6;
const PAD = 8; // the panel's inner margin

export interface Page {
  w: number;
  h: number;
  s: number; // one reference px (1920x1080) in page px
  inset: { top: number; right: number; bottom: number; left: number };
}
export interface Cell {
  id: string;
  text: string;
  kind: 'button' | 'input' | 'area' | 'label';
  on?: boolean; // the tool, tab or brush in use
  off?: boolean; // nothing to do now; its text says why
  grow?: number; // its share of the row's width (1)
  pic?: string; // the tile picture it shows (pics.ts), a palette entry's or a tool's
}
export interface Row {
  cells: Cell[];
  tall?: number; // rows of height it takes (1)
}

export function builderLayout(p: Page) {
  const row = Math.max(TAP, Math.round(52 * p.s)),
    pw = Math.min(440, Math.max(320, Math.round(p.w * 0.24))),
    panel: Box = { x: p.w - p.inset.right - pw, y: p.inset.top, w: pw, h: p.h - p.inset.top - p.inset.bottom },
    inner = { x: panel.x + PAD, w: pw - 2 * PAD },
    split = (y: number, n: number, h = row): Box[] => {
      const w = (inner.w - (n - 1) * GAP) / n;
      return Array.from({ length: n }, (_, i) => ({ x: inner.x + i * (w + GAP), y, w, h }));
    },
    tabs = split(panel.y + PAD, 4),
    footY = panel.y + panel.h - PAD - 2 * row - GAP,
    foot = [split(footY, 3), split(footY + row + GAP, 5)],
    noteH = Math.round(row * 1.5),
    note: Box = { x: inner.x, y: footY - GAP - noteH, w: inner.w, h: noteH },
    top = tabs[0].y + row + GAP,
    content: Box = { x: inner.x, y: top, w: inner.w, h: Math.max(0, note.y - GAP - top) };
  // the bar: 9 tools centred on the map's width, at the page's foot
  const left = p.inset.left,
    room = panel.x - GAP - left,
    // a plate holds its tile picture over its name (Fernando, Nov 25)
    bh = Math.max(56, row + 12) + Math.max(36, Math.round(48 * p.s)),
    bw = Math.max(TAP, Math.min(130, Math.floor((room - 8 * GAP) / 9))),
    span = 9 * bw + 8 * GAP,
    x0 = left + Math.max(0, (room - span) / 2),
    by = p.h - p.inset.bottom - bh,
    bar = Array.from({ length: 9 }, (_, i): Box => ({ x: x0 + i * (bw + GAP), y: by, w: bw, h: bh })),
    // the key hints over the bar, two lines across the map's width (the panel's help line holds the messages)
    hintH = Math.max(52, Math.round(60 * p.s)),
    hints: Box = { x: x0, y: by - GAP - hintH, w: span, h: hintH };
  // what the camera keeps clear of: the panel on the right and the bar at the foot (scene.ts setInsets)
  const insets = { top: 0, bottom: p.h - hints.y, left: 0, right: p.w - panel.x };
  return { row, panel, tabs, content, note, foot, bar, hints, insets };
}
export type BuilderLayout = ReturnType<typeof builderLayout>;

// how many rows of one height fit in the content
export const rowsFit = (l: BuilderLayout) => Math.max(0, Math.floor((l.content.h + GAP) / (l.row + GAP)));

// Each cell's box, row by row from the content's top; a row that does not fit gets no boxes (its cells stay unseen)
export function placeRows(l: BuilderLayout, rows: Row[]): Box[][] {
  const { content: c } = l;
  let y = c.y;
  return rows.map((r) => {
    const h = (r.tall ?? 1) * l.row + ((r.tall ?? 1) - 1) * GAP;
    if (y + h > c.y + c.h + 0.5) return [];
    const total = r.cells.reduce((n, cell) => n + (cell.grow ?? 1), 0),
      free = c.w - (r.cells.length - 1) * GAP;
    let x = c.x;
    const boxes = r.cells.map((cell): Box => {
      const w = (free * (cell.grow ?? 1)) / total,
        b = { x, y, w, h };
      x += w + GAP;
      return b;
    });
    y += h + GAP;
    return boxes;
  });
}
