// Controle (Gamepad API do navegador, pedido do Fernando de 12/11). Traduz o estado dos botões em ações de teclado
// (KeyAction), para o Game tratar controle, teclado e mouse do mesmo jeito. Puro: o laço que lê o controle fica no Game.
// Mapeamento "standard" do navegador, igual no Xbox e no PlayStation: 0 = A / ×, 1 = B / ○, 2 = X / □, 3 = Y / △,
// 4 e 5 = ombros, 6 e 7 = gatilhos, 8 = Back / Select, 9 = Start, 12 a 15 = direcional.
import type { KeyAction, ScreenDir } from './keyboard.ts';

export interface PadState {
  buttons: boolean[];
  axes: number[];
}
export interface PadMemory {
  held: Partial<Record<string, number>>; // desde quando (ms) cada entrada está apertada, para repetir
  last: Partial<Record<string, number>>; // quando repetiu pela última vez
}
export const emptyMemory = (): PadMemory => ({ held: {}, last: {} });

const DEAD = 0.5; // analógico: menos que isso é ruído do controle
// direcional segurado repete como uma tecla: 1ª repetição depois de 300 ms, depois a cada 120 ms (o cursor do FFT
// anda casa a casa; repetir mais rápido passava do alvo)
const FIRST_REPEAT = 300, REPEAT = 120;

const PRESS: Record<number, KeyAction> = {
  0: { k: 'confirm' }, 1: { k: 'cancel' }, 2: { k: 'status' }, 3: { k: 'info' },
  4: { k: 'rotate', dir: -1 }, 5: { k: 'rotate', dir: 1 }, 6: { k: 'zoom', factor: 1.15 }, 7: { k: 'zoom', factor: 1 / 1.15 },
  8: { k: 'undo' }, 9: { k: 'help' },
};
const DPAD: Record<number, ScreenDir> = { 12: 'up', 13: 'down', 14: 'left', 15: 'right' };

// Ações deste quadro: botão vale ao apertar (não enquanto segura); direção (direcional ou analógico) repete segurando.
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
