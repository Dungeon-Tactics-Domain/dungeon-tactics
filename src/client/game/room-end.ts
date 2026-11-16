// What follows an expedition room: the save is settled before any window opens, then the result board.

import { CRAWL_RUN } from '../../content/crawl/rooms.ts';
import { poolOf } from '../../shared/battle/combat.ts';
import type { BattleState } from '../../shared/battle/types.ts';
import { cleared, descentGold, expeditionMap, nodeGold, openNodes, winRoom } from '../../shared/crawl/expedition.ts';
import { t } from '../i18n.ts';
import { CRAWL_KEY, ROOM_KEY } from '../saves.ts';
import { store } from '../store.ts';
import { roomLine } from '../tally.ts';
import { type CrawlRoom, endExpedition, goHome, savedExpedition } from './crawl.ts';
import { type EndHero, enterButton, resultBoard } from './end-screens.ts';

// After an expedition room: a victory carries the life on (winRoom), a defeat or the last boss down ends the expedition
// (the save is cleared, its gold banked). Written before any window opens, so a reload after the battle cannot replay the room
export function settleRoom(room: CrawlRoom, won: boolean, state: BattleState) {
  const exp = savedExpedition();
  store.set(ROOM_KEY, '');
  const map = exp && expeditionMap(exp.seed);
  // another tab may have ended the expedition or this room meanwhile: a result for a room that is no longer open is ignored
  if (!exp || !map || !openNodes(map, exp.path).includes(room.node)) return null;
  const standing = Object.entries(room.heroes).flatMap(([spawn, h]) => {
    const u = state.units.find((x) => x.id === spawn);
    return u ? [[h.id, u] as const] : [];
  });
  const left = Object.fromEntries(standing.map(([id, u]) => [id, u.hp]));
  const manaLeft = Object.fromEntries(standing.map(([id, u]) => [id, poolOf(u, 'mana')]));
  const next = won ? winRoom(exp, room.node, left, manaLeft) : null;
  const done = !!next && cleared(map, next.path);
  // what went to the town when it ended: all of it with the boss down, half when the party fell
  const banked = !next ? endExpedition(exp, true) : done ? endExpedition(next, false) : 0;
  if (next && !done) store.set(CRAWL_KEY, JSON.stringify(next));
  const node = map[room.node];
  const gold = { room: next ? nodeGold(node) : 0, found: descentGold(next ?? exp), banked };
  return { next, done, map, node, gold, down: node.next.some((n) => map[n].floor > node.floor) };
}

// the window after the room: back to the map to go on, or to the town when the expedition ended. Each hero's card says
// the life it takes into the next room (the recovery already applied), in place of the mockup's EXP
export function finishRoom(room: CrawlRoom, won: boolean, state: BattleState, heroes: EndHero[]) {
  const settled = settleRoom(room, won, state);
  if (!settled) return goHome();
  const { next, done, node, gold, down, map } = settled;
  // on to the expedition map while it goes on (home alone opens the town), else home
  const home = () => {
    location.search = next && !done ? '?home=expedition' : '?home';
  };
  const carried = (h: EndHero) => (next && !done ? next.party.find((p) => p.id === room.heroes[h.id]?.id) : undefined);
  resultBoard({
    won: !!next, // a cleared room and a won expedition get the victory's look
    title: !next
      ? t('Expedição perdida', 'Expedition lost')
      : done
        ? t('Expedição concluída!', 'Expedition complete!')
        : down
          ? t(`Andar ${node.floor} vencido!`, `Floor ${node.floor} cleared!`)
          : t('Sala vencida!', 'Room cleared!'),
    cards: heroes.map((h) => [h, roomLine(h, carried(h))]),
    cols: [
      [t('Andar', 'Floor'), t(`${node.floor} de ${CRAWL_RUN.floors}`, `${node.floor} of ${CRAWL_RUN.floors}`)],
      ...(next
        ? ([
            [t('Salas vencidas', 'Rooms cleared'), String(next.path.filter((n) => !map[n].chest).length)],
            [t('Ouro da sala', 'Room gold'), `+${gold.room}`],
          ] as [string, string][])
        : []),
      [t('Ouro achado', 'Gold found'), String(gold.found)],
      ...(next && !done
        ? []
        : ([[t('Ouro para a cidade', 'Gold to town'), String(gold.banked)]] as [string, string][])),
    ],
    note: !next
      ? t(
          `O grupo caiu no andar ${node.floor}. Os feridos voltam à cidade com metade do ouro achado.`,
          `The party fell on floor ${node.floor}. The wounded return to town with half the gold found.`,
        )
      : done
        ? t(
            'O chefe da masmorra caiu. O grupo volta à cidade com todo o ouro achado.',
            'The dungeon’s boss fell. The party returns to town with all the gold found.',
          )
        : down
          ? t(
              `Quem ficou de pé recupera ${CRAWL_RUN.roomHeal}% da vida e quem caiu volta com ${CRAWL_RUN.fallen}%; ao descer ao andar ${node.floor + 1}, todos recuperam mais ${CRAWL_RUN.floorHeal}%.`,
              `Whoever stood recovers ${CRAWL_RUN.roomHeal}% of their life and the fallen come back at ${CRAWL_RUN.fallen}%; going down to floor ${node.floor + 1}, everyone recovers ${CRAWL_RUN.floorHeal}% more.`,
            )
          : t(
              `Quem ficou de pé recupera ${CRAWL_RUN.roomHeal}% da vida; quem caiu volta com ${CRAWL_RUN.fallen}%.`,
              `Whoever stood recovers ${CRAWL_RUN.roomHeal}% of their life; the fallen come back at ${CRAWL_RUN.fallen}%.`,
            ),
    actions: [
      enterButton(next && !done ? t('Seguir no mapa', 'On to the map') : t('Voltar à cidade', 'Back to town'), home),
    ],
    // Esc goes the same way: closing only left the finished room on screen
    onBack: home,
  });
}
