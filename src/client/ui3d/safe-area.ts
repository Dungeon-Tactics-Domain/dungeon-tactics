// The safe area in px (the notch, the rounded corners, the home bar) for the 3D layer, which cannot read env() itself: a
// probe padded by style.css' --safe-x and --safe-y, measured when the layer fits.
import { el } from '../icons.ts';
import type { Safe } from './layout.ts';

let probe: HTMLElement | undefined;

export function safeArea(): Safe {
  if (!probe) {
    probe = el('div', { 'aria-hidden': 'true' });
    probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:var(--safe-y) var(--safe-x)';
    document.body.append(probe);
  }
  const css = getComputedStyle(probe);
  return { x: Number.parseFloat(css.paddingLeft) || 0, y: Number.parseFloat(css.paddingTop) || 0 };
}
