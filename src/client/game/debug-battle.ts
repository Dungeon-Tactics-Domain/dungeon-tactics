// The debug panel's Battle builder group (grill, Nov 25: "opened from the debug panel"): open the battle builder on
// this battle's map and starting units; from a battle the builder's Play opened, go back to it, and edit the map in
// the middle of the battle (battleedit/live.ts) with one of the map builder's tools at the map cursor.
import { SCENARIOS } from '../../shared/battle/scenarios.ts';
import { battleFromScenario } from '../../shared/mapedit/battle.ts';
import { sound } from '../../shared/mapedit/setup.ts';
import { liveEdit, liveWhy } from '../battleedit/live.ts';
import { isBuilt, openBattleBuilder } from '../battleedit/play.ts';
import { classOf } from '../dev-roster.ts';
import { t } from '../i18n.ts';
import { looks3d } from '../looks3d.ts';
import type { Game } from '../main.ts';
import { BAR, type Brush } from '../mapedit/tools.ts';
import { type Go, pick } from '../option-row.ts';
import { param } from '../store.ts';
import type { OptionsGroup } from './options-list.ts';

// the live edit's tool and brush, kept between openings like Spawn's class
let tool = 3;
let brush: Brush = 1;

export function battleGroup(g: Game, close: () => void): OptionsGroup {
  const id = g.battle.state.scenario,
    room = param('room') !== null,
    why = liveWhy(g);
  const built: (Go | ReturnType<typeof pick>)[] = isBuilt()
    ? [
        {
          link: t('Voltar ao construtor de batalhas', 'Back to the battle builder'),
          help: t('Volta ao construtor com esta batalha.', 'Back to the builder with this battle.'),
          run: () => {
            close();
            openBattleBuilder();
          },
        },
        pick(
          t('Ferramenta do mapa', 'Map tool'),
          t(
            'O que Editar no cursor faz no mapa, como no construtor de mapas.',
            'What Edit at the cursor does to the map, as in the map builder.',
          ),
          BAR.map((s, i): [number, string] => [i, t(...s.name)]),
          () => tool,
          (v) => (tool = v),
        ),
        pick(
          t('Pincel', 'Brush'),
          t('Uma casa ou as 3x3 em volta do cursor.', 'One tile or the 3x3 around the cursor.'),
          [
            [1, '1x1'],
            [3, '3x3'],
          ] as [Brush, string][],
          () => brush,
          (v) => (brush = v),
        ),
        {
          link: why
            ? t(`Editar no cursor: ${why}`, `Edit at the cursor: ${why}`)
            : t('Editar no cursor', 'Edit at the cursor'),
          help: t(
            'Muda o mapa na casa do cursor e a batalha segue do mesmo turno; quem ficar num muro vai para a casa livre mais perto. O Desfazer recomeça.',
            'Changes the map on the cursor’s tile and the battle goes on from the same turn; whoever stands in a wall goes to the nearest free tile. Undo starts over.',
          ),
          run: () => {
            if (why) return;
            close();
            liveEdit(g, tool, brush);
          },
        },
      ]
    : [];
  return {
    title: t('Construtor de batalhas', 'Battle builder'),
    help: t(
      'Monta uma batalha num mapa: unidades, fichas, ordem, bolsas, objetivo e quem joga cada lado.',
      'Builds a battle on a map: units, sheets, order, bags, objective and who plays each side.',
    ),
    rows: [
      ...built,
      {
        // leaving an expedition room loses the expedition (crawl.ts leftRoom)
        link: room
          ? t('Construtor de batalhas: termine a sala antes', 'Battle builder: finish the room first')
          : t('Abrir com esta batalha', 'Open with this battle'),
        help: t(
          'Sai desta batalha e abre o construtor com o mapa e as unidades do começo dela.',
          'Leaves this battle and opens the builder with its map and starting units.',
        ),
        run: () => {
          if (room) return;
          close();
          const doc = battleFromScenario(SCENARIOS[id], classOf);
          // a battle the builder's save would refuse opens the draft as it was, and says so
          if (!sound(doc))
            return void looks3d.effects?.announce(
              t('Esta batalha não cabe no construtor.', 'This battle does not fit the builder.'),
            );
          openBattleBuilder({ name: t(SCENARIOS[id].name, SCENARIOS[id].en).slice(0, 40), doc });
        },
      },
    ],
  };
}
