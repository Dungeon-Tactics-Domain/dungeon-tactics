import { describe, expect, it } from 'vitest';
import scene from '../scripts/sandbox/bench/window3d.json';
import { parseSpec } from '../src/client/dev/sandbox-spec.ts';
import { keyAction } from '../src/client/keyboard.ts';
import { toolRows } from '../src/client/tool-rows.ts';
import { stage } from '../src/client/ui3d/layout.ts';
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
    const key = (tool: string) => rows.find((r) => r.tool === tool)!.key;
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
