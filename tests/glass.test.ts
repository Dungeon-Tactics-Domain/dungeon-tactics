/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ALPHA_MIN,
  ALPHA_STEP,
  clampAlpha,
  defaultGlass,
  type GlassEnv,
  glassVars,
  OPAQUE,
  parseGlass,
  VEIL,
} from '../src/client/glass.ts';

const css = readFileSync(new URL('../src/client/style.css', import.meta.url), 'utf8');
const token = (name: string) => {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`));
  if (!m) throw new Error(`no hex token --${name}`);
  return [1, 3, 5].map((i) => Number.parseInt(m[1].slice(i, i + 2), 16));
};

// WCAG 2.1 relative luminance and contrast ratio
const lum = (rgb: number[]) => {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: number[], b: number[]) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const over = (top: number[], alpha: number, under: number[]) => top.map((c, i) => c * alpha + under[i] * (1 - alpha));

const env: GlassEnv = { blur: true, reducedTransparency: false, touch: false };

describe('panel glass', () => {
  it('defaults to the opaque look, the same values as the stylesheet', () => {
    expect(glassVars(defaultGlass(false), env)).toEqual(OPAQUE);
    // 100% must change no pixel: the :root defaults are these exact values (plain hex stops, no veil, rim or filter)
    for (const [k, v] of Object.entries(OPAQUE)) expect(css).toContain(`${k}: ${v};`);
    expect(defaultGlass(true).blur).toBe('off');
    expect(defaultGlass(false).blur).toBe('light');
  });

  it('rebuilds a save field by field and falls back on any doubt', () => {
    for (const bad of [null, 'x', 7, [], { alpha: 'a', blur: 'toString' }])
      expect(parseGlass(bad, true)).toEqual(defaultGlass(true));
    expect(parseGlass({ alpha: 63, blur: 'strong' }, false)).toEqual({ alpha: 65, blur: 'strong' });
    expect(parseGlass({ alpha: 3 }, false)).toEqual({ alpha: ALPHA_MIN, blur: 'light' });
    expect(clampAlpha(Number.NaN)).toBe(100);
    expect(clampAlpha(140)).toBe(100);
  });

  it('turns translucent below 100%, blurs only where the browser can, and stays opaque under reduced transparency', () => {
    const v = glassVars({ alpha: 60, blur: 'light' }, env);
    expect(v['--glass-hi']).toBe('color-mix(in srgb, var(--paper-hi) 60%, transparent)');
    expect(v['--panel-veil']).toBe(`color-mix(in srgb, var(--shade) ${VEIL}%, transparent)`);
    expect(v['--panel-rim']).toBe('color-mix(in srgb, var(--paper-edge) 20%, transparent)');
    expect(v['--panel-filter']).toBe('blur(6px) saturate(1.2)');
    expect(glassVars({ alpha: 100, blur: 'strong' }, env)).toEqual(OPAQUE);
    expect(glassVars({ alpha: 60, blur: 'off' }, env)['--panel-filter']).toBe('none');
    expect(glassVars({ alpha: 60, blur: 'light' }, { ...env, blur: false })['--panel-filter']).toBe('none');
    expect(glassVars({ alpha: 60, blur: 'light' }, { ...env, reducedTransparency: true })).toEqual(OPAQUE);
  });

  // the pairs the design system passes on the panels (contrast table); the worst backdrop is white (a bright sky), since
  // blur and saturate cannot make it brighter. The panel colour sits at its alpha over the veil over the backdrop
  it('keeps every panel text at 4.5:1 over a white backdrop at every slider step', () => {
    const under = over(token('shade'), VEIL / 100, [255, 255, 255]);
    const pairs: [string, string][] = [
      ['ink', 'paper-hi'],
      ['ink-muted', 'paper-hi'],
      ['focus', 'paper-hi'],
      ['heal', 'paper-hi'],
      ['strike-dmg', 'paper-hi'],
      ['ink-muted', 'paper'],
      ['enemy-hi', 'paper'],
      ['ink', 'paper-lo'],
    ];
    let worst = Number.POSITIVE_INFINITY;
    for (let a = ALPHA_MIN; a < 100; a += ALPHA_STEP)
      for (const [text, bg] of pairs) worst = Math.min(worst, ratio(token(text), over(token(bg), a / 100, under)));
    expect(worst).toBeGreaterThanOrEqual(4.5);
  });
});
