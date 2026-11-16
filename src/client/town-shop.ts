// The Shop and the Tavern as one counter screen in the layout of a Final Fantasy Tactics shop (Fernando, Nov 16): a
// command list (Buy, Sell, Leave), the list with each price, and a detail box for the picked row with what it gives, how
// many the party owns, what it would change on each member and the action with why it is off. Rules in chest.ts, group.ts.

import { CONSUMABLES } from '../content/items.ts';
import {
  ITEMS,
  type ItemDef,
  type Kind,
  kindOf,
  type Loadout,
  SLOTS,
  type Slot,
  worn,
} from '../shared/battle/equipment.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';
import { defenceRows } from './battle-text.ts';
import { buy, CHEST_KEY, CHEST_MAX, type Chest, type Equip, sell } from './chest.ts';
import { unitFrom } from './dev-roster.ts';
import { commandRow, dialog } from './dialog.ts';
import { GROUP_MAX, JOBS, RECRUIT_COST, recruit } from './group.ts';
import { stillFace } from './hud-pieces.ts';
import { abilityName, t, unitName } from './i18n.ts';
import { button, type Child, el } from './icons.ts';
import { compare, itemName, itemStats, KIND_NAME, loadChest, loadEquip, RARITY } from './sheet-lines.ts';
import { sfx } from './sound.ts';
import { store } from './store.ts';
import { chestFull, goldNote, loadGroup, saveGroup, shortBy, statsLine } from './town-ui.ts';

// the slot a new piece of this kind would go to: the first empty one of its kind (a 2nd accessory), else the first
export const fitSlot = (load: Loadout, kind: Kind): Slot => {
  const fits = SLOTS.filter((s) => kindOf(s) === kind);
  return fits.find((s) => !worn(load, s)) ?? fits[0];
};

// what wearing the piece would change on one member, as the Equipment window counts it, and the piece it would replace
export function fitLine(cls: string, load: Loadout, it: ItemDef): string {
  const slot = fitSlot(load, it.kind),
    old = worn(load, slot);
  if (old?.id === it.id) return t('já usa', 'already wears it');
  const change = compare(cls, load, slot, it.id);
  return old ? t(`${change} (no lugar de ${itemName(old)})`, `${change} (replacing ${itemName(old)})`) : change;
}

// how many of a piece the party has, loose in the chest and worn by someone
export const ownedOf = (chest: Chest, eq: Equip, id: string): [loose: number, on: number] => [
  chest.items.filter((i) => i === id).length,
  Object.values(eq)
    .flatMap((l) => Object.values(l))
    .filter((i) => i === id).length,
];
export function ownedText([loose, on]: [number, number]): string {
  const n = loose + on;
  return n
    ? t(`${n} (${loose} no baú, ${on} em uso)`, `${n} (${loose} in the chest, ${on} worn)`)
    : t('nenhuma', 'none');
}

// One row of the list: what it is, how many are owned, its price and, in words, why its action is off
interface Row {
  key: string;
  head?: string; // a heading before the row (Gear, Consumables)
  face?: Node;
  name: string;
  kind: string;
  own?: number;
  price: number;
  why: string;
  detail: () => Child[];
}

// the detail box's action: the window's one gold button, with why it is off in a line outside the faded button
const action = (label: string, run: () => void, why: string) => [
  ...(why ? [el('p', { class: 'learned' }, why)] : []),
  button('primary', label, run, { disabled: !!why }),
];

// The counter window. Focusing a row (arrows, d-pad) shows it in the detail box; Enter, a click or a tap picks it and
// moves the focus to the box's action, so nothing is bought by the first press and a finger never needs a hover.
// The rows and the commands are `.camp-list` rows, which the arrows walk (dialog.ts)
function counter(o: {
  title: string;
  note: Child;
  commands: HTMLElement[];
  rows: Row[];
  empty: string;
  sel: string;
  back?: () => void;
}) {
  const box = el('div', { class: 'counter-detail', 'aria-live': 'polite' });
  const show = (r: Row, b: HTMLElement) => {
    for (const p of list.querySelectorAll('[aria-current]')) p.removeAttribute('aria-current');
    b.setAttribute('aria-current', 'true');
    box.replaceChildren(...r.detail().filter((c): c is Node | string => !!c));
  };
  const rowButtons = o.rows.map((r) => {
    const b = button(
      'secondary',
      [
        r.face,
        el('span', { class: 'counter-what' }, r.name, el('small', {}, r.kind)),
        r.own ? el('span', { class: 'counter-own' }, t(`tem ${r.own}`, `own ${r.own}`)) : null,
        el(
          'span',
          { class: 'counter-price' },
          el('span', { class: 'price' }, String(r.price)),
          r.why && el('small', {}, r.why),
        ),
      ],
      () => {
        show(r, b);
        const act = box.querySelector<HTMLButtonElement>('button:not(:disabled)');
        if (act) act.focus();
        else sfx('cancel');
      },
      { onfocus: () => show(r, b) },
    );
    return b;
  });
  const list = el(
    'div',
    { class: 'counter-list camp-list' },
    ...o.rows.flatMap((r, i) => [r.head ? el('h3', {}, r.head) : null, rowButtons[i]]),
    o.rows.length ? null : el('p', {}, o.empty),
  );
  const d = dialog(
    'counter',
    o.title,
    [
      el(
        'div',
        { class: 'counter-layout' },
        el('div', { class: 'menu-actions camp-list command-list' }, ...o.commands),
        list,
        o.rows.length ? box : null,
      ),
    ],
    { onBack: o.back, note: o.note },
  );
  // back on the row the last action was on (or the first), with its detail open; an empty list leaves the open command
  const at = Math.max(
    0,
    o.rows.findIndex((r) => r.key === o.sel),
  );
  if (o.rows.length) show(o.rows[at], rowButtons[at]);
  (rowButtons[at] ?? o.commands.find((c) => c.classList.contains('picked')))?.focus();
  return d;
}

