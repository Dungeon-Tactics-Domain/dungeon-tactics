import { describe, expect, it } from 'vitest';
import { defaultPixel, nextSize, PIXEL_SIZES, parsePixel } from '../src/client/pixel-settings.ts';

describe('pixel art settings', () => {
  it('default: 2 px on portrait mobile, 3 px on PC, outline and locked camera on, palette off', () => {
    expect(defaultPixel(true)).toEqual({ size: 0, outline: true, palette: false, snap: true });
    expect(defaultPixel(false)).toEqual({ size: 0, outline: true, palette: false, snap: true });
  });

  it('malformed browser save falls back to the default, field by field', () => {
    expect(parsePixel(null, false)).toEqual(defaultPixel(false));
    expect(parsePixel('lixo', false)).toEqual(defaultPixel(false));
    expect(parsePixel({ size: 7, outline: 'sim', palette: true }, false)).toEqual({
      ...defaultPixel(false),
      palette: true,
    });
    expect(parsePixel({ size: 0, outline: false, palette: false, snap: false, extra: 1 }, true)).toEqual({
      size: 0,
      outline: false,
      palette: false,
      snap: false,
    });
  });

  it('quick shortcut cycles through the sizes and wraps around (Off, 2, 3, 4)', () => {
    expect(PIXEL_SIZES).toEqual([0, 2, 3, 4]);
    expect(nextSize(0)).toBe(2);
    expect(nextSize(3)).toBe(4);
    expect(nextSize(4)).toBe(0);
  });
});
