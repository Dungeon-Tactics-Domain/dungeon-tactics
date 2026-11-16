import { SLOTS, withGear, worn } from '../shared/battle/equipment.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';
import { abilityDetail, regenLine } from './battle-text.ts';
import { CHEST_KEY, CHEST_MAX, EQUIP_KEY } from './chest.ts';
import { unitFrom } from './dev-roster.ts';
import { choice, dialog, secondTap } from './dialog.ts';
import { changeClass, DEPLOY_MAX, dismiss, JOBS, type Member, toggleDeploy } from './group.ts';
import { poolGauges, stillFace } from './hud-pieces.ts';
import { abilityName, t, unitName } from './i18n.ts';
import { button, el } from './icons.ts';
import { itemName, itemStats, loadChest, loadEquip, RARITY, sheetRows, slotName } from './sheet-lines.ts';
import { sfx } from './sound.ts';
import { store } from './store.ts';
import { openGear } from './town-gear.ts';
import { chestFull, loadGroup, saveGroup, statsLine } from './town-ui.ts';
import { focused, refocus } from './window-focus.ts';

const row = (k: string, v: string | number) => [el('dt', {}, k), el('dd', {}, String(v))];
// Unit sheet (like the FFT formation status screen): numbers, each ability with what it does (the ones still to come are
// marked), what each of the 7 slots holds and the party actions: class, go or not to battle, and dismiss (recruits only).
// Since Nov 16 (slice 3) each number is the total the battle counts with where it comes from, and Change equipment opens
// the Equipment window. Esc/✕ goes back to the list
// `at`: the button that had focus before the sheet rebuilt itself (every action closes and reopens the dialog): focus
// returns to the same place instead of jumping to the top, otherwise acting by keyboard restarted the Tab walk each time
export function openSheet(m: Member, back: () => void, at = '') {
  const u = unitFrom(m.cls, m.name);
  const again = (x: Member) => {
    const i = focused();
    d.close();
    openSheet(x, back, i);
  };
  const mine = loadEquip()[m.id] ?? {};
  const sheet = withGear(UNIT_DEFS[m.cls], mine);
  const g = loadGroup(),
    going = g.deployed.includes(m.id),
    alone = going && g.deployed.length === 1; // someone always goes (toggleDeploy refuses it)
  // dismissing returns the recruit's pieces to the chest, which keeps CHEST_MAX
  const noRoom = loadChest().items.length + Object.values(mine).length > CHEST_MAX;
  const deploy = () => {
    const r = toggleDeploy(loadGroup(), m.id);
    if (!r) return void sfx('cancel');
    saveGroup(r);
    sfx('confirm');
    again(m);
  };
  const setClass = (c: (typeof JOBS)[number]) => {
    saveGroup(changeClass(loadGroup(), m.id, c));
    sfx('confirm');
    again({ ...m, cls: c });
  };
  // the recruit leaves for good: a 2nd tap like Delete on a saved game (Fernando's grill of Nov 16)
  const fire = (e: Event) => {
    if (!secondTap(e, t('Confirmar: dispensar', 'Confirm: dismiss'))) return;
    const r = dismiss(loadGroup(), loadEquip(), loadChest(), m.id);
    if (!r) return void sfx('cancel');
    saveGroup(r.group);
    store.set(EQUIP_KEY, JSON.stringify(r.eq));
    store.set(CHEST_KEY, JSON.stringify(r.chest));
    sfx('confirm');
    d.close();
    back();
  };
  // the right column shows one at a time (Nov 16): the attributes, the totals the battle sheet counts with where each
  // comes from (dev-roster.ts builds it with the same withGear), what each of the 7 slots holds (changing it is the
  // Equipment window's), or the abilities; all at once scrolled at 1280x720
  const tabs = {
    attrs: () =>
      el(
        'dl',
        { class: 'keys attrs' },
        ...sheetRows(m.cls, mine).flatMap(([k, v, from]) => [
          el('dt', {}, k),
          el('dd', {}, v, from ? el('small', { class: 'from' }, from) : null),
        ]),
      ),
    gear: () =>
      el(
        'dl',
        { class: 'keys attrs' },
        ...SLOTS.flatMap((s) => {
          const it = worn(mine, s);
          return [
            el('dt', {}, slotName(s)),
            el(
              'dd',
              {},
              it ? itemName(it) : t('vazio', 'empty'),
              it ? el('small', { class: 'from' }, `${RARITY[it.rarity]()} · ${itemStats(it)}`) : null,
            ),
          ];
        }),
      ),
    skills: () => el('dl', { class: 'keys' }, ...u.abilities.flatMap((a) => row(abilityName(a), abilityDetail(a)))),
  };
  const pane = el('div', {}, tabs.attrs());
  const tab = choice<keyof typeof tabs>(
    t('O que ver', 'What to show'),
    [
      ['attrs', t('Atributos', 'Attributes')],
      ['gear', t('Equipamento', 'Equipment')],
      ['skills', t('Habilidades', 'Abilities')],
    ],
    'attrs',
    (v) => pane.replaceChildren(tabs[v]()),
  );
  tab.classList.add('sheet-tabs');
  // two columns on PC (13/11, design system): who the unit is and the decisions on the left, its numbers, what it wears
  // and what it knows on the right; in one column the sheet was 927 px inside a 644 px dialog
  const d = dialog(
    'party sheet',
    u.name,
    [
      el(
        'div',
        { class: 'sheet-cols' },
        el(
          'div',
          {},
          el(
            'div',
            { class: 'party-card' },
            stillFace(m.cls, 'neutral', true),
            el(
              'div',
              {},
              el('strong', {}, unitName(m.cls)),
              el('p', { class: 'party-stats' }, statsLine(sheet)),
              // the class's mana or stamina pool, full as it enters a battle, and its regen (Nov 16)
              ...poolGauges(sheet),
              regenLine(sheet) ? el('p', { class: 'party-stats' }, regenLine(sheet)) : null,
            ),
          ),
          el(
            'div',
            { class: 'menu-actions' },
            button(
              'primary',
              going ? t('Deixar na cidade', 'Leave in town') : t('Levar à batalha', 'Bring to battle'),
              deploy,
              { disabled: alone || (!going && g.deployed.length >= DEPLOY_MAX) },
            ),
            button('secondary', t('Trocar equipamento', 'Change equipment'), () => {
              const i = focused();
              d.close();
              openGear(m, () => openSheet(m, back, i)); // back on this button
            }),
            ...(m.recruit ? [button('secondary', t('Dispensar', 'Dismiss'), fire, { disabled: noRoom })] : []),
          ),
          ...(m.recruit && noRoom
            ? [el('p', {}, t(`Dispensar: ${chestFull()}, venda peças antes.`, `Dismiss: ${chestFull()}, sell first.`))]
            : []),
          ...(alone
            ? [
                el(
                  'p',
                  {},
                  t(
                    'Só este vai à batalha: leve outro antes de deixá-lo na cidade.',
                    'Only this one goes to battle: bring someone else before leaving them in town.',
                  ),
                ),
              ]
            : []),
          ...(!going && g.deployed.length >= DEPLOY_MAX
            ? [
                el(
                  'p',
                  {},
                  t(
                    `Já vão ${DEPLOY_MAX}: deixe alguém na cidade antes.`,
                    `${DEPLOY_MAX} already go: leave someone in town first.`,
                  ),
                ),
              ]
            : []),
          // class change (like FFT's Job): the numbers and abilities become those of the new class; the equipment stays
          el('h3', {}, t('Classe', 'Class')),
          choice(
            t(
              'Trocar muda os números e as habilidades; o equipamento fica.',
              'Changing swaps stats and abilities; equipment stays.',
            ),
            JOBS.map((c) => [c, unitName(c)]),
            m.cls,
            (c) => c !== m.cls && setClass(c),
          ),
          button('secondary', t('Voltar ao grupo', 'Back to party'), () => {
            d.close();
            back();
          }),
        ),
        el('div', {}, tab, pane),
      ),
    ],
    { onBack: back },
  );
  refocus(d.overlay, at, '.primary');
}
