import { describe, expect, it } from 'vitest';
import { type Box, type LayoutMode, place, REGIONS, stage } from '../src/client/ui3d/layout.ts';
import { type ToolsSpec, toolShown, toolsFoot, toolsLayout } from '../src/client/window3d/tools-layout.ts';

// The corner buttons' own layout (Fernando, Nov 18 night: the ☰ list gave way to a gear, Undo and ↺ ↻ on the screen).
// `notch`: a phone's safe side, as ui3d/layer.ts adds it to the stage and to the margins
const spec = (w: number, h: number, mode: LayoutMode, over: Partial<ToolsSpec> = {}, notch = 0): ToolsSpec => {
  const st = stage(w, h, mode, { x: notch, y: 0 }),
    [fx, fy] = mode === 'frame' ? [st.x, st.y] : [0, 0];
  return {
    pageW: w,
    stage: st,
    inset: { top: 12 + fy, right: 12 + notch + fx },
    row: [44, 120, 0], // Back, "↶ Undo" and the gear
    pair: 'list',
    ...over,
  };
};
const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const PAGES: [string, number, number, LayoutMode, number][] = [
  ['a phone on its side (844x390)', 844, 390, 'edges', 0],
  ['the same phone with its notch (844x390)', 844, 390, 'edges', 47],
  ['a small phone (667x375)', 667, 375, 'edges', 0],
  ['a tablet (1024x768)', 1024, 768, 'edges', 0],
  ['a tablet in the 16:9 frame (1024x768)', 1024, 768, 'frame', 0],
  ['a laptop (1280x720)', 1280, 720, 'edges', 0],
  ['the reference (1920x1080)', 1920, 1080, 'edges', 0],
];

describe('corner buttons: their layout with no DOM', () => {
  for (const [name, w, h, mode, notch] of PAGES)
    it(`the gear on the corner, ↺ ↻ after the turn list and clear of everything: ${name}`, () => {
      const q = spec(w, h, mode, {}, notch),
        l = toolsLayout(q),
        gear = l.row.at(-1)!,
        list = place(REGIONS.turn, q.stage);
      expect(gear.x + gear.w).toBe(w - q.inset.right);
      expect(l.pair[0].x).toBe(list.x + list.w + 8);
      expect(l.pair[1].x - (l.pair[0].x + l.pair[0].w)).toBe(8);
      // the pair ends left of the row, with Back and Undo shown or not, and keeps off the instruction banner
      expect(l.pair[1].x + l.pair[1].w).toBeLessThan(l.row[0].x);
      for (const b of l.pair) expect(overlap(b, place(REGIONS.banner, q.stage)), name).toBe(false);
      for (const b of [...l.pair, ...l.row]) expect(b.y).toBe(q.inset.top);
    });

  it('the town has no list: its pair stands left of the gear, 8 px apart', () => {
    const l = toolsLayout(spec(844, 390, 'edges', { row: [0], pair: 'row' }));
    expect(l.row).toHaveLength(1);
    const [left, right] = l.pair;
    expect(right.x - (left.x + left.w)).toBe(8);
    expect(l.row[0].x - (right.x + right.w)).toBe(8);
    expect(l.row[0].x + l.row[0].w).toBe(844 - 12);
  });

  it('no pair when the switch hides it', () => {
    expect(toolsLayout(spec(1920, 1080, 'edges', { pair: 'none' })).pair).toEqual([]);
  });

  it('no button goes under the 44 px of a finger, and a button is never narrower than tall', () => {
    const l = toolsLayout(spec(640, 360, 'edges', { row: [10, 0] }));
    expect(l.size).toBe(44);
    expect(l.row.map((b) => b.w)).toEqual([44, 44]);
    expect(toolsLayout(spec(1920, 1080, 'edges')).size).toBe(56);
  });

  // Fernando, Nov 18: Undo carries its word ("↶ Desfazer"), so ↶ and ↩ are told apart
  it('a button with its word is as wide as the word, the row 8 px apart and on the corner', () => {
    const [back, undo, gear] = toolsLayout(spec(844, 390, 'edges', { row: [80, 100, 0] })).row;
    expect([back.w, undo.w, gear.w]).toEqual([80, 100, 44]);
    expect(gear.x - (undo.x + undo.w)).toBe(8);
    expect(undo.x - (back.x + back.w)).toBe(8);
  });

  it('the Height corner keeps under the row of buttons', () => {
    expect(toolsFoot(0.39, 12)).toBe(12 + 44 + 8);
    expect(toolsFoot(1, 12)).toBe(12 + 56 + 8);
  });
});

// Fernando, Nov 18 night: Undo and ↺ ↻ follow the screen buttons switch; Back stays a finger's (Esc and the right
// button go back)
describe('which corner buttons show', () => {
  it('the gear always; Undo and the pair with the switch; Back only for a finger with a screen to go back', () => {
    for (const keys of [true, false])
      for (const hidden of [true, false])
        for (const on of [true, false]) {
          expect(toolShown('gear', keys, hidden, on)).toBe(true);
          for (const k of ['undo', 'left', 'right'] as const) expect(toolShown(k, keys, hidden, on)).toBe(on);
          expect(toolShown('back', keys, hidden, on)).toBe(!keys && !hidden);
        }
  });
});
