import { describe, expect, it } from 'vitest';
import { emptyMemory, padActions } from '../src/client/gamepad.ts';
import { ACTIONS, PAD_INDEX, type PadGlyph } from '../src/client/glyphs.ts';
import { keyHelp } from '../src/client/keyboard.ts';
import { editKey, editPad } from '../src/client/mapedit/keys.ts';
import { builderLayout, type Cell, placeRows, rowsFit, TAP } from '../src/client/mapedit/layout.ts';
import { barCells, footCells, type PanelState, pages, panelRows, tabCells } from '../src/client/mapedit/panel.ts';
import { idOf, MAX_SLOTS, parseSlots, withSlot } from '../src/client/mapedit/slots.ts';
import {
  BAR,
  footprint,
  halfCells,
  heroCorner,
  strokeStep,
  type Tool,
  toolMark,
  unknownLook,
  wholeOf,
} from '../src/client/mapedit/tools.ts';
import type { Box } from '../src/client/ui3d/layout.ts';
import { PALETTE } from '../src/content/map-palette.ts';
import { MAPS } from '../src/shared/battle/scenarios.ts';
import { generateRoom } from '../src/shared/crawl/generate.ts';
import { blankDoc, docFromScenario, index } from '../src/shared/mapedit/doc.ts';
import { paint } from '../src/shared/mapedit/edit.ts';

// The map builder's screen (Nov 25, docs/game-design/map-builder.md): the pure parts behind the tool bar, the side
// panel, the brush, the keys and the saves. The drawing is checked on screenshots.

const doc = blankDoc(8, 6);
const key = (k: string, more: Partial<KeyboardEvent> = {}) =>
  editKey({ key: k, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, ...more }, false);

describe('the brush and a stroke', () => {
  it('1x1 is the tile, 3x3 the tiles around it, cut at the edges', () => {
    expect(footprint(doc, { x: 3, y: 3 }, 1)).toEqual([{ x: 3, y: 3 }]);
    expect(footprint(doc, { x: 3, y: 3 }, 3)).toHaveLength(9);
    expect(footprint(doc, { x: 0, y: 0 }, 3)).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ]);
    expect(footprint(doc, { x: 7, y: 5 }, 3)).toHaveLength(4);
  });
  it('a stroke edits each tile once, however often the drag passes over it', () => {
    const up: Tool = { k: 'height', delta: 1 };
    const done = new Set<string>();
    const cells = [...footprint(doc, { x: 2, y: 2 }, 3), ...footprint(doc, { x: 3, y: 2 }, 3)];
    const d = strokeStep(doc, up, cells, done);
    expect(d.tiles[index(d, { x: 2, y: 2 })].h).toBe(1); // in both footprints, raised once
    expect(d.tiles[index(d, { x: 4, y: 2 })].h).toBe(1);
    expect(d.tiles.filter((t) => t.h === 1)).toHaveLength(12);
    // the same cells again in the same stroke change nothing
    expect(strokeStep(d, up, cells, done)).toBe(d);
  });
  it('an empty or a refused stroke is the same document (no undo step)', () => {
    expect(strokeStep(doc, { k: 'paint', entry: 'grass' }, footprint(doc, { x: 1, y: 1 }, 3), new Set())).toBe(doc);
    expect(strokeStep(doc, { k: 'ramp' }, [{ x: 1, y: 1 }], new Set())).toBe(doc); // no higher neighbour
  });
  it('paints keep the height and lower stops at 0', () => {
    const high = strokeStep(doc, { k: 'height', delta: 1 }, [{ x: 1, y: 1 }], new Set());
    const water = strokeStep(high, { k: 'paint', entry: 'water_shallow' }, [{ x: 1, y: 1 }], new Set());
    expect(water.tiles[index(water, { x: 1, y: 1 })]).toMatchObject({ look: 'water', depth: 1, h: 1 });
    expect(strokeStep(doc, { k: 'height', delta: -1 }, [{ x: 1, y: 1 }], new Set())).toBe(doc);
  });
  it('a whole tile is the 2x2 half cells the scene draws', () => {
    expect(halfCells({ x: 2, y: 1 })).toEqual([
      { x: 4, y: 2 },
      { x: 5, y: 2 },
      { x: 4, y: 3 },
      { x: 5, y: 3 },
    ]);
    for (const p of halfCells({ x: 2, y: 1 })) expect(wholeOf(p)).toEqual({ x: 2, y: 1 });
  });
});

