// The town's windows (opened at its buildings, game/town.ts, and from its menu, game/crawl.ts townMenu): Party with each
// member's sheet (class, equipment, who goes), Tavern (recruits) and Shop. Rules in group.ts and chest.ts.

import { bonusOf, ITEMS, type ItemDef, SLOTS, type Slot } from '../shared/battle/equipment.ts';
import { SUB } from '../shared/battle/half.ts';
import { MAX_JUMP } from '../shared/battle/pathing.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';
import { buy, CHEST_KEY, EQUIP_KEY, equip, parseChest, parseEquip, sell } from './chest.ts';
import { unitFrom } from './dev-roster.ts';
import { choice, dialog, priceRow } from './dialog.ts';
import {
  changeClass,
  DEPLOY_MAX,
  dismiss,
  GROUP_KEY,
  GROUP_MAX,
  type Group,
  JOBS,
  type Member,
  parseGroup,
  RECRUIT_COST,
  recruit,
  toggleDeploy,
} from './group.ts';
import { abilityDetail, attrRows, stillFace } from './hud.ts';
import { abilityName, t, unitName } from './i18n.ts';
import { button, el } from './icons.ts';
import { sfx } from './sound.ts';
import { store } from './store.ts';

// a sheet's numbers as the battle counts them: Move and Jump in half tiles (Nov 15, Fernando: "everything in half
// tiles"); the party list shows them
export const statsLine = (d: { hp: number; speed: number; move: number; jump?: number }) => {
  const move = d.move * SUB,
    jump = (d.jump ?? MAX_JUMP) * SUB;
  return t(
    `Vida ${d.hp} · Velocidade ${d.speed} · Movimento ${move} · Salto ${jump}`,
    `HP ${d.hp} · Speed ${d.speed} · Move ${move} · Jump ${jump}`,
  );
};

// How to play's Move and Jump sentence, from the sheets so it follows a change. A leap needs 2 cells (a whole tile)
// to land level past a gap, so only Jump 4 or more clears one (Nov 15)
export function jumpHelp(): string {
  const j = (id: string) => (UNIT_DEFS[id].jump ?? MAX_JUMP) * SUB;
  return t(
    `Movimento e Salto contam em meias casas: o Salto do Lanceiro é ${j('lancer')}, o do Ladino e do Lacaio ${j('rogue')}, o dos outros ${j('warrior')}. Por passo se sobe ou desce metade do Salto em níveis; com Salto ${2 * SUB} ou mais também se voa 1 casa de água funda ou de buraco.`,
    `Move and Jump count in half tiles: the Lancer has Jump ${j('lancer')}, the Rogue and the Minion ${j('rogue')}, the rest ${j('warrior')}. Each step climbs or drops up to half the Jump in levels; Jump ${2 * SUB} or more also clears 1 tile of deep water or a gap.`,
  );
}

// Party screen (like the FFT formation): everyone in the party, who goes to the next battle (up to 4) and who stays in camp,
// with the painted face (portrait for a class without one), class and numbers; each row opens the sheet. Every member knows the whole kit of their class.
// Nov 13, delivery 5 of the design (docs/game-design/towns-party-equipment.md): recruits and class change
const loadGroup = () => parseGroup(store.json(GROUP_KEY));
const saveGroup = (g: Group) => store.set(GROUP_KEY, JSON.stringify(g));

export function openParty(back?: () => void) {
  const g = loadGroup();
  const again = () => openParty(back);
  const card = (m: Member) => {
    const u = unitFrom(m.cls, m.name),
      going = g.deployed.includes(m.id);
    const open = () => {
      d.close();
      openSheet(m, again);
    };
    return el(
      'li',
      {
        class: 'party-card',
        role: 'button',
        tabindex: '0',
        'aria-label': t(`Ficha de ${u.name}`, `${u.name}'s sheet`),
        onclick: open,
        onkeydown: (e: KeyboardEvent) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            open();
          }
        },
      },
      stillFace(m.cls, 'neutral'),
      el(
        'div',
        {},
        el('strong', {}, u.name),
        el(
          'span',
          { class: 'party-class' },
          ` · ${unitName(m.cls)} · ${going ? t('vai à batalha', 'in battle') : t('no acampamento', 'at camp')}`,
        ),
        el('p', { class: 'party-stats' }, statsLine(u)),
        el('p', { class: 'party-skills' }, u.abilities.map(abilityName).join(' · ')),
      ),
    );
  };
  const d = dialog(
    'party',
    t('Grupo', 'Party'),
    [
      el(
        'p',
        {},
        t(
          `${g.deployed.length} de ${DEPLOY_MAX} vão à batalha. Escolha alguém para trocar a classe ou quem vai.`,
          `${g.deployed.length} of ${DEPLOY_MAX} go to battle. Pick someone to change class or who goes.`,
        ),
      ),
      el(
        'ul',
        { class: 'party-list' },
        ...g.deployed.map((id) => g.members.find((m) => m.id === id)!).map(card),
        ...g.members.filter((m) => !g.deployed.includes(m.id)).map(card),
      ),
    ],
    { onBack: back },
  );
  d.overlay.querySelector<HTMLElement>('.party-card')?.focus();
}

