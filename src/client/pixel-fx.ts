// The pixel effect (Fernando, Nov 24: the pixel splat demo's final pass as an editable Options section, saved per
// player, with a "Reference" preset): the settings, the presets, how big a low-res pixel is and the low-res size. Saved
// in dt:pixel-fx (not dt:pixel: that one belongs to the pixel art retired on Nov 18 and may still sit in old browsers).
// Pure apart from the cached value; the scene draws it (scene/pixel-pass.ts) and hears a change through `onPixelFx`.
import { store } from './store.ts';

export const PIXEL_KEY = 'dt:pixel-fx';
export const PIXEL_PALETTES = ['warm', 'cold', 'original'] as const;
export type PixelPalette = (typeof PIXEL_PALETTES)[number];
export const PIXEL_SIZES = [0, 2, 3, 4, 5, 6, 7, 8] as const; // screen px per low-res px; 0 = from the screen (pixelSize)
export const PIXEL_LEVELS = [2, 3, 4, 5, 6, 7, 8] as const;

export interface PixelFx {
  on: boolean;
  size: number;
  levels: number;
  palette: PixelPalette;
  dither: boolean;
  strength: number; // dither amplitude, 0 to 100% of one brightness level, in steps of 5
}
export type PixelLook = Omit<PixelFx, 'on'>;
export type PixelPreset = 'ours' | 'reference';

export const PIXEL_PRESETS: Record<PixelPreset, PixelLook> = {
  // the demo's defaults (08-pixel-splat, c0f3030): scale 4, 5 levels, Masmorra quente, half-amplitude dither
  ours: { size: 4, levels: 5, palette: 'warm', dither: true, strength: 50 },
  // the reference author's numbers (brief of Nov 24): pixel from the screen (/270), 5 levels, dither spread 0.5; his
  // palette colours are not ours to take, so it keeps our warm one
  reference: { size: 0, levels: 5, palette: 'warm', dither: true, strength: 50 },
};
// off by default (Fernando, Nov 24): the game stays smooth 3D until the player turns it on
export const PIXEL_DEFAULT: PixelFx = { on: false, ...PIXEL_PRESETS.ours };

const oneOf = <T>(list: readonly T[], v: unknown, fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
const flagOr = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

// read back from the browser: every field rebuilt on its own, a doubtful one falls to its default
export function parsePixelFx(raw: unknown): PixelFx {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof PixelFx, unknown>>;
  const d = PIXEL_DEFAULT;
  const s = r.strength;
  return {
    on: flagOr(r.on, d.on),
    size: oneOf(PIXEL_SIZES, r.size, d.size),
    levels: oneOf(PIXEL_LEVELS, r.levels, d.levels),
    palette: oneOf(PIXEL_PALETTES, r.palette, d.palette),
    dither: flagOr(r.dither, d.dither),
    strength:
      Number.isInteger(s) && (s as number) >= 0 && (s as number) <= 100 && (s as number) % 5 === 0
        ? (s as number)
        : d.strength,
  };
}

// the preset whose values these are, or null for the player's own mix
export const presetOf = (fx: PixelFx): PixelPreset | null =>
  (Object.keys(PIXEL_PRESETS) as PixelPreset[]).find((p) =>
    (Object.keys(PIXEL_PRESETS[p]) as (keyof PixelLook)[]).every((k) => PIXEL_PRESETS[p][k] === fx[k]),
  ) ?? null;

// screen px per low-res px; "from the screen" keeps about 270 low-res rows on the short side, as the reference does
export const pixelSize = (size: number, w: number, h: number) =>
  size || Math.min(8, Math.max(2, Math.round(Math.min(w, h) / 270)));
// the low-res target covering a w x h screen (CSS px), never 0
export const lowRes = (px: number, w: number, h: number): [number, number] => [
  Math.max(1, Math.ceil(w / px)),
  Math.max(1, Math.ceil(h / px)),
];

let fx = parsePixelFx(store.json(PIXEL_KEY));
let heard: (() => void) | null = null;

export const pixelFx = (): PixelFx => fx;
// the open scene redraws with the new values (one scene at a time: the last listener stays); the returned call lets
// go only if it is still the one heard, so a scene disposed after the next one was built does not deafen it
export function onPixelFx(redraw: () => void) {
  heard = redraw;
  return () => {
    if (heard === redraw) heard = null;
  };
}
export function setPixelFx(next: PixelFx) {
  fx = next;
  store.set(PIXEL_KEY, JSON.stringify(next));
  heard?.();
}
