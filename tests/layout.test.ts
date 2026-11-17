import { describe, expect, it } from 'vitest';
import pieces from '../scripts/sandbox/bench/ui-pecas.json';
import { parseSpec } from '../src/client/dev/sandbox-spec.ts';
import { LAYOUT_MODES, parseLayout, place, REGIONS, type Region, stage } from '../src/client/ui3d/layout.ts';
import { type Flags, PIECES, skinFlags, specFlags, VARIANTS } from '../src/client/ui3d/skin-flags.ts';

// Where the battle interface sits (ui3d/layout.ts) and which look each piece takes (ui3d/skin-flags.ts); Nov 16
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

  it('edges never shrinks below the smallest scale; the frame always fits', () => {
    expect(stage(640, 360, 'edges').s).toBe(0.6);
    expect(stage(640, 360, 'frame').s).toBeCloseTo(1 / 3);
  });

  it('an unknown layout is the default', () => {
    expect(LAYOUT_MODES[0]).toBe('edges');
    expect(['frame', 'edges', 'wide', null].map(parseLayout)).toEqual(['frame', 'edges', 'edges', 'edges']);
  });
});

describe('interface looks: one flag reader for the address and the spec', () => {
  const url = (q: string): Flags => {
    const p = new URLSearchParams(q);
    return (name) => p.get(name);
  };
  const looks = (q: string, spec: Record<string, unknown> = {}) => {
    const { menu, turn, pixel } = skinFlags(url(q), specFlags(spec));
    return `${menu} ${turn}${pixel ? ' pixel' : ''}`;
  };

  it('without a flag every piece is the HTML one', () => {
    const skin = skinFlags(url(''), specFlags({}));
    expect(skin.pixel).toBe(false);
    for (const piece of Object.keys(PIECES)) expect(skin[piece as keyof typeof PIECES], piece).toBe('html');
  });

  it.each([
    // one piece each
    ['menu=3d', '3d html'],
    ['menu=css', 'css html'],
    ['turn=3d', 'html 3d'],
    ['menu=css&turn=3d', 'css 3d'],
    // the preset sets every piece that has that look
    ['ui=3d', '3d 3d'],
    ['ui=css', 'css html'],
    ['ui=html', 'html html'],
    // a piece's own flag beats the preset and the shortcut
    ['ui=3d&menu=css', 'css 3d'],
    ['ui=3d&turn=html', '3d html'],
    ['menu3d&menu=html', 'html html'],
    ['turn3d&turn=html', 'html html'],
    // the older flags still work, and beat the preset
    ['menu3d', '3d html'],
    ['menu3d=pixel', '3d html pixel'],
    ['turn3d', 'html 3d'],
    ['menucss', 'css html'],
    ['menu3d&turn3d', '3d 3d'],
    ['menu3d&menucss', '3d html'],
    ['ui=3d&menucss', 'css 3d'],
    // the pixel filter
    ['ui=3d&pixel=1', '3d 3d pixel'],
    ['menu=3d&pixel', '3d html pixel'],
    ['menu3d=pixel&pixel=0', '3d html'],
    // a value the piece does not have is skipped
    ['menu=big', 'html html'],
    ['turn=css', 'html html'],
    ['turn=css&ui=3d', '3d 3d'],
    ['ui=4d', 'html html'],
  ])('?%s', (q, want) => {
    expect(looks(q)).toBe(want);
  });

  it('the address beats the spec, piece by piece', () => {
    expect(looks('', { menu3d: true, turn3d: true })).toBe('3d 3d');
    expect(looks('', { menu3d: 'pixel' })).toBe('3d html pixel');
    expect(looks('', { ui: '3d', uiPixel: true })).toBe('3d 3d pixel');
    expect(looks('', { ui: 'css' })).toBe('css html');
    expect(looks('menu=css', { menu3d: true, turn3d: true })).toBe('css 3d');
    expect(looks('ui=html', { menu: '3d', turn: '3d' })).toBe('html html');
    expect(looks('menucss', { menu: '3d' })).toBe('css html');
    expect(looks('pixel=0', { ui: '3d', uiPixel: true })).toBe('3d 3d');
    // the spec's own `pixel` is the scene's pixel art, not the filter
    expect(looks('', { ui: '3d', pixel: 3 })).toBe('3d 3d');
  });

  it('a spec names the looks and the layout, and a typo fails it', () => {
    expect(parseSpec({ ui: '3d', menu: 'css', turn: '3d', uiPixel: true, layout: 'frame' }).problems).toEqual([]);
    expect(parseSpec({ ui: 'x', menu: '4d', turn: 'css', uiPixel: 1, layout: 'wide' }).problems).toEqual([
      'ui must be one of html, css, 3d',
      'menu must be one of html, css, 3d',
      'turn must be one of html, 3d',
      'uiPixel must be true or false',
      'layout must be one of edges, frame',
    ]);
  });

  it('the table the labs page reads is the one the game reads', () => {
    expect(pieces).toEqual({ pieces: PIECES, presets: VARIANTS, layouts: LAYOUT_MODES, pixel: ['0', '1'] });
    for (const piece of ['menu', 'turn', 'bar', 'sheet', 'height', 'banner', 'hints', 'preview'])
      expect(PIECES[piece as keyof typeof PIECES], piece).toContain('html');
  });
});