// a command of the counter; the open one stays picked like the town menu's row with its window open
const command = (orb: 'gold' | 'blue' | 'bronze', label: string, run: () => void, open = false) => {
  const b = commandRow(orb, label, run);
  b.classList.toggle('picked', open);
  if (open) b.setAttribute('aria-current', 'true');
  return b;
};

// Shop (Nov 13, delivery 2): buy with the chest gold, sell for half (as in FFT). It sells only common pieces (rares and
// epics drop, Nov 16) and lists the consumables, whose Buy stays off until the battle can use them
type ShopTab = 'buy' | 'sell';
export function openShop(back?: () => void, tab: ShopTab = 'buy', sel = '') {
  const chest = loadChest(),
    eq = loadEquip(),
    g = loadGroup(),
    full = chest.items.length >= CHEST_MAX;
  const reopen = (to: ShopTab, key = '') => {
    d.close();
    openShop(back, to, key);
  };
  const save = (c: Chest | null, key: string) => {
    if (!c) return void sfx('cancel');
    store.set(CHEST_KEY, JSON.stringify(c));
    sfx('confirm');
    reopen(tab, key);
  };
  // who goes to battle first, as the Party lists them
  const members = [...g.members].sort((a, b) => Number(g.deployed.includes(b.id)) - Number(g.deployed.includes(a.id)));
  // the piece's box: what it gives, how many the party has and what it would change on each member (any class wears any
  // piece, so everyone is listed), then the action
  const pieceBox = (it: ItemDef, price: Child[], act: Child[]) => [
    el('h3', {}, itemName(it)),
    el('p', {}, `${KIND_NAME[it.kind]()} · ${RARITY[it.rarity]()}`),
    el('p', { class: 'counter-gives' }, itemStats(it)),
    el(
      'dl',
      { class: 'keys' },
      ...price,
      el('dt', {}, t('No grupo', 'In the party')),
      el('dd', {}, ownedText(ownedOf(chest, eq, it.id))),
    ),
    el('h3', {}, t('Quem pode usar', 'Who can use it')),
    el('p', {}, t('Qualquer classe. O que muda em cada um:', 'Any class. What changes on each:')),
    el(
      'ul',
      { class: 'counter-fit' },
      ...members.map((m) =>
        el(
          'li',
          {},
          el('strong', {}, unitFrom(m.cls, m.name).name),
          ` · ${unitName(m.cls)}: ${fitLine(m.cls, eq[m.id] ?? {}, it)}`,
        ),
      ),
    ),
    ...act,
  ];
  const later = t('usar em batalha vem depois', 'using it in battle comes later');
  const rows: Record<ShopTab, () => Row[]> = {
    buy: () => [
      ...Object.values(ITEMS)
        .filter((it) => it.rarity === 'common')
        .map((it, i): Row => {
          // too expensive or no room: the action turns off and says how much is missing
          const why = full ? chestFull() : shortBy(chest.gold, it.price);
          return {
            key: it.id,
            head: i ? undefined : t('Peças', 'Gear'),
            name: itemName(it),
            kind: KIND_NAME[it.kind](),
            own: ownedOf(chest, eq, it.id).reduce((a, b) => a + b),
            price: it.price,
            why,
            detail: () =>
              pieceBox(
                it,
                [el('dt', {}, t('Preço', 'Price')), el('dd', {}, el('span', { class: 'price' }, String(it.price)))],
                action(t('Comprar', 'Buy'), () => save(buy(chest, it.id), it.id), why),
              ),
          };
        }),
      ...CONSUMABLES.map(
        (c, i): Row => ({
          key: c.id,
          head: i ? undefined : t('Consumíveis', 'Consumables'),
          name: t(c.name, c.en),
          kind: t(...c.use),
          price: c.price,
          why: later,
          detail: () => [
            el('h3', {}, t(c.name, c.en)),
            el('p', { class: 'counter-gives' }, t(...c.use)),
            el(
              'dl',
              { class: 'keys' },
              el('dt', {}, t('Preço', 'Price')),
              el('dd', {}, el('span', { class: 'price' }, String(c.price))),
            ),
            ...action(t('Comprar', 'Buy'), () => sfx('cancel'), later),
          ],
        }),
      ),
    ],
    // one row per kind of piece in the chest, with how many of it are there
    sell: () =>
      [...new Set(chest.items)].map((id): Row => {
        const it = ITEMS[id],
          gets = Math.floor(it.price / 2);
        return {
          key: id,
          name: itemName(it),
          kind: `${KIND_NAME[it.kind]()} · ${RARITY[it.rarity]()}`,
          own: ownedOf(chest, {}, id)[0],
          price: gets,
          why: '',
          detail: () =>
            pieceBox(
              it,
              [
                el('dt', {}, t('Vende por', 'Sells for')),
                el(
                  'dd',
                  {},
                  el('span', { class: 'price' }, String(gets)),
                  t(' (metade do preço)', ' (half the price)'),
                ),
              ],
              action(t('Vender', 'Sell'), () => save(sell(chest, id), id), ''),
            ),
        };
      }),
  };
  const d = counter({
    title: t('Loja', 'Shop'),
    note: goldNote(t('Ouro no baú', 'Gold in chest'), chest.gold),
    commands: [
      command('gold', t('Comprar', 'Buy'), () => reopen('buy'), tab === 'buy'),
      command(
        'blue',
        t(`Vender (${chest.items.length})`, `Sell (${chest.items.length})`),
        () => reopen('sell'),
        tab === 'sell',
      ),
      command('bronze', t('Sair', 'Leave'), () => {
        d.close();
        back?.();
      }),
    ],
    rows: rows[tab](),
    empty: t(
      'Nada para vender. O equipamento guardado no baú aparece aqui.',
      'Nothing to sell. Spare gear in the chest shows up here.',
    ),
    sel,
    back,
  });
}

