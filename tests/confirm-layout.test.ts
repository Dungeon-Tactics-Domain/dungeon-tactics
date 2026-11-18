import { describe, expect, it } from 'vitest';
import { confirmLayout, SIZE } from '../src/client/confirm3d/confirm-layout.ts';
import { type Box, type LayoutMode, setPageFloor, stage } from '../src/client/ui3d/layout.ts';

// The 3D "Execute?" window's own layout (Nov 18: the 3D pieces stop measuring the HTML). Each case is what the browser
// measured on the unseen HTML window, on a sandbox scene (a charged strike: what it spends, then the charge's note),
// the day before the numbers moved to confirm-layout.ts. Boxes as [x, y, w, h] from the window's top left.
type Four = [number, number, number, number];
interface Measured {
  name: string;
  w: number;
  h: number;
  mode: LayoutMode;
  coarse: boolean;
  lines: number; // of the second note
  box: [number, number];
  size: [number, number]; // what the HUD places beside the unit: whole px
  head: Four;
  notes: Four[];
  choices: Four[];
}
const MEASURED = [
  {
    name: 'the reference (1920x1080)',
    ...{ w: 1920, h: 1080, mode: 'edges', coarse: false, lines: 2, box: [440, 219.969], size: [440, 220] },
    head: [14, 2, 412, 55.797],
    notes: [
      [20, 65.797, 400, 23.391],
      [20, 97.188, 400, 46.781],
    ],
    choices: [
      [22, 153.969, 195, 52],
      [223, 153.969, 195, 52],
    ],
  },
  {
    name: 'a phone on its side (844x390)',
    ...{ w: 844, h: 390, mode: 'edges', coarse: false, lines: 3, box: [193.406, 152.859], size: [193, 153] },
    head: [7.266, 2, 178.875, 42.781],
    notes: [
      [9.891, 48.297, 173.625, 15.234],
      [9.891, 67.047, 173.625, 45.703],
    ],
    choices: [
      [15.266, 122.75, 78.438, 22.844],
      [99.703, 122.75, 78.438, 22.844],
    ],
  },
  {
    name: 'ultrawide (3440x1440)',
    ...{ w: 3440, h: 1440, mode: 'edges', coarse: false, lines: 2, box: [586.656, 287.922], size: [587, 288] },
    head: [18, 2, 550.656, 73.719],
    notes: [
      [26, 86.375, 534.656, 31.188],
      [26, 128.219, 534.656, 62.375],
    ],
    choices: [
      [26, 200.594, 264.328, 69.328],
      [296.328, 200.594, 264.328, 69.328],
    ],
  },
  {
    name: '1280x720',
    ...{ w: 1280, h: 720, mode: 'edges', coarse: false, lines: 3, box: [293.328, 197.813], size: [293, 198] },
    head: [10, 2, 273.328, 47.313],
    notes: [
      [14, 54.641, 265.328, 20.797],
      [14, 80.766, 265.328, 62.391],
    ],
    choices: [
      [18, 153.156, 125.672, 34.656],
      [149.672, 153.156, 125.656, 34.656],
    ],
  },
  {
    name: 'a 4:3 tablet, frame (1024x768)',
    ...{ w: 1024, h: 768, mode: 'frame', coarse: false, lines: 3, box: [234.656, 175.234], size: [235, 175] },
    head: [8.391, 2, 217.875, 44.656],
    notes: [
      [11.578, 50.922, 211.5, 18.484],
      [11.578, 73.672, 211.5, 55.453],
    ],
    choices: [
      [16.391, 139.125, 97.938, 27.719],
      [120.328, 139.125, 97.938, 27.719],
    ],
  },
  {
    name: 'a phone on its side, a finger pointing (844x390)',
    ...{ w: 844, h: 390, mode: 'edges', coarse: true, lines: 3, box: [193.406, 174.016], size: [193, 174] },
    head: [7.266, 2, 178.875, 42.781],
    notes: [
      [9.891, 48.297, 173.625, 15.234],
      [9.891, 67.047, 173.625, 45.703],
    ],
    choices: [
      [15.266, 122.75, 78.438, 44],
      [99.703, 122.75, 78.438, 44],
    ],
  },
  {
    name: '1280x720, a finger pointing',
    ...{ w: 1280, h: 720, mode: 'edges', coarse: true, lines: 3, box: [293.328, 207.156], size: [293, 207] },
    head: [10, 2, 273.328, 47.313],
    notes: [
      [14, 54.641, 265.328, 20.797],
      [14, 80.766, 265.328, 62.391],
    ],
    choices: [
      [18, 153.156, 125.672, 44],
      [149.672, 153.156, 125.656, 44],
    ],
  },
] as Measured[];

const near = (got: Box, [x, y, w, h]: Four) => {
  // the browser's numbers came rounded to 1/1000 of a px
  expect(got.x).toBeCloseTo(x, 1);
  expect(got.y).toBeCloseTo(y, 1);
  expect(got.w).toBeCloseTo(w, 1);
  expect(got.h).toBeCloseTo(h, 1);
};
const one = () => 1;

