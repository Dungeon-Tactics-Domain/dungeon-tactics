import { TOWN } from '../../content/crawl/town.ts';
import { bonusOf } from '../../shared/battle/equipment.ts';
import { HALF } from '../../shared/battle/half.ts';
import type { Scenario } from '../../shared/battle/scenarios.ts';
import { UNIT_DEFS } from '../../shared/battle/units.ts';
import {
  classMana,
  cleared,
  type Expedition,
  expeditionMap,
  goldHome,
  openChest,
  openNodes,
  parseExpedition,
  startExpedition,
} from '../../shared/crawl/expedition.ts';
import { roomId } from '../../shared/crawl/generate.ts';
import { CHEST_KEY, EQUIP_KEY, parseChest, parseEquip } from '../chest.ts';
import { buildDevScenario, type DevUnit, slotsOf, unitFrom } from '../dev-roster.ts';
import { commandRow, dialog, secondTap } from '../dialog.ts';
import { GROUP_KEY, heroesFor, parseGroup } from '../group.ts';
import { t } from '../i18n.ts';
import { button, el } from '../icons.ts';
import { CRAWL_KEY, ROOM_KEY } from '../saves.ts';
import { setTrack } from '../sound.ts';
import { param, store } from '../store.ts';
import { goldNote, openBar, openParty, openShop, sideWindows } from '../town-ui.ts';
import { expeditionScreen, floorOf } from './expedition-map.ts';

export { CRAWL_KEY, ROOM_KEY }; // part of a save slot, so their names live in saves.ts

// the expedition room in play: who stands on each hero spawn (h0, h1…) and the life and mana they enter with (absent: full)
export interface CrawlRoom {
  node: number;
  heroes: Record<string, { id: string; hp: number; mana?: number }>;
}

const townGold = () => parseChest(store.json(CHEST_KEY)).gold;

// The descent ends: its gold goes to the town's (all of it alive, half when the party fell: goldHome) and the save is
// cleared in the same step, so a reload cannot bank it twice. Capped where parseChest reads it (above, it reads 0)
export function endExpedition(exp: Expedition, fell: boolean) {
  const chest = parseChest(store.json(CHEST_KEY));
  const gold = goldHome(exp, fell);
  store.set(CHEST_KEY, JSON.stringify({ ...chest, gold: Math.min(999999, chest.gold + gold) }));
  store.set(CRAWL_KEY, '');
  return gold;
}

// A window drawn earlier (another tab may have moved the expedition on, ended it or started another) acts on the save as
// it is now: the same expedition (its seed) still live, else null
export const current = (exp: Expedition) => {
  const live = liveExpedition();
  return live?.seed === exp.seed ? live : null;
};

// Back to town alive (the map's Back to town, a new quest over a live one): the saved expedition's gold goes home whole,
// once; nothing when it already ended elsewhere. Returns the gold that went home
export function retreat(exp: Expedition) {
  const now = current(exp);
  return now ? endExpedition(now, false) : 0;
}

// Opens a chest of the saved expedition and saves it; null when the chest is not open there any more (a stale map)
export function takeChest(exp: Expedition, node: number) {
  const now = current(exp);
  const next = now && openChest(now, node);
  if (!next || next === now) return null;
  store.set(CRAWL_KEY, JSON.stringify(next));
  return next;
}
export const group = () => parseGroup(store.json(GROUP_KEY));
// who goes, as the town's party has them (class, name, equipment); `ids` keeps the order of the sheets
const crawlers = (ids: string[]) => heroesFor({ ...group(), deployed: ids }, parseEquip(store.json(EQUIP_KEY)));
// the mana pool of a crawler's battle sheet (its class's, as buildDevScenario copies it); 0 without one
const manaOf = (u: DevUnit) => UNIT_DEFS[u.base].vars?.mana ?? 0;
// the members still in the group, with their sheets in the same order
const inGroup = (exp: Expedition) => {
  const ids = exp.party.map((h) => h.id).filter((id) => group().members.some((m) => m.id === id));
  return { ids, units: crawlers(ids) };
};
// read with each hero's mana pool as its class has it now (classMana): every reader sees a class changed in town
export const savedExpedition = () => {
  const exp = parseExpedition(store.json(CRAWL_KEY));
  if (!exp) return null;
  const { ids, units } = inGroup(exp);
  return classMana(exp, Object.fromEntries(ids.map((id, i) => [id, manaOf(units[i])])));
};

