import { describe, expect, it } from 'vitest';
import { type LayoutMode, stage } from '../src/client/ui3d/layout.ts';
import { rowSeen, type ToolsSpec, toolsFoot, toolsLayout } from '../src/client/window3d/tools-layout.ts';

// The 3D corner menu's own layout (Nov 18: the 3D pieces stop measuring the HTML). Each case is what the browser
// measured on the unseen HTML menu with its list open, on a sandbox scene, the day before the numbers moved to
// tools-layout.ts. Boxes as [x, y, w, h] on the page.
type Four = [number, number, number, number];
interface Measured {
  name: string;
  w: number;
  h: number;
  mode: LayoutMode;
  buttons: Four[]; // left to right, the menu button last, sunk 2 px while its list is open
  list: Four;
  head: number;
}
const MEASURED = [
  {
    name: 'the reference (1920x1080)',
    ...{ w: 1920, h: 1080, mode: 'edges', head: 42 },
    buttons: [[1852, 14, 56, 56]],
    list: [1478, 78, 430, 458],
  },
  {
    name: 'ultrawide, edges (3440x1440)',
    ...{ w: 3440, h: 1440, mode: 'edges', head: 56 },
    buttons: [[3353.344, 14, 74.656, 74.656]],
    list: [2854.672, 100, 573.328, 610.625],
  },
  {
    name: 'ultrawide, frame (3440x1440)',
    ...{ w: 3440, h: 1440, mode: 'frame', head: 56 },
    buttons: [[2913.344, 14, 74.656, 74.656]],
    list: [2414.672, 100, 573.328, 610.625],
  },
  {
    name: 'a phone on its side: the list ends at the page (844x390)',
    ...{ w: 844, h: 390, mode: 'edges', head: 18 },
    buttons: [[788, 14, 44, 44]],
    list: [532, 60.391, 300, 317.594],
  },
  {
    name: 'the reference with Back for a finger',
    ...{ w: 1920, h: 1080, mode: 'edges', head: 42 },
    buttons: [
      [1788, 12, 56, 56],
      [1852, 14, 56, 56],
    ],
    list: [1478, 78, 430, 458],
  },
  {
    name: 'a phone on its side with Back for a finger',
    ...{ w: 844, h: 390, mode: 'edges', head: 18 },
    buttons: [
      [736, 12, 44, 44],
      [788, 14, 44, 44],
    ],
    list: [532, 60.391, 300, 317.594],
  },
] as Measured[];

const near = (got: { x: number; y: number; w: number; h: number }, [x, y, w, h]: Four) => {
  expect(got.x).toBeCloseTo(x, 1);
  expect(got.y).toBeCloseTo(y, 1);
  expect(got.w).toBeCloseTo(w, 1);
  expect(got.h).toBeCloseTo(h, 1);
};
// the page's margins: 12 px, plus the frame's own in the `frame` layout (ui3d/layer.ts `inset`)
const spec = (w: number, h: number, mode: LayoutMode, over: Partial<ToolsSpec> = {}): ToolsSpec => {
  const st = stage(w, h, mode),
    [fx, fy] = mode === 'frame' ? [st.x, st.y] : [0, 0];
  return {
    pageW: w,
    pageH: h,
    s: st.s,
    inset: { top: 12 + fy, right: 12 + fx, bottom: 12 + fy },
    buttons: 1,
    rows: 8,
    open: true,
    scroll: 0,
    ...over,
  };
};