const SLOT_NAME: Record<Slot, () => string> = {
  weapon: () => t('Arma', 'Weapon'),
  armor: () => t('Armadura', 'Armor'),
  accessory: () => t('Acessório', 'Accessory'),
};
const itemName = (it: ItemDef) => t(it.name, it.en);
// "+2 damage · +8 accuracy": only what the item changes, in the sheet's wording
export function itemStats(it: ItemDef): string {
  const parts: [number | undefined, string, string][] = [
    [it.hp, 'vida', 'HP'],
    [it.power, 'dano', 'damage'],
    [it.hit, 'acerto', 'hit'],
    [it.move && it.move * SUB, 'movimento', 'move'], // in half tiles, like every Move and Jump on screen
    [it.jump && it.jump * SUB, 'salto', 'jump'],
    [it.speed, 'velocidade', 'speed'],
  ];
  return parts
    .filter(([v]) => v)
    .map(([v, pt, en]) => `${v! > 0 ? '+' : ''}${v} ${t(pt, en)}`)
    .join(' · ');
}
const loadChest = () => parseChest(store.json(CHEST_KEY));
const loadEquip = () => parseEquip(store.json(EQUIP_KEY));

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
  gold < price ? t(`faltam ${price - gold}`, `${price - gold} short`) : '';

// the lab kit's gold counter on a window's head band (Shop, Tavern): small uppercase label, the number after a coin
const goldNote = (label: string, gold: number) =>
  el('p', { class: 'gold' }, el('span', { class: 'result-label' }, label), el('strong', {}, String(gold)));

// Shop (Nov 13, delivery 2: provisional on the map until the towns): buy with the chest gold, sell for half (as in FFT).
// Since Nov 15 the lab kit's list rows, buying and selling in turns: the 9 items fit at 1280x720 (a full chest scrolled
// the window to 905 px)
export function openShop(back?: () => void, tab: 'buy' | 'sell' = 'buy') {
  const chest = loadChest();
  const save = (c: ReturnType<typeof buy>) => {
    if (!c) return void sfx('cancel');
    store.set(CHEST_KEY, JSON.stringify(c));
    sfx('confirm');
    d.close();
    openShop(back, tab);
  };
  const d = dialog(
    'party shop',
    t('Loja', 'Shop'),
    [
      choice<'buy' | 'sell'>(
        t('Comprar ou vender', 'Buy or sell'),
        [
          ['buy', t('Comprar', 'Buy')],
          ['sell', t(`Vender (${chest.items.length})`, `Sell (${chest.items.length})`)],
        ],
        tab,
        (v) => {
          d.close();
          openShop(back, v);
        },
      ),
      ...(tab === 'buy'
        ? Object.values(ITEMS).map((it) =>
            priceRow(
              [itemName(it), el('small', {}, `${SLOT_NAME[it.slot]()} · ${itemStats(it)}`)],
              it.price,
              button('secondary', t('Comprar', 'Buy'), () => save(buy(chest, it.id)), {
                disabled: chest.gold < it.price,
              }),
              // too expensive: the button turns off and says under it how much is missing (before, it only went grey)
              shortBy(chest.gold, it.price),
            ),
          )
        : chest.items.length
          ? chest.items.map((id) =>
              priceRow(
                [itemName(ITEMS[id]), el('small', {}, SLOT_NAME[ITEMS[id].slot]())],
                Math.floor(ITEMS[id].price / 2),
                button('secondary', t('Vender', 'Sell'), () => save(sell(chest, id))),
              ),
            )
          : [el('p', {}, t('Vazio.', 'Empty.'))]),
    ],
    { onBack: back, note: goldNote(t('Ouro no baú', 'Gold in chest'), chest.gold) },
  );
  // the open tab keeps the focus, so switching by keyboard goes on from there
  d.overlay.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
}

