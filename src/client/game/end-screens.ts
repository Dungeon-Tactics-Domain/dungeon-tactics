import { hint } from '../hud-pieces.ts';
import { t } from '../i18n.ts';
import { button } from '../icons.ts';
import { looks3d } from '../looks3d.ts';
import { reducedMotion } from '../motion.ts';
import { survivalCols } from '../survival.ts';
import { type CardLine, tallyLine } from '../tally.ts';
import { goHome, homeLabel } from './crawl.ts';

// Victory: slips of paper falling on the 3D layer for 2.5 s; disappear by themselves. With reduced motion, nothing.
export function confetti() {
  if (!reducedMotion()) looks3d.effects?.confetti();
}

// a hero at the end of the battle (Game.endHeroes): its spawn id, the life left (0 when fallen),
// what it did and whether it was the highlight (most downed, tie broken by damage)
export interface EndHero {
  id: string;
  def: string;
  hp: number;
  max: number;
  dmg: number;
  kills: number;
  mvp: boolean;
}

// The primary button with its key drawn on it, like the kit's Continue [Enter]
export const enterButton = (label: string, onclick: () => void) =>
  button('primary', [label, hint('confirm', 'key-chip')], onclick);

export interface Board {
  won: boolean;
  title: string;
  cards: [EndHero, CardLine][];
  cols: [label: string, value: string][]; // what the battle gave, one column each, label over value
  note: string;
  actions: HTMLButtonElement[]; // a command list, top to bottom: the primary first, where the focus starts
  onBack?: () => void;
}

// End of battle after FFT's (Nov 16): the title on its banner, the party's rows and the Result window, drawn on the 3D
// layer (result3d/); nothing once the context is lost, the warning covers the page then
export function resultBoard(board: Board): { close(): void } {
  return looks3d.board?.(board) ?? { close() {} };
}

export interface BattleEnd {
  won: boolean;
  survival: boolean; // Until Dawn: turns held and the record instead of the Beacon line
  lasted: number;
  best: number; // record before this battle
  heroes: EndHero[];
  restart: () => void;
}

export function battleEndScreen({ won, survival, lasted, best, heroes, restart }: BattleEnd) {
  const d = resultBoard({
    won,
    title: won ? t('Vitória!', 'Victory!') : t('Derrota', 'Defeat'),
    cards: heroes.map((h) => [h, tallyLine(h)]),
    cols: survival ? survivalCols(lasted, best) : [],
    note: survival
      ? won
        ? t('O sol nasceu e os heróis ainda estavam de pé.', 'The sun rose and the heroes were still standing.')
        : t('Os heróis tombaram antes do amanhecer.', 'The heroes fell before dawn.')
      : won
        ? t('Todos os inimigos caíram e o Farol resistiu.', 'Every enemy fell and the Beacon held.')
        : t('O Farol caiu ou os heróis tombaram.', 'The Beacon fell or the heroes were defeated.'),
    actions: [
      // a defeat offers the same battle again, like FFT's retry; an expedition's has none (room-end.ts settles it first)
      enterButton(won ? t('Jogar de novo', 'Play again') : t('Tentar de novo', 'Try again'), () => {
        d.close();
        restart();
      }),
      // the way home under it (the town): without it, leaving the battle required reloading the page
      button('secondary', homeLabel(), goHome),
    ],
  });
}
