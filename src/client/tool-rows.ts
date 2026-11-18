// The rows of the battle HUD's corner menu (3 bars), one list for the HTML menu (hud-tools.ts) and the 3D one
// (window3d/tools3d.ts): what each row runs, its glyph as text, its name and its key. Pure and tested
// (tests/window3d.test.ts).

import { fullscreenLabel } from './fullscreen.ts';
import type { Act } from './glyphs.ts';
import { t } from './i18n.ts';

export type Tool = 'undo' | 'rotateLeft' | 'rotateRight' | 'recenter' | 'fast' | 'fps' | 'fullscreen' | 'menu';
export interface ToolRow {
  tool: Tool;
  glyph: string;
  label: string;
  key: Act | ''; // the action whose key the row shows (glyphs.ts); '' when it has none (fast battle: hold Confirm)
  toggle?: true; // a switch: the row shows whether it is on
  off?: true; // nothing to run now: drawn faded and does nothing (Undo with no step to take back)
}

// `canUndo`: the battle has a step to take back (Battle.canUndo). Fernando, Nov 18: Undo stays in the list and on the
// screen, faded, instead of coming and going. `full`: in fullscreen now; undefined where the browser has no
// Fullscreen API (an iPhone), and the row is left out
export const toolRows = (canUndo = true, full?: boolean): ToolRow[] => [
  { tool: 'undo', glyph: '↶', label: t('Desfazer', 'Undo'), key: 'undo', ...(!canUndo && { off: true as const }) },
  { tool: 'rotateLeft', glyph: '⟲', label: t('Girar à esquerda', 'Rotate left'), key: 'rotateLeft' },
  { tool: 'rotateRight', glyph: '⟳', label: t('Girar à direita', 'Rotate right'), key: 'rotateRight' },
  { tool: 'recenter', glyph: '⌖', label: t('Ver o mapa inteiro', 'Show the whole map'), key: 'recenter' },
  { tool: 'fast', glyph: '»', label: t('Batalha rápida (3×)', 'Fast battle (3×)'), key: '', toggle: true },
  { tool: 'fps', glyph: '▤', label: t('Contador de fps', 'FPS counter'), key: 'fps', toggle: true },
  // its name says what a tap does now (Fernando, Nov 18: a phone in the browser needs fullscreen in reach)
  ...(full === undefined
    ? []
    : [{ tool: 'fullscreen' as const, glyph: '⛶', label: fullscreenLabel(full), key: '' as const }]),
  { tool: 'menu', glyph: '⚙', label: t('Opções e ajuda', 'Options and help'), key: 'help' },
];

// a faded control, Undo with no step (Fernando, Nov 18: 45%, still seen, plainly not live)
export const OFF_ALPHA = 0.45;
