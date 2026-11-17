// The rows of the battle HUD's corner menu (3 bars), one list for the HTML menu (hud-tools.ts) and the 3D one
// (window3d/tools3d.ts): what each row runs, its glyph as text, its name and its key. Pure and tested
// (tests/window3d.test.ts).
import type { Act } from './glyphs.ts';
import { t } from './i18n.ts';

export type Tool = 'undo' | 'rotateLeft' | 'rotateRight' | 'recenter' | 'pixel' | 'fast' | 'fps' | 'menu';
export interface ToolRow {
  tool: Tool;
  glyph: string;
  label: string;
  key: Act | ''; // the action whose key the row shows (glyphs.ts); '' when it has none (fast battle: hold Confirm)
  toggle?: true; // a switch: the row shows whether it is on
}

export const toolRows = (): ToolRow[] => [
  { tool: 'undo', glyph: '↶', label: t('Desfazer', 'Undo'), key: 'undo' },
  { tool: 'rotateLeft', glyph: '⟲', label: t('Girar à esquerda', 'Rotate left'), key: 'rotateLeft' },
  { tool: 'rotateRight', glyph: '⟳', label: t('Girar à direita', 'Rotate right'), key: 'rotateRight' },
  { tool: 'recenter', glyph: '⌖', label: t('Ver o mapa inteiro', 'Show the whole map'), key: 'recenter' },
  { tool: 'pixel', glyph: '▦', label: t('Tamanho do pixel', 'Pixel size'), key: 'pixel' },
  { tool: 'fast', glyph: '»', label: t('Batalha rápida (3×)', 'Fast battle (3×)'), key: '', toggle: true },
  { tool: 'fps', glyph: '▤', label: t('Contador de fps', 'FPS counter'), key: 'fps', toggle: true },
  { tool: 'menu', glyph: '⚙', label: t('Opções e ajuda', 'Options and help'), key: 'help' },
];
