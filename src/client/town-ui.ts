// The town's windows (opened at its buildings, game/town.ts, and from its menu, game/crawl.ts townMenu): Tavern (recruits)
// and Shop; the Party screen is town-party.ts. Rules in group.ts and chest.ts.

import { CONSUMABLES } from '../content/items.ts';
import { ITEMS } from '../shared/battle/equipment.ts';
import { SUB } from '../shared/battle/half.ts';
import { MAX_JUMP } from '../shared/battle/pathing.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';
import { buy, CHEST_KEY, CHEST_MAX, sell } from './chest.ts';
import { choice, dialog, priceRow } from './dialog.ts';
import { GROUP_KEY, GROUP_MAX, type Group, JOBS, parseGroup, RECRUIT_COST, recruit } from './group.ts';
import { stillFace } from './hud-pieces.ts';
import { t, unitName } from './i18n.ts';
import { button, el } from './icons.ts';
import { itemName, itemStats, KIND_NAME, loadChest, RARITY } from './sheet-lines.ts';
import { sfx } from './sound.ts';
import { store } from './store.ts';

// How to play's Move and Jump sentence, from the sheets so it follows a change. A leap needs 2 cells (a whole tile)
// to land level past a gap, so only Jump 4 or more clears one (Nov 15)
export function jumpHelp(): string {
  const j = (id: string) => (UNIT_DEFS[id].jump ?? MAX_JUMP) * SUB;
  return t(
    `Movimento e Salto contam em meias casas: o Salto do Lanceiro é ${j('lancer')}, o do Ladino e do Lacaio ${j('rogue')}, o dos outros ${j('warrior')}. Por passo se sobe ou desce metade do Salto em níveis; com Salto ${2 * SUB} ou mais também se voa 1 casa de água funda ou de buraco.`,
    `Move and Jump count in half tiles: the Lancer has Jump ${j('lancer')}, the Rogue and the Minion ${j('rogue')}, the rest ${j('warrior')}. Each step climbs or drops up to half the Jump in levels; Jump ${2 * SUB} or more also clears 1 tile of deep water or a gap.`,
  );
}

// the saved party (dt:party); the Party screen is town-party.ts
export const loadGroup = () => parseGroup(store.json(GROUP_KEY));
export const saveGroup = (g: Group) => store.set(GROUP_KEY, JSON.stringify(g));
export { openParty } from './town-party.ts';

// Tavern (Nov 13, delivery 5 of the design): recruit one person of any class for gold, up to the party cap
export function openBar(back: () => void) {
  const gold = loadChest().gold;
  const why =
    loadGroup().members.length >= GROUP_MAX
      ? t(
          'Grupo cheio: dispense alguém na ficha para recrutar.',
          'Party is full: dismiss someone on their sheet to recruit.',
        )
      : gold < RECRUIT_COST
        ? t(
            `Faltam ${RECRUIT_COST - gold} de ouro para recrutar.`,
            `${RECRUIT_COST - gold} more gold needed to recruit.`,
          )
        : '';
  const party = loadGroup().members.length;
  const d = dialog(
    'party',
    t('Taverna', 'Tavern'),
    [
      // recruit (delivery 5): one person of any of the 4 classes for gold, up to the party cap
      el('h3', {}, t('Recrutar', 'Recruit')),
      // without gold or with a full party the buttons turn off and the line says what is missing (before, only the error sound played)
      ...(why ? [el('p', { class: 'learned' }, why)] : []),
      // one lab kit list row per class: neutral face, what it does, the price after a coin and Recruit
      ...JOBS.map((c) =>
        priceRow(
          [stillFace(c, 'neutral'), t(`Recrutar ${unitName(c)}`, `Recruit ${unitName(c)}`)],
          RECRUIT_COST,
          button(
            'secondary',
            t('Recrutar', 'Recruit'),
            () => {
              const r = recruit(loadGroup(), loadChest(), c);
              if (!r) return void sfx('cancel');
              saveGroup(r.group);
              store.set(CHEST_KEY, JSON.stringify(r.chest));
              sfx('confirm');
              d.close();
              openBar(back);
            },
            { disabled: !!why },
          ),
        ),
      ),
    ],
    {
      onBack: back,
      note: goldNote(t(`Grupo ${party} de ${GROUP_MAX} · ouro`, `Party ${party} of ${GROUP_MAX} · gold`), gold),
    },
  );
}

