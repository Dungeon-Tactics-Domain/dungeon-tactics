import { describe, expect, it } from 'vitest';
import scene from '../scripts/sandbox/bench/window3d.json';
import { parseSpec } from '../src/client/dev/sandbox-spec.ts';
import { type Act, keysText } from '../src/client/glyphs.ts';
import { keyAction } from '../src/client/keyboard.ts';
import { toolRows } from '../src/client/tool-rows.ts';
import { stage } from '../src/client/ui3d/layout.ts';
import { neighbour } from '../src/client/ui3d/walk.ts';
import { REF as NOTE, noteLayout, noteWidths } from '../src/client/window3d/note-view.ts';
import { REF, statusLayout, valueWidth } from '../src/client/window3d/status-view.ts';

// The 3D corner menu and Status window (window3d/; Nov 17): the pure parts behind the drawing. The drawing itself is
// checked on the bench (docs/sandbox.md: window3d.json)
describe('corner menu: one list of rows for the HTML menu and the 3D one', () => {
  const rows = toolRows();

  it('has each tool once, with a name and a glyph', () => {
    expect(new Set(rows.map((r) => r.tool)).size).toBe(rows.length);
    for (const r of rows) expect(r.label && r.glyph, r.tool).toBeTruthy();
  });

  it('its bench scene is a valid spec', () => {
    expect(parseSpec(scene).problems).toEqual([]);
  });

  it('marks only the two switches', () => {
    expect(rows.filter((r) => r.toggle).map((r) => r.tool)).toEqual(['fast', 'fps']);
  });

  it('shows the key that really runs the row', () => {
    const run = (key: string, shiftKey = false) => keyAction({ key, shiftKey } as KeyboardEvent);
    const key = (tool: string) => keysText(rows.find((r) => r.tool === tool)!.key as Act, 'keyboard')!;
    expect(run(key('undo').toLowerCase())).toEqual({ k: 'undo' });
    expect(run(key('recenter').toLowerCase())).toEqual({ k: 'recenter' });
    expect(run(key('pixel').toLowerCase())).toEqual({ k: 'pixel' });
    expect(run(key('menu').toLowerCase())).toEqual({ k: 'help' });
    expect(run(key('rotateRight').toLowerCase())).toEqual({ k: 'rotate', dir: 1 });
    expect(key('rotateLeft')).toBe('⇧R');
    expect(run('R', true)).toEqual({ k: 'rotate', dir: -1 });
  });
});

describe('3D Status window: where the sheet and its rows sit', () => {
  const st = stage(1920, 1080, 'edges');
  const line = 30;

  it('a unit sheet is centred, with the first half of its rows on the left', () => {
    const L = statusLayout(st, Array(13).fill(line), false);
    expect(L.box.w).toBe(REF.w);
    expect(L.box.x).toBe((1920 - REF.w) / 2);
    expect(L.box.y + L.box.h / 2).toBeCloseTo(540);
    expect(L.rows.filter((r) => r.x === L.rows[0].x).length).toBe(7);
    expect(L.rows[7].x).toBeGreaterThan(L.rows[0].x + L.rows[0].w);
    expect(L.rows[7].y).toBe(L.rows[0].y);
    expect(L.rows[0].y).toBeGreaterThan(L.head);
  });

  it('a wrapped value makes its row taller and pushes only its column down', () => {
    const plain = statusLayout(st, Array(4).fill(line), false);
    const tall = statusLayout(st, [line, 3 * line, line, line], false);
    expect(plain.rows[0].h).toBe(REF.row);
    expect(tall.rows[1].h).toBe(3 * line + REF.rowPad);
    expect(tall.rows[3].y).toBe(plain.rows[3].y);
    expect(tall.box.h).toBeGreaterThan(plain.box.h);
    // every row ends above the foot
    for (const r of tall.rows) expect(r.y + r.h).toBeLessThanOrEqual(tall.box.h - tall.foot);
  });

  it("an ability's paragraph takes one narrower sheet, with no label column", () => {
    const L = statusLayout(st, [4 * line], true);
    expect(L.box.w).toBe(REF.plain);
    expect(L.label).toBe(0);
    expect(L.rows).toHaveLength(1);
    expect(valueWidth(st, true)).toBe(L.rows[0].w);
    expect(valueWidth(st, false)).toBe(statusLayout(st, [line, line], false).rows[0].w - REF.label);
  });

  it('fits a phone lying down at the smallest scale, and never leaves the page at the top', () => {
    const phone = stage(844, 390, 'edges');
    const text = 16 * 1.3 + 6; // the 16 px floor
    const L = statusLayout(phone, Array(14).fill(text), false);
    expect(L.box.w).toBeLessThanOrEqual(844);
    // the 16 px text is wider than the scale says: the label column and the sheet follow the text
    expect(L.label).toBeCloseTo((REF.label * 16) / 22);
    expect(L.box.w).toBeGreaterThan(REF.w * phone.s);
    expect(L.box.y).toBeGreaterThanOrEqual(0);
    expect(L.box.y + L.box.h).toBeLessThanOrEqual(390);
    expect(statusLayout(phone, Array(40).fill(text), false).box.y).toBe(0);
  });

  it('follows the frame layout', () => {
    const frame = stage(2560, 1080, 'frame');
    expect(statusLayout(frame, [line, line], false).box.x).toBe(frame.x + (frame.w - REF.w) / 2);
  });
});

