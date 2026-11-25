// The debug panel's Battle builder group (grill, Nov 25: "opened from the debug panel"): open the battle builder on
// this battle's map and starting units; from a battle the builder's Play opened, go back to it, and turn the live map
// edit on and off (battleedit/live-mode.ts).
import { SCENARIOS } from '../../shared/battle/scenarios.ts';
import { battleFromScenario } from '../../shared/mapedit/battle.ts';
import { sound } from '../../shared/mapedit/setup.ts';
import { liveInput } from '../battle-input.ts';
import { liveWhy } from '../battleedit/live.ts';
import { isBuilt, openBattleBuilder } from '../battleedit/play.ts';
import { classOf } from '../dev-roster.ts';
import { t } from '../i18n.ts';
import { looks3d } from '../looks3d.ts';
import type { Game } from '../main.ts';
import type { Go } from '../option-row.ts';
import { param } from '../store.ts';
import type { OptionsGroup } from './options-list.ts';

export function battleGroup(g: Game, close: () => void): OptionsGroup {
  const id = g.battle.state.scenario,
    room = param('room') !== null,
    why = liveWhy(g);
  const built: Go[] = isBuilt()
    ? [
        {
          link: t('Voltar ao construtor de batalhas', 'Back to the battle builder'),
          help: t('Volta ao construtor com esta batalha.', 'Back to the builder with this battle.'),
          run: () => {
            close();
            openBattleBuilder();
          },
        },
        {
          link: liveInput.on
            ? t('Sair da edição do mapa ao vivo', 'Leave the live map edit')
            : why
              ? t(`Editar o mapa ao vivo: ${why}`, `Edit the map live: ${why}`)
              : t('Editar o mapa ao vivo', 'Edit the map live'),
          help: t(
            'Mostra a barra do construtor de mapas sobre a batalha: arraste para pintar; ao soltar o mapa muda e a batalha segue do mesmo turno; quem ficar num muro vai para a casa livre mais perto. O Desfazer recomeça.',
            'Shows the map builder’s bar over the battle: drag to paint; on release the map changes and the battle goes on from the same turn; whoever stands in a wall goes to the nearest free tile. Undo starts over.',
          ),
          run: () => {
            if (why && !liveInput.on) return;
            close();
            void import('../battleedit/live-mode.ts').then((m) => m.toggleLive(g));
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