describe('3D "Execute?": its layout with no DOM', () => {
  for (const m of MEASURED)
    it(`sits where the HTML window sat: ${m.name}`, () => {
      const s = stage(m.w, m.h, m.mode).s;
      const count: Record<string, number> = { title: 1, spends: 1, charge: m.lines };
      const l = confirmLayout(
        { title: 'title', notes: ['spends', 'charge'], choices: 2 },
        s,
        m.coarse,
        (str) => count[str],
      );
      near(l, [0, 0, ...m.box]);
      expect([Math.round(l.w), Math.round(l.h)]).toEqual(m.size);
      near(l.head, m.head);
      expect(l.notes).toHaveLength(2);
      l.notes.forEach((n, i) => near(n, m.notes[i]));
      expect(l.choices).toHaveLength(2);
      l.choices.forEach((c, i) => near(c, m.choices[i]));
    });

  it('with no note the choices come 10 px under the head', () => {
    const l = confirmLayout({ title: 't', notes: [], choices: 2 }, 1, false, one);
    expect(l.notes).toEqual([]);
    expect(l.head).toEqual({ x: 14, y: 2, w: 412, h: 20 + 33.796875 + 2 });
    expect(l.choices[0].y).toBe(l.head.y + l.head.h + 10);
    expect(l.h).toBe(l.choices[0].y + 52 + 12 + 2);
  });

  it('a note is as tall as its lines, and pushes the choices down by them', () => {
    const tall = (n: number) =>
      confirmLayout({ title: 't', notes: ['a'], choices: 2 }, 1, false, (str) => (str === 'a' ? n : 1));
    const line = tall(2).notes[0].h - tall(1).notes[0].h;
    expect(line).toBeCloseTo(1.3 * SIZE.note, 1);
    expect(tall(3).notes[0].h).toBeCloseTo(3 * line, 5);
    expect(tall(3).choices[0].y - tall(1).choices[0].y).toBeCloseTo(2 * line, 5);
    expect(tall(3).h - tall(1).h).toBeCloseTo(2 * line, 5);
  });

  it('the head is never shorter than the icon beside the title, and grows when the title takes two lines', () => {
    // a small page: one 11.7 px line is 15 px, under the 32 px icon
    const small = (title: number) =>
      confirmLayout({ title: 't', notes: [], choices: 2 }, 0.44, false, () => title).head.h;
    expect(small(1)).toBe(small(2));
    expect(small(3)).toBeGreaterThan(small(2));
    // the reference: a 33.8 px line already passes the icon, so the second line shows
    const big = (title: number) => confirmLayout({ title: 't', notes: [], choices: 2 }, 1, false, () => title).head.h;
    expect(big(2) - big(1)).toBeCloseTo(33.8, 1);
  });

  it('asks for the lines at the size and the width it draws them', () => {
    const asked: [string, number, number][] = [];
    const l = confirmLayout({ title: 'T', notes: ['N'], choices: 2 }, 1, false, (str, px, width) => {
      asked.push([str, px, width]);
      return 1;
    });
    // the title beside its 32 px icon, 10 px apart, inside the head's 14 px of padding; a note as wide as its box
    expect(asked).toEqual([
      ['T', 26, 412 - 28 - 32 - 10],
      ['N', 18, l.notes[0].w],
    ]);
    // under the smallest full scale the text shrinks with the pieces (layout.ts textPx), never the 16 px above it
    const sizes: number[] = [];
    confirmLayout({ title: 'T', notes: ['N'], choices: 2 }, 0.6, false, (_s, px) => sizes.push(px));
    expect(sizes).toEqual([16, 16]);
  });

  it('the choices split the row evenly, 6 px apart, and a finger keeps its 44 px', () => {
    const l = confirmLayout({ title: 't', notes: [], choices: 2 }, 0.5, false, one);
    const [a, b] = l.choices;
    expect(a.w).toBe(b.w);
    expect(b.x - (a.x + a.w)).toBeCloseTo(6, 5);
    expect(a.x - l.head.x).toBe(8);
    expect(l.head.x + l.head.w - (b.x + b.w)).toBeCloseTo(8, 5);
    expect(a.h).toBe(26);
    const touch = confirmLayout({ title: 't', notes: [], choices: 2 }, 0.5, true, one);
    expect(touch.choices[0].h).toBe(44);
    expect(touch.h - l.h).toBe(18);
    // on the reference the row is already 52 px: a finger changes nothing
    expect(confirmLayout({ title: 't', notes: [], choices: 2 }, 1, true, one).choices[0].h).toBe(52);
  });

  it("on a tablet the window widens with its 14 px text; a phone and a PC keep the reference's width", () => {
    const at = (w: number, h: number) => {
      setPageFloor(w, h);
      return confirmLayout({ title: 't', notes: [], choices: 2 }, stage(w, h, 'edges').s, true, one);
    };
    // 768x1024: scale 0.4, the choice's 24 px drawn at 14 instead of 9.6, the window 440 x 0.4 x 14 / 9.6 wide
    const upright = at(768, 1024);
    expect(upright.w).toBeCloseTo((440 * 0.4 * 14) / 9.6, 1);
    expect(upright.choices[0].w).toBeGreaterThan(110); // "▶ Atirar" at 14 px is about 60 px, with the button's padding
    expect(at(844, 390).w).toBe(Math.trunc(Math.fround(440 * (844 / 1920)) * 64) / 64);
    expect(at(1920, 1080).w).toBe(440);
    expect(at(1152, 648).w).toBe(Math.trunc(Math.fround(440 * 0.6) * 64) / 64);
    setPageFloor(0, 0);
  });
});
