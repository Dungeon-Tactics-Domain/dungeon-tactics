// What a 3D sheet (sheet3d.ts) draws piece by piece: a row of a list, a line of a text, the head and the plates at the
// foot. Places come from sheet-layout.ts; the inks from the layer's theme and the flow screens' dark tokens (draw.ts).
import type { Mesh } from 'three';
import type { Sheet, SheetRow } from '../game/sheets.ts';
import { NONE, type Part } from '../hints3d/hints3d.ts';
import { t } from '../i18n.ts';
import { type Faces, faceMesh } from '../ui3d/face.ts';
import type { Ui3dLayer } from '../ui3d/layer.ts';
import { type Colors, label, lift, put, rgba } from './draw.ts';
import { REF as OPT } from './options-layout.ts';
import { type Line, REF, type SheetLayout, sideBox } from './sheet-layout.ts';

// a row of the list or a line of the text: its part, where it sits in the content and what fades with it (a face)
export interface Piece {
  part: Part;
  top: number;
  h: number;
  more: Mesh[];
}

// a row of the list, from its own top left; `side`: its second button, which says its own text (armed or not)
export function drawRow(
  layer: Ui3dLayer,
  faces: Faces,
  p: Piece,
  v: SheetRow,
  L: SheetLayout,
  side?: HTMLButtonElement,
) {
  const { theme } = layer,
    s = L.s,
    mid = L.rowH / 2,
    w = L.box.w - L.side,
    end = w - (side ? 46 : REF.inset) * s; // clear of the glove when it points at the second button
  const text = (str: string, size: number, hex: string) => label(layer, s, str, size, hex);
  const two = (a: string, b: string | undefined, x: number, sizes: [number, number], align: 'left' | 'right') => {
    const room = align === 'left' ? Math.max(40, end - x - rightW - 24 * s) : Infinity;
    const top = put(p.part, text(a, sizes[0], theme.ink), x, b ? mid - 15 * s : mid, align, room);
    const low = b ? put(p.part, text(b, sizes[1], theme.inkSoft), x, mid + 17 * s, align, room) : null;
    return Math.max(top.scale.x, low?.scale.x ?? 0);
  };
  let rightW = 0;
  if (v.right) rightW = two(v.right, v.rightSub, end, [REF.size.name - 2, REF.size.sub], 'right');
  if (v.no) put(p.part, text(v.no, REF.size.no, theme.inkSoft), REF.inset * s, mid);
  if (v.face) {
    const f = Math.min(REF.face * s, L.rowH - 8);
    const m = faceMesh(faces, v.face, 'neutral', { x: REF.faceX * s, y: mid - f / 2, w: f, h: f }, () => layer.wake());
    m.renderOrder = 71;
    p.part.group.add(m);
    p.more.push(m);
  }
  two(v.name, v.sub, (v.face ? REF.nameX : REF.inset) * s, [REF.size.name, REF.size.sub], 'left');
  if (!side) return;
  // the second button: an inked box on the paper, lit from under while it holds the focus
  const b = sideBox(L, 0, 0),
    x = b.x - L.box.x,
    y = b.y - L.box.y;
  p.part.box(x, y, b.w, b.h, 6 * s, NONE, rgba(theme.ink, 0.8));
  // armed (dialog.ts secondTap) it says what the next tap does, "Confirm: ..." : two lines, so the text keeps its size
  const [say, what] = (side.lastChild?.textContent ?? '').split(': '),
    half = what ? Math.max(16, REF.size.sub * s) * 0.6 : 0;
  const one = (str: string, dy: number) =>
    put(p.part, text(str, REF.size.sub, theme.ink), x + b.w / 2, y + b.h / 2 + dy, 'centre', b.w - 14 * s);
  one(what ? `${say}:` : say, -half);
  if (what) one(what, half);
}

// a line of the text, from its own top left
export function drawLine(layer: Ui3dLayer, p: Part, v: Line, L: SheetLayout) {
  const { theme } = layer,
    s = L.s,
    mid = v.h / 2;
  const text = (str: string, hex: string) => label(layer, 1, str, v.size, hex);
  put(p, text(v.str, v.ink === 'ink' ? theme.ink : theme.inkSoft), v.x, mid);
  if (v.bullet) put(p, text('•', theme.inkSoft), v.x - (REF.indent / 2) * s, mid, 'centre');
  if (v.mark) {
    // the mark's own colour (style.css --mark-*); its pattern is in the words beside it
    const sw = REF.swatch * s,
      hex = getComputedStyle(layer.root).getPropertyValue(`--mark-${v.mark}`).trim();
    p.box(v.x - REF.indent * s, mid - sw / 2, sw, sw, 3 * s, rgba(hex), rgba(theme.ink, 0.9));
  }
  if (v.rule) p.box(0, v.h - 2 * s, L.box.w, Math.max(1, 2 * s), 0, rgba(theme.ink, 0.45));
}

// the name over its hairline, the note, and the plates at the foot: the link (`link`, what it says), then Back;
// `focus`: the plate holding the cursor, -1 for none
export function drawHead(
  layer: Ui3dLayer,
  c: Colors,
  fixed: Part,
  sheet: Sheet,
  L: SheetLayout,
  link: string | null | undefined,
  focus: number,
) {
  const s = L.s;
  const text = (str: string, size: number, hex: string) => label(layer, s, str, size, hex);
  fixed.clear();
  put(fixed, text(sheet.title, OPT.size.title, c.title), L.title.x, L.title.y, 'centre');
  fixed.box(L.rule.x, L.rule.y, L.rule.w, L.rule.h, 0, rgba(c.line, 0.9));
  put(fixed, text('◆', 14, c.line), L.title.x, L.rule.y + L.rule.h / 2, 'centre');
  if (sheet.note) put(fixed, text(sheet.note, OPT.size.note, c.soft), L.note.x, L.note.y, 'right');
  const names = [...(L.foot.length > 1 ? [link ?? ''] : []), t('Voltar', 'Back')];
  L.foot.forEach((r, i) => {
    const lit = i === focus;
    fixed.box(r.x, r.y, r.w, r.h, 6 * s, rgba(lit ? c.line : c.plate, 0.95), rgba(lit ? c.title : c.line, 0.8));
    put(fixed, text(names[i], OPT.size.button, c.text), r.x + r.w / 2, r.y + r.h / 2, 'centre', r.w - 24 * s);
  });
  lift(fixed, 40);
}
