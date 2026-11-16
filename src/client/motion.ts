// Reduce motion (Nov 16, Fernando via the Design lab): Yes / No / System, System by default. Every gesture asks
// `reducedMotion()`; the CSS answers to `data-motion` on <html> (style.css: "full" cancels the system's request, "reduce" forces it).
import { store } from './store.ts';

export type Motion = 'system' | 'reduce' | 'full';
export const MOTION_KEY = 'dt:motion';
export const parseMotion = (v: unknown): Motion => (v === 'reduce' || v === 'full' ? v : 'system');

const system = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const motion = () => parseMotion(store.json(MOTION_KEY));
export const reducedMotion = () => {
  const m = motion();
  return m === 'system' ? system() : m === 'reduce';
};

export function setMotion(m: Motion) {
  store.set(MOTION_KEY, JSON.stringify(m));
  applyMotion();
}
export function applyMotion() {
  const m = motion();
  if (m === 'system') delete document.documentElement.dataset.motion;
  else document.documentElement.dataset.motion = m;
}

// on import, like the theme: the CSS reads it from the first paint
if (typeof document !== 'undefined') applyMotion();
