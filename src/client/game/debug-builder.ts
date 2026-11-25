// The debug panel's Map builder group (Nov 25, docs/game-design/map-builder.md: "opened from the debug panel"): open
// the builder on this battle's map or a blank one of a chosen size, and from a battle the builder's Play opened, go
// back to the builder with its map.
import { SCENARIOS } from '../../shared/battle/scenarios.ts';
import { blankDoc, docFromScenario } from '../../shared/mapedit/doc.ts';
import { t } from '../i18n.ts';
import type { Game } from '../main.ts';
import { isPlayed, openBuilder } from '../mapedit/play-map.ts';
import { type Go, pick } from '../option-row.ts';
import { param } from '../store.ts';
import type { OptionsGroup } from './options-list.ts';

type Start = 'map' | '8' | '12' | '16';
let start: Start = 'map'; // kept between openings, like Spawn's class

export function builderGroup(g: Game, close: () => void): OptionsGroup {
  const id = g.battle.state.scenario,
    room = param('room') !== null;
  const back: Go[] = isPlayed(id)
    ? [
        {
          link: t('Voltar ao construtor', 'Back to the builder'),
          help: t(
            'Volta ao construtor de mapas com o mapa desta batalha.',
            'Back to the map builder with this battle’s map.',
          ),
          run: () => {
            close();
            openBuilder();
          },
        },
      ]
    : [];
  return {
    title: t('Construtor de mapas', 'Map builder'),
    help: t(
      'Pinta o chão, a altura e as rampas de um mapa; Jogar abre uma batalha nele.',
      'Paints a map’s ground, height and ramps; Play opens a battle on it.',
    ),
    rows: [
      ...back,
      pick(
        t('Começar com', 'Start with'),
        t(
          'O mapa desta batalha (sem as unidades) ou um mapa de grama.',
          'This battle’s map (without its units) or a map of grass.',
        ),
        [
          ['map', t('O mapa desta batalha', 'This battle’s map')],
          ['8', t('Em branco 8x8', 'Blank 8x8')],
          ['12', t('Em branco 12x12', 'Blank 12x12')],
          ['16', t('Em branco 16x16', 'Blank 16x16')],
        ] as [Start, string][],
        () => start,
        (v) => (start = v),
      ),
      {
        // leaving an expedition room loses the expedition (crawl.ts leftRoom)
        link: room
          ? t('Construtor de mapas: termine a sala da expedição antes', 'Map builder: finish the expedition room first')
          : t('Abrir o construtor de mapas', 'Open the map builder'),
        help: t('Sai desta batalha e abre o construtor.', 'Leaves this battle and opens the builder.'),
        run: () => {
          if (room) return;
          close();
          const n = Number(start);
          openBuilder(start === 'map' ? docFromScenario(SCENARIOS[id]) : blankDoc(n, n));
        },
      },
    ],
  };
}
