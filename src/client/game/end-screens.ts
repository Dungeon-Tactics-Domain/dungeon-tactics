// End-of-battle windows: the standalone battle (Until Dawn record, mission reward, play again) and the campaign stage
// (gold, learned abilities, back to the map or try again), plus the victory confetti. The game saves progress before
// opening them; these only show it and offer the next step.
import { ITEMS } from '../../shared/battle/equipment.ts';
import { CHAPTERS, learned } from '../campaign.ts';
import { VICTORY_GOLD } from '../chest.ts';
import { dialog } from '../dialog.ts';
import { abilityName, t } from '../i18n.ts';
import { el } from '../icons.ts';
import type { Mission } from '../missions.ts';
import { SURVIVE_TURNS } from '../survival.ts';
import { nodeOfChapter } from '../world.ts';
import { savedGroup, savedHero, toWorld } from './boot.ts';

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

export interface BattleEnd {
  won: boolean;
  survival: boolean; // Until Dawn: turns held and the record instead of the Beacon line
  lasted: number;
  best: number; // record before this battle
  mvp: HTMLElement[]; // the highlight line (Game.mvpLine)
  mission: Mission | null; // bar mission in play: its reward shows on a victory
  restart: () => void;
}

export function battleEndScreen({ won, survival, lasted, best, mvp, mission, restart }: BattleEnd) {
  const d = dialog('result', won ? t('Vitória!', 'Victory!') : t('Derrota', 'Defeat'), [
    ...(survival
      ? [
          el(
            'p',
            { class: lasted > best ? 'learned' : '' },
            lasted > best
              ? t(
                  `Novo recorde: ${lasted} de ${SURVIVE_TURNS} turnos!`,
                  `New record: ${lasted} of ${SURVIVE_TURNS} turns!`,
                )
              : t(
                  `Aguentaram ${lasted} de ${SURVIVE_TURNS} turnos (recorde: ${best}).`,
                  `Held out ${lasted} of ${SURVIVE_TURNS} turns (record: ${best}).`,
                ),
          ),
        ]
      : []),
    ...mvp,
    ...(mission && won
      ? [
          el(
            'p',
            { class: 'mvp' },
            t(
              `Recompensa: ${mission.gold} de ouro${mission.item ? ` e ${ITEMS[mission.item].name}` : ''} no baú.`,
              `Reward: ${mission.gold} gold${mission.item ? ` and ${ITEMS[mission.item].en}` : ''} in the chest.`,
            ),
          ),
        ]
      : []),
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
    // Title beside it: without it, leaving the standalone battle required reloading the page
    el(
      'div',
      { class: 'menu-actions' },
      mission && won
        ? el('button', { type: 'button', class: 'primary', onclick: toWorld }, t('Voltar ao mapa', 'Back to map'))
        : el(
            'button',
            {
              type: 'button',
              class: 'primary',
              onclick: () => {
                d.close();
                restart();
              },
            },
            t('Jogar de novo', 'Play again'),
          ),
      el(
        'button',
        {
          type: 'button',
          class: 'secondary',
          onclick: () => {
            location.search = '';
          },
        },
        t('Título', 'Title'),
      ),
    ),
  ]);
  // Enter plays again (focus went to the X, and closing left the finished battle with no key to restart)
  d.overlay.querySelector<HTMLButtonElement>('.primary')!.focus();
}

export interface StageEnd {
  n: number; // campaign stage
  won: boolean;
  mvp: HTMLElement[];
  heroesFell: boolean; // defeat by losing the heroes (or a stage without a Beacon), not by the Beacon going dark
  restart: () => void;
}

export function stageEndScreen({ n, won, mvp, heroesFell, restart }: StageEnd) {
  const last = n === CHAPTERS.length - 1;
  const d = dialog(
    'result',
    won
      ? last
        ? t('Fim da campanha!', 'Campaign complete!')
        : t('Fase vencida!', 'Stage cleared!')
      : t('Derrota', 'Defeat'),
    [
      ...(won
        ? [
            ...mvp,
            el(
              'p',
              { class: 'mvp' },
              t(`+${VICTORY_GOLD} de ouro no baú do grupo`, `+${VICTORY_GOLD} gold in the party chest`),
            ),
            ...learned(n, savedHero(), savedGroup()).map((x) =>
              el(
                'p',
                { class: 'learned' },
                t(
                  `${x.name} aprendeu ${x.abilities.map(abilityName).join(' e ')}!`,
                  `${x.name} learned ${x.abilities.map(abilityName).join(' and ')}!`,
                ),
              ),
            ),
          ]
        : []),
      // on the last stage there is no next battle: the map keeps only the epilogue, back to Vauclair
      el(
        'p',
        {},
        won
          ? last
            ? t('O epílogo espera em Vauclair, no mapa.', 'The epilogue awaits in Vauclair, on the map.')
            : t('O caminho seguinte se abriu no mapa.', 'The next path opened on the map.')
          : heroesFell
            ? t('Os heróis caíram. A fase recomeça do início.', 'The heroes fell. The stage starts over.')
            : t('O Farol se apagou. A fase recomeça do início.', 'The Beacon went dark. The stage starts over.'),
      ),
      // victory returns to the world map (the next point is open); defeat retries right there or goes back to the map
      el(
        'div',
        { class: 'menu-actions' },
        won
          ? el(
              'button',
              {
                type: 'button',
                class: 'primary',
                onclick: () => {
                  location.search = `?world&from=${nodeOfChapter(n)}`;
                },
              },
              t('Voltar ao mapa', 'Back to the map'),
            )
          : el(
              'button',
              {
                type: 'button',
                class: 'primary',
                onclick: () => {
                  d.close();
                  restart();
                },
              },
              t('Tentar de novo', 'Try again'),
            ),
        ...(won ? [] : [el('button', { type: 'button', class: 'secondary', onclick: toWorld }, t('Mapa', 'Map'))]),
      ),
    ],
  );
  d.overlay.querySelector<HTMLButtonElement>('.primary')!.focus();
}