describe('the tool bar', () => {
  it('holds 9 tools, keys 1 to 9, as the spec lists them', () => {
    expect(BAR.map((s) => s.id)).toEqual([
      'ground',
      'tree',
      'water',
      'wall',
      'up',
      'down',
      'ramp',
      'palette',
      'rubble',
    ]);
    expect(ACTIONS.tools.keys).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
    expect(BAR[7].tool('sand')).toEqual({ k: 'paint', entry: 'sand' }); // the Paint panel's pick
    for (const s of BAR) {
      const t = s.tool('sand');
      if (t.k === 'paint')
        expect(
          PALETTE.some((e) => e.id === t.entry),
          s.id,
        ).toBe(true);
    }
  });
  it('each kind of tool lights the tiles in its own mark', () => {
    const marks = ['ground', 'tree', 'water', 'wall', 'up', 'down', 'ramp'].map((id) =>
      toolMark(BAR.find((s) => s.id === id)!.tool('sand')),
    );
    expect(new Set(marks).size).toBe(marks.length);
  });
});

describe('a pasted map', () => {
  it('names the first look no palette entry draws', () => {
    expect(unknownLook(doc)).toBeNull();
    const odd = { ...doc, tiles: doc.tiles.map((t, i) => (i === 3 ? { ...t, look: 'zzz' } : t)) };
    expect(unknownLook(odd)).toBe('zzz');
    expect(unknownLook({ ...doc, tiles: doc.tiles.map(() => ({ terrain: 'wall' as const, h: 0 })) })).toBeNull();
  });
  it('every game map and a crawl room export and import back', () => {
    for (const sc of [...MAPS, generateRoom(7, { depth: 2, boss: false })])
      expect(unknownLook(docFromScenario(sc)), sc.id).toBeNull();
  });
});

describe("Play's default hero", () => {
  it('stands on the first free corner', () => {
    expect(heroCorner(doc)).toEqual({ x: 0, y: 5 });
    const wall = PALETTE.find((e) => e.id === 'brick')!;
    const d = paint(doc, { x: 0, y: 5 }, wall);
    expect(heroCorner(d)).toEqual({ x: 0, y: 0 });
  });
  it('falls back to the standable tile nearest a corner, and to none', () => {
    const wall = PALETTE.find((e) => e.id === 'brick')!;
    let d = doc;
    for (let i = 0; i < d.tiles.length; i++) d = paint(d, { x: i % 8, y: Math.floor(i / 8) }, wall);
    expect(heroCorner(d)).toBeNull();
    d = paint(d, { x: 1, y: 4 }, PALETTE[0]);
    expect(heroCorner(d)).toEqual({ x: 1, y: 4 });
  });
});

describe('the keys and the pad', () => {
  it('each key in the table does its action', () => {
    ACTIONS.tools.keys.forEach((k, i) => expect(key(k)).toEqual({ k: 'tool', index: i }));
    expect(key('b')).toEqual({ k: 'brush' });
    expect(key('B')).toEqual({ k: 'brush' });
    expect(ACTIONS.editUndo.keys).toEqual(['Ctrl+Z']);
    expect(key('z', { ctrlKey: true })).toEqual({ k: 'undo' });
    expect(ACTIONS.redo.keys).toEqual(['Ctrl+Y']);
    expect(key('y', { ctrlKey: true })).toEqual({ k: 'redo' });
    expect(key('Z', { ctrlKey: true, shiftKey: true })).toEqual({ k: 'redo' });
    expect(ACTIONS.erase.keys).toEqual(['Del']);
    expect(key('Delete')).toEqual({ k: 'erase' });
  });
  it('keeps the battle cursor, Enter, camera and top view, and nothing else of the battle', () => {
    expect(key('ArrowUp')).toEqual({ k: 'cursor', dir: 'up' });
    expect(key('Enter')).toEqual({ k: 'confirm' });
    expect(key('t')).toEqual({ k: 'top' });
    expect(key('r', { shiftKey: true })).toEqual({ k: 'rotate', dir: -1 });
    expect(key('q')?.k).toBe('zoom');
    expect(key('z')).toBeNull(); // the battle's undo is Ctrl+Z here
    expect(key('p')).toBeNull();
    expect(key('F2')).toBeNull(); // no debug panel in the builder: it has no battle
    expect(key('Tab')).toBeNull(); // Tab walks the panel's buttons, as on any page
    expect(key('r', { ctrlKey: true })).toBeNull(); // the browser's reload
  });
  it('a name field keeps its letters and digits', () => {
    expect(editKey({ key: '3', shiftKey: false, ctrlKey: false, altKey: false, metaKey: false }, true)).toBeNull();
    expect(editKey({ key: 'b', shiftKey: false, ctrlKey: false, altKey: false, metaKey: false }, true)).toBeNull();
  });
  it('each pad button in the table does its action', () => {
    const press = (g: PadGlyph) => {
      const i = PAD_INDEX[g]!;
      const buttons = Array.from({ length: 16 }, (_, b) => b === i);
      return padActions({ buttons, axes: [0, 0, 0, 0] }, emptyMemory(), 0).map(editPad);
    };
    expect(ACTIONS.tools.pad.flatMap(press)).toEqual([{ k: 'nextTool' }]);
    expect(ACTIONS.brush.pad.flatMap(press)).toEqual([{ k: 'brush' }]);
    expect(ACTIONS.editUndo.pad.flatMap(press)).toEqual([{ k: 'undo' }]);
    expect(ACTIONS.erase.pad.flatMap(press)).toEqual([{ k: 'erase' }]);
    expect(ACTIONS.panel.pad.flatMap(press)).toEqual([{ k: 'panel' }]);
    expect(press('south')).toEqual([{ k: 'confirm' }]);
    expect(press('r3')).toEqual([{ k: 'top' }]);
    expect(press('l3')).toEqual([null]); // the debug panel needs a battle
  });
  it('the help lists the builder keys, or its pad buttons', () => {
    const row = (shown: Parameters<typeof keyHelp>[0]) =>
      keyHelp(shown).find(([k]) => k === 'No construtor de mapas')?.[1];
    expect(row('keyboard')).toContain('1 2 3 4 5 6 7 8 9: ferramentas da barra');
    expect(row('keyboard')).toContain('Ctrl+Y: refazer');
    expect(row('xbox')).toContain('X: ferramentas da barra');
    expect(row('xbox')).not.toContain('refazer'); // the pad has no redo button: the panel's button does it
  });
});

