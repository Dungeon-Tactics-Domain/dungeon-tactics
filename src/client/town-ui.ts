// The town's windows (opened at its buildings, game/town.ts, and from its menu, game/crawl.ts townMenu): Party with each
// member's sheet (class, equipment, who goes) and their Equipment, Tavern (recruits) and Shop. Rules in group.ts and chest.ts.

import { CONSUMABLES } from '../content/items.ts';
import { COMBAT } from '../shared/battle/combat.ts';
import {
  ITEMS,
  type ItemDef,
  type Kind,
  kindOf,
  type Loadout,
  type Rarity,
  SLOTS,
  type Slot,
  withGear,
  worn,
} from '../shared/battle/equipment.ts';
import { SUB } from '../shared/battle/half.ts';
import { MAX_JUMP } from '../shared/battle/pathing.ts';
import { dodgeOf, ELEMENTS, resistOf, UNIT_DEFS, type UnitDef } from '../shared/battle/units.ts';
import { abilityDetail, defenceRows, ELEMENT_NAME, regenLine, signed } from './battle-text.ts';
import { buy, CHEST_KEY, CHEST_MAX, EQUIP_KEY, equip, parseChest, parseEquip, sell } from './chest.ts';
import { unitFrom } from './dev-roster.ts';
import { choice, dialog, priceRow, secondTap } from './dialog.ts';
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
import { poolGauges, stillFace } from './hud-pieces.ts';
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
  const g = loadGroup(),
    eq = loadEquip();
  const again = () => openParty(back);
  const card = (m: Member) => {
    const u = unitFrom(m.cls, m.name),
      going = g.deployed.includes(m.id),
      sheet = withGear(UNIT_DEFS[m.cls], eq[m.id]); // the numbers with the pieces on, as the battle counts them
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
        'aria-label': t(`Ficha de ${u.name}`, `${u.name}’s sheet`),
        onclick: open,
        onkeydown: (e: KeyboardEvent) => {
          // Space too, like a real button (the design system's Confirm)
          if (e.key === 'Enter' || e.key === ' ') {
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
        el('p', { class: 'party-stats' }, statsLine(sheet)),
        // resistances and dodge (Nov 15); the sheet shows every attribute
        el(
          'p',
          { class: 'party-stats' },
          defenceRows(sheet)
            .map(([k, v]) => `${k} ${v}`)
            .join(' · '),
        ),
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
        { class: 'party-list arrow-walk' }, // the arrows walk the rows (dialog.ts)
        ...g.deployed.map((id) => g.members.find((m) => m.id === id)!).map(card),
        ...g.members.filter((m) => !g.deployed.includes(m.id)).map(card),
      ),
    ],
    { onBack: back },
  );
  d.overlay.querySelector<HTMLElement>('.party-card')?.focus();
}

const KIND_NAME: Record<Kind, () => string> = {
  main: () => t('Mão principal', 'Main hand'),
  off: () => t('Mão secundária', 'Off hand'),
  head: () => t('Cabeça', 'Head'),
  body: () => t('Corpo', 'Body'),
  legs: () => t('Pernas', 'Legs'),
  accessory: () => t('Acessório', 'Accessory'),
};
const slotName = (s: Slot) => (s === 'acc1' || s === 'acc2' ? `${KIND_NAME.accessory()} ${s.at(-1)}` : KIND_NAME[s]());
// rarity in words (a piece, "peça", is feminine in Portuguese): never by colour alone
const RARITY: Record<Rarity, () => string> = {
  common: () => t('comum', 'common'),
  rare: () => t('rara', 'rare'),
  epic: () => t('épica', 'epic'),
};
const itemName = (it: ItemDef) => t(it.name, it.en);

