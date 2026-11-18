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
import { looks3d } from './looks3d.ts';
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
  looks3d.shop?.(back, tab, sel); // drawn by town3d/screens.ts
}

// Tavern (Nov 13, delivery 5 of the design): recruit one person of any class for gold, up to the party cap. `said`: who
// just joined, on the box of the class they came from
export function openBar(back: () => void, sel = '', said = '') {
  looks3d.bar?.(back, sel, said); // drawn by town3d/screens.ts
}
