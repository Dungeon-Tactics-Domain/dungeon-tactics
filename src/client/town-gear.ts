// The equipment window: the 7 slots, compare, swap and the chest.

import { ITEMS, kindOf, SLOTS, type Slot, worn } from '../shared/battle/equipment.ts';
import { CHEST_KEY, CHEST_MAX, EQUIP_KEY, equip } from './chest.ts';
import { unitFrom } from './dev-roster.ts';
import { choice, dialog, priceRow } from './dialog.ts';
import type { Member } from './group.ts';
import { t } from './i18n.ts';
import { button, el } from './icons.ts';
import { compare, itemName, itemStats, loadChest, loadEquip, RARITY, slotName } from './sheet-lines.ts';
import { sfx } from './sound.ts';
import { store } from './store.ts';
import { chestFull } from './town-ui.ts';
import { focused, refocus } from './window-focus.ts';

// Equipment window (Nov 16, slice 3: 7 slots, compare, swap, chest): the slots on the left with what each holds, the
// open one on the right: its piece with what it gives and Remove, then the chest's pieces of its kind, each with what it
// would change on the sheet and Equip. Every action rebuilds the window on the same slot; Esc/✕ goes back to the Sheet
export function openGear(m: Member, back: () => void, slot: Slot = 'main', at = '') {
  const name = unitFrom(m.cls, m.name).name;
  const chest = loadChest(),
    mine = loadEquip()[m.id] ?? {},
    full = chest.items.length >= CHEST_MAX;
  const put = (s: Slot, id: string | null) => {
    const r = equip(loadChest(), loadEquip(), m.id, s, id);
    if (!r) return void sfx('cancel');
    store.set(CHEST_KEY, JSON.stringify(r.chest));
    store.set(EQUIP_KEY, JSON.stringify(r.eq));
    sfx('confirm');
    const i = focused();
    d.close();
    openGear(m, back, s, i);
  };
  const panel = (s: Slot) => {
    const it = worn(mine, s);
    const fits = [...new Set(chest.items)].filter((id) => ITEMS[id].kind === kindOf(s));
    return [
      el('h3', {}, slotName(s)),
      it
        ? priceRow(
            [itemName(it), el('small', {}, `${RARITY[it.rarity]()} · ${itemStats(it)}`)],
            null,
            button('secondary', t('Tirar', 'Remove'), () => put(s, null), {
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
              [itemName(ITEMS[id]), el('small', {}, `${RARITY[ITEMS[id].rarity]()} · ${compare(m.cls, mine, s, id)}`)],
              null,
              button('secondary', t('Equipar', 'Equip'), () => put(s, id), {
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
    ];
  };
  const body = el('div', { class: 'menu-body' }, ...panel(slot));
  // the slots as Options' section column: picking one shows it on the right at once
  const nav = choice(
    t('Espaços', 'Slots'),
    SLOTS.map((s): [Slot, string] => {
      const it = worn(mine, s);
      return [s, `${slotName(s)}: ${it ? itemName(it) : t('vazio', 'empty')}`];
    }),
    slot,
    (s) => body.replaceChildren(...panel(s)),
  );
  nav.classList.add('menu-nav');
  const d = dialog(
    'party gear',
    t(`Equipamento de ${name}`, `${name}'s equipment`),
    [el('div', { class: 'menu-layout' }, nav, body)],
    { onBack: back },
  );
  refocus(d.overlay, at, '[aria-pressed="true"]');
}
