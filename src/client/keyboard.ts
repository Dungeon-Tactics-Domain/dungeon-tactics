// Teclado no estilo do Final Fantasy Tactics (pedido do Fernando, 25/10): jogar tudo sem mouse. Só traduz tecla em
// ação e direção da tela em passo na grade; quem executa é o Game (main.ts). Puro e testado.
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
  | { k: 'turns' }
  | { k: 'help' };

const ZOOM_STEP = 1.15;
const SLOTS = 7; // Mover + 6 habilidades: a barra mais longa de hoje (o Ramza do estudo do FFT)

const DIRS: Record<string, ScreenDir> = {
  w: 'up', arrowup: 'up', s: 'down', arrowdown: 'down', a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right',
};
const SIMPLE: Record<string, KeyAction> = {
  enter: { k: 'confirm' }, ' ': { k: 'confirm' }, escape: { k: 'cancel' }, backspace: { k: 'cancel' },
  z: { k: 'undo' }, t: { k: 'face' }, c: { k: 'status' }, f3: { k: 'fps' }, p: { k: 'wait' }, f: { k: 'recenter' }, h: { k: 'help' }, '?': { k: 'help' }, i: { k: 'info' }, v: { k: 'pixel' }, l: { k: 'turns' },
  // Q afasta e E aproxima: mesma mão do WASD
  q: { k: 'zoom', factor: ZOOM_STEP }, e: { k: 'zoom', factor: 1 / ZOOM_STEP },
};

type KeyInput = Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'altKey' | 'metaKey'>;

// Ctrl/Alt/Cmd ficam com o navegador (Ctrl+R recarrega, Ctrl+W fecha a aba); a tecla vale em minúscula ou maiúscula
export function keyAction(e: KeyInput): KeyAction | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  const k = e.key.toLowerCase();
  if (DIRS[k]) return { k: 'cursor', dir: DIRS[k] };
  if (k === 'tab') return { k: 'cycle', dir: e.shiftKey ? -1 : 1 };
  // R gira para a direita; Shift+R para a esquerda (o toque tem os dois botões)
  if (k === 'r') return { k: 'rotate', dir: e.shiftKey ? -1 : 1 };
  const n = Number(k);
  if (Number.isInteger(n) && n >= 1 && n <= SLOTS) return { k: 'slot', index: n - 1 };
  return SIMPLE[k] ?? null;
}

// O mapa aparece em losango, então nenhum eixo da grade aponta reto para cima. Cada tecla pega o eixo mais perto da
// diagonal dela na tela, girada 45° no sentido do relógio (W = cima-direita, D = baixo-direita, S = baixo-esquerda,
// A = cima-esquerda): as quatro caem em eixos diferentes e acompanham a câmera quando ela gira.
export function gridStep(dir: ScreenDir, yaw: number): Pos {
  const up = { x: -Math.sin(yaw), y: -Math.cos(yaw) }; // "para cima na tela" medido no chão (mesmas contas do pan da cena)
  const right = { x: Math.cos(yaw), y: -Math.sin(yaw) };
  const [a, b] = { up: [1, 1], right: [-1, 1], down: [-1, -1], left: [1, -1] }[dir];
  const vx = a * up.x + b * right.x;
  const vy = a * up.y + b * right.y;
  // Math.sign(0) é 0, e o "|| 0" troca o -0 por 0
  return Math.abs(vx) > Math.abs(vy) ? { x: Math.sign(vx), y: 0 } : { x: 0, y: Math.sign(vy) || 0 };
}

// Tab: a próxima unidade viva na ordem da lista (para ler vida e ameaça de cada uma)
export function cycleUnit(state: BattleState, from: Pos, dir: 1 | -1): Pos {
  const units = state.units;
  const i = units.findIndex((u) => u.pos.x === from.x && u.pos.y === from.y);
  const next = i < 0 ? 0 : (i + dir + units.length) % units.length;
  return units[next].pos;
}

// Lista da tela de ajuda: [teclas, o que fazem]
export const keyHelp = (): [string, string][] => [
  ['W A S D · ← ↑ → ↓', t('no menu, sobe e desce; no mapa, anda o cursor de casa em casa (segue a câmera)', 'in the menu, up and down; on the map, move the cursor tile by tile (follows the camera)')],
  [t('Enter · Espaço', 'Enter · Space'), t('andar até a casa sob o cursor; no alvo, pergunta "Executar?" e o 2º Enter age; no fim do turno, confirma a direção; seguro, acelera a batalha 3 vezes', 'move to the tile under the cursor; on a target, asks "Execute?" and the 2nd Enter acts; at turn end, confirms the facing; held, speeds the battle up 3 times')],
  ['Esc · Backspace', t('cancelar a escolha; de novo, volta para Mover', 'cancel the choice; again, back to Move')],
  ['1 – 7', t('Mover e as habilidades da barra', 'Move and the bar abilities')],
  ['I', t('ficha da habilidade escolhida', 'details of the chosen ability')],
  ['C', t('Status: ficha da unidade sob o cursor (ou de quem joga)', 'Status: sheet of the unit under the cursor (or the active one)')],
  ['Tab · Shift+Tab', t('pular de unidade em unidade (vida e alcance)', 'jump between units (HP and reach)')],
  ['Z', t('desfazer', 'undo')],
  ['T', t('virar a unidade da vez (só nos mapas com direção)', 'turn the active unit (only on maps with facing)')],
  ['P', t('Esperar: termina o turno; quem fez menos joga antes de novo (sem ter agido, pede P de novo)', 'Wait: ends the turn; doing less brings the next turn sooner (without acting, asks for P again)')],
  ['R · Shift+R', t('girar a câmera 90°', 'rotate the camera 90°')],
  ['Q · E', t('afastar · aproximar', 'zoom out · zoom in')],
  ['F', t('ver o mapa inteiro', 'show the whole map')],
  ['V', t('trocar o tamanho do pixel art (Desligado, 2, 3, 4 px)', 'change the pixel art size (Off, 2, 3, 4 px)')],
  ['L', t('lista de turnos inteira ou só os próximos 4', 'full turn list or only the next 4')],
  ['F3', t('liga e desliga o contador de fps e recursos', 'toggles the fps and resources counter')],
  ['H · ?', t('esta ajuda e o menu', 'this help and the menu')],
];
