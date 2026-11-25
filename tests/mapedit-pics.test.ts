// The map builder's tile pictures and in-place redraw (Nov 25): which picture each panel cell shows, the tiny maps they
// are rendered from, and the terrain grid's partial redraw giving the same vertices and normals as a whole one
import { BufferAttribute, BufferGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import { barCells, type PanelState, panelRows } from '../src/client/mapedit/panel.ts';
import { PIC_KEYS, PIC_SIGN, paletteGrid, picGrid, picOf } from '../src/client/mapedit/pics.ts';
import { BAR } from '../src/client/mapedit/tools.ts';
import {
  type Cells,
  changed,
  fillNormals,
  fillVertices,
  gridIndex,
  grow,
  newVerts,
} from '../src/client/terrain-grid.ts';
import { PALETTE } from '../src/content/map-palette.ts';
import { blankDoc } from '../src/shared/mapedit/doc.ts';

const state = (over: Partial<PanelState> = {}): PanelState => ({
  tab: 'paint',
  doc: blankDoc(8, 8),
  tool: BAR[0].tool('sand'),
  picked: 'sand',
  page: 0,
  perPage: 40,
  slots: [],
  playWhy: null,
  canUndo: false,
  canRedo: false,
  brush: 1,
  shown: 'keyboard',
  finger: false,
  ...over,
});

describe('tile pictures', () => {
  it('every bar tool and every palette entry on the Paint tab has a picture that is rendered', () => {
    const cells = [...barCells(state()), ...panelRows(state()).flatMap((r) => r.cells)].filter(
      (c) => c.id.startsWith('bar:') || c.id.startsWith('pal:'),
    );
    expect(cells.length).toBe(BAR.length + PALETTE.length);
    for (const c of cells) expect(PIC_KEYS).toContain(c.pic);
  });

  it('the Relief tab tools show the same pictures as their bar plates', () => {
    const relief = panelRows(state({ tab: 'relief' })).flatMap((r) => r.cells.filter((c) => c.id.startsWith('bar:')));
    expect(relief.map((c) => c.pic)).toEqual(['up', 'down', 'ramp']);
  });

  it('the Palette tool shows the entry picked; the others their own entry or tool', () => {
    expect(BAR.map((_, i) => picOf(`bar:${i}`, 'crates'))).toEqual([
      'grass',
      'tree',
      'water_shallow',
      'brick',
      'up',
      'down',
      'ramp',
      'crates',
      'rubble',
    ]);
    expect(picOf('pal:snow', 'sand')).toBe('snow');
    expect(picOf('undo', 'sand')).toBeNull();
    expect(Object.keys(PIC_SIGN).sort()).toEqual(['down', 'ramp', 'up']);
  });

  it('each picture map is halved and shows what its tool makes', () => {
    for (const key of PIC_KEYS) {
      const g = picGrid(key);
      expect(g.tiles.length).toBe(g.width * g.height);
      expect(g.sub).toBe(2);
    }
    const hs = (k: string) => picGrid(k).tiles.map((t) => t.h);
    expect(Math.max(...hs('up'))).toBeGreaterThan(Math.min(...hs('up')));
    expect(picGrid('up').tiles[3 * 6 + 3].h).toBe(Math.max(...hs('up'))); // the middle is the high one
    expect(picGrid('down').tiles[3 * 6 + 3].h).toBe(Math.min(...hs('down')));
    expect(picGrid('ramp').tiles.some((t) => t.ramp)).toBe(true);
    expect(picGrid('crates').tiles.every((t) => t.look === 'crates' && t.terrain === 'wall')).toBe(true);
  });

  it('the palette map holds every entry once, on a ramp so a stairs look loads its stairs too', () => {
    const g = paletteGrid();
    expect(g.tiles.map((t) => [t.terrain, t.look])).toEqual(PALETTE.map((e) => [e.terrain, e.look]));
    expect(g.tiles.every((t) => t.ramp)).toBe(true);
  });
});

// a small terrain: 6 x 4 sub-tiles, heights from a seed
const cellsOf = (NX: number, NZ: number, h: (a: number, b: number) => number): Cells => {
  const raw = new Float32Array(NX * NZ),
    tone = new Float32Array(NX * NZ).fill(1),
    paint = new Float32Array(NX * NZ * 5);
  for (let b = 0; b < NZ; b++)
    for (let a = 0; a < NX; a++) {
      raw[b * NX + a] = h(a, b);
      paint[(b * NX + a) * 5] = 1;
    }
  return { raw, tone, paint, NX, NZ };
};

describe('terrain grid: the in-place redraw', () => {
  const NX = 12,
    NZ = 9,
    all = { a0: 0, a1: NX, b0: 0, b1: NZ },
    before = cellsOf(NX, NZ, (a, b) => ((a * 7 + b * 3) % 5) * 0.25),
    after = cellsOf(NX, NZ, (a, b) => ((a * 7 + b * 3) % 5) * 0.25 + (a === 5 && b === 4 ? 1 : 0));

  it('finds only the vertices round the changed sub-tile, and none when nothing changed', () => {
    expect(changed(before, after)).toEqual({ a0: 5, a1: 6, b0: 4, b1: 5 });
    expect(changed(before, before)).toBeNull();
    expect(grow({ a0: 0, a1: 1, b0: 8, b1: 9 }, NX, NZ)).toEqual({ a0: 0, a1: 2, b0: 7, b1: 9 });
  });

  it('a partial redraw gives the same vertices and normals as a whole one', () => {
    const whole = newVerts(NX, NZ);
    fillVertices(after, whole, all, -3, -2, 6);
    fillNormals(whole.pos, whole.normal, NX, NZ, all);
    const part = newVerts(NX, NZ);
    fillVertices(before, part, all, -3, -2, 6);
    fillNormals(part.pos, part.normal, NX, NZ, all);
    const box = changed(before, after)!;
    fillVertices(after, part, box, -3, -2, 6);
    fillNormals(part.pos, part.normal, NX, NZ, grow(box, NX, NZ));
    expect([...part.pos]).toEqual([...whole.pos]);
    for (let i = 0; i < whole.normal.length; i++) expect(part.normal[i]).toBeCloseTo(whole.normal[i], 6);
  });

  it("the normals are Three's computeVertexNormals over the same triangles", () => {
    const v = newVerts(NX, NZ);
    fillVertices(after, v, all, -3, -2, 6);
    fillNormals(v.pos, v.normal, NX, NZ, all);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(v.pos, 3));
    g.setIndex(new BufferAttribute(gridIndex(NX, NZ), 1));
    g.computeVertexNormals();
    const three = g.getAttribute('normal').array;
    for (let i = 0; i < three.length; i++) expect(v.normal[i]).toBeCloseTo(three[i], 5);
  });
});
