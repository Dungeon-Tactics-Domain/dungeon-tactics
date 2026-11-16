// The Party screen's Equipment page: the 7 slots, compare, swap and the chest.

import { ITEMS, kindOf, SLOTS, type Slot, worn } from '../shared/battle/equipment.ts';
import { CHEST_KEY, CHEST_MAX, EQUIP_KEY, equip } from './chest.ts';
import { choice, priceRow } from './dialog.ts';
import type { Member } from './group.ts';
import { t } from './i18n.ts';
import { button, el } from './icons.ts';
import { compareRows, itemName, itemStats, loadChest, loadEquip, RARITY, slotName } from './sheet-lines.ts';
import { sfx } from './sound.ts';
import { store } from './store.ts';
import { chestFull } from './town-ui.ts';

// Equipment page (Nov 16; FFT's equip screen): the slots in a column with what each holds, the open one beside it: its
// piece with what it gives and Remove, then the chest's pieces of its kind, each with the sheet's totals it would change,
// now → after, and Equip. `show` rebuilds the Party window on a slot after every action (town-party.ts)
export function gearPage(m: Member, slot: Slot, show: (v: { slot: Slot }) => void): HTMLElement {
  const chest = loadChest(),
    mine = loadEquip()[m.id] ?? {},
    full = chest.items.length >= CHEST_MAX;
  const put = (id: string | null) => {
    const r = equip(loadChest(), loadEquip(), m.id, slot, id);
    if (!r) return void sfx('cancel');
    store.set(CHEST_KEY, JSON.stringify(r.chest));
    store.set(EQUIP_KEY, JSON.stringify(r.eq));
    sfx('confirm');
    show({ slot });
  };
  // ▲ and ▼ carry the direction with the colour; a piece that moves nothing says so
  const changes = (id: string) => {
    const rows = compareRows(m.cls, mine, slot, id);
    return el(
      'span',
      { class: 'compare' },
      ...(rows.length
        ? rows.map(([k, now, after, up]) =>
            el('span', {}, `${k} ${now} → ${after} `, el('b', { class: up ? 'up' : 'down' }, up ? '▲' : '▼')),
          )
        : [t('nada muda', 'no change')]),
    );
  };
  const it = worn(mine, slot);
  const fits = [...new Set(chest.items)].filter((id) => ITEMS[id].kind === kindOf(slot));
  const nav = choice(
    t('Espaços', 'Slots'),
    SLOTS.map((s): [Slot, string] => {
      const w = worn(mine, s);
      return [s, `${slotName(s)}: ${w ? itemName(w) : t('vazio', 'empty')}`];
    }),
    slot,
    (s) => show({ slot: s }),
  );
  nav.classList.add('menu-nav', 'slot-list'); // drawn as Options' section column
  return el(
    'div',
    { class: 'gear-page' },
    nav,
    el(
      'div',
      {},
      el('h3', {}, slotName(slot)),
      it
        ? priceRow(
            [itemName(it), el('small', {}, `${RARITY[it.rarity]()} · ${itemStats(it)}`)],
            null,
            button('secondary', t('Tirar', 'Remove'), () => put(null), {
              'aria-label': t(`Tirar ${itemName(it)}`, `Remove ${itemName(it)}`),
              disabled: full,
            }),
            full ? chestFull() : '',
          )
        : el('p', {}, t('Vazio.', 'Empty.')),
      el('h3', {}, t('No baú', 'In the chest')),
      ...(fits.length
        ? fits.map((id) =>
            priceRow(
              [itemName(ITEMS[id]), el('small', {}, RARITY[ITEMS[id].rarity]()), changes(id)],
              null,
              button('secondary', t('Equipar', 'Equip'), () => put(id), {
                'aria-label': t(`Equipar ${itemName(ITEMS[id])}`, `Equip ${itemName(ITEMS[id])}`),
              }),
            ),
          )
        : [
            el(
              'p',
              {},
              t(
                'Nada deste tipo no baú: a Loja da cidade vende peças comuns.',
                'Nothing of this kind in the chest: the town Shop sells common pieces.',
              ),
            ),
          ]),
    ),
  );
}
