// The map builder's keys and pad buttons as actions (Nov 25): its own map because Ctrl+Z / Ctrl+Y are the spec's undo
// and redo, which keyAction leaves to the browser, and 1 to 9 pick the bar's tools. The rest is the battle's own
// cursor, Enter, camera and top view. Pure and tested against the ACTIONS table (tests/mapedit-screen.test.ts).
import { ACTIONS } from '../glyphs.ts';
import { type KeyAction, keyAction } from '../keyboard.ts';

export type EditAction =
  | Extract<KeyAction, { k: 'cursor' | 'confirm' | 'rotate' | 'zoom' | 'recenter' | 'top' }>
  | { k: 'tool'; index: number }
  | { k: 'nextTool' }
  | { k: 'brush' }
  | { k: 'undo' }
  | { k: 'redo' }
  | { k: 'erase' }
  | { k: 'panel' };

type KeyInput = Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'altKey' | 'metaKey'> & { repeat?: boolean };

const KEPT = new Set(['cursor', 'confirm', 'rotate', 'zoom', 'recenter', 'top']);
const kept = (a: KeyAction | null) => (a && KEPT.has(a.k) ? (a as EditAction) : null);

// `typing`: a name or the paste box has the focus, so its letters and digits are text, never a tool
export function editKey(e: KeyInput, typing: boolean): EditAction | null {
  if (typing) return null;
  const k = e.key.toLowerCase();
  if (e.ctrlKey || e.metaKey) {
    if (e.altKey) return null;
    if (k === 'z') return e.shiftKey ? { k: 'redo' } : { k: 'undo' };
    return k === 'y' ? { k: 'redo' } : null;
  }
  if (e.altKey) return null;
  const slot = (ACTIONS.tools.keys as readonly string[]).indexOf(e.key);
  if (slot >= 0) return { k: 'tool', index: slot };
  if (k === 'b') return { k: 'brush' };
  if (k === 'delete') return { k: 'erase' };
  // Tab walks the page's buttons as on any page: the side panel's controls are real buttons
  if (k === 'tab') return null;
  return kept(keyAction(e));
}

// a pad button (gamepad.ts padActions) in the builder: X the next tool, Y the brush, View undo, B plain ground at the
// cursor, Menu into the side panel and back
export function editPad(a: KeyAction): EditAction | null {
  if (a.k === 'status') return { k: 'nextTool' };
  if (a.k === 'info') return { k: 'brush' };
  if (a.k === 'undo') return { k: 'undo' };
  if (a.k === 'cancel') return { k: 'erase' };
  if (a.k === 'help') return { k: 'panel' };
  return kept(a);
}
