// Pure side of the 3D banner, Height and button hints (hints3d.ts; Fernando, Nov 16: the instruction pill, the tile
// height and the button hints of FFT The Ivalice Chronicles): which hints each turn screen shows for the input device in
// use, the height the corner shows, and where each hint of a row sits. No DOM or Three here; tested in
// tests/hints3d.test.ts.
import type { Battle } from '../../shared/battle/battle.ts';
import type { Pos } from '../../shared/battle/types.ts';
import { cancelStep, type Screen } from '../command.ts';
import type { Act, Shown } from '../glyphs.ts';
import { t } from '../i18n.ts';
import { cursorInfo, tileHeight } from '../tile-info.ts';
import type { Box } from '../ui3d/layout.ts';

// what the row is drawn for: the keys or a pad's family (glyphs.ts, key-hints.ts), or a finger, which gets no hints
export type Device = Shown | 'touch';

// `act`: the action whose keys or pad buttons the hint shows, one cap each (glyphs.ts ACTIONS)
export interface Hint {
  act: Act;
  text: string;
}
export interface Hints {
  left: Hint[];
  right: Hint[];
}

// what Confirm does on each screen (the reference: Move Here on the Move map, Confirm on a target), in a word or two
function confirmText(s: Screen): string {
  if (s.k === 'menu' || s.k === 'abilities') return t('Escolher', 'Select');
  if (s.k === 'map' && s.command === 'move') return t('Mover', 'Move');
  if (s.k === 'facing') return t('Passar a vez', 'End Turn');
  return t('Confirmar', 'Confirm');
}

// The hints at the foot of the screen: on the right what Confirm and Cancel do now (Cancel only when cancelStep has
// somewhere to go) and the camera, on the left the way to the menu. `open`: a hero's turn with nothing playing; while
// the battle plays, holding Confirm speeds it up. A finger has no buttons: the banner says what a tap does
export function hintsFor(b: Battle, s: Screen, open: boolean, device: Device): Hints {
  if (device === 'touch' || b.over) return { left: [], right: [] };
  // Zoom and rotate share one hint, "Camera" (Fernando, Nov 16: the row must fit its region at 1280x720, where the 16 px
  // text floor makes it wider than the reference's)
  const hint = (act: Act, text: string): Hint => ({ act, text });
  const left = [hint('help', t('Menu e ajuda', 'Menu and Help'))];
  const camera = [hint('camera', t('Câmera', 'Camera'))];
  if (!open) return { left, right: [hint('confirm', t('Segure: acelerar', 'Hold: Speed Up')), ...camera] };
  const back = cancelStep(b, s);
  const right = [hint('confirm', confirmText(s))];
  if (back === 'undo') right.push(hint('cancel', t('Desfazer', 'Undo')));
  else if (back) right.push(hint('cancel', s.k === 'confirm' ? t('Voltar', 'Back') : t('Cancelar', 'Cancel')));
  // the submenu's third hint is the ability's sheet; everywhere else the camera, as in the reference
  return { left, right: [...right, ...(s.k === 'abilities' ? [hint('info', t('Detalhes', 'Details'))] : camera)] };
}

// The number of the Height corner: the tile under the cursor. null hides the corner: the battle is over, or the
// abilities submenu is open (the reference's description sheet takes that corner)
export const heightShown = (b: Battle, s: Screen, cursor: Pos): number | null =>
  b.over || s.k === 'abilities' ? null : tileHeight(b.grid, cursor);

// The small line under the Height corner (Fernando, Nov 16): the same tile line the HTML corner shows (floor, slope,
// shallow or deep water, spikes, a charge about to land), shown and hidden with the Height. `size`: the square of a big
// unit choosing where to stop (HudView.hl.size)
export const tileLine = (b: Battle, s: Screen, cursor: Pos, size = 1): string =>
  heightShown(b, s, cursor) === null ? '' : cursorInfo(b.grid, b.state, cursor, size);

// Sizes of a hint row in px of the 1920x1080 reference (layout-fft-ic.json dicas.direita: a 26 px glyph, text of about
// 22 px, 12 px between them and 40 px to the next hint)
export const ROW = { cap: 26, text: 22, capGap: 4, gap: 12, between: 40 };

// Where each hint of a row sits: the x of each of its caps and of its text, from their measured widths. The right row
// ends on its region's right edge and grows leftwards, the left row starts on its region's left edge. `s`: the scale.
// A row wider than its region (a pad's four camera buttons at 1280x720) closes the space between its hints, down to
// the space between a cap and its text, so it still ends inside
export function layRow(
  sizes: { caps: number[]; text: number }[],
  box: Box,
  align: 'left' | 'right',
  s: number,
): { caps: number[]; text: number }[] {
  const width = (h: { caps: number[]; text: number }) =>
    h.caps.reduce((w, c) => w + c + ROW.capGap * s, 0) - ROW.capGap * s + ROW.gap * s + h.text;
  const content = sizes.reduce((w, h) => w + width(h), 0),
    spaces = Math.max(1, sizes.length - 1);
  const between = Math.max(ROW.gap * s, Math.min(ROW.between * s, (box.w - content) / spaces));
  const total = content + between * (sizes.length - 1);
  let x = align === 'right' ? box.x + box.w - total : box.x;
  return sizes.map((h) => {
    const caps = h.caps.map((c) => {
      const at = x;
      x += c + ROW.capGap * s;
      return at;
    });
    const text = x - ROW.capGap * s + ROW.gap * s;
    x = text + h.text + between;
    return { caps, text };
  });
}