// The 3D notice window (window3d/note3d.ts; Nov 18): the map's Information and opened chest, the expedition lost
describe('3D notice window: where the sheet, its rows and its buttons sit', () => {
  const st = stage(1920, 1080, 'edges');
  const line = 31;
  const inside = (b: { x: number; y: number; w: number; h: number }, w: number, h: number) =>
    b.x >= 0 && b.y >= 0 && b.x + b.w <= w + 1e-6 && b.y + b.h <= h + 1e-6;

  it('is centred on the page, its rows under the head and its buttons over the foot', () => {
    const L = noteLayout(st, { legend: Array(7).fill(line), text: [4 * line, 4 * line], figure: true }, 1, false);
    expect(L.box.w).toBe(NOTE.w);
    expect(L.box.x).toBe((1920 - NOTE.w) / 2);
    expect(L.box.y + L.box.h / 2).toBeCloseTo(540);
    expect(L.fits).toBe(true);
    expect(L.legend[0].y).toBeGreaterThan(L.head);
    // one column: each thing under the one before, nothing over another
    const rows = [...L.legend, ...L.text, L.figure!, L.buttons[0]];
    rows.forEach((r, i) => {
      if (i) expect(r.y, `row ${i}`).toBeGreaterThanOrEqual(rows[i - 1].y + rows[i - 1].h - 1e-6);
      expect(inside(r, L.box.w, L.box.h - L.foot), `row ${i}`).toBe(true);
    });
    expect(L.buttons[0].x + L.buttons[0].w / 2).toBeCloseTo(L.box.w / 2);
  });

  it('a notice with only a figure and a button is a short sheet', () => {
    const chest = noteLayout(st, { legend: [], text: [], figure: true }, 1, false);
    const lost = noteLayout(st, { legend: [], text: [3 * line], figure: true }, 1, false);
    expect(chest.figure!.y).toBeGreaterThan(chest.head);
    expect(lost.box.h).toBeGreaterThan(chest.box.h);
    expect(noteLayout(st, { legend: [], text: [line], figure: false }, 1, false).figure).toBeUndefined();
  });

  it('a wrapped legend text makes its row taller', () => {
    const plain = noteLayout(st, { legend: [line, line], text: [], figure: false }, 1, false);
    const tall = noteLayout(st, { legend: [3 * line, line], text: [], figure: false }, 1, false);
    expect(plain.legend[0].h).toBe(NOTE.mark + NOTE.gap / 2);
    expect(tall.legend[1].y - plain.legend[1].y).toBe(3 * line - NOTE.mark);
  });

  it('lays one to three buttons side by side, and the arrows go to the one seen that way', () => {
    for (const n of [1, 2, 3]) {
      const { buttons, box, foot } = noteLayout(st, { legend: [], text: [line], figure: false }, n, false);
      expect(buttons).toHaveLength(n);
      for (const b of buttons) expect(inside(b, box.w, box.h - foot), `${n} buttons`).toBe(true);
      for (let i = 1; i < n; i++) {
        expect(buttons[i].y).toBe(buttons[0].y);
        expect(buttons[i].x).toBeGreaterThan(buttons[i - 1].x + buttons[i - 1].w);
      }
      // the row is centred on the sheet
      expect(buttons[0].x + (buttons.at(-1)!.x + buttons.at(-1)!.w - buttons[0].x) / 2).toBeCloseTo(box.w / 2);
    }
    const { buttons } = noteLayout(st, { legend: [], text: [line], figure: false }, 3, false);
    expect(neighbour(buttons, 0, 'right')).toBe(1);
    expect(neighbour(buttons, 1, 'right')).toBe(2);
    expect(neighbour(buttons, 2, 'left')).toBe(1);
    expect(neighbour(buttons, 1, 'left')).toBe(0);
    // at an edge, and up and down, the cursor stays: nothing wraps
    expect(neighbour(buttons, 2, 'right')).toBe(2);
    expect(neighbour(buttons, 0, 'left')).toBe(0);
    expect(neighbour(buttons, 1, 'up')).toBe(1);
    expect(neighbour(buttons, 1, 'down')).toBe(1);
  });

  it('on a phone lying down the tall sheet does not fit, and the wide one does, its legend in two columns', () => {
    const phone = stage(844, 390, 'edges');
    const text = 16 * 1.3 + 6; // the 16 px floor
    const info = { legend: Array(7).fill(text), text: [2 * text, 2 * text], figure: false };
    expect(noteLayout(phone, info, 1, false).fits).toBe(false);
    const L = noteLayout(phone, info, 1, true);
    expect(L.fits).toBe(true);
    expect(L.box.w).toBe(844 - 16);
    expect(L.box.y).toBeGreaterThanOrEqual(0);
    expect(L.box.y + L.box.h).toBeLessThanOrEqual(390);
    // the first four on the left, the other three beside them, row by row
    expect(L.legend.filter((r) => r.x === L.legend[0].x)).toHaveLength(4);
    expect(L.legend[4].x).toBeGreaterThanOrEqual(L.legend[0].x + L.legend[0].w);
    expect(L.legend[4].y).toBe(L.legend[0].y);
    // a finger's button, and the text's room is what the sheet gives it
    expect(L.buttons[0].h).toBeGreaterThanOrEqual(44);
    const W = noteWidths(phone, 7, true);
    expect(W.cols).toBe(2);
    expect(W.legendText).toBeCloseTo(L.legend[0].w - ((NOTE.mark + NOTE.markGap) * 16) / 24);
    expect(noteWidths(phone, 3, true).cols).toBe(1);
  });

  it('follows the frame layout', () => {
    const frame = stage(2560, 1080, 'frame');
    const L = noteLayout(frame, { legend: [], text: [line], figure: false }, 1, false);
    expect(L.box.x).toBe(frame.x + (frame.w - NOTE.w) / 2);
  });
});
