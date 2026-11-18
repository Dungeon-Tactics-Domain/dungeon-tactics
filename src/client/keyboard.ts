// Keyboard in the style of Final Fantasy Tactics (Fernando's request, Oct 25): play everything without a mouse. Only translates key into
// action and screen direction into a grid step; the Game (main.ts) executes. Pure and tested.
import type { BattleState, Pos } from '../shared/battle/types.ts';
import { type Act, keysText, type Shown } from './glyphs.ts';
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
  | { k: 'zoom'; factor: number }
  | { k: 'recenter' }
  | { k: 'face' }
  | { k: 'status' }
  | { k: 'info' }
  | { k: 'fps' }
  | { k: 'turns'; dir: 1 | -1 }
  | { k: 'help' };

const ZOOM_STEP = 1.15;
const SLOTS = 7; // Move + 6 abilities: the longest bar it was sized for

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
  i: { k: 'info' },
  f3: { k: 'fps' },
  p: { k: 'wait' },
  f: { k: 'recenter' },
  h: { k: 'help' },
  '?': { k: 'help' },
  // the page keys scroll the turn list, which since Nov 15 holds every unit (Fernando's decision)
  pageup: { k: 'turns', dir: -1 },
  pagedown: { k: 'turns', dir: 1 },
  // Q zooms out and E zooms in: same hand as WASD
  q: { k: 'zoom', factor: ZOOM_STEP },
  e: { k: 'zoom', factor: 1 / ZOOM_STEP },
};

type KeyInput = Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'altKey' | 'metaKey'> & { repeat?: boolean };

// a held key repeats none of these: a held Esc backed out and then undid the move, a held P skipped the facing choice, a
// held Z spent every undo, and an Esc held while closing a window went on into the battle (input review, Nov 16)
const ONCE = new Set<KeyAction['k']>(['cancel', 'wait', 'undo']);

// Ctrl/Alt/Cmd stay with the browser (Ctrl+R reloads, Ctrl+W closes the tab); the key works in lower or upper case
export function keyAction(e: KeyInput): KeyAction | null {
  const a = action(e);
  return a && e.repeat && ONCE.has(a.k) ? null : a;
}

function action(e: KeyInput): KeyAction | null {
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

// Keys the page keeps (Nov 18, accessibility): with a menu or "Execute?" open, Tab walks its buttons as on any page
// (on the map it jumps between units), and Enter or Space press the button Tab reached instead of the game's focus
export function pageKeeps(a: KeyAction, menuOpen: boolean, tabbed: boolean): boolean {
  return (a.k === 'cycle' && menuOpen) || (a.k === 'confirm' && tabbed);
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

// Help screen list: [keys, what they do], for what the hints show (glyphs.ts): the keys with their alternates, or the pad's
// buttons by name; a row the pad has no button for is left out. `keys`: the keyboard's fuller spelling of the row
export function keyHelp(shown: Shown = 'keyboard'): [string, string][] {
  const k = (a: Act) => keysText(a, shown) ?? '';
  const pad = shown !== 'keyboard';
  const rows: [acts: Act[], keys: string, text: string][] = [
    [
      ['move'],
      'W A S D · ← ↑ → ↓',
      t(
        'no menu, sobe e desce; no mapa, anda o cursor de casa em casa (segue a câmera)',
        'in the menu, up and down; on the map, move the cursor tile by tile (follows the camera)',
      ),
    ],
    [
      ['confirm'],
      t('Enter · Espaço', 'Enter · Space'),
      t(
        `andar até a casa sob o cursor; no alvo, pergunta "Executar?" e o 2º ${k('confirm')} age; no fim do turno, confirma a direção; seguro, acelera a batalha 3 vezes`,
        `move to the tile under the cursor; on a target, asks "Execute?" and the 2nd ${k('confirm')} acts; at turn end, confirms the facing; held, speeds the battle up 3 times`,
      ),
    ],
    [
      ['cancel'],
      'Esc · Backspace',
      t(
        'volta um passo (mapa → habilidades → menu); no menu, desfaz o último movimento se ele não levou contra-ataque',
        'goes back one step (map → abilities → menu); in the menu, undoes the last move if it drew no counter',
      ),
    ],
    [['slots'], '', t('Mover e as habilidades da barra', 'Move and the bar abilities')],
    [
      ['status'],
      '',
      t(
        'Status: ficha da unidade sob o cursor (ou de quem joga)',
        'Status: sheet of the unit under the cursor (or the active one)',
      ),
    ],
    [
      ['cycle'],
      'Tab · Shift+Tab',
      t(
        'no mapa, pula de unidade em unidade (vida e alcance); com um menu aberto, anda pelos botões dele',
        'on the map, jump between units (HP and reach); with a menu open, walk its buttons',
      ),
    ],
    [['undo'], '', t('desfazer', 'undo')],
    [['face'], '', t('virar a unidade da vez', 'turn the active unit')],
    [
      ['wait'],
      '',
      t(
        `Esperar: escolhe para onde olhar; ${k('wait')} de novo ou ${k('confirm')} termina o turno; quem fez menos joga antes de novo`,
        `Wait: pick the facing; ${k('wait')} again or ${k('confirm')} ends the turn; doing less brings the next turn sooner`,
      ),
    ],
    [['rotateLeft', 'rotateRight'], 'R · Shift+R', t('girar a câmera 45°', 'rotate the camera 45°')],
    [['zoom'], 'Q · E', t('afastar · aproximar', 'zoom out · zoom in')],
    [['recenter'], '', t('ver o mapa inteiro', 'show the whole map')],
    [
      ['turns'],
      'PgUp · PgDn',
      t('rolar a lista de turnos ou a janela aberta', 'scroll the turn list or the open window'),
    ],
    [
      ['info'],
      '',
      t('ficha da habilidade em foco no submenu Habilidades', 'sheet of the ability in focus in the Abilities submenu'),
    ],
    [['fps'], '', t('liga e desliga o contador de fps e recursos', 'toggles the fps and resources counter')],
    [['help'], 'H · ?', t('esta ajuda e o menu', 'this help and the menu')],
  ];
  const menu = pad ? `${k('cancel')} · ${k('help')}` : 'Esc · H';
  return [
    ...rows.flatMap(([acts, keys, text]): [string, string][] => {
      const named = acts.map(k).filter(Boolean);
      return named.length ? [[(!pad && keys) || named.join(' · '), text]] : [];
    }),
    // the walkable town (game/town.ts) reads the same keys
    [
      t('Na cidade', 'In town'),
      t(
        `${k('walk')} anda enquanto segura; ${k('confirm')} fala com quem está à frente ou entra pela porta (o balão mostra o quê); o clique só anda até lá; ${menu} abre o menu da cidade`,
        `${k('walk')} walk while held; ${k('confirm')} talks to whoever is in front or goes in at the door (the balloon shows what); a click only walks there; ${menu} opens the town menu`,
      ),
    ],
  ];
}
