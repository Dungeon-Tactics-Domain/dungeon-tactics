// Undo and redo of the builders (spec: Ctrl+Z / Ctrl+Y, one drag = one step, 50 steps), for a map or a battle
// document. Documents are immutable, so each step is the whole document before it: a stroke edits a draft and is
// recorded once, at its end.

export const UNDO_STEPS = 50;

export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

export const startHistory = <T>(doc: T): History<T> => ({ past: [], present: doc, future: [] });

// a new step; the same history when the document did not change (an empty stroke, a refused edit)
export function record<T>(h: History<T>, doc: T): History<T> {
  if (doc === h.present) return h;
  return { past: [...h.past, h.present].slice(-UNDO_STEPS), present: doc, future: [] };
}

export function undo<T>(h: History<T>): History<T> {
  if (!h.past.length) return h;
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
}

export function redo<T>(h: History<T>): History<T> {
  if (!h.future.length) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
}
