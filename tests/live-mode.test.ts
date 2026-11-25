import { describe, expect, it } from 'vitest';
import { commandIndex } from '../src/client/command.ts';
import { hintsFor } from '../src/client/hints3d/hints-view.ts';
import { keyAction } from '../src/client/keyboard.ts';
import { liveLayout, TAP } from '../src/client/mapedit/layout.ts';
import { BAR, halfCells, strokeMarks, toolMark } from '../src/client/mapedit/tools.ts';
import type { Box } from '../src/client/ui3d/layout.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { blankDoc } from '../src/shared/mapedit/doc.ts';
import { flat, stateOf } from './battle-helpers.ts';

// The battle builder's live map edit (battleedit/live-mode.ts, Nov 25): the pure parts it shares with the map builder,
// its bar's layout over the battle, its key and its hint. The painting itself is checked on screenshots.

const doc = blankDoc(8, 6);
const wall = BAR[3].tool('sand');
const inside = (a: Box, b: Box) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w + 0.5 && a.y + a.h <= b.y + b.h;
const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('the tiles a stroke lights', () => {
  it('the brush alone: its tiles as half cells in the tool colour, the cursor on its corner', () => {
    const m = strokeMarks(doc, { x: 2, y: 2 }, 1, null, wall);
    expect(m.hl.tiles).toEqual(halfCells({ x: 2, y: 2 }).map((pos) => ({ pos, kind: toolMark(wall) })));
    expect(m.cursor).toEqual({ x: 4, y: 4 });
    expect(m.size).toBe(2);
  });
  it('a stroke so far and the brush, each tile once, in the stroke tool colour', () => {
    const stroke = {
      tool: BAR[1].tool('sand'),
      cells: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 0 },
      ],
    };
    const m = strokeMarks(doc, { x: 1, y: 0 }, 1, stroke, wall);
    expect(m.hl.tiles).toHaveLength(2 * 4);
    expect(new Set(m.hl.tiles.map((t) => t.kind))).toEqual(new Set([toolMark(stroke.tool)]));
  });
  it('a 3x3 brush at the edge: the cursor covers the tiles left on the map', () => {
    const m = strokeMarks(doc, { x: 0, y: 0 }, 3, null, wall);
    expect(m.hl.tiles).toHaveLength(4 * 4);
    expect(m.cursor).toEqual({ x: 0, y: 0 });
    expect(m.size).toBe(4);
  });
});

describe('the bar over the battle', () => {
  const TABLET = { w: 1024, h: 768, s: 1024 / 1920, inset: { top: 12, right: 12, bottom: 12, left: 12 } };
  const PC = { w: 1600, h: 900, s: 1600 / 1920, inset: { top: 12, right: 12, bottom: 12, left: 12 } };
  for (const [name, page, list] of [
    ['PC 1600x900', PC, 260],
    ['tablet 1024x768', TABLET, 180],
  ] as const)
    it(`nine finger targets right of the turn list, on the page, hints and help over them (${name})`, () => {
      const l = liveLayout(page, list);
      const pageBox = { x: 0, y: 0, w: page.w, h: page.h };
      expect(l.bar).toHaveLength(9);
      for (const b of l.bar) {
        expect(b.w).toBeGreaterThanOrEqual(TAP);
        expect(b.h).toBeGreaterThanOrEqual(TAP);
        expect(inside(b, pageBox)).toBe(true);
        expect(b.x).toBeGreaterThan(list);
      }
      l.bar.forEach((a, i) => l.bar.slice(i + 1).forEach((b) => expect(overlap(a, b)).toBe(false)));
      expect(l.hints.y + l.hints.h).toBeLessThanOrEqual(l.bar[0].y);
      expect(l.note.y + l.note.h).toBeLessThanOrEqual(l.hints.y);
      // the camera keeps the map over the help line
      expect(l.bottom).toBe(page.h - l.note.y);
      expect(l.bottom).toBeLessThan(page.h / 2);
    });
});

describe('its key and hint', () => {
  it('M turns it on and off, in either case', () => {
    const m = { key: 'm', shiftKey: false, ctrlKey: false, altKey: false, metaKey: false };
    expect(keyAction(m)).toEqual({ k: 'live' });
    expect(keyAction({ ...m, key: 'M' })).toEqual({ k: 'live' });
  });
  it("a battle the battle builder opened shows the key on the turn's left, beside Options", () => {
    const b = new Battle(
      flat(6, 6),
      stateOf([
        { id: 'a', def: 'warrior', team: 'hero', x: 1, y: 1 },
        { id: 'b', def: 'soldier', team: 'enemy', x: 2, y: 1 },
      ]),
    );
    const menu = { k: 'menu' as const, index: commandIndex('move') };
    expect(hintsFor(b, menu, true, 'keyboard', true).left.map((h) => h.act)).toEqual(['help', 'live']);
    expect(hintsFor(b, menu, true, 'keyboard').left.map((h) => h.act)).toEqual(['help']);
    // while the battle plays, the edit cannot open
    expect(hintsFor(b, menu, false, 'keyboard', true).left.map((h) => h.act)).toEqual(['help']);
  });
});