describe('3D corner menu: its layout with no DOM', () => {
  for (const m of MEASURED)
    it(`sits where the HTML menu sat: ${m.name}`, () => {
      const l = toolsLayout(spec(m.w, m.h, m.mode, { buttons: m.buttons.length }));
      expect(l.buttons).toHaveLength(m.buttons.length);
      l.buttons.forEach((b, i) => near(b, m.buttons[i]));
      near(l.list, m.list);
      expect(l.head).toBe(m.head);
    });

  it('the rows touch each other under the head, every one the same height', () => {
    // from 1690 px of width up the browser measured the same rows: 52 px of the reference each. Under it the HTML
    // rows, 44 px by then, sat up to 5 px apart by an accident of their text lines; the drawn rows never did
    const l = toolsLayout(spec(1920, 1080, 'edges'));
    expect(l.rows.map((r) => r.y)).toEqual([42, 94, 146, 198, 250, 302, 354, 406]);
    for (const r of l.rows) expect(r).toMatchObject({ x: 0, w: 430, h: 52 });
    const wide = toolsLayout(spec(3440, 1440, 'edges'));
    [56, 125.328, 194.656, 263.984, 333.313, 402.641, 471.969, 541.297].forEach((y, i) => {
      expect(wide.rows[i].y).toBeCloseTo(y, 1);
      expect(wide.rows[i].h).toBeCloseTo(69.328, 2);
    });
    const small = toolsLayout(spec(844, 390, 'edges'));
    expect(small.rows.map((r) => r.y)).toEqual([18, 62, 106, 150, 194, 238, 282, 326]);
  });

  it('no button or row goes under the 44 px of a finger, and the list never under 300 px wide', () => {
    const l = toolsLayout(spec(640, 360, 'edges'));
    expect(l.size).toBe(44);
    expect(l.rowH).toBe(44);
    expect(l.list.w).toBe(300);
    expect(toolsLayout(spec(1920, 1080, 'edges')).size).toBe(56);
  });

  it('the menu button sinks 2 px only while its list is open; Back and Undo never do', () => {
    const at = (open: boolean) => toolsLayout(spec(1920, 1080, 'edges', { buttons: 3, open })).buttons.map((b) => b.y);
    expect(at(false)).toEqual([12, 12, 12]);
    expect(at(true)).toEqual([12, 12, 14]);
  });

  it('the buttons stand 8 px apart, the menu button on the corner', () => {
    const [back, undo, menu] = toolsLayout(spec(1920, 1080, 'edges', { buttons: 3, open: false })).buttons;
    expect(menu.x + menu.w).toBe(1920 - 12);
    expect(menu.x - (undo.x + undo.w)).toBe(8);
    expect(undo.x - (back.x + back.w)).toBe(8);
    expect(toolsLayout(spec(1920, 1080, 'edges', { buttons: 0 })).buttons).toEqual([]);
  });

  it('a list that fits the page does not scroll', () => {
    const l = toolsLayout(spec(1920, 1080, 'edges'));
    expect(l.more).toBe(0);
    expect(l.list.h).toBe(l.head + 8 * l.rowH);
    expect(l.rows.every((r) => rowSeen(l, r))).toBe(true);
  });

  it('on a low page the list ends 12 px above the page, and scrolls by the rows left out', () => {
    const l = toolsLayout(spec(844, 390, 'edges'));
    expect(l.list.y + l.list.h).toBeCloseTo(390 - 12, 5);
    expect(l.more).toBeCloseTo(18 + 8 * 44 - l.list.h, 5);
    // 299.6 px under the 18 px head: six whole rows show, the seventh is cut and left out
    expect(l.rows.map((r) => rowSeen(l, r))).toEqual([true, true, true, true, true, true, false, false]);
  });

  it('scrolling moves the rows up: one that passes under the head is left out, the last one comes in', () => {
    const top = toolsLayout(spec(844, 390, 'edges'));
    const end = toolsLayout(spec(844, 390, 'edges', { scroll: top.more }));
    expect(end.rows[0].y).toBeCloseTo(18 - top.more, 5);
    expect(rowSeen(end, end.rows[0])).toBe(false); // under the head
    expect(rowSeen(end, end.rows[7])).toBe(true);
    expect(end.rows[7].y + end.rows[7].h).toBeCloseTo(end.list.h, 5); // the last row ends with the list
    // one px of scroll is not yet a row out (the same slack the drawing always had)
    const hair = toolsLayout(spec(844, 390, 'edges', { scroll: 1 }));
    expect(rowSeen(hair, hair.rows[0])).toBe(true);
    expect(rowSeen(hair, toolsLayout(spec(844, 390, 'edges', { scroll: 2 })).rows[0])).toBe(false);
  });

  // Fernando, Nov 18: Undo carries its word ("↶ Desfazer"), so ↶ and ↩ are told apart
  it('a button with its word is as wide as the word, the row still 8 px apart and on the corner', () => {
    const [back, undo, menu] = toolsLayout(spec(844, 390, 'edges', { buttons: 3, widths: [80, 100, 0] })).buttons;
    expect([back.w, undo.w, menu.w]).toEqual([80, 100, 44]);
    expect(menu.x + menu.w).toBe(844 - 12);
    expect(menu.x - (undo.x + undo.w)).toBe(8);
    expect(undo.x - (back.x + back.w)).toBe(8);
    expect(back.h).toBe(44);
    // never narrower than tall
    expect(toolsLayout(spec(844, 390, 'edges', { buttons: 2, widths: [10, 0] })).buttons[0].w).toBe(44);
  });

  // Fernando, Nov 18: on a phone "FPS counter" and "Options and help" were found only by scrolling by chance
  it('while rows wait under the list, its foot keeps room for a cue and no row is drawn over it', () => {
    const top = toolsLayout(spec(844, 390, 'edges'));
    expect(top.below).toBe(true);
    expect(top.cue).toBeGreaterThanOrEqual(16);
    for (const r of top.rows) if (rowSeen(top, r)) expect(r.y + r.h).toBeLessThanOrEqual(top.list.h - top.cue + 1);
    const end = toolsLayout(spec(844, 390, 'edges', { scroll: top.more }));
    expect([end.below, end.cue]).toEqual([false, 0]);
    expect(toolsLayout(spec(1920, 1080, 'edges')).below).toBe(false); // a list that fits says nothing
  });

  it('the Height corner keeps under the row of buttons', () => {
    expect(toolsFoot(0.39, 12)).toBe(12 + 44 + 8);
    expect(toolsFoot(1, 12)).toBe(12 + 56 + 8);
  });

  it('the head is a whole number of px, as the browser draws a frame', () => {
    expect(toolsLayout(spec(844, 390, 'edges')).head).toBe(18); // 42 x 0.4396 = 18.46
    expect(toolsLayout(spec(1600, 560, 'edges')).head).toBe(25); // 25.2
    expect(toolsLayout(spec(1024, 768, 'frame')).head).toBe(22); // 22.4
  });
});
