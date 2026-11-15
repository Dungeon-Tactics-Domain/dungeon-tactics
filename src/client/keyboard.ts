// Keyboard in the style of Final Fantasy Tactics (Fernando's request, Oct 25): play everything without a mouse. Only translates key into
// action and screen direction into a grid step; the Game (main.ts) executes. Pure and tested.
import type { BattleState, Pos } from '../shared/battle/types.ts';
import { t } from './i18n.ts';

export type ScreenDir = 'up' | 'down' | 'left' | 'right';
export type KeyAction =
  | { k: 'cursor'; dir: ScreenDir }
  | { k: 'confirm' }
  | { k: 'cancel' }
  | { k: 'cycle'; dir: 1 | -1 }
  | { k: 'slot'; index: number }
  | { k: 'undo' }
  | { k: 'wait' }
  | { k: 'rotate'; dir: 1 | -1 }
  | { k: 'info' }
  | { k: 'pixel' }
  | { k: 'zoom'; factor: number }
  | { k: 'recenter' }
  | { k: 'face' }
  | { k: 'status' }
  | { k: 'fps' }
  | { k: 'turns'; dir: 1 | -1 }
  | { k: 'help' };

const ZOOM_STEP = 1.15;
const SLOTS = 7; // Move + 6 abilities: today's longest bar (the FFT study's Ramza)

const DIRS: Record<string, ScreenDir> = {
  w: 'up',
  arrowup: 'up',
  s: 'down',
  arrowdown: 'down',
  a: 'left',
  arrowleft: 'left',
  d: 'right',
  arrowright: 'right',
};
const SIMPLE: Record<string, KeyAction> = {
  enter: { k: 'confirm' },
  ' ': { k: 'confirm' },
  escape: { k: 'cancel' },
  backspace: { k: 'cancel' },
  z: { k: 'undo' },
  t: { k: 'face' },
  c: { k: 'status' },
  f3: { k: 'fps' },
  p: { k: 'wait' },
  f: { k: 'recenter' },
  h: { k: 'help' },
  '?': { k: 'help' },
  i: { k: 'info' },
  v: { k: 'pixel' },
  // the page keys scroll the turn list, which since Nov 15 holds every unit (Fernando's decision)
  pageup: { k: 'turns', dir: -1 },
  pagedown: { k: 'turns', dir: 1 },
  // Q zooms out and E zooms in: same hand as WASD
  q: { k: 'zoom', factor: ZOOM_STEP },
  e: { k: 'zoom', factor: 1 / ZOOM_STEP },
};

type KeyInput = Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'altKey' | 'metaKey'>;

// Ctrl/Alt/Cmd stay with the browser (Ctrl+R reloads, Ctrl+W closes the tab); the key works in lower or upper case
export function keyAction(e: KeyInput): KeyAction | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  const k = e.key.toLowerCase();
  if (DIRS[k]) return { k: 'cursor', dir: DIRS[k] };
  if (k === 'tab') return { k: 'cycle', dir: e.shiftKey ? -1 : 1 };
  // R rotates right; Shift+R left (touch has both buttons)
  if (k === 'r') return { k: 'rotate', dir: e.shiftKey ? -1 : 1 };
  const n = Number(k);
  if (Number.isInteger(n) && n >= 1 && n <= SLOTS) return { k: 'slot', index: n - 1 };
  return SIMPLE[k] ?? null;
}

