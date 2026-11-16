// End-of-battle window of the standalone battle (Until Dawn record, play again, home) and the victory confetti. The
// standalone battle and the expedition rooms (crawl.ts finishRoom) both end on the lab mockup's board (resultBoard). The
// game saves progress before opening it.
import { endExpression } from '../battle-face.ts';
import { classOf } from '../dev-roster.ts';
import { dialog } from '../dialog.ts';
import { gauge, stillFace } from '../hud-pieces.ts';
import { t, unitName } from '../i18n.ts';
import { button, el } from '../icons.ts';
import { reducedMotion } from '../motion.ts';
import { survivalCols } from '../survival.ts';
import { type CardLine, tallyLine } from '../tally.ts';
import { goHome, homeLabel } from './crawl.ts';

// Victory: confetti falling for 2.5 s (DOM and CSS, no cost in the 3D frame); disappears by itself. With reduced motion, nothing.
export function confetti() {
  if (reducedMotion()) return;
  const colors = ['#f2c14e', '#4aa3ff', '#ff6b6b', '#7dffa8', '#ffffff'];
  const box = el(
    'div',
    { class: 'confetti', 'aria-hidden': 'true' },
    ...Array.from({ length: 60 }, (_, i) =>
      el('i', {
        style: `left:${Math.random() * 100}%;background:${colors[i % colors.length]};animation-delay:${Math.random() * 0.8}s;animation-duration:${1.6 + Math.random()}s`,
      }),
    ),
  );
  document.body.append(box);
  setTimeout(() => box.remove(), 3000);
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
// One hero's card (lab mockup, Nov 15): face, name (with the highlight's tag where the mockup had the level), class, the
// life bar and one line; a fallen hero's face goes grey and the line says so in words
function heroCard(h: EndHero, [text, tone]: CardLine, won: boolean) {
  const base = classOf(h.def);
  return el(
    'li',
    { class: `hero-card${h.hp <= 0 ? ' fell' : ''}` },
    stillFace(h.def, endExpression(h.hp, h.max, won), true),
    el(
      'strong',
      { class: 'hero-card-name' },
      unitName(h.def),
      h.mvp ? el('span', { class: 'hero-card-mvp' }, t('Destaque', 'MVP')) : null,
    ),
    base && unitName(base) !== unitName(h.def) ? el('span', { class: 'unit-class' }, unitName(base)) : null,
    gauge('hp', t('Vida', 'HP'), h.hp, h.max),
    el('span', { class: `hero-card-line ${tone}` }, text),
  );
}

// The primary button with its key drawn on it, like the kit's Continue [Enter]
export const enterButton = (label: string, onclick: () => void) =>
  button('primary', [label, el('kbd', { class: 'key-chip', 'aria-hidden': 'true' }, 'Enter')], onclick);

export interface Board {
  won: boolean;
  title: string;
  cards: [EndHero, CardLine][];
  cols: [label: string, value: string][]; // what the battle gave, one column each, label over value
  note: string;
  actions: HTMLButtonElement[]; // the primary last: it sits at the right edge, like the mockup's Continue
  onBack?: () => void;
}

// End of battle as the Design lab's mockup (Nov 15): no window over the darkened battle, the title on its own band (wine
// on a defeat), a card per hero and the Result panel as wide as the cards, with the actions at its right foot
export function resultBoard({ won, title, cards, cols, note, actions, onBack }: Board) {
  const d = dialog(
    'result',
    title,
    [
      el('ul', { class: 'hero-cards' }, ...cards.map(([h, line]) => heroCard(h, line, won))),
      el(
        'section',
        { class: 'result-panel' },
        el('div', { class: 'panel-head' }, t('Resultado', 'Result')),
        cols.length ? el('dl', {}, ...cols.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)])) : null,
        el('p', {}, note),
        el('div', { class: 'result-actions' }, ...actions),
      ),
    ],
    { onBack },
  );
  d.overlay.querySelector('.dialog')!.classList.add('result-board');
  outcome(d.overlay, won);
  // Enter takes the primary (focus went to the X, and closing left the finished battle with no key to go on)
  d.overlay.querySelector<HTMLButtonElement>('.primary')!.focus();
  return d;
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
    // the way home beside it (the town): without it, leaving the battle required reloading the page
    actions: [
      button('secondary', homeLabel(), goHome),
      enterButton(t('Jogar de novo', 'Play again'), () => {
        d.close();
        restart();
      }),
    ],
  });
}