// The sheet's numbers, one line each (Nov 16, slice 3): `of` reads the battle sheet as the rules do (resistOf and dodgeOf
// clamp), `piece` what one piece adds, Move and Jump in half tiles like every screen. A line with no `of` is a stat no
// battle reads yet (equipment.ts PENDING: its pieces just add up); `more` is shown only when something gives it
interface Line {
  name: () => string; // after a piece's number: "+10% física"
  label?: () => string; // the sheet row, when not the name with a capital
  unit?: '%';
  signed?: true; // a resistance: "−10%" and "+0%" on the sheet
  of?: (d: UnitDef) => number;
  // the same reading on a charging unit (physical and magic resistance): the drop comes off the raw sum before the cap,
  // so a resistance past the cap still counts there (combat.ts; whether that is right is Fernando's call)
  charging?: (d: UnitDef) => number;
  piece: (it: ItemDef) => number;
  more?: true;
}
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const LINES: Line[] = [
  { name: () => t('vida', 'HP'), of: (d) => d.hp, piece: (it) => it.hp ?? 0 },
  { name: () => t('poder físico', 'physical power'), of: (d) => d.physPower ?? 0, piece: (it) => it.physPower ?? 0 },
  { name: () => t('poder mágico', 'magic power'), of: (d) => d.magPower ?? 0, piece: (it) => it.magPower ?? 0 },
  { name: () => t('acerto', 'hit'), of: (d) => d.hit ?? 0, piece: (it) => it.hit ?? 0 },
  { name: () => t('esquiva', 'dodge'), unit: '%', of: dodgeOf, piece: (it) => it.dodge ?? 0 },
  {
    name: () => t('física', 'physical'),
    label: () => t('Resistência física', 'Physical resistance'),
    unit: '%',
    signed: true,
    of: (d) => resistOf(d, 'phys'),
    charging: (d) => resistOf(d, 'phys', -COMBAT.CHARGING_PHYS),
    piece: (it) => it.resist?.phys ?? 0,
  },
  {
    name: () => t('mágica', 'magic'),
    label: () => t('Resistência mágica', 'Magic resistance'),
    unit: '%',
    signed: true,
    of: (d) => resistOf(d, 'mag'),
    charging: (d) => resistOf(d, 'mag', -COMBAT.CHARGING_MAG),
    piece: (it) => it.resist?.mag ?? 0,
  },
  ...ELEMENTS.map(
    (e): Line => ({
      name: ELEMENT_NAME[e],
      label: () => t(`Resistência a ${ELEMENT_NAME[e]()}`, `${cap(ELEMENT_NAME[e]())} resistance`),
      unit: '%',
      signed: true,
      more: true,
      of: (d) => resistOf(d, e),
      piece: (it) => it.resist?.[e] ?? 0,
    }),
  ),
  { name: () => t('movimento', 'move'), of: (d) => d.move * SUB, piece: (it) => (it.move ?? 0) * SUB },
  { name: () => t('salto', 'jump'), of: (d) => (d.jump ?? MAX_JUMP) * SUB, piece: (it) => (it.jump ?? 0) * SUB },
  { name: () => t('velocidade', 'speed'), of: (d) => d.speed, piece: (it) => it.speed ?? 0 },
  { name: () => 'mana', more: true, piece: (it) => it.mana ?? 0 },
  { name: () => 'stamina', more: true, piece: (it) => it.stamina ?? 0 },
  { name: () => t('regeneração de mana', 'mana regen'), more: true, piece: (it) => it.manaRegen ?? 0 },
  { name: () => t('regeneração de vida', 'HP regen'), more: true, piece: (it) => it.hpRegen ?? 0 },
];
// a piece's number or a change, with its sign (the HUD's minus); the sheet's total
const plus = (l: Line, v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}${l.unit ?? ''}`;
const total = (l: Line, v: number) => (l.signed ? signed(v) : `${v}${l.unit ?? ''}`);
const soon = () => t('em breve', 'soon');
const stat = (l: Line, v: number) => `${plus(l, v)} ${l.name()}${l.of ? '' : ` (${soon()})`}`;
// what each worn piece adds to a line, in slot order
const pieces = (l: Line, load: Loadout | undefined) =>
  SLOTS.flatMap((s) => {
    const it = worn(load, s);
    const v = it ? l.piece(it) : 0;
    return it && v ? [{ it, v }] : [];
  });
const lineValue = (l: Line, def: UnitDef, load: Loadout | undefined) =>
  l.of ? l.of(withGear(def, load)) : pieces(l, load).reduce((s, p) => s + p.v, 0);

// "+20 poder físico · +5 acerto": only what the item changes, in the sheet's wording
export const itemStats = (it: ItemDef) =>
  LINES.filter((l) => l.piece(it))
    .map((l) => stat(l, l.piece(it)))
    .join(' · ');

// The Sheet's numbers (Nov 16, slice 3): each total as the battle counts it and, when a piece changes it, where it comes
// from: ["Vida", "235", "Guerreiro 210 · Elmo de ferro +25"]. When a limit took part of it (dodge 50, resistances 60) it
// says so with the raw sum, and for a resistance a charging unit loses, what is left then: the drop comes off the raw
// sum, so past the cap the pieces still count there (the coordinator's review of Nov 16: "capped" alone misled)
export function sheetRows(cls: string, load: Loadout | undefined): [label: string, total: string, from: string][] {
  const def = UNIT_DEFS[cls];
  return LINES.flatMap((l): [string, string, string][] => {
    const from = pieces(l, load),
      v = lineValue(l, def, load),
      own = l.of?.(def) ?? 0,
      raw = own + from.reduce((s, p) => s + p.v, 0);
    if (l.more && !v && !own && !from.length) return [];
    const parts = [
      ...(l.of ? [`${unitName(cls)} ${total(l, own)}`] : []),
      ...from.map((p) => `${itemName(p.it)} ${plus(l, p.v)}`),
    ];
    if (raw !== v) {
      const when = l.charging ? `; ${t('carregando', 'charging')}, ${total(l, l.charging(withGear(def, load)))}` : '';
      parts.push(`${t('no limite', 'capped')} (${t('bruto', 'raw')} ${total(l, raw)}${when})`);
    }
    return [
      [
        l.label?.() ?? cap(l.name()),
        `${total(l, v)}${l.of ? '' : ` (${soon()})`}`,
        from.length ? parts.join(' · ') : '',
      ],
    ];
  });
}

// what equipping `id` in `slot` (null: taking it off) changes on the sheet, as the rules read it: past a cap the
// change is what is left of it, and a resistance's change on a charging unit, read before the cap, comes apart when it
// differs
export function compare(cls: string, load: Loadout, slot: Slot, id: string | null): string {
  const def = UNIT_DEFS[cls],
    next: Loadout = { ...load, [slot]: id ?? undefined };
  const parts = LINES.flatMap((l) => {
    const d = lineValue(l, def, next) - lineValue(l, def, load);
    const c = l.charging ? l.charging(withGear(def, next)) - l.charging(withGear(def, load)) : d;
    return [...(d ? [stat(l, d)] : []), ...(c !== d ? [`${stat(l, c)} ${t('carregando', 'while charging')}`] : [])];
  });
  return parts.join(' · ') || t('nada muda', 'no change');
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
// why a piece cannot go into the chest (CHEST_MAX): under Buy and Remove, and before Dismiss
const chestFull = () => t(`baú cheio (${CHEST_MAX})`, `chest full (${CHEST_MAX})`);

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
        : [el('p', {}, t('Vazio.', 'Empty.'))],
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

const row = (k: string, v: string | number) => [el('dt', {}, k), el('dd', {}, String(v))];
// the focus a window that rebuilds itself after each action (Sheet, Equipment) gives back: the button with the same name,
// else `first`. By name, not position (review of Nov 16): equipping adds or drops rows, so the same index was another button
const nameOf = (b: Element) => b.getAttribute('aria-label') ?? b.textContent ?? '';
const refocus = (overlay: HTMLElement, name: string, first: string) =>
  (
    [...overlay.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')].find((b) => name && nameOf(b) === name) ??
    overlay.querySelector<HTMLButtonElement>(first)
  )?.focus();
const focused = () => (document.activeElement instanceof HTMLButtonElement ? nameOf(document.activeElement) : '');

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
    if (!secondTap(e, t('Toque de novo: dispensa', 'Tap again: dismisses'))) return;
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
              going ? t('Deixar no acampamento', 'Leave at camp') : t('Levar à batalha', 'Bring to battle'),
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
                    'Só este vai à batalha: leve outro antes de deixá-lo no acampamento.',
                    'Only this one goes to battle: bring someone else before leaving them at camp.',
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
        el('div', {}, tab, pane),
      ),
    ],
    { onBack: back },
  );
  refocus(d.overlay, at, '.primary');
}

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
