// The safe area in px (the notch, the rounded corners, the home bar) for the 3D layer, which cannot read env() itself: a
// probe padded by the four env(safe-area-inset-*), measured when the layer fits.
import { el } from '../icons.ts';
import type { Safe } from './layout.ts';

export interface Sides {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

let probe: HTMLElement | undefined;

// each side's own inset: what a piece that hangs from one edge keeps clear of (the corner menu, the help line)
export function safeSides(): Sides {
  if (!probe) {
    probe = el('div', { 'aria-hidden': 'true' });
    probe.style.cssText = `position:fixed;visibility:hidden;pointer-events:none;padding:${[
      'top',
      'right',
      'bottom',
      'left',
    ]
      .map((side) => `env(safe-area-inset-${side},0px)`)
      .join(' ')}`;
    document.body.append(probe);
  }
  const css = getComputedStyle(probe),
    px = (v: string) => Number.parseFloat(v) || 0;
  return {
    top: px(css.paddingTop),
    right: px(css.paddingRight),
    bottom: px(css.paddingBottom),
    left: px(css.paddingLeft),
  };
}

// the larger of the two sides on each axis, so the interface stays centred (layout.ts `stage`)
export const safeOf = (s: Sides): Safe => ({ x: Math.max(s.left, s.right), y: Math.max(s.top, s.bottom) });