// Unit sheet (like the FFT formation status screen): numbers, each ability with what it does (the ones still to come are
// marked), the 3 equipment slots and the party actions: class, go or not to battle, and dismiss (recruits only).
// Esc/✕ goes back to the list
// `at`: the button that had focus before the sheet rebuilt itself (every action closes and reopens the dialog): focus
// returns to the same place instead of jumping to the top, otherwise equipping by keyboard restarted the Tab walk each time
export function openSheet(m: Member, back: () => void, at = -1) {
  const u = unitFrom(m.cls, m.name);
  const def = UNIT_DEFS[m.cls];
  const buttons = () => [...d.overlay.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
  const again = (x: Member) => {
    const i = buttons().indexOf(document.activeElement as HTMLButtonElement);
    d.close();
    openSheet(x, back, i);
  };
  const row = (k: string, v: string | number) => [el('dt', {}, k), el('dd', {}, String(v))];
  const eq = loadEquip(),
    chest = loadChest(),
    mine = eq[m.id] ?? {};
  const b = bonusOf(mine);
  const g = loadGroup(),
    going = g.deployed.includes(m.id);
  // number with the equipment: "42 (+6)"
  const withB = (v: number, plus: number) => (plus ? `${v + plus} (${plus > 0 ? '+' : ''}${plus})` : String(v));
  const put = (slot: Slot, id: string | null) => {
    const r = equip(loadChest(), loadEquip(), m.id, slot, id);
    if (!r) return void sfx('cancel');
    store.set(CHEST_KEY, JSON.stringify(r.chest));
    store.set(EQUIP_KEY, JSON.stringify(r.eq));
    sfx('confirm');
    again(m);
  };
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
  const fire = () => {
    const r = dismiss(loadGroup(), loadEquip(), loadChest(), m.id);
    if (!r) return void sfx('cancel');
    saveGroup(r.group);
    store.set(EQUIP_KEY, JSON.stringify(r.eq));
    store.set(CHEST_KEY, JSON.stringify(r.chest));
    sfx('confirm');
    d.close();
    back();
  };
  // two columns on PC (13/11, design system): who the unit is and the decisions on the left, what it knows and wears on
  // the right; in one column the sheet was 927 px inside a 644 px dialog and equipment sat below the fold
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
              el(
                'dl',
                { class: 'keys' },
                ...row(t('Vida', 'HP'), withB(u.hp, b.hp)),
                ...row(t('Velocidade', 'Speed'), withB(u.speed, b.speed)),
                ...row(t('Movimento', 'Move'), withB(u.move * SUB, b.move * SUB)),
                ...row(t('Salto', 'Jump'), withB((u.jump ?? def.jump ?? MAX_JUMP) * SUB, b.jump * SUB)),
                ...(b.hit ? row(t('Acerto', 'Hit'), `+${b.hit}`) : []),
                // the equipment's damage counts in both powers, as the battle sheet does
                ...attrRows({ ...def, power: b.power }).flatMap(([k, v]) => row(k, v)),
              ),
            ),
          ),
          el(
            'div',
            { class: 'menu-actions' },
            button(
              'primary',
              going ? t('Deixar no acampamento', 'Leave at camp') : t('Levar à batalha', 'Bring to battle'),
              deploy,
              { disabled: !going && g.deployed.length >= DEPLOY_MAX },
            ),
            ...(m.recruit ? [button('secondary', t('Dispensar', 'Dismiss'), fire)] : []),
          ),
          ...(!going && g.deployed.length >= DEPLOY_MAX
            ? [
                el(
                  'p',
                  {},
                  t(
                    `Já vão ${DEPLOY_MAX}: deixe alguém no acampamento antes.`,
                    `${DEPLOY_MAX} already go: leave someone at camp first.`,
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
        el(
          'div',
          {},
          el('h3', {}, t('Habilidades', 'Abilities')),
          el('dl', { class: 'keys' }, ...u.abilities.flatMap((a) => row(abilityName(a), abilityDetail(a)))),
          el('h3', {}, t('Equipamento', 'Equipment')),
          // each slot: the current item and the chest items that fit it (Equip); Unequip returns it to the chest
          el(
            'dl',
            { class: 'keys' },
            ...SLOTS.flatMap((slot) => [
              el('dt', {}, SLOT_NAME[slot]()),
              el(
                'dd',
                {},
                mine[slot]
                  ? `${itemName(ITEMS[mine[slot]!])} (${itemStats(ITEMS[mine[slot]!])}) `
                  : t('vazio ', 'empty '),
                ...(mine[slot] ? [button('secondary', t('Tirar', 'Remove'), () => put(slot, null))] : []),
                ...[...new Set(chest.items.filter((id) => ITEMS[id].slot === slot))].map((id) =>
                  button(
                    'secondary',
                    t(`Equipar ${itemName(ITEMS[id])}`, `Equip ${itemName(ITEMS[id])}`),
                    () => put(slot, id),
                    { title: itemStats(ITEMS[id]) },
                  ),
                ),
              ),
            ]),
          ),
          ...(chest.items.length
            ? []
            : [
                el(
                  'p',
                  {},
                  t('O baú está vazio: compre na Loja da cidade.', 'The chest is empty: buy at the town Shop.'),
                ),
              ]),
        ),
      ),
    ],
    { onBack: back },
  );
  (buttons()[at] ?? d.overlay.querySelector<HTMLButtonElement>('.primary')!).focus();
}