// The map appears as a diamond, so no grid axis points straight up. Each key takes the axis closest to its
// diagonal on screen, rotated 45° clockwise (W = up-right, D = down-right, S = down-left,
// A = up-left): the four land on different axes and follow the camera when it rotates.
export function gridStep(dir: ScreenDir, yaw: number): Pos {
  const up = { x: -Math.sin(yaw), y: -Math.cos(yaw) }; // "up on screen" measured on the ground (same math as the scene's pan)
  const right = { x: Math.cos(yaw), y: -Math.sin(yaw) };
  // 8 angles (Nov 13): with the camera straight (0°, 90°…) the map isn't a diamond and each arrow walks straight on screen (request
  // from Fernando: "when the camera angle changes the controls should change the directionals"); on the diagonal, the up rule
  const diamond = Math.round(yaw / (Math.PI / 4)) % 2 !== 0;
  const [a, b] = diamond
    ? { up: [1, 1], right: [-1, 1], down: [-1, -1], left: [1, -1] }[dir]
    : { up: [1, 0], right: [0, 1], down: [-1, 0], left: [0, -1] }[dir];
  const vx = a * up.x + b * right.x;
  const vy = a * up.y + b * right.y;
  // Math.sign(0) is 0, and the "|| 0" swaps -0 for 0
  return Math.abs(vx) > Math.abs(vy) ? { x: Math.sign(vx), y: 0 } : { x: 0, y: Math.sign(vy) || 0 };
}

// Tab: the next living unit in list order (to read each one's HP and threat)
export function cycleUnit(state: BattleState, from: Pos, dir: 1 | -1): Pos {
  const units = state.units;
  const i = units.findIndex((u) => u.pos.x === from.x && u.pos.y === from.y);
  const next = i < 0 ? 0 : (i + dir + units.length) % units.length;
  return units[next].pos;
}

// Help screen list: [keys, what they do]
export const keyHelp = (): [string, string][] => [
  [
    'W A S D · ← ↑ → ↓',
    t(
      'no menu, sobe e desce; no mapa, anda o cursor de casa em casa (segue a câmera)',
      'in the menu, up and down; on the map, move the cursor tile by tile (follows the camera)',
    ),
  ],
  [
    t('Enter · Espaço', 'Enter · Space'),
    t(
      'andar até a casa sob o cursor; no alvo, pergunta "Executar?" e o 2º Enter age; no fim do turno, confirma a direção; seguro, acelera a batalha 3 vezes',
      'move to the tile under the cursor; on a target, asks "Execute?" and the 2nd Enter acts; at turn end, confirms the facing; held, speeds the battle up 3 times',
    ),
  ],
  [
    'Esc · Backspace',
    t(
      'cancelar a escolha; de novo, volta para Mover; no menu, depois de andar e antes de agir, desfaz o movimento',
      'cancel the choice; again, back to Move; in the menu, after moving and before acting, undoes the move',
    ),
  ],
  ['1 – 7', t('Mover e as habilidades da barra', 'Move and the bar abilities')],
  ['I', t('ficha da habilidade escolhida', 'details of the chosen ability')],
  [
    'C',
    t(
      'Status: ficha da unidade sob o cursor (ou de quem joga)',
      'Status: sheet of the unit under the cursor (or the active one)',
    ),
  ],
  ['Tab · Shift+Tab', t('pular de unidade em unidade (vida e alcance)', 'jump between units (HP and reach)')],
  ['Z', t('desfazer', 'undo')],
  ['T', t('virar a unidade da vez', 'turn the active unit')],
  [
    'P',
    t(
      'Esperar: termina o turno; quem fez menos joga antes de novo (sem ter agido, pede P de novo)',
      'Wait: ends the turn; doing less brings the next turn sooner (without acting, asks for P again)',
    ),
  ],
  ['R · Shift+R', t('girar a câmera 45°', 'rotate the camera 45°')],
  ['Q · E', t('afastar · aproximar', 'zoom out · zoom in')],
  ['F', t('ver o mapa inteiro', 'show the whole map')],
  ['V', t('trocar o tamanho do pixel art (Desligado, 2, 3, 4 px)', 'change the pixel art size (Off, 2, 3, 4 px)')],
  ['PgUp · PgDn', t('rolar a lista de turnos', 'scroll the turn list')],
  ['F3', t('liga e desliga o contador de fps e recursos', 'toggles the fps and resources counter')],
  ['H · ?', t('esta ajuda e o menu', 'this help and the menu')],
];
