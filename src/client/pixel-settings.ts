// Pixel art options (Fernando's request, Oct 25: compare and pick the best). They live in the browser (store `dt:pixel`)
// and apply right away. Pure and tested; BattleScene is what applies them.
export const PIXEL_SIZES = [0, 2, 3, 4] as const; // 0 = no pixel art (normal render)
export type PixelSize = (typeof PIXEL_SIZES)[number];
export interface PixelSettings {
  size: PixelSize;
  outline: boolean; // depth and normal outline from RenderPixelatedPass
  palette: boolean; // few colors per channel (16-bit look)
  snap: boolean; // camera snapped to the pixel grid (without it the ground "boils" when moving)
}
// dt:pixel2 from Nov 13 (to put everyone back on plain 3D) to Nov 14, when it took the English name (store.ts migrate)
export const PIXEL_KEY = 'dt:pixel';

// normal 3D by default (Nov 13, Fernando's request: "make the pixelated look not the default"); pixel art stays in Options
// and on the V key. The `phone` parameter is kept for the day the phone gets its own default
export const defaultPixel = (_phone: boolean): PixelSettings => ({
  size: 0,
  outline: true,
  palette: false,
  snap: true,
});

const isSize = (v: unknown): v is PixelSize => PIXEL_SIZES.includes(v as PixelSize);

// the saved value may be old or edited: each invalid field goes back to the default, the good ones stay
export function parsePixel(raw: unknown, phone: boolean): PixelSettings {
  const d = defaultPixel(phone);
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  const bool = (k: 'outline' | 'palette' | 'snap') => (typeof r[k] === 'boolean' ? (r[k] as boolean) : d[k]);
  return {
    size: isSize(r.size) ? r.size : d.size,
    outline: bool('outline'),
    palette: bool('palette'),
    snap: bool('snap'),
  };
}

export const nextSize = (s: PixelSize): PixelSize => PIXEL_SIZES[(PIXEL_SIZES.indexOf(s) + 1) % PIXEL_SIZES.length];
