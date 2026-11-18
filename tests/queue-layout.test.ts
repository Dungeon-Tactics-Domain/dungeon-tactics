import { describe, expect, it } from 'vitest';
import { HEAD, type QueueSpec, queueLayout } from '../src/client/turn3d/queue-layout.ts';
import { type LayoutMode, lu, place, REGIONS, sheetBox, stage } from '../src/client/ui3d/layout.ts';

// The 3D turn list's own layout (Nov 18: the 3D pieces stop measuring the HTML). Each case is what the browser measured
// on the unseen HTML list, on a sandbox scene, the day before the numbers moved to queue-layout.ts: the cards must sit
// on the same px.
interface Measured {
  name: string;
  w: number;
  h: number;
  mode: LayoutMode;
  n: number;
  stats: number;
  sheet: number;
  left: number;
  top: number;
  width: number;
  height: number;
  more: number;
  x: number;
  rw: number;
  rh: number;
  ys: number[];
  title?: [number, number]; // the HTML title's middle and its top, where it was measured
}
const MEASURED: Measured[] = [
  {
    name: 'a low wide page, the list scrolls (1600x560)',
    ...{ w: 1600, h: 560, mode: 'edges', n: 25, stats: 120, sheet: 157 },
    ...{ left: 10.797, top: -5.594, width: 228, height: 407, more: 1011, x: 50, rw: 41, rh: 48 },
    title: [85.492, 1.594],
    ys: [350, 294, 239, 184, 129, 74, 18, -37, -92, -147, -202, -257, -313, -368, -423, -478, -533, -589, -644],
  },
  {
    name: 'a phone on its side (844x390)',
    ...{ w: 844, h: 390, mode: 'edges', n: 25, stats: 90, sheet: 115 },
    ...{ left: 7.906, top: -14.234, width: 169.125, height: 287, more: 757, x: 37, rw: 30, rh: 35 },
    title: [62.633, -8.969],
    ys: [245, 205, 165, 124, 84, 43, 3, -37, -78, -118, -159, -199, -240, -280, -320, -361, -401, -442, -482],
  },
  {
    name: 'the reference (1920x1080)',
    ...{ w: 1920, h: 1080, mode: 'edges', n: 25, stats: 131, sheet: 262 },
    ...{ left: 18, top: 64, width: 311, height: 752, more: 1547, x: 84, rw: 66, rh: 78 },
    title: [142.5, 76],
    ys: [659, 569, 479, 389, 299, 209, 119, 29, -61, -151, -241, -331, -421, -511, -601, -691, -781, -871, -961],
  },
  {
    name: 'ultrawide, edges (3440x1440)',
    ...{ w: 3440, h: 1440, mode: 'edges', n: 24, stats: 154, sheet: 349 },
    ...{ left: 24, top: 85.328, width: 394, height: 1004, more: 1934, x: 112, rw: 88, rh: 104 },
    ys: [880, 760, 640, 520, 400, 280, 160, 40, -80, -200, -320, -440, -560, -680, -800, -920, -1040, -1160],
  },
  {
    name: 'ultrawide, frame (3440x1440)',
    ...{ w: 3440, h: 1440, mode: 'frame', n: 22, stats: 154, sheet: 349 },
    ...{ left: 464, top: 85.328, width: 394, height: 1004, more: 1694, x: 112, rw: 88, rh: 104 },
    ys: [880, 760, 640, 520, 400, 280, 160, 40, -80, -200, -320, -440, -560, -680, -800, -920, -1040, -1160],
  },
  {
    name: 'a 4:3 tablet, frame (1024x768)',
    ...{ w: 1024, h: 768, mode: 'frame', n: 23, stats: 97, sheet: 236 },
    ...{ left: 9.594, top: 130.125, width: 193, height: 400, more: 764, x: 45, rw: 36, rh: 43 },
    ys: [349, 300, 251, 202, 153, 104, 55, 6, -43, -92, -141, -190, -239, -288, -337, -386, -436, -485, -534],
  },
  {
    name: 'where the sizes were measured (1280x720)',
    ...{ w: 1280, h: 720, mode: 'edges', n: 24, stats: 107, sheet: 175 },
    ...{ left: 12, top: 42.656, width: 227, height: 500, more: 980, x: 56, rw: 44, rh: 52 },
    ys: [438, 378, 318, 258, 198, 138, 78, 18, -42, -102, -162, -222, -282, -342, -402, -462, -522, -582, -642],
  },
] as Measured[];

