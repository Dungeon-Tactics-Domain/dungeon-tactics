// The Party screen (Nov 16, Fernando: the interface rebuilt on its FFT counterpart, the formation and unit menus): every
// member on the left (face, name, class, life and pool bars; who goes to battle first, under their count), the picked one's
// pages on the right: Status, Equipment, Abilities and Class. One window: the Sheet and the Equipment windows it had
// became its pages. Rules in group.ts and chest.ts.

import { type Slot, withGear } from '../shared/battle/equipment.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';
import { abilityDetail, regenLine } from './battle-text.ts';
import { CHEST_KEY, CHEST_MAX, EQUIP_KEY } from './chest.ts';
import { choice, dialog, secondTap } from './dialog.ts';
import { changeClass, DEPLOY_MAX, dismiss, JOBS, type Member, roster, toggleDeploy } from './group.ts';
import { gauge, poolGauges, stillFace } from './hud-pieces.ts';
import { abilityName, t, unitName } from './i18n.ts';
import { abilityIcon, button, type Child, el } from './icons.ts';
import { loadChest, loadEquip, sheetRows } from './sheet-lines.ts';
import { sfx } from './sound.ts';
import { store } from './store.ts';
import { gearPage } from './town-gear.ts';
import { chestFull, loadGroup, saveGroup, town3d } from './town-ui.ts';
import { focused, refocus } from './window-focus.ts';

const PAGES = ['status', 'gear', 'skills', 'job'] as const;
type Page = (typeof PAGES)[number];
const PAGE_NAME: Record<Page, () => string> = {
  status: () => 'Status',
  gear: () => t('Equipamento', 'Equipment'),
  skills: () => t('Habilidades', 'Abilities'),
  job: () => t('Classe', 'Class'),
};
// where the window opens: the member (the first of the list when absent or gone), the page, the Equipment page's open
// slot and the button that had the focus before it rebuilt itself
export interface PartyView {
  id?: string;
  page?: Page;
  slot?: Slot;
  at?: string;
}

