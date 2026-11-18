import { describe, expect, it } from 'vitest';
import { parseSpec } from '../src/client/dev/sandbox-spec.ts';
import {
  LAYOUT_MODES,
  pageFloor,
  parseLayout,
  place,
  REGIONS,
  type Region,
  setPageFloor,
  stage,
  textPx,
} from '../src/client/ui3d/layout.ts';

// Where the battle interface sits (ui3d/layout.ts); Nov 16
describe('interface layout: the reference regions on a page', () => {
  const all = Object.entries(REGIONS) as [string, Region][];
  const box = ({ x, y, w, h }: Region) => ({ x, y, w, h });

  it('on a 1920x1080 page both layouts are the reference itself', () => {
    for (const mode of LAYOUT_MODES)
      for (const [id, r] of all) expect(place(r, stage(1920, 1080, mode)), `${id} ${mode}`).toEqual(box(r));
    expect(place(REGIONS.menu, stage(1920, 1080, 'frame'))).toEqual({ x: 1152, y: 688, w: 414, h: 327 });
    expect(REGIONS.submenu.x).toBe(1284);
    expect(box(REGIONS.detail)).toEqual({ x: 1450, y: 100, w: 400, h: 564 });
  });

  it('every region lies inside the reference', () => {
    for (const [id, r] of all) expect(r.x >= 0 && r.y >= 0 && r.x + r.w <= 1920 && r.y + r.h <= 1080, id).toBe(true);
  });

  it('frame: a centred 16:9 box scaled to fit, on a wide and on a tall page', () => {
    expect(stage(3440, 1440, 'frame')).toEqual({ x: 440, y: 0, w: 2560, h: 1440, s: 4 / 3 });
    expect(stage(1024, 768, 'frame')).toEqual({ x: 0, y: 96, w: 1024, h: 576, s: 1024 / 1920 });
    const st = stage(3440, 1440, 'frame');
    for (const [id, r] of all) {
      const b = place(r, st);
      expect(b.x, id).toBeCloseTo(440 + (r.x * 4) / 3);
      expect(b.y, id).toBeCloseTo((r.y * 4) / 3);
      expect(b.w, id).toBeCloseTo((r.w * 4) / 3);
    }
  });

  it('edges: each region keeps the reference distance to its own edge, at the same scale as the frame', () => {
    const st = stage(3440, 1440, 'edges');
    expect(st).toEqual({ x: 0, y: 0, w: 3440, h: 1440, s: 4 / 3 });
    const s = st.s;
    const menu = place(REGIONS.menu, st);
    expect(menu.x + menu.w).toBeCloseTo(3440 - 354 * s); // right
    expect(menu.y + menu.h).toBeCloseTo(1440 - 65 * s); // bottom
    expect(place(REGIONS.detail, st).y).toBeCloseTo(100 * s); // top
    const banner = place(REGIONS.banner, st);
    expect(banner.x + banner.w / 2).toBeCloseTo(3440 / 2); // centred
    const turn = place(REGIONS.turn, st);
    expect(turn.x).toBeCloseTo(18 * s); // left
    expect(turn.y + turn.h / 2).toBeCloseTo(720 + (64 + 849 / 2 - 540) * s); // about the middle
    // the two layouts differ only sideways here
    const framed = place(REGIONS.menu, stage(3440, 1440, 'frame'));
    expect(framed.x).toBeCloseTo(menu.x - 440);
    expect(framed.y).toBeCloseTo(menu.y);
  });

  it('edges: a short page keeps the smallest full scale; the frame always fits', () => {
    expect(stage(1920, 600, 'edges').s).toBe(0.6);
    expect(stage(1280, 720, 'edges').s).toBeCloseTo(2 / 3);
    expect(stage(1180, 820, 'edges').s).toBeCloseTo(1180 / 1920);
    expect(stage(640, 360, 'frame').s).toBeCloseTo(1 / 3);
  });

  // Fernando, Nov 18: on a phone and a tablet the pieces may shrink with the screen
  it('edges: a narrow page shrinks the pieces by its width alone, down to a third', () => {
    expect(stage(1024, 768, 'edges').s).toBeCloseTo(1024 / 1920); // the combat bar spans the reference's width
    expect(stage(768, 1024, 'edges').s).toBeCloseTo(0.4);
    expect(stage(844, 390, 'edges').s).toBeCloseTo(844 / 1920); // not 390 / 1080: the height never shrinks them
    expect(stage(480, 320, 'edges').s).toBeCloseTo(1 / 3);
    // the whole combat bar fits between the edges wherever the floor is not reached
    for (const w of [667, 768, 844, 1024]) {
      const bar = place(REGIONS.bar, stage(w, 400, 'edges'));
      expect(bar.x, String(w)).toBeGreaterThanOrEqual(0);
      expect(bar.x + bar.w, String(w)).toBeLessThanOrEqual(w);
    }
  });

  it('edges: the pieces anchor inside the safe area, the larger side of each axis on both; the frame ignores it', () => {
    const st = stage(844, 390, 'edges', { x: 47, y: 21 });
    expect(st).toEqual({ x: 47, y: 21, w: 750, h: 348, s: 750 / 1920 });
    expect(place(REGIONS.turn, st).x).toBeCloseTo(47 + 18 * st.s); // clear of the notch
    const menu = place(REGIONS.menu, st);
    expect(menu.y + menu.h).toBeCloseTo(390 - 21 - 65 * st.s); // clear of the home bar
    expect(stage(844, 390, 'frame', { x: 47, y: 21 })).toEqual(stage(844, 390, 'frame'));
  });

  it("a 3D piece's smallest text is 16 px down to the smallest full scale, then shrinks with the pieces", () => {
    expect(textPx(26, 1)).toBe(26);
    expect(textPx(12, 1)).toBe(16);
    expect(textPx(12, 0.6)).toBe(16);
    expect(textPx(12, 0.3)).toBe(8);
    expect(textPx(40, 0.3)).toBe(12);
    expect(textPx(12, 1, 22)).toBe(22);
  });

  it('a tablet never draws 3D text under 14 px; a phone on its side and a PC keep their sizes', () => {
    // the smallest (12 px) and a mid-size (26 px) text of the reference, on the page; `was` is before Nov 18's floor
    const at = (w: number, h: number, safe = { x: 0, y: 0 }) => {
      const s = stage(w, h, 'edges', safe).s;
      return {
        small: textPx(12, s, 16, pageFloor(w, h)),
        mid: textPx(26, s, 16, pageFloor(w, h)),
        was: textPx(12, s, 16, 0),
      };
    };
    const phone = at(844, 390, { x: 47, y: 21 });
    expect(phone.small).toBeCloseTo(10.42, 2); // unchanged: the phone on its side (decisions.md, Nov 18)
    expect(phone.small).toBe(phone.was);
    expect(at(667, 375).small).toBeCloseTo(9.26, 2);
    expect(at(667, 375).small).toBe(at(667, 375).was);
    expect(at(768, 1024).was).toBeCloseTo(10.67, 2); // the upright tablet, before
    expect(at(768, 1024)).toMatchObject({ small: 14, mid: 14 });
    expect(at(1024, 768).small).toBeCloseTo(14.22, 2); // already over 14 by its scale
    expect(at(1180, 820)).toMatchObject({ small: 16, mid: 16 });
    expect(at(1280, 720).small).toBe(16);
    expect(at(1280, 720).mid).toBeCloseTo(17.33, 2);
    expect(at(1920, 1080)).toMatchObject({ small: 16, mid: 26, was: 16 });
    // a caller's own higher floor stays; the page floor only lifts what is under 14
    expect(textPx(12, 0.4, 22, 14)).toBeCloseTo(14.67, 2);
  });

  it('the page floor follows the shorter side, set by the 3D layer', () => {
    expect([pageFloor(844, 390), pageFloor(390, 844), pageFloor(768, 1024), pageFloor(599, 900)]).toEqual([
      0, 0, 14, 0,
    ]);
    // a page of 1152x648 or more (a PC, a large tablet as 1180x820) has none: its 16 px holds by the scale already
    expect([pageFloor(1152, 648), pageFloor(1280, 720), pageFloor(1280, 1024), pageFloor(1180, 820)]).toEqual([
      0, 0, 0, 0,
    ]);
    setPageFloor(768, 1024);
    expect(textPx(12, 0.4)).toBe(14);
    setPageFloor(844, 390);
    expect(textPx(12, 0.4)).toBeCloseTo(10.67, 2);
  });

  it('an unknown layout is the default', () => {
    expect(LAYOUT_MODES[0]).toBe('edges');
    expect(['frame', 'edges', 'wide', null].map(parseLayout)).toEqual(['frame', 'edges', 'edges', 'edges']);
  });
});

describe('interface layout: the spec', () => {
  it('a spec names the layout and the pixel filter, and a typo fails it', () => {
    expect(parseSpec({ uiPixel: true, layout: 'frame' }).problems).toEqual([]);
    expect(parseSpec({ uiPixel: 1, layout: 'wide' }).problems).toEqual([
      'uiPixel must be true or false',
      'layout must be one of edges, frame',
    ]);
  });
});
