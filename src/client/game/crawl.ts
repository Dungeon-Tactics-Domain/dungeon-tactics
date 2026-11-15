// The dungeon crawl around its rooms (Nov 15): the town the game opens in (Fernando: no world map; the town's windows and
// "Go on the quest"), the expedition map between rooms and the window after each room. The rules live in src/shared/crawl;
// this file casts the town's party into the rooms and keeps the dt:crawl save.
import { CRAWL_RUN, CRAWL_TOWN } from '../../content/crawl/rooms.ts';
import { bonusOf } from '../../shared/battle/equipment.ts';
import { HALF } from '../../shared/battle/half.ts';
import type { Scenario } from '../../shared/battle/scenarios.ts';
import type { BattleState } from '../../shared/battle/types.ts';
import {
  cleared,
  type Expedition,
  expeditionMap,
  openNodes,
  parseExpedition,
  startExpedition,
  winRoom,
} from '../../shared/crawl/expedition.ts';
import { roomGroup, roomId } from '../../shared/crawl/generate.ts';
import { EQUIP_KEY, parseEquip } from '../chest.ts';
import { buildDevScenario, slotsOf, unitFrom } from '../dev-roster.ts';
import { commandRow, dialog } from '../dialog.ts';
import { GROUP_KEY, heroesFor, parseGroup } from '../group.ts';
import { t, unitName } from '../i18n.ts';
import { button, el } from '../icons.ts';
import { CRAWL_KEY, ROOM_KEY } from '../saves.ts';
import { setTrack } from '../sound.ts';
import { param, store } from '../store.ts';
import { openBar, openParty, openShop } from '../town-ui.ts';
import { type CardLine, type EndHero, enterButton, fellLine, resultBoard, tallyLine } from './end-screens.ts';
import { titleScreen } from './title.ts';

export { CRAWL_KEY, ROOM_KEY }; // part of a save slot, so their names live in saves.ts

// the expedition room in play: who stands on each hero spawn (h0, h1…) and the life they enter with
export interface CrawlRoom {
  node: number;
  heroes: Record<string, { id: string; hp: number }>;
}

export const savedExpedition = () => parseExpedition(store.json(CRAWL_KEY));
const group = () => parseGroup(store.json(GROUP_KEY));
// who goes, as the town's party has them (class, name, equipment); `ids` keeps the order of the sheets
const crawlers = (ids: string[]) => heroesFor({ ...group(), deployed: ids }, parseEquip(store.json(EQUIP_KEY)));

// The generated room with the expedition party on its hero spawns and the enemies as sheets of their own: the developer
// menu's path (dev-roster.ts), under the room's id so the mood still reads its theme. A member no longer in the group stays out
export function castRoom(room: Scenario, exp: Expedition, node: number): { scenario: Scenario; room: CrawlRoom } {
  const ids = exp.party.map((h) => h.id).filter((id) => group().members.some((m) => m.id === id));
  const enemies = slotsOf(room.id).enemy.map((s) => unitFrom(s.def));
  const units = crawlers(ids);
  const scenario = buildDevScenario({ map: room.id, heroes: units, enemies }, room.id, [room.name, room.en]);
  // never above the sheet's life: the save is read from the browser (a max typed into dt:crawl gave a hero 999)
  const hp = (id: string, i: number) =>
    Math.min(exp.party.find((h) => h.id === id)!.hp, units[i].hp + bonusOf(units[i].items).hp);
  const heroes = Object.fromEntries(ids.map((id, i) => [`h${i}`, { id, hp: hp(id, i) }]));
  return { scenario, room: { node, heroes } };
}

// home (?home): the town (homeScreen), over the standalone battle; the bare address is the title
export const goHome = () => {
  location.search = '?home';
};

// the way home is always the town (Fernando, Nov 15: the game always opens there; a live expedition is one tap away)
export const homeLabel = () => t('Cidade', 'Town');

// the expedition in progress: saved and its boss not yet down
export function liveExpedition() {
  const exp = savedExpedition();
  return exp && !cleared(expeditionMap(exp.seed), exp.path) ? exp : null;
}