// Tavern (Nov 13, delivery 5 of the design): recruit one person of any class for gold, up to the party cap. `said`: who
// just joined, on the box of the class they came from
export function openBar(back: () => void, sel = '', said = '') {
  const gold = loadChest().gold,
    party = loadGroup().members.length;
  // without gold or with a full party Recruit turns off and the line says what is missing
  const full = party >= GROUP_MAX;
  const why = full
    ? t(
        'Grupo cheio: dispense alguém na ficha para recrutar.',
        'Party is full: dismiss someone on their sheet to recruit.',
      )
    : gold < RECRUIT_COST
      ? t(`Faltam ${RECRUIT_COST - gold} de ouro para recrutar.`, `${RECRUIT_COST - gold} more gold needed to recruit.`)
      : '';
  const d = counter({
    title: t('Taverna', 'Tavern'),
    note: goldNote(t(`Grupo ${party} de ${GROUP_MAX} · ouro`, `Party ${party} of ${GROUP_MAX} · gold`), gold),
    commands: [
      command('blue', t('Recrutar', 'Recruit'), () => {}, true),
      command('bronze', t('Sair', 'Leave'), () => {
        d.close();
        back();
      }),
    ],
    rows: JOBS.map((c): Row => {
      const def = UNIT_DEFS[c];
      return {
        key: c,
        face: stillFace(c, 'neutral'),
        name: unitName(c),
        kind: t('recruta', 'recruit'),
        price: RECRUIT_COST,
        why: full ? t('grupo cheio', 'party full') : shortBy(gold, RECRUIT_COST),
        detail: () => [
          el('div', { class: 'party-card' }, stillFace(c, 'neutral', true), el('h3', {}, unitName(c))),
          el('p', { class: 'party-stats' }, statsLine(def)),
          el(
            'p',
            { class: 'party-stats' },
            defenceRows(def)
              .map(([k, v]) => `${k} ${v}`)
              .join(' · '),
          ),
          el('p', { class: 'party-skills' }, def.abilities.map(abilityName).join(' · ')),
          el(
            'dl',
            { class: 'keys' },
            el('dt', {}, t('Custo', 'Cost')),
            el('dd', {}, el('span', { class: 'price' }, String(RECRUIT_COST))),
          ),
          c === sel && said ? el('p', { class: 'counter-said' }, said) : null,
          ...action(
            t(`Recrutar ${unitName(c)}`, `Recruit ${unitName(c)}`),
            () => {
              const r = recruit(loadGroup(), loadChest(), c);
              if (!r) return void sfx('cancel');
              saveGroup(r.group);
              store.set(CHEST_KEY, JSON.stringify(r.chest));
              sfx('confirm');
              d.close();
              const name = r.group.members.at(-1)!.name;
              openBar(back, c, t(`${name} entrou no grupo.`, `${name} joined the party.`));
            },
            why,
          ),
        ],
      };
    }),
    empty: '',
    sel,
    back,
  });
}