describe('the browser saves', () => {
  it('reads every slot back field by field and drops the broken ones', () => {
    const a = { ...blankDoc(4, 4, 'a', 'A'), en: 'A' };
    const b = { ...blankDoc(5, 5, 'b', 'B'), en: 'B' };
    expect(parseSlots([a, { ...b, width: 99 }, 'x', null, b])).toEqual([a, b]);
    expect(parseSlots('nope')).toEqual([]);
    expect(parseSlots(null)).toEqual([]);
  });
  it('one slot per name, the last saved wins, at most MAX_SLOTS', () => {
    const a = blankDoc(4, 4, 'a', 'A');
    const a2 = blankDoc(6, 6, 'a', 'A');
    expect(parseSlots([a, a2])).toEqual([a2]);
    expect(withSlot([a], a2)).toEqual([a2]);
    const many = Array.from({ length: MAX_SLOTS + 3 }, (_, i) => blankDoc(4, 4, `m${i}`, `M${i}`));
    const kept = many.reduce((s, d) => withSlot(s, d), [] as typeof many);
    expect(kept).toHaveLength(MAX_SLOTS);
    expect(kept.at(-1)?.name).toBe(`M${MAX_SLOTS + 2}`);
  });
  it('a map id comes from its name in letters, digits and _', () => {
    expect(idOf('Bosque das Cinzas')).toBe('bosque_das_cinzas');
    expect(idOf('Ponte à noite!')).toBe('ponte_a_noite');
    expect(idOf('  ')).toBe('new_map');
  });
});

const PC = { w: 1600, h: 900, s: 900 / 1080, inset: { top: 12, right: 12, bottom: 12, left: 12 } };
const TABLET = { w: 1024, h: 768, s: 1024 / 1920, inset: { top: 12, right: 12, bottom: 12, left: 12 } };
const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (a: Box, b: Box) =>
  a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.w <= b.x + b.w + 0.5 && a.y + a.h <= b.y + b.h + 0.5;

const state = (over: Partial<PanelState> = {}): PanelState => ({
  tab: 'paint',
  doc,
  tool: BAR[0].tool('sand'),
  picked: 'sand',
  page: 0,
  perPage: 24,
  slots: [],
  playWhy: null,
  canUndo: false,
  canRedo: false,
  brush: 1,
  shown: 'keyboard',
  finger: false,
  ...over,
});