// A room still saved with no room in the address: the party left it before it ended (Options, a sibling room, the
// bare address and Continue). Fernando, Nov 15: that loses the expedition like a defeat; only Restart retries the room for free
export function leftRoom() {
  if (!savedExpedition() || !store.get(ROOM_KEY)) return false;
  store.set(CRAWL_KEY, '');
  store.set(ROOM_KEY, '');
  return true;
}

// The open room whose battle is still saved: loading its game from the title's Continue reopens it, because closing the tab is not leaving the
// room (review of Nov 15); leaving through Options or the address still loses the expedition (leftRoom).
// ponytail: matches the room built from the node's own seed; one built from the fallback seed (none of 500 tested) is
// not found, so the loaded game goes home and the room counts as left
export function savedRoom(): number | null {
  const exp = savedExpedition();
  const held = (store.json(ROOM_KEY) as { state?: { scenario?: unknown } } | null)?.state?.scenario;
  if (!exp || typeof held !== 'string') return null;
  const map = expeditionMap(exp.seed);
  const id = (n: number) => roomId(map[n].seed, { depth: map[n].floor, boss: map[n].boss }) + HALF;
  return openNodes(map, exp.path).find((n) => id(n) === held) ?? null;
}

// What ?home and a game loaded on the title (with no room in play) open: always the town (Fernando, Nov 15), which offers to
// continue a live expedition; ?home=expedition, where a room's result window goes, opens its map straight away
export function homeScreen() {
  if (leftRoom()) return lostScreen();
  const exp = liveExpedition();
  if (exp && param('home') === 'expedition') expeditionScreen(exp);
  else townScreen();
}

// The town (fixed for now: only the party grows) as the lab kit's command menu in the top right corner (Nov 15 mockups):
// the quest, the Shop, Tavern and Party windows, and the way back to the title (quick battles, how to play, developer,
// credits). Over the spinning backdrop battle
export function townScreen() {
  setTrack('world'); // Pastoral D, the town's music (Fernando, Nov 15)
  const live = liveExpedition();
  // the window beside the menu, if any (its 'close' skips its onBack)
  const closeBeside = () => {
    for (const o of document.querySelectorAll('.overlay')) if (o !== d.overlay) o.dispatchEvent(new Event('close'));
  };
  const go = (fn: () => void) => () => {
    closeBeside();
    d.close();
    fn();
  };
  // Shop, Tavern and Party open beside the menu, which stays on screen with the open row picked; another row swaps the
  // window, and closing it gives the focus back to its row
  const beside = (open: (back: () => void) => void) => (e: Event) => {
    const row = e.currentTarget as HTMLButtonElement;
    closeBeside();
    for (const b of d.overlay.querySelectorAll('.picked')) b.classList.remove('picked');
    row.classList.add('picked');
    open(() => {
      row.classList.remove('picked');
      row.focus();
    });
  };
  const d = dialog(
    'title',
    t(...CRAWL_TOWN),
    [
      el(
        'div',
        { class: 'menu-actions camp-list command-list' },
        // an expedition in progress is continued; a new quest over it asks a 2nd tap, since it abandons it (Fernando, Nov 15)
        ...(live
          ? [
              commandRow(
                'gold',
                [
                  t('Continuar a expedição', 'Continue the expedition'),
                  el('small', { class: 'continue-where' }, floorOf(live)),
                ],
                go(() => expeditionScreen(live)),
                'primary',
              ),
            ]
          : []),
        commandRow(
          'gold',
          t('Ir para a quest', 'Go on the quest'),
          (e: Event) => {
            const btn = e.currentTarget as HTMLButtonElement;
            if (live && !btn.dataset.armed) {
              btn.dataset.armed = '1';
              // the label only: the row keeps its orb
              btn.lastChild!.textContent = t(
                'Toque de novo: abandona a expedição atual',
                'Tap again: abandons the current expedition',
              );
              return;
            }
            go(depart)();
          },
          live ? 'secondary' : 'primary',
        ),
        commandRow(
          'gold',
          t('Loja', 'Shop'),
          beside((back) => openShop(back)),
        ),
        commandRow(
          'blue',
          t('Taverna', 'Tavern'),
          beside((back) => openBar(back)),
        ),
        commandRow(
          'blue',
          t('Grupo', 'Party'),
          beside((back) => openParty(back)),
        ),
        commandRow('bronze', t('Tela de título', 'Title screen'), go(titleScreen)),
      ),
    ],
    { fixed: true },
  );
  d.overlay.classList.add('town-menu');
  d.overlay.querySelector<HTMLButtonElement>('.primary')!.focus();
}

