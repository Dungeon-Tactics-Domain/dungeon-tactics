// Gamepad (browser Gamepad API, Fernando's request of Nov 12). Translates the button state into keyboard actions
// (KeyAction), so the Game treats gamepad, keyboard and mouse the same way. Pure: the loop that reads the gamepad lives in the Game.
// The browser's "standard" mapping, the same on Xbox and PlayStation: 0 = A / ×, 1 = B / ○, 2 = X / □, 3 = Y / △,
// 4 and 5 = bumpers, 6 and 7 = triggers, 8 = Back / Select, 9 = Start, 12 to 15 = d-pad.
import type { KeyAction, ScreenDir } from './keyboard.ts';

export interface PadState {
  buttons: boolean[];
  axes: number[];
}
export interface PadMemory {
  held: Partial<Record<string, number>>; // since when (ms) each input has been pressed, for repeating
  last: Partial<Record<string, number>>; // when it last repeated
}
export const emptyMemory = (): PadMemory => ({ held: {}, last: {} });

const DEAD = 0.5; // analog: less than this is gamepad noise
// held d-pad repeats like a key: 1st repeat after 300 ms, then every 120 ms (FFT's cursor
// moves tile by tile; repeating faster overshot the target)
const FIRST_REPEAT = 300, REPEAT = 120;

const PRESS: Record<number, KeyAction> = {
  0: { k: 'confirm' }, 1: { k: 'cancel' }, 2: { k: 'status' }, 3: { k: 'info' },
  4: { k: 'rotate', dir: -1 }, 5: { k: 'rotate', dir: 1 }, 6: { k: 'zoom', factor: 1.15 }, 7: { k: 'zoom', factor: 1 / 1.15 },
  8: { k: 'undo' }, 9: { k: 'help' },
};
const DPAD: Record<number, ScreenDir> = { 12: 'up', 13: 'down', 14: 'left', 15: 'right' };

// This frame's actions: a button counts on press (not while held); direction (d-pad or analog) repeats while held.
export function padActions(pad: PadState, mem: PadMemory, now: number): KeyAction[] {
  const out: KeyAction[] = [];
  const dirs: ScreenDir[] = [];
  for (const [i, dir] of Object.entries(DPAD)) if (pad.buttons[Number(i)]) dirs.push(dir);
  const [x = 0, y = 0] = pad.axes;
  if (Math.abs(x) > DEAD || Math.abs(y) > DEAD) dirs.push(Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : y > 0 ? 'down' : 'up');
  const active = new Set<string>();
  for (const [i, action] of Object.entries(PRESS)) {
    const key = `b${i}`;
    if (!pad.buttons[Number(i)]) continue;
    active.add(key);
    if (mem.held[key] === undefined) out.push(action);
  }
  for (const dir of new Set(dirs)) {
    const key = `d${dir}`;
    active.add(key);
    const since = mem.held[key];
    const last = mem.last[key] ?? 0;
    if (since === undefined || (now - since >= FIRST_REPEAT && now - last >= REPEAT)) {
      out.push({ k: 'cursor', dir });
      mem.last[key] = now;
    }
  }
  for (const key of Object.keys(mem.held)) if (!active.has(key)) delete mem.held[key];
  for (const key of active) mem.held[key] ??= now;
  return out;
}
