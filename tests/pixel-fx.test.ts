import { describe, expect, it } from 'vitest';
import { lowRes, PIXEL_DEFAULT, PIXEL_PRESETS, parsePixelFx, pixelSize, presetOf } from '../src/client/pixel-fx.ts';

describe('pixel effect settings', () => {
  it('a missing or broken save reads as the default: off, our preset', () => {
    for (const raw of [null, undefined, 'on', 7, [], { on: 'yes' }]) expect(parsePixelFx(raw)).toEqual(PIXEL_DEFAULT);
    expect(PIXEL_DEFAULT.on).toBe(false);
    expect(presetOf(PIXEL_DEFAULT)).toBe('ours');
  });

  it('each doubtful field falls to its own default, the good ones stay', () => {
    const fx = parsePixelFx({ on: true, size: 9, levels: 6, palette: 'neon', dither: 1, strength: 33 });
    expect(fx).toEqual({ ...PIXEL_DEFAULT, on: true, levels: 6 });
    for (const strength of [-5, 105, 2.5, '50', Number.NaN]) expect(parsePixelFx({ strength }).strength).toBe(50);
    expect(parsePixelFx({ size: 1 }).size).toBe(PIXEL_DEFAULT.size);
    expect(parsePixelFx({ levels: 1 }).levels).toBe(PIXEL_DEFAULT.levels);
  });

  it('a saved value comes back as it was', () => {
    const fx = { on: true, size: 0, levels: 3, palette: 'original', dither: false, strength: 100 } as const;
    expect(parsePixelFx(JSON.parse(JSON.stringify(fx)))).toEqual(fx);
  });

  it('Reference holds the author numbers of the Nov 24 brief: pixel from the screen, 5 levels, dither 0.5', () => {
    expect(PIXEL_PRESETS.reference).toMatchObject({ size: 0, levels: 5, dither: true, strength: 50 });
    expect(PIXEL_PRESETS.ours).toMatchObject({ size: 4, levels: 5, palette: 'warm', dither: true, strength: 50 });
  });

  it('the preset is read from the values; one changed by hand is nobody’s', () => {
    expect(presetOf({ on: true, ...PIXEL_PRESETS.reference })).toBe('reference');
    expect(presetOf({ ...PIXEL_DEFAULT, levels: 4 })).toBeNull();
  });

  it('automatic pixel size: about 270 rows on the short side, from 2 to 8', () => {
    expect(pixelSize(0, 1920, 1080)).toBe(4);
    expect(pixelSize(0, 1280, 720)).toBe(3);
    expect(pixelSize(0, 768, 1024)).toBe(3); // a portrait tablet goes by its width
    expect(pixelSize(0, 375, 300)).toBe(2); // never under 2
    expect(pixelSize(0, 7680, 4320)).toBe(8); // never over 8
    expect(pixelSize(5, 1920, 1080)).toBe(5); // a size picked by hand wins
  });

  it('the low-res target covers the whole screen and is never empty', () => {
    expect(lowRes(4, 1920, 1080)).toEqual([480, 270]);
    expect(lowRes(3, 1001, 500)).toEqual([334, 167]);
    expect(lowRes(8, 0, 0)).toEqual([1, 1]);
  });
});