function lostScreen() {
  const d = dialog(
    'result',
    t('Expedição perdida', 'Expedition lost'),
    [
      el(
        'p',
        {},
        t(
          'O grupo saiu no meio da sala. Os feridos voltam à cidade.',
          'The party left in the middle of a room. The wounded return to town.',
        ),
      ),
      el(
        'div',
        { class: 'menu-actions' },
        button('primary', t('Voltar à cidade', 'Back to town'), () => {
          d.close();
          townScreen();
        }),
      ),
    ],
    { onBack: townScreen },
  );
  d.overlay.querySelector<HTMLButtonElement>('.primary')!.focus();
}

// the party that goes is the town's (up to 4), each at full life with its equipment
function depart() {
  const g = group();
  const units = crawlers(g.deployed);
  const party = g.deployed.map((id, k) => ({ id, max: units[k].hp + bonusOf(units[k].items).hp }));
  const exp = startExpedition((Math.random() * 2 ** 31) | 0, party);
  store.set(CRAWL_KEY, JSON.stringify(exp));
  store.set(ROOM_KEY, '');
  expeditionScreen(exp);
}

// the floor of the rooms open now
const floorAt = (exp: Expedition) => {
  const map = expeditionMap(exp.seed);
  return map[openNodes(map, exp.path)[0]].floor;
};
const floorOf = (exp: Expedition) =>
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
        `${m?.name ?? h.id}${m ? ` · ${unitName(m.cls)}` : ''} · ${t('vida', 'HP')} ${h.hp}/${h.max}`,
      );
    }),
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
    const { group: foes } = roomGroup(n.seed, { depth: n.floor, boss: n.boss });
    const taken = exp.path.some((p) => map[p].floor === n.floor && map[p].row === n.row);
    const state = exp.path.includes(i)
      ? t('vencida', 'cleared')
      : open.includes(i)
        ? ''
        : taken
          ? t('caminho não tomado', 'path not taken')
          : t('abre depois da anterior', 'opens after the one before');
    return button(
      open.includes(i) ? 'primary' : 'secondary',
      [
        `${n.boss ? t('Chefe: ', 'Boss: ') : ''}${t(foes.name[0], foes.name[1])}${state ? ` (${state})` : ''}`,
        el('small', { class: 'continue-where' }, foes.enemies.map(unitName).join(' · ')),
      ],
      () => {
        location.search = `?room=${i}`;
      },
      { disabled: !open.includes(i) },
    );
  };
  // the boss is one more row, on the last floor only
  const rows = Array.from({ length: CRAWL_RUN.rows + 1 }, (_, r) =>
    map.flatMap((n, i) => (n.floor === floor && n.row === r ? [i] : [])),
  ).filter((r) => r.length);
  const d = dialog(
    'title',
    `${t('Masmorra', 'Dungeon')} · ${floorOf(exp)}`,
    [
      partyList(exp),
      ...rows.map((r) => el('div', { class: 'menu-actions crawl-row' }, ...r.map(room))),
      el(
        'div',
        { class: 'menu-actions' },
        // the 2nd tap confirms: going back loses the descent (decision 32)
        button('secondary', t('Voltar à cidade', 'Back to town'), (e: Event) => {
          const btn = e.currentTarget as HTMLButtonElement;
          if (!btn.dataset.armed) {
            btn.dataset.armed = '1';
            btn.textContent = t('Toque de novo: perde a descida', 'Tap again: the descent is lost');
            return;
          }
          store.set(CRAWL_KEY, '');
          d.close();
          townScreen();
        }),
      ),
    ],
    { fixed: true },
  );
  d.overlay.classList.add('main-title', 'crawl-map');
  d.overlay.querySelector<HTMLButtonElement>('.primary')!.focus();
}