// the windows open beside the town menu (crawl.ts): every overlay but the menu's own
export const sideWindows = <T>(overlays: Iterable<T>, menu: T) => [...overlays].filter((o) => o !== menu);

// what is missing to buy, under the Shop row's turned-off button; nothing when the gold covers it
export const shortBy = (gold: number, price: number) =>
  gold < price ? t(`faltam ${price - gold} de ouro`, `${price - gold} gold short`) : '';
// why a piece cannot go into the chest (CHEST_MAX): under Buy and Remove, and before Dismiss
export const chestFull = () => t(`baú cheio (${CHEST_MAX})`, `chest full (${CHEST_MAX})`);

// the lab kit's gold counter on a window's head band (Shop, Tavern): small uppercase label, the number after a coin
export const goldNote = (label: string, gold: number) =>
  el('p', { class: 'gold' }, el('span', { class: 'result-label' }, label), el('strong', {}, String(gold)));

// Shop (Nov 13, delivery 2: provisional on the map until the towns): buy with the chest gold, sell for half (as in FFT).
// Since Nov 15 the lab kit's list rows, in turns. Since Nov 16 (slice 3, the lab's gold grill) it sells only common pieces
// (rares and epics drop) and lists the consumables, whose Buy stays off until the battle can use them
type ShopTab = 'gear' | 'goods' | 'sell';
export function openShop(back?: () => void, tab: ShopTab = 'gear') {
  const chest = loadChest(),
    full = chest.items.length >= CHEST_MAX;
  const save = (c: ReturnType<typeof buy>) => {
    if (!c) return void sfx('cancel');
    store.set(CHEST_KEY, JSON.stringify(c));
    sfx('confirm');
    d.close();
    openShop(back, tab);
  };
  const rows: Record<ShopTab, () => HTMLElement[]> = {
    gear: () =>
      Object.values(ITEMS)
        .filter((it) => it.rarity === 'common')
        .map((it) =>
          priceRow(
            [itemName(it), el('small', {}, `${KIND_NAME[it.kind]()} · ${itemStats(it)}`)],
            it.price,
            button('secondary', t('Comprar', 'Buy'), () => save(buy(chest, it.id)), {
              disabled: full || chest.gold < it.price,
            }),
            // too expensive: the button turns off and says under it how much is missing (before, it only went grey)
            full ? chestFull() : shortBy(chest.gold, it.price),
          ),
        ),
    goods: () =>
      CONSUMABLES.map((c) =>
        priceRow(
          [t(c.name, c.en), el('small', {}, t(...c.use))],
          c.price,
          button('secondary', t('Comprar', 'Buy'), () => sfx('cancel'), { disabled: true }),
          t('usar em batalha vem depois', 'using it in battle comes later'),
        ),
      ),
    sell: () =>
      chest.items.length
        ? chest.items.map((id) =>
            priceRow(
              [itemName(ITEMS[id]), el('small', {}, `${KIND_NAME[ITEMS[id].kind]()} · ${RARITY[ITEMS[id].rarity]()}`)],
              Math.floor(ITEMS[id].price / 2),
              button('secondary', t('Vender', 'Sell'), () => save(sell(chest, id))),
            ),
          )
        : [
            el(
              'p',
              {},
              t(
                'Nada para vender. O equipamento guardado no baú aparece aqui.',
                'Nothing to sell. Spare gear in the chest shows up here.',
              ),
            ),
          ],
  };
  const d = dialog(
    'party shop',
    t('Loja', 'Shop'),
    [
      choice<ShopTab>(
        t('Comprar ou vender', 'Buy or sell'),
        [
          ['gear', t('Peças', 'Gear')],
          ['goods', t('Consumíveis', 'Consumables')],
          ['sell', t(`Vender (${chest.items.length})`, `Sell (${chest.items.length})`)],
        ],
        tab,
        (v) => {
          d.close();
          openShop(back, v);
        },
      ),
      ...rows[tab](),
    ],
    { onBack: back, note: goldNote(t('Ouro no baú', 'Gold in chest'), chest.gold) },
  );
  // the open tab keeps the focus, so switching by keyboard goes on from there
  d.overlay.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
}
