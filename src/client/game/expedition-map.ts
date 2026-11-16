// The expedition map: the floor in play as rows of rooms, the party's state and the chest window.

import { CRAWL_RUN } from '../../content/crawl/rooms.ts';
import { descentGold, type Expedition, expeditionMap, nodeGold, openNodes } from '../../shared/crawl/expedition.ts';
import { roomGroup } from '../../shared/crawl/generate.ts';
import { dialog, secondTap } from '../dialog.ts';
import { t, unitName } from '../i18n.ts';
import { button, el } from '../icons.ts';
import { setTrack } from '../sound.ts';
import { goldNote } from '../town-ui.ts';
import { current, group, retreat, takeChest, toTown } from './crawl.ts';

// the floor of the rooms open now
const floorAt = (exp: Expedition) => {
  const map = expeditionMap(exp.seed);
  return map[openNodes(map, exp.path)[0]].floor;
};
export const floorOf = (exp: Expedition) =>
  t(`andar ${floorAt(exp)} de ${CRAWL_RUN.floors}`, `floor ${floorAt(exp)} of ${CRAWL_RUN.floors}`);

const memberOf = (id: string) => group().members.find((m) => m.id === id);
const partyList = (exp: Expedition) =>
  el(
    'ul',
    { class: 'legend' },
    ...exp.party.map((h) => {
      const m = memberOf(h.id);
      return el(
        'li',
        {},
        `${m?.name ?? h.id}${m ? ` · ${unitName(m.cls)}` : ''} · ${t('vida', 'HP')} ${h.hp}/${h.max}` +
          (h.manaMax ? ` · ${t('mana', 'mana')} ${h.mana ?? h.manaMax}/${h.manaMax}` : ''),
      );
    }),
    el('li', {}, `${t('Ouro achado', 'Gold found')} · ${descentGold(exp)}`),
  );

// The floor in play as rows of rooms (decision 21: a map of linked rooms, the enemies of each in sight before choosing);
// the open rooms enter the battle, the others say why they are closed
export function expeditionScreen(exp: Expedition) {
  setTrack('crypt');
  const map = expeditionMap(exp.seed);
  const open = openNodes(map, exp.path);
  const floor = floorAt(exp);
  const room = (i: number) => {
    const n = map[i];
    // another room of its row taken (for the chest: a room of the row it hangs off, not its own)
    const taken = exp.path.some((p) => map[p].floor === n.floor && map[p].row === n.row);
    const state = exp.path.includes(i)
      ? n.chest
        ? t(`aberto: ${nodeGold(n)} de ouro`, `opened: ${nodeGold(n)} gold`)
        : t('vencida', 'cleared')
      : open.includes(i)
        ? ''
        : taken
          ? t('caminho não tomado', 'path not taken')
          : t('abre depois da anterior', 'opens after the one before');
    if (n.chest)
      return button(
        open.includes(i) ? 'primary' : 'secondary',
        [
          `${t('Baú', 'Chest')}${state ? ` (${state})` : ''}`,
          el(
            'small',
            { class: 'continue-where' },
            t('sem batalha · só pela sala que leva ao baú', 'no battle · only through the room that leads to it'),
          ),
        ],
        () => {
          d.close();
          const next = takeChest(exp, i);
          if (next) return chestScreen(next, nodeGold(n));
          // a stale map: the expedition as it is now, or the town when it ended
          const now = current(exp);
          if (now) expeditionScreen(now);
          else toTown();
        },
        { disabled: !open.includes(i) },
      );
    const { group: foes } = roomGroup(n.seed, { depth: n.floor, boss: n.boss });
    // the one room of its row the floor's chest hangs off, marked on its own button: two rooms of a row often share a group
    const toChest = n.next.some((c) => map[c].chest) ? t(' · leva ao baú', ' · leads to the chest') : '';
    return button(
      open.includes(i) ? 'primary' : 'secondary',
      [
        `${n.boss ? t('Chefe: ', 'Boss: ') : ''}${t(foes.name[0], foes.name[1])}${state ? ` (${state})` : ''}`,
        el('small', { class: 'continue-where' }, foes.enemies.map(unitName).join(' · ') + toChest),
      ],
      () => {
        location.search = `?room=${i}`;
      },
      { disabled: !open.includes(i) },
    );
  };
  // the boss is one more row, on the last floor only; the chest on a line of its own after the row it hangs off
  const line = (r: number, chest: boolean) =>
    map.flatMap((n, i) => (n.floor === floor && n.row === r && n.chest === chest ? [i] : []));
  const rows = Array.from({ length: CRAWL_RUN.rows + 1 }, (_, r) => [line(r, false), line(r, true)])
    .flat()
    .filter((r) => r.length);
  const d = dialog(
    'title',
    `${t('Masmorra', 'Dungeon')} · ${floorOf(exp)}`,
    [
      partyList(exp),
      // the arrows walk the open rooms row by row, then Back to town (dialog.ts)
      ...rows.map((r) => el('div', { class: 'menu-actions crawl-row arrow-walk' }, ...r.map(room))),
      el(
        'div',
        { class: 'menu-actions arrow-walk' },
        // the 2nd tap confirms: going back ends the descent (decision 32), alive, so its gold goes home whole
        button('secondary', t('Voltar à cidade', 'Back to town'), (e: Event) => {
          const again = t(
            'Toque de novo: encerra a expedição, o ouro achado vai à cidade',
            'Tap again: ends the expedition, the gold found goes to town',
          );
          if (!secondTap(e, again)) return;
          retreat(exp);
          d.close();
          toTown();
        }),
      ),
    ],
    { fixed: true },
  );
  d.overlay.classList.add('main-title', 'crawl-map');
  d.overlay.querySelector<HTMLButtonElement>('.primary')!.focus();
}

// The chest just opened (already saved): its gold, then back to the map
function chestScreen(exp: Expedition, gold: number) {
  const back = () => expeditionScreen(exp);
  const d = dialog(
    'result',
    t('Baú aberto', 'Chest opened'),
    [
      goldNote(t('Ouro', 'Gold'), gold),
      el(
        'div',
        { class: 'menu-actions' },
        button('primary', t('Seguir no mapa', 'On to the map'), () => {
          d.close();
          back();
        }),
      ),
    ],
    { onBack: back },
  );
  d.overlay.querySelector<HTMLButtonElement>('.primary')!.focus();
}