// The generated room with the expedition party on its hero spawns and the enemies as sheets of their own: the developer
// menu's path (dev-roster.ts), under the room's id so the mood still reads its theme. A member no longer in the group stays out
export function castRoom(room: Scenario, exp: Expedition, node: number): { scenario: Scenario; room: CrawlRoom } {
  const { ids, units } = inGroup(exp);
  const enemies = slotsOf(room.id).enemy.map((s) => unitFrom(s.def));
  const scenario = buildDevScenario({ map: room.id, heroes: units, enemies }, room.id, [room.name, room.en]);
  // never above the sheet's life: the save is read from the browser (a max typed into dt:crawl gave a hero 999)
  const hp = (id: string, i: number) =>
    Math.min(exp.party.find((h) => h.id === id)!.hp, units[i].hp + bonusOf(units[i].items).hp);
  // mana as savedExpedition matched it to the class (absent: no pool)
  const mana = (id: string) => {
    const saved = exp.party.find((h) => h.id === id)!.mana;
    return saved === undefined ? {} : { mana: saved };
  };
  const heroes = Object.fromEntries(ids.map((id, i) => [`h${i}`, { id, hp: hp(id, i), ...mana(id) }]));
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
// It returns the gold that went home (half, as for a fall), null when no room was left
export function leftRoom() {
  const exp = savedExpedition();
  if (!exp || !store.get(ROOM_KEY)) return null;
  store.set(ROOM_KEY, '');
  return endExpedition(exp, true);
}

// The scenario id of the room battle still saved, read raw: Battle.load needs that room's scenario registered, which a
// new page does only once it opens the room, so a load there missed the room left behind
export const heldRoom = () => (store.json(ROOM_KEY) as { state?: { scenario?: unknown } } | null)?.state?.scenario;

// The open room whose battle is still saved: loading its game from the title's Continue reopens it, because closing the tab is not leaving the
// room (review of Nov 15); leaving through Options or the address still loses the expedition (leftRoom).
// ponytail: matches the room built from the node's own seed; one built from the fallback seed (none of 500 tested) is
// not found, so the loaded game goes home and the room counts as left
export function savedRoom(): number | null {
  const exp = savedExpedition();
  const held = heldRoom();
  if (!exp || typeof held !== 'string') return null;
  const map = expeditionMap(exp.seed);
  const id = (n: number) => roomId(map[n].seed, { depth: map[n].floor, boss: map[n].boss }) + HALF;
  return openNodes(map, exp.path).find((n) => id(n) === held) ?? null;
}

// What ?home opens over the walkable town (game/town.ts; a game loaded on the title and New game go there too): the
// expedition lost if the party left a room, the expedition map on ?home=expedition, where a room's result window goes;
// else the town alone, which offers to continue a live expedition at its gate
export function homeScreen() {
  const kept = leftRoom();
  if (kept !== null) return lostScreen(kept);
  const exp = liveExpedition();
  if (exp && param('home') === 'expedition') expeditionScreen(exp);
}

// back to walking the town after a window over it (its music, Pastoral D: Fernando, Nov 15)
export const toTown = () => setTrack('world');

// The quest's rows, at the gate and in the town menu: an expedition in progress is continued; a new quest over it asks a
// 2nd tap, since it abandons it (Fernando, Nov 15)
function questRows(go: (fn: () => void) => () => void) {
  const live = liveExpedition();
  return [
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
      t('Nova expedição', 'New expedition'),
      (e: Event) => {
        const again = t(
          'Confirmar: encerra a expedição atual, o ouro achado vai à cidade',
          'Confirm: ends the current expedition, the gold found goes to town',
        );
        if (live && !secondTap(e, again)) return;
        go(depart)();
      },
      live ? 'secondary' : 'primary',
    ),
  ];
}

