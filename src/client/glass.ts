// Panel glass (Nov 16, Fernando's request): the blue panels' opacity and a blur of what is behind them, saved in dt:glass and
// applied as CSS variables on <html> (style.css --glass-*, --panel-*). 100% is the opaque look of before; below it
// the panel blends over a dark veil (--panel-veil) that keeps the text at 4.5:1 even over a white sky (tests/glass.test.ts)
import { store } from './store.ts';

export const GLASS_KEY = 'dt:glass';
export const ALPHA_MIN = 40; // the veil keeps contrast lower still, but below 40% the panels stop reading as the blue interface
export const ALPHA_STEP = 5; // the slider's step
export const BLURS = { off: 0, light: 6, strong: 12 } as const; // px
export type Blur = keyof typeof BLURS;
export interface Glass {
  alpha: number; // percent
  blur: Blur;
}
export interface GlassEnv {
  blur: boolean; // the browser has backdrop-filter
  reducedTransparency: boolean;
  touch: boolean;
}

// The default is the opaque look; touch screens start with the blur off: backdrop-filter is heavy on a phone's GPU
export const defaultGlass = (touch: boolean): Glass => ({ alpha: 100, blur: touch ? 'off' : 'light' });

export const clampAlpha = (v: number) =>
  Number.isFinite(v) ? Math.min(100, Math.max(ALPHA_MIN, Math.round(v / ALPHA_STEP) * ALPHA_STEP)) : 100;

// A missing, corrupt or out-of-range save falls back field by field to the default
export function parseGlass(raw: unknown, touch: boolean): Glass {
  const d = defaultGlass(touch);
  if (!raw || typeof raw !== 'object') return d;
  const { alpha, blur } = raw as Record<string, unknown>;
  return {
    alpha: typeof alpha === 'number' ? clampAlpha(alpha) : d.alpha,
    blur: typeof blur === 'string' && Object.hasOwn(BLURS, blur) ? (blur as Blur) : d.blur,
  };
}

// the opaque look: the same values as the style.css defaults (plain hex stops, no veil, no rim, no filter), so 100% changes
// no pixel, even in a browser without color-mix
export const OPAQUE = {
  '--glass-hi': 'var(--paper-hi)',
  '--glass': 'var(--paper)',
  '--glass-lo': 'var(--paper-lo)',
  '--panel-veil': 'transparent',
  '--panel-rim': 'transparent',
  '--panel-filter': 'none',
};
export const VEIL = 75; // % of --shade under a translucent panel: the least that keeps 4.5:1 over white is 73 (tests/glass.test.ts)

const see = (token: string, pct: number) => `color-mix(in srgb, var(${token}) ${pct}%, transparent)`;

// Below 100%: translucent stops over the dark veil, a light rim at half the transparency and the blur. An opaque panel hides
// its backdrop, so there the filter stays 'none': no GPU cost, and no new containing block for the fixed pieces inside a
// window. Reduced transparency asked by the system wins over the save
export function glassVars(g: Glass, env: GlassEnv): Record<string, string> {
  if (env.reducedTransparency || g.alpha >= 100) return OPAQUE;
  const px = BLURS[g.blur];
  return {
    '--glass-hi': see('--paper-hi', g.alpha),
    '--glass': see('--paper', g.alpha),
    '--glass-lo': see('--paper-lo', g.alpha),
    '--panel-veil': see('--shade', VEIL),
    '--panel-rim': see('--paper-edge', (100 - g.alpha) / 2),
    '--panel-filter': px && env.blur ? `blur(${px}px) saturate(1.2)` : 'none',
  };
}

const media = (q: string) => typeof matchMedia !== 'undefined' && matchMedia(q).matches;
export const glassEnv = (): GlassEnv => ({
  blur:
    typeof CSS !== 'undefined' &&
    (CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)')),
  reducedTransparency: media('(prefers-reduced-transparency: reduce)'),
  touch: !media('(hover: hover) and (pointer: fine)'), // the same test as the HUD's key hints (hud.ts KEYS)
});

export const getGlass = () => parseGlass(store.json(GLASS_KEY), glassEnv().touch);

function applyGlass(g: Glass) {
  for (const [k, v] of Object.entries(glassVars(g, glassEnv()))) document.documentElement.style.setProperty(k, v);
}

// applies at once: every panel reads the variables, no reload
export function setGlass(g: Glass) {
  store.set(GLASS_KEY, JSON.stringify(g));
  applyGlass(g);
}

// on import, before the first window opens
if (typeof document !== 'undefined') applyGlass(getGlass());
