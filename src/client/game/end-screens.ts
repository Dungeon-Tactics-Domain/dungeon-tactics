// End-of-battle window of the standalone battle (Until Dawn record, play again, home) and the victory confetti. The
// standalone battle and the expedition rooms (room-end.ts finishRoom) both end on the FFT-style board (resultBoard). The
// game saves progress before opening it.
import { endExpression } from '../battle-face.ts';
import { classOf } from '../dev-roster.ts';
import { dialog } from '../dialog.ts';
import { gauge, hint, stillFace } from '../hud-pieces.ts';
import { t, unitName } from '../i18n.ts';
import { button, el } from '../icons.ts';
import { looks3d } from '../looks3d.ts';
import { reducedMotion } from '../motion.ts';
import { survivalCols } from '../survival.ts';
import { type CardLine, tallyLine } from '../tally.ts';
import { goHome, homeLabel } from './crawl.ts';

// Victory: slips of paper falling on the 3D layer for 2.5 s; disappear by themselves. With reduced motion, nothing.
export function confetti() {
  if (!reducedMotion()) looks3d.effects?.confetti();
}

// victory or defeat on the window itself: the overlay keeps the plain `result-overlay` class, which hides the battle HUD
const outcome = (overlay: HTMLElement, won: boolean) =>
  overlay.querySelector('.dialog')!.classList.add(won ? 'won' : 'lost');

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
// One hero's row (FFT's after-battle unit list, Nov 16): face, name (with the highlight's tag) and class, the life bar
// with the board's line under it, then what the hero did in two number columns; a fallen hero's face goes grey and the
// line says so in words
function heroCard(h: EndHero, [text, tone]: CardLine, won: boolean) {
  const base = classOf(h.def);
  const did = (label: string, n: number) => el('div', {}, el('dt', {}, label), el('dd', {}, String(n)));
  return el(
    'li',
    { class: `hero-card${h.hp <= 0 ? ' fell' : ''}` },
    stillFace(h.def, endExpression(h.hp, h.max, won)),
    el(
      'div',
      { class: 'hero-card-who' },
      el(
        'strong',
        { class: 'hero-card-name' },
        unitName(h.def),
        h.mvp ? el('span', { class: 'hero-card-mvp' }, t('Destaque', 'MVP')) : null,
      ),
      base && unitName(base) !== unitName(h.def) ? el('span', { class: 'unit-class' }, unitName(base)) : null,
    ),
    el(
      'div',
      { class: 'hero-card-life' },
      gauge('hp', t('Vida', 'HP'), h.hp, h.max),
      // the plain tone is tallyLine's damage and takedowns, which the columns beside it already say
      tone ? el('span', { class: `hero-card-line ${tone}` }, text) : null,
    ),
    el('dl', { class: 'hero-card-did' }, did(t('Dano', 'Damage'), h.dmg), did(t('Derrubados', 'Takedowns'), h.kills)),
  );
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
