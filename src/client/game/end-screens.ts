// End-of-battle window of the standalone battle (Until Dawn record, play again, home) and the victory confetti; the
// expedition rooms have their own (crawl.ts finishRoom). The game saves progress before opening it.
import { dialog } from '../dialog.ts';
import { portrait } from '../hud.ts';
import { t } from '../i18n.ts';
import { button, el } from '../icons.ts';
import { SURVIVE_TURNS } from '../survival.ts';
import { goHome, homeLabel } from './crawl.ts';

// Victory: confetti falling for 2.5 s (DOM and CSS, no cost in the 3D frame); disappears by itself. With reduced motion, nothing.
export function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
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

// Battle highlight (tally.ts) as a small unit card, like the HUD's unit panel: portrait, name and what the unit did
export function mvpCard(def: string, name: string, dmg: number, kills: number): HTMLElement {
  return el(
    'div',
    { class: 'result-mvp' },
    portrait(def),
    el(
      'div',
      {},
      el('span', { class: 'result-label' }, t('Destaque', 'MVP')),
      el('strong', {}, name),
      el(
        'span',
        {},
        t(
          `${dmg} de dano · ${kills} derrubado${kills === 1 ? '' : 's'}`,
          `${dmg} damage · ${kills} ${kills === 1 ? 'takedown' : 'takedowns'}`,
        ),
      ),
    ),
  );
}

// What the battle gave, one row each after a glass orb like the command menu's: gold-coloured for records (the orb is
// decoration: the text says it all)
type Gain = [orb: 'gold' | 'blue', text: string];
const gainList = (rows: Gain[]) =>
  rows.length
    ? [
        el(
          'ul',
          { class: 'result-gains' },
          ...rows.map(([orb, text]) => el('li', {}, el('span', { class: `orb ${orb}`, 'aria-hidden': 'true' }), text)),
        ),
      ]
    : [];

// victory or defeat on the window itself: the overlay keeps the plain `result-overlay` class, which hides the battle HUD
const outcome = (overlay: HTMLElement, won: boolean) =>
  overlay.querySelector('.dialog')!.classList.add(won ? 'won' : 'lost');

export interface BattleEnd {
  won: boolean;
  survival: boolean; // Until Dawn: turns held and the record instead of the Beacon line
  lasted: number;
  best: number; // record before this battle
  mvp: HTMLElement[]; // the highlight card (Game.mvpLine, mvpCard), empty when no hero scored
  restart: () => void;
}

export function battleEndScreen({ won, survival, lasted, best, mvp, restart }: BattleEnd) {
  const d = dialog('result', won ? t('Vitória!', 'Victory!') : t('Derrota', 'Defeat'), [
    ...mvp,
    ...gainList([
      ...(survival
        ? [
            [
              'gold',
              lasted > best
                ? t(
                    `Novo recorde: ${lasted} de ${SURVIVE_TURNS} turnos!`,
                    `New record: ${lasted} of ${SURVIVE_TURNS} turns!`,
                  )
                : t(
                    `Aguentaram ${lasted} de ${SURVIVE_TURNS} turnos (recorde: ${best}).`,
                    `Held out ${lasted} of ${SURVIVE_TURNS} turns (record: ${best}).`,
                  ),
            ] as Gain,
          ]
        : []),
    ]),
    el(
      'p',
      {},
      survival
        ? won
          ? t('O sol nasceu e os heróis ainda estavam de pé.', 'The sun rose and the heroes were still standing.')
          : t('Os heróis tombaram antes do amanhecer.', 'The heroes fell before dawn.')
        : won
          ? t('Todos os inimigos caíram e o Farol resistiu.', 'Every enemy fell and the Beacon held.')
          : t('O Farol caiu ou os heróis tombaram.', 'The Beacon fell or the heroes were defeated.'),
    ),
    // the way home beside it (the town, or the expedition map): without it, leaving the battle required reloading the page
    el(
      'div',
      { class: 'menu-actions' },
      button('primary', t('Jogar de novo', 'Play again'), () => {
        d.close();
        restart();
      }),
      button('secondary', homeLabel(), goHome),
    ),
  ]);
  outcome(d.overlay, won);
  // Enter plays again (focus went to the X, and closing left the finished battle with no key to restart)
  d.overlay.querySelector<HTMLButtonElement>('.primary')!.focus();
}