// After an expedition room: a victory carries the life on (winRoom), a defeat or the last boss down ends the expedition
// (the save is cleared). Written before any window opens, so a reload after the battle cannot replay the room
export function settleRoom(room: CrawlRoom, won: boolean, state: BattleState) {
  const exp = savedExpedition();
  store.set(ROOM_KEY, '');
  const map = exp && expeditionMap(exp.seed);
  // another tab may have ended the expedition or this room meanwhile: a result for a room that is no longer open is ignored
  if (!exp || !map || !openNodes(map, exp.path).includes(room.node)) return null;
  const left = Object.fromEntries(
    Object.entries(room.heroes).flatMap(([spawn, h]) => {
      const u = state.units.find((x) => x.id === spawn);
      return u ? [[h.id, u.hp]] : [];
    }),
  );
  const next = won ? winRoom(exp, room.node, left) : null;
  const done = !!next && cleared(map, next.path);
  store.set(CRAWL_KEY, next && !done ? JSON.stringify(next) : '');
  const node = map[room.node];
  return { next, done, node, down: node.next.some((n) => map[n].floor > node.floor) };
}

// the window after the room: back to the map to go on, or to the town when the expedition ended. Each hero's card says
// the life it takes into the next room (the recovery already applied), in place of the mockup's EXP
export function finishRoom(room: CrawlRoom, won: boolean, state: BattleState, heroes: EndHero[]) {
  const settled = settleRoom(room, won, state);
  if (!settled) return goHome();
  const { next, done, node, down } = settled;
  // on to the expedition map while it goes on (home alone opens the town), else home
  const home = () => {
    location.search = next && !done ? '?home=expedition' : '?home';
  };
  const line = (h: EndHero): CardLine => {
    const carried = next && !done && next.party.find((p) => p.id === room.heroes[h.id]?.id);
    if (!carried) return h.hp <= 0 ? fellLine() : tallyLine(h);
    const life = `${carried.hp}/${carried.max}`;
    return h.hp <= 0
      ? [t(`Caído · volta com ${life}`, `Fallen · back at ${life}`), 'fell']
      : [t(`Próxima sala: ${life}`, `Next room: ${life}`), 'gain'];
  };
  resultBoard({
    won: !!next, // a cleared room and a won expedition get the victory's look
    title: !next
      ? t('Expedição perdida', 'Expedition lost')
      : done
        ? t('Expedição concluída!', 'Expedition complete!')
        : down
          ? t(`Andar ${node.floor} vencido!`, `Floor ${node.floor} cleared!`)
          : t('Sala vencida!', 'Room cleared!'),
    cards: heroes.map((h) => [h, line(h)]),
    cols: [
      [t('Andar', 'Floor'), t(`${node.floor} de ${CRAWL_RUN.floors}`, `${node.floor} of ${CRAWL_RUN.floors}`)],
      ...(next ? ([[t('Salas vencidas', 'Rooms cleared'), String(next.path.length)]] as [string, string][]) : []),
    ],
    note: !next
      ? t(
          `O grupo caiu no andar ${node.floor}. Os feridos voltam à cidade.`,
          `The party fell on floor ${node.floor}. The wounded return to town.`,
        )
      : done
        ? t('O chefe da masmorra caiu. O grupo volta à cidade.', 'The dungeon’s boss fell. The party returns to town.')
        : down
          ? t(
              `Quem ficou de pé recupera 25% da vida e quem caiu volta com 25%; ao descer ao andar ${node.floor + 1}, todos recuperam mais 50%.`,
              `Whoever stood recovers 25% of their life and the fallen come back at 25%; going down to floor ${node.floor + 1}, everyone recovers 50% more.`,
            )
          : t(
              'Quem ficou de pé recupera 25% da vida; quem caiu volta com 25%.',
              'Whoever stood recovers 25% of their life; the fallen come back at 25%.',
            ),
    actions: [
      enterButton(next && !done ? t('Seguir no mapa', 'On to the map') : t('Voltar à cidade', 'Back to town'), home),
    ],
    // Esc goes the same way: closing only left the finished room on screen
    onBack: home,
  });
}