const plain = (over: Partial<QueueSpec>): QueueSpec => ({
  rows: 1,
  now: false,
  s: 1,
  at: { x: 0, y: 0, w: 200, h: 600 },
  pageH: 600,
  sheet: 0,
  stats: 0,
  ...over,
});

describe('3D turn list: its layout with no DOM', () => {
  for (const m of MEASURED)
    it(`sits where the HTML list sat: ${m.name}`, () => {
      const st = stage(m.w, m.h, m.mode);
      // the room the 3D bar's sheet takes from the bottom, which the HUD used to read off its HTML panel
      const sheet = m.h - Math.round(sheetBox(st, m.h).y);
      expect(sheet).toBe(m.sheet);
      const l = queueLayout({
        rows: m.n,
        now: false,
        s: st.s * 1.5,
        at: place(REGIONS.turn, st),
        pageH: m.h,
        sheet,
        stats: m.stats,
      });
      // Nov 18: a list longer than its box drops its top by whole px to the row that fits whole under the title; the
      // rows stay on the page px they had, the list scrolls by as much more
      const cut = Math.round(l.top - m.top); // whole px; the measured top was written to 1/1000 px
      expect(l.top - m.top).toBeCloseTo(cut, 2);
      expect(cut).toBeGreaterThanOrEqual(0);
      expect(l.left).toBeCloseTo(m.left, 2);
      expect(l.box.right - l.box.left).toBeCloseTo(m.width, 2);
      expect(l.height).toBe(m.height - cut);
      expect(l.head).toBe(l.seat.pad.top + HEAD);
      expect(l.more).toBe(m.more + cut);
      expect(l.rows.slice(0, m.ys.length).map((r) => r.y + cut)).toEqual(m.ys);
      for (const r of l.rows) expect(r).toMatchObject({ x: m.x, w: m.rw, h: m.rh });
      // no card at rest is cut by the title's line: each is wholly under it or over it (clipped), but for the rounding
      // of a row's box to whole px (under 2 px)
      for (const r of l.rows) expect(r.y >= l.head || r.y + r.h <= l.head + 2, String(r.y)).toBe(true);
      expect(l.rows.some((r) => r.y >= l.head && r.y - l.seat.gap < l.head + 2)).toBe(true); // the top one a gap under it
      // the list's name, drawn: on the middle of the HTML title's 16 px line (2 px under its top)
      if (m.title) {
        expect(l.title.x).toBeCloseTo(m.title[0], 1);
        expect(l.title.y - 10).toBeCloseTo(m.title[1] + cut, 1);
      }
    });

  // Fernando, Nov 18: on a phone the list's region began above the page, its name and first card cut by the edge
  it('starts under the top margin, its name and every card inside the page', () => {
    for (const [w, h, safe] of [
      [844, 390, { x: 47, y: 21 }],
      [667, 375, { x: 0, y: 0 }],
      [1024, 768, { x: 0, y: 0 }],
      [768, 1024, { x: 0, y: 0 }],
    ] as const) {
      const st = stage(w, h, 'edges', safe),
        l = queueLayout({
          rows: 12,
          now: false,
          s: st.s * 1.5,
          at: place(REGIONS.turn, st),
          pageH: h,
          sheet: h - Math.round(sheetBox(st, h).y),
          stats: 90,
          margin: 12,
        });
      expect(l.top, `${w}`).toBeGreaterThanOrEqual(12);
      expect(l.title.y - 8, `${w}`).toBeGreaterThanOrEqual(12); // the 16 px line's top
      for (const r of l.rows) expect(r.y >= l.head || r.y + r.h <= l.head + 2, `${w} ${r.y}`).toBe(true);
    }
  });

  it('the name sits right over the top row of a list that fits, over the cards', () => {
    const l = queueLayout(plain({ rows: 3, at: { x: 12, y: 40, w: 200, h: 500 }, pageH: 720 }));
    expect(l.title).toEqual({ x: 12 + 56 + (120 - 56 - 10) / 2, y: 40 + (318 - 8 - 22) + 10 });
  });

  it('stacks from the bottom: row 1 ends a padding above the end, each next one a gap higher', () => {
    const l = queueLayout(plain({ rows: 3, at: { x: 12, y: 40, w: 200, h: 500 }, pageH: 720 }));
    expect(l.rows).toEqual([
      { x: 56, y: 438, w: 44, h: 52 },
      { x: 56, y: 378, w: 44, h: 52 },
      { x: 56, y: 318, w: 44, h: 52 },
    ]);
    expect(l.box).toEqual({ left: 12, top: 40, right: 132, bottom: 540 });
  });

  it('the acting row is a bigger card, unless the sheet stands for it', () => {
    // with no acting panel under it the list still ends 2 px above the end of the page
    const big = queueLayout(plain({ rows: 2, now: true }));
    expect(big.rows[0]).toEqual({ x: 56, y: 598 - 10 - 64, w: 54, h: 64 });
    expect(big.rows[1]).toEqual({ x: 56, y: 598 - 10 - 64 - 8 - 52, w: 44, h: 52 });
    expect(big.seat.first).toEqual({ w: 54, h: 64 });
    expect(queueLayout(plain({ rows: 2 })).seat.first).toEqual({ w: 44, h: 52 });
  });

  it('a list that fits does not scroll; a row more than fits does, by what is past its box', () => {
    const fill = (rows: number) => queueLayout(plain({ rows, at: { x: 0, y: 0, w: 200, h: 300 }, pageH: 300 }));
    // 8 + 22 of title + 10, and 60 a row with its gap: four rows are 280 px, five 340, in a box of 298
    expect(fill(0).more).toBe(0);
    expect(fill(0).rows).toEqual([]);
    expect(fill(4).more).toBe(0);
    // a fifth row does not fit: the list drops its top 18 px to the fourth row's (gap under the title), 42 + 18 to scroll
    expect(fill(5).top).toBe(18);
    expect(fill(5).more).toBe(60);
    expect(fill(5).rows[4].y).toBeLessThan(0); // up the list, past its top
    expect(fill(6).more).toBe(120);
  });

  it('ends above the acting panel when that one is taller than the reference, 2 px clear', () => {
    // the region ends 150 px above a 600 px page's end
    const room = (sheet: number) => queueLayout(plain({ at: { x: 10, y: 50, w: 200, h: 400 }, sheet }));
    expect(room(0).box.bottom).toBe(450);
    expect(room(148).box.bottom).toBe(450); // the border: 148 + 2 is the region's own end
    expect(room(149).box.bottom).toBe(449);
    expect(room(200).box.bottom).toBe(398);
    expect(room(200).rows[0].y).toBe(398 - 50 - 10 - 52);
  });

  it('grows to the right by the room the life and CT lines take', () => {
    const wide = (stats: number) => queueLayout(plain({ s: 1.5, at: { x: 10, y: 0, w: 200, h: 400 }, stats })).box;
    expect(wide(0).right).toBe(10 + 180);
    expect(wide(131).right).toBe(10 + 180 + 131);
  });

  it('under the smallest full scale the rows keep a floor that shrinks with the pieces', () => {
    const row = (s: number) => queueLayout(plain({ s })).seat.row;
    expect(row(1.5)).toEqual({ w: 66, h: 78 });
    expect(row(0.9)).toEqual({ w: 41, h: 48 }); // 52 x 0.9 is 46.8: the 48 px floor holds
    expect(row(0.45).h).toBeCloseTo(24, 1); // half of it: the floor is 48 x 0.5
  });

  it('lu cuts a length to the 1/64 px of the browser, toward zero', () => {
    expect(lu(10.8)).toBe(691 / 64);
    expect(lu(-5.6)).toBe(-358 / 64);
    expect(lu(48 * 0.9999999999999999)).toBe(48); // the noise of a float is not a px less
  });
});