export function openParty(back?: () => void, view: PartyView = {}) {
  if (town3d.party?.(back, view)) return;
  const g = loadGroup(),
    eq = loadEquip(),
    all = roster(g);
  const m = all.find((x) => x.id === view.id) ?? all[0],
    page = view.page ?? 'status',
    mine = eq[m.id] ?? {},
    sheet = withGear(UNIT_DEFS[m.cls], mine); // the numbers with the pieces on, as the battle counts them
  // every action saves and rebuilds the window on the same member and page, the focus back on the button of the same
  // name (window-focus.ts): by keyboard and gamepad the walk goes on from there
  const show = (next: PartyView = {}) => {
    const at = focused();
    d.close();
    openParty(back, { id: m.id, page, slot: view.slot, at, ...next });
  };
  const going = g.deployed.includes(m.id),
    alone = going && g.deployed.length === 1, // someone always goes (toggleDeploy refuses it)
    fullField = !going && g.deployed.length >= DEPLOY_MAX;
  // dismissing returns the recruit's pieces to the chest, which keeps CHEST_MAX
  const noRoom = loadChest().items.length + Object.values(mine).length > CHEST_MAX;
  const deploy = () => {
    const r = toggleDeploy(loadGroup(), m.id);
    if (!r) return void sfx('cancel');
    saveGroup(r);
    sfx('confirm');
    show();
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
    show({ id: undefined });
  };

  // FFT's unit list: face, name, class and the bars, full as the unit enters a battle; a row picks whose pages show
  const row = (x: Member) => {
    const s = withGear(UNIT_DEFS[x.cls], eq[x.id]);
    return button(
      x.id === m.id ? 'secondary picked' : 'secondary',
      [
        stillFace(x.cls, 'neutral'),
        el(
          'span',
          { class: 'roster-who' },
          el('strong', {}, x.name),
          el('span', { class: 'party-class' }, unitName(x.cls)),
          gauge('hp', t('Vida', 'HP'), s.hp, s.hp),
          ...poolGauges(s),
        ),
      ],
      () => show({ id: x.id }),
      { 'aria-label': `${x.name}, ${unitName(x.cls)}`, 'aria-current': String(x.id === m.id) },
    );
  };
  const reserve = all.slice(g.deployed.length);
  const list = el(
    'div',
    { class: 'menu-actions camp-list roster-list' }, // a window list: up and down walk its rows (dialog.ts)
    el(
      'h3',
      {},
      t(`Vão à batalha ${g.deployed.length}/${DEPLOY_MAX}`, `Battle party ${g.deployed.length}/${DEPLOY_MAX}`),
    ),
    ...all.slice(0, g.deployed.length).map(row),
    reserve.length ? el('h3', {}, t('Ficam na cidade', 'Staying in town')) : null,
    ...reserve.map(row),
  );

  const pages: Record<Page, () => Child[]> = {
    // who the unit is as the HUD's unit panel, who goes to battle, then each total the battle counts as a bar with where
    // it comes from (sheetRows)
    status: () => [
      el(
        'div',
        { class: 'unit-head' },
        stillFace(m.cls, 'neutral', true),
        el(
          'div',
          {},
          el('strong', {}, m.name),
          el('span', { class: 'party-class' }, unitName(m.cls)),
          gauge('hp', t('Vida', 'HP'), sheet.hp, sheet.hp),
          ...poolGauges(sheet),
          regenLine(sheet) ? el('p', {}, regenLine(sheet)) : null,
        ),
      ),
      el(
        'div',
        { class: 'menu-actions' },
        button(
          'primary',
          going ? t('Deixar na cidade', 'Leave in town') : t('Levar à batalha', 'Bring to battle'),
          deploy,
          {
            disabled: alone || fullField,
          },
        ),
        m.recruit ? button('secondary', t('Dispensar', 'Dismiss'), fire, { disabled: noRoom }) : null,
      ),
      // a disabled button says why
      alone
        ? el(
            'p',
            {},
            t(
              'Só este vai à batalha: leve outro antes de deixá-lo na cidade.',
              'Only this one goes to battle: bring someone else before leaving them in town.',
            ),
          )
        : null,
      fullField
        ? el(
            'p',
            {},
            t(
              `Já vão ${DEPLOY_MAX}: deixe alguém na cidade antes.`,
              `${DEPLOY_MAX} already go: leave someone in town first.`,
            ),
          )
        : null,
      m.recruit && noRoom
        ? el('p', {}, t(`Dispensar: ${chestFull()}, venda peças antes.`, `Dismiss: ${chestFull()}, sell first.`))
        : null,
      el(
        'dl',
        { class: 'stat-rows' },
        ...sheetRows(m.cls, mine).map(([k, v, from, share]) =>
          el(
            'div',
            {},
            el('dt', {}, k),
            el(
              'dd',
              {},
              // the number beside it says the same: the bar is decoration for a screen reader
              el(
                'span',
                { class: 'gauge-bar', 'aria-hidden': 'true' },
                el('i', { style: `width:${Math.round(share * 100)}%` }),
              ),
              el('strong', {}, v),
              from ? el('small', { class: 'from' }, from) : null,
            ),
          ),
        ),
      ),
    ],
    gear: () => [gearPage(m, view.slot ?? 'main', show)],
    skills: () => [
      el(
        'dl',
        { class: 'keys skills' },
        ...UNIT_DEFS[m.cls].abilities.flatMap((a) => [
          el('dt', {}, abilityIcon(a), abilityName(a)),
          el('dd', {}, abilityDetail(a)),
        ]),
      ),
    ],
    // class change (like FFT's Job): the numbers and abilities become those of the new class; the equipment stays
    job: () => [
      choice(
        t(
          'Trocar muda os números e as habilidades; o equipamento fica.',
          'Changing swaps stats and abilities; equipment stays.',
        ),
        JOBS.map((c) => [c, unitName(c)]),
        m.cls,
        (c) => {
          if (c === m.cls) return;
          saveGroup(changeClass(loadGroup(), m.id, c));
          sfx('confirm');
          show();
        },
      ),
    ],
  };
  const tabs = choice<Page>(
    t('Página', 'Page'),
    PAGES.map((p) => [p, PAGE_NAME[p]()]),
    page,
    (p) => show({ page: p }),
  );
  tabs.classList.add('roster-tabs');
  const d = dialog(
    'party roster',
    t('Grupo', 'Party'),
    [
      el(
        'div',
        { class: 'roster-cols' },
        list,
        el(
          'section',
          { class: 'roster-page', 'aria-label': `${m.name}: ${PAGE_NAME[page]()}` },
          tabs,
          ...pages[page](),
        ),
      ),
    ],
    { onBack: back },
  );
  // left and right turn the pages (FFT's paging) wherever the focus is; on a tab the focus follows the page
  d.overlay.addEventListener('keydown', (e) => {
    const dir = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
    if (!dir) return;
    e.preventDefault();
    const next = PAGES[(PAGES.indexOf(page) + dir + PAGES.length) % PAGES.length];
    show(tabs.contains(document.activeElement) ? { page: next, at: PAGE_NAME[next]() } : { page: next });
  });
  // no button of that name left (a piece equipped, a member dismissed, the first opening): the page's own start
  refocus(
    d.overlay,
    view.at ?? '',
    view.at === undefined
      ? '.roster-list .picked'
      : page === 'gear'
        ? '.slot-list [aria-pressed="true"]'
        : page === 'status'
          ? '.roster-page .primary:not(:disabled)'
          : '.roster-tabs [aria-pressed="true"]',
  );
}