describe('layout A: the bar at the foot, the panel on the right', () => {
  for (const [name, page] of [
    ['PC 1600x900', PC],
    ['tablet 1024x768', TABLET],
  ] as const)
    it(`every control is a finger's target, on the page, none over another (${name})`, () => {
      const l = builderLayout(page);
      const pageBox = { x: 0, y: 0, w: page.w, h: page.h };
      const boxes = [...l.tabs, ...l.foot.flat(), ...l.bar];
      for (const b of boxes) {
        expect(b.w).toBeGreaterThanOrEqual(TAP);
        expect(b.h).toBeGreaterThanOrEqual(TAP);
        expect(inside(b, pageBox)).toBe(true);
      }
      boxes.forEach((a, i) => boxes.slice(i + 1).forEach((b) => expect(overlap(a, b)).toBe(false)));
      for (const b of l.bar) expect(overlap(b, l.panel)).toBe(false);
      expect(overlap(l.hints, l.panel)).toBe(false);
      expect(l.hints.y + l.hints.h).toBeLessThanOrEqual(l.bar[0].y);
      for (const b of [l.content, l.note, ...l.tabs, ...l.foot.flat()]) expect(inside(b, l.panel)).toBe(true);
      // the map keeps the room left of the panel and over the bar
      expect(l.insets.right).toBe(page.w - l.panel.x);
      expect(page.w - l.insets.right).toBeGreaterThan(page.w * 0.6);
    });

  it('a row that does not fit gets no boxes; the ones that do sit inside the content', () => {
    const l = builderLayout(TABLET);
    const n = rowsFit(l);
    const cell: Cell = { id: 'x', text: 'x', kind: 'button' };
    const rows = Array.from({ length: n + 2 }, () => ({ cells: [cell, cell] }));
    const placed = placeRows(l, rows);
    expect(placed.slice(0, n).every((r) => r.length === 2)).toBe(true);
    expect(placed.slice(n).every((r) => r.length === 0)).toBe(true);
    for (const b of placed.flat()) expect(inside(b, l.content)).toBe(true);
  });

  it('the File panel shows Play on a tablet, before the saved slots', () => {
    const l = builderLayout(TABLET);
    const rows = panelRows(state({ tab: 'file', slots: ['A', 'B', 'C', 'D', 'E'] }));
    const placed = placeRows(l, rows);
    const play = rows.findIndex((r) => r.cells.some((c) => c.id === 'play'));
    expect(placed[play]).toHaveLength(3); // Play, Build a battle, Leave
    expect(rows.findIndex((r) => r.cells.some((c) => c.id.startsWith('slot:')))).toBeGreaterThan(play);
    expect(rows.find((r) => r.cells[0].id.startsWith('slot:'))?.cells[0].id).toBe('slot:E'); // newest first
  });
});

describe('what the panel holds', () => {
  it('four tabs, the one open lit', () => {
    expect(tabCells('map').map((c) => [c.id, !!c.on])).toEqual([
      ['tab:paint', false],
      ['tab:relief', false],
      ['tab:map', true],
      ['tab:file', false],
    ]);
  });
  it('the palette by pages of what fits, two to a row, with its page row', () => {
    const per = 10;
    expect(pages(per)).toBe(Math.ceil(PALETTE.length / per));
    const all = Array.from({ length: pages(per) }, (_, page) =>
      panelRows(state({ perPage: per, page }))
        .flatMap((r) => r.cells)
        .filter((c) => c.id.startsWith('pal:'))
        .map((c) => c.id.slice(4)),
    ).flat();
    expect(all).toEqual(PALETTE.map((e) => e.id));
    const first = panelRows(state({ perPage: per }));
    expect(first.at(-1)?.cells.map((c) => [c.id, !!c.off])).toEqual([
      ['page:-1', true],
      ['pageNo', false],
      ['page:1', false],
    ]);
  });
  it('Map stops its buttons at the size limits, and says the clear size', () => {
    const small = panelRows(state({ tab: 'map', doc: blankDoc(4, 24) })).flatMap((r) => r.cells);
    const off = (id: string) => small.find((c) => c.id === id)?.off;
    expect([off('w:-1'), off('w:1'), off('h:-1'), off('h:1')]).toEqual([true, false, false, true]);
    expect([off('edge:left:-1'), off('edge:top:1')]).toEqual([true, true]);
    expect(small.find((c) => c.id === 'clear')?.text).toContain('4x24');
  });
  it('Play says why it cannot open', () => {
    const play = panelRows(state({ tab: 'file', playWhy: 'sem chão' }))
      .flatMap((r) => r.cells)
      .find((c) => c.id === 'play');
    expect(play).toMatchObject({ off: true, text: 'Jogar: sem chão' });
  });
  it('the bar names its keys for the keyboard, not for a finger or a pad', () => {
    expect(barCells(state())[2].text).toBe('Água · 3');
    expect(barCells(state({ finger: true }))[2].text).toBe('Água');
    expect(barCells(state({ shown: 'xbox' }))[2].text).toBe('Água');
    expect(barCells(state()).map((c) => !!c.on)).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
  });
  it('the foot: brush, undo and redo faded with nothing to do, and the camera', () => {
    const [row, cam] = footCells(state({ canUndo: true }));
    expect(row.map((c) => [c.id, !!c.off])).toEqual([
      ['brush', false],
      ['undo', false],
      ['redo', true],
    ]);
    expect(cam.map((c) => c.id)).toEqual(['rotL', 'rotR', 'top', 'zoomOut', 'zoomIn']);
  });
});