// The dungeon gate at the north end of the town (Nov 15, Fernando: the quest opens at its spot): the quest's rows and the
// way back to the street
export function questGate(name: string) {
  const go = (fn: () => void) => () => {
    d.close();
    fn();
  };
  const d = dialog(
    'title',
    name,
    [
      el(
        'div',
        { class: 'menu-actions camp-list command-list' },
        ...questRows(go),
        commandRow('bronze', t('Ficar na cidade', 'Stay in town'), go(toTown)),
      ),
    ],
    { onBack: toTown },
  );
  d.overlay.querySelector<HTMLButtonElement>('.primary')!.focus();
}

// The town menu (Esc, Start, the corner button; the lab kit's command menu in the top right corner, Nov 15 mockups):
// every place without walking there, the quest, Shop, Tavern and Party, and the way back to the title. Over the walkable town.
// `extra`: the town's own rows at the foot (its debug grid and fluid movement, game/town.ts, which this file cannot import)
export function townMenu(extra?: Node) {
  // the window beside the menu, if any (its 'close' skips its onBack)
  const closeBeside = () => {
    for (const o of sideWindows(document.querySelectorAll('.overlay'), d.overlay)) o.dispatchEvent(new Event('close'));
  };
  // the gold on its head band follows a buy, a sale or a recruit in the window beside it (they all go through a click);
  // the listener goes when the menu closes (a close from elsewhere drops it at the next click)
  const follow = () => {
    if (d.overlay.isConnected) d.overlay.querySelector('.dialog-head .gold strong')!.textContent = String(townGold());
    else removeEventListener('click', follow);
  };
  const stop = () => {
    removeEventListener('click', follow);
    closeBeside();
  };
  const go = (fn: () => void) => () => {
    stop();
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
    t(TOWN.name, TOWN.en),
    [
      el(
        'div',
        { class: 'menu-actions camp-list command-list' },
        ...questRows(go),
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
        // the title over its own spinning backdrop battle, the bare address (an empty `search` left a "?" on it)
        commandRow(
          'bronze',
          t('Voltar ao título', 'Back to title'),
          go(() => {
            location.href = location.pathname;
          }),
        ),
        extra,
      ),
    ],
    // closes back to the street; a window beside it closes first (only the topmost window takes Esc)
    { onBack: stop, note: goldNote(t('Ouro', 'Gold'), townGold()) },
  );
  d.overlay.classList.add('town-menu');
  addEventListener('click', follow);
  d.overlay.querySelector<HTMLButtonElement>('.primary')!.focus();
}

function lostScreen(kept: number) {
  const d = dialog(
    'result',
    t('Expedição perdida', 'Expedition lost'),
    [
      el(
        'p',
        {},
        t(
          'O grupo deixou a sala no meio da luta. A expedição acabou, e metade do ouro achado vai à cidade.',
          'The party left the room mid-fight. The expedition is over, and half the gold found goes to town.',
        ),
      ),
      goldNote(t('Ouro para a cidade', 'Gold to town'), kept),
      el(
        'div',
        { class: 'menu-actions' },
        button('primary', t('Voltar à cidade', 'Back to town'), () => {
          d.close();
          toTown();
        }),
      ),
    ],
    { onBack: toTown },
  );
  d.overlay.querySelector<HTMLButtonElement>('.primary')!.focus();
}

// the party that goes is the town's (up to 4), each at full life with its equipment
function depart() {
  // a new quest over a live one ends that one in town, alive: its gold goes home whole
  const live = liveExpedition();
  if (live) retreat(live);
  const g = group();
  const units = crawlers(g.deployed);
  const party = g.deployed.map((id, k) => ({
    id,
    max: units[k].hp + bonusOf(units[k].items).hp,
    manaMax: manaOf(units[k]),
  }));
  const exp = startExpedition((Math.random() * 2 ** 31) | 0, party);
  store.set(CRAWL_KEY, JSON.stringify(exp));
  store.set(ROOM_KEY, '');
  expeditionScreen(exp);
}
