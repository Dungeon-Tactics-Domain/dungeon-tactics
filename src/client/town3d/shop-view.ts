// Pure side of the 3D Shop and Tavern (town3d.ts draws them): the same counter the HTML windows build (town-shop.ts:
// commands, the list with each price, the picked row's box with its action and why it is off), as a page laid out like
// FFT: The Ivalice Chronicles' Inventory (labs refs/fft-ivalice/49) with the Tavern's plaques on the left (61). The
// wording and the numbers come from the same helpers as the HTML ones. No DOM or Three here; tested in
// tests/town3d.test.ts.
import { CONSUMABLES } from '../../content/items.ts';
import { ITEMS } from '../../shared/battle/equipment.ts';
import { UNIT_DEFS } from '../../shared/battle/units.ts';
import { defenceRows } from '../battle-text.ts';
import { CHEST_MAX, type Chest, type Equip } from '../chest.ts';
import type { Act } from '../glyphs.ts';
import { GROUP_MAX, type Group, JOBS, RECRUIT_COST } from '../group.ts';
import { abilityName, t, unitName } from '../i18n.ts';
import { itemName, itemStats, KIND_NAME, RARITY } from '../sheet-lines.ts';
import { fitLine, ownedOf, ownedText } from '../town-shop.ts';
import { chestFull, shortBy, statsLine } from '../town-ui.ts';
import { chrome, fill, type Hit, type Item, type Page, plaques, text } from './page.ts';
import { C } from './town-layout.ts';

interface Row {
  key: string;
  head?: string; // a heading before the row (Gear, Consumables)
  face?: string;
  name: string;
  kind: string;
  own?: number;
  price: number;
  why: string; // why its action is off, in words
}
interface Detail {
  head: string;
  face?: string;
  name: string;
  sub: string;
  gives: string;
  pairs: [label: string, value: string][];
  section?: string; // a heading and the block under it
  fit?: string;
  said?: string; // what just happened here
  action: string;
}
interface Counter {
  crumbs: string[];
  gold: [label: string, value: number];
  note?: string;
  commands: { id: string; label: string; picked?: boolean }[];
  rows: Row[];
  empty: string;
  sel: string;
  detail: (r: Row) => Detail;
}

export const HINTS = (): [Act, string][] => [
  ['confirm', t('escolher', 'choose')],
  ['cancel', t('sair', 'leave')],
];

// Hit ids: `cmd:<command>`, `row:<key>` and `act`, the picked row's action. Picking a row is not buying: the row in
// focus shows in the box, pressing it moves the cursor to `act` (town3d-screens.ts)
function counter(o: Counter): Page {
  const { list: L, box: B } = C;
  const cmd = plaques(o.commands);
  const items: Item[] = [];
  const hits: Hit[] = [...cmd.hits];
  const picked = o.rows.find((r) => r.key === o.sel) ?? o.rows[0];
  // the list: a heading takes a row of its own
  let n = 0;
  const rowY = (i: number) => L.y + C.head + i * C.rowH;
  for (const r of o.rows) {
    if (r.head) {
      items.push(
        fill({ x: L.x + 12, y: rowY(n) + 14, w: L.w - 24, h: C.rowH - 24 }, 'band', { row: n }),
        text(r.head, L.x + C.name, rowY(n) + C.rowH / 2, 24, 'ink', { row: n }),
      );
      n++;
    }
    const mid = rowY(n) + C.rowH / 2,
      left = L.x + (r.face ? 86 : C.name),
      ink = r.why ? 'off' : 'ink';
    if (r.face) items.push({ k: 'face', box: { x: L.x + C.face, y: rowY(n) + 5, w: 56, h: 56 }, def: r.face, row: n });
    items.push(
      text(r.name, left, mid, 30, 'ink', { max: L.x + C.kind - left - 12, row: n }),
      text(r.kind, L.x + C.kind, mid, 22, 'soft', { max: 150, row: n }),
      text(String(r.price), L.x + C.price, mid, 30, ink, { align: 'r', row: n }),
    );
    if (r.own) items.push(text(String(r.own), L.x + C.own, mid, 26, 'soft', { align: 'r', row: n }));
    hits.push({
      id: `row:${r.key}`,
      box: { x: L.x, y: rowY(n), w: L.w, h: C.rowH },
      name: `${r.name}, ${r.price}`,
      on: 'paper',
      picked: r === picked,
      row: n,
    });
    n++;
  }
  const page: Item[] = [
    ...chrome({
      crumbs: o.crumbs,
      gold: o.gold,
      note: o.note,
      help: picked ? picked.why || o.detail(picked).gives : o.empty,
      hints: HINTS(),
    }),
    ...cmd.items,
    { k: 'paper', box: L, head: C.head },
    text(o.crumbs.at(-1)!, L.x + C.name, L.y + C.head / 2, 26, 'soft'),
    text(t('Tem', 'Own'), L.x + C.own, L.y + C.head / 2, 22, 'soft', { align: 'r' }),
    text(t('Preço', 'Price'), L.x + C.price, L.y + C.head / 2, 22, 'soft', { align: 'r' }),
    ...items,
  ];
  if (!picked)
    return {
      items: [...page, text(o.empty, L.x + C.name, L.y + C.head + 30, 26, 'soft', { wrap: L.w - 2 * C.name })],
      hits,
    };
  // the picked row's box
  const d = o.detail(picked),
    x = B.x + C.pad,
    w = B.w - 2 * C.pad,
    top = B.y + C.head;
  page.push(
    { k: 'paper', box: B, head: C.head },
    text(d.head, x, B.y + C.head / 2, 26, 'soft', { max: w }),
    text(d.name, x, top + 40, 34, 'ink', { max: w - (d.face ? 130 : 0) }),
    text(d.sub, x, top + 80, 22, 'soft', { max: w - (d.face ? 130 : 0) }),
    text(d.gives, x, top + 108, 24, 'ink', { wrap: w - (d.face ? 130 : 0), maxH: 96 }),
  );
  if (d.face) page.push({ k: 'face', box: { x: B.x + B.w - C.pad - 120, y: top + 16, w: 120, h: 120 }, def: d.face });
  d.pairs.forEach(([k, v], i) => {
    const y = top + 232 + i * 36;
    page.push(text(k, x, y, 22, 'soft'), text(v, x + w, y, 24, 'ink', { align: 'r', max: w - 150 }));
  });
  const under = top + 232 + d.pairs.length * 36;
  if (d.section)
    page.push(fill({ x, y: under, w, h: 34 }, 'band'), text(d.section, x + 10, under + 17, 22, 'ink', { max: w - 20 }));
  if (d.fit) page.push(text(d.fit, x, under + 44, 20, 'ink', { wrap: w, maxH: C.act.y - 70 - under - 44 }));
  const note = d.said || picked.why;
  if (note) page.push(text(note, x, C.act.y - 62, 22, d.said ? 'up' : 'down', { wrap: w, maxH: 56 }));
  page.push(
    text(d.action, C.act.x + C.act.w / 2, C.act.y + C.act.h / 2, 28, picked.why ? 'dim' : 'light', {
      align: 'c',
      max: C.act.w - 100,
    }),
  );
  hits.push({ id: 'act', box: C.act, name: d.action, on: 'dark', off: !!picked.why });
  return {
    items: page,
    hits,
    list: { box: { x: L.x, y: L.y + C.head, w: L.w, h: L.h - C.head }, rowH: C.rowH, rows: n },
  };
}

export type ShopTab = 'buy' | 'sell';
export interface ShopState {
  chest: Chest;
  eq: Equip;
  group: Group;
}

// The Shop: Buy lists the common pieces and then the consumables (listed, off until a battle can use them); Sell one
// row per kind of piece in the chest, for half the price
export function shopPage({ chest, eq, group: g }: ShopState, tab: ShopTab, sel: string): Page {
  const full = chest.items.length >= CHEST_MAX;
  const later = t('usar em batalha vem depois', 'using it in battle comes later');
  // who goes to battle first, as the Party lists them
  const members = [...g.members].sort((a, b) => Number(g.deployed.includes(b.id)) - Number(g.deployed.includes(a.id)));
  const fits = (id: string) =>
    members.map((m) => `${m.name} · ${unitName(m.cls)}: ${fitLine(m.cls, eq[m.id] ?? {}, ITEMS[id])}`).join('\n');
  const piece = (id: string, price: [string, string], action: string): Detail => ({
    head: KIND_NAME[ITEMS[id].kind](),
    name: itemName(ITEMS[id]),
    sub: `${KIND_NAME[ITEMS[id].kind]()} · ${RARITY[ITEMS[id].rarity]()}`,
    gives: itemStats(ITEMS[id]),
    pairs: [price, [t('No grupo', 'In the party'), ownedText(ownedOf(chest, eq, id))]],
    section: t('Quem pode usar: qualquer classe', 'Who can use it: any class'),
    fit: fits(id),
    action,
  });
  const buy: Row[] = [
    ...Object.values(ITEMS)
      .filter((it) => it.rarity === 'common')
      .map((it, i) => ({
        key: it.id,
        head: i ? undefined : t('Peças', 'Gear'),
        name: itemName(it),
        kind: KIND_NAME[it.kind](),
        own: ownedOf(chest, eq, it.id).reduce((a, b) => a + b),
        price: it.price,
        why: full ? chestFull() : shortBy(chest.gold, it.price),
      })),
    ...CONSUMABLES.map((c, i) => ({
      key: c.id,
      head: i ? undefined : t('Consumíveis', 'Consumables'),
      name: t(c.name, c.en),
      kind: '',
      price: c.price,
      why: later,
    })),
  ];
  const sell: Row[] = [...new Set(chest.items)].map((id) => ({
    key: id,
    name: itemName(ITEMS[id]),
    kind: `${KIND_NAME[ITEMS[id].kind]()} · ${RARITY[ITEMS[id].rarity]()}`,
    own: ownedOf(chest, {}, id)[0],
    price: Math.floor(ITEMS[id].price / 2),
    why: '',
  }));
  return counter({
    crumbs: [t('Loja', 'Shop'), tab === 'buy' ? t('Comprar', 'Buy') : t('Vender', 'Sell')],
    gold: [t('Ouro no baú', 'Gold in chest'), chest.gold],
    commands: [
      { id: 'cmd:buy', label: t('Comprar', 'Buy'), picked: tab === 'buy' },
      {
        id: 'cmd:sell',
        label: t(`Vender (${chest.items.length})`, `Sell (${chest.items.length})`),
        picked: tab === 'sell',
      },
      { id: 'cmd:leave', label: t('Sair', 'Leave') },
    ],
    rows: tab === 'buy' ? buy : sell,
    empty: t(
      'Nada para vender. O equipamento guardado no baú aparece aqui.',
      'Nothing to sell. Spare gear in the chest shows up here.',
    ),
    sel,
    detail: (r) => {
      const c = CONSUMABLES.find((x) => x.id === r.key);
      if (c)
        return {
          head: t('Consumível', 'Consumable'),
          name: r.name,
          sub: '',
          gives: t(...c.use),
          pairs: [[t('Preço', 'Price'), String(c.price)]],
          action: t('Comprar', 'Buy'),
        };
      return tab === 'buy'
        ? piece(r.key, [t('Preço', 'Price'), String(r.price)], t('Comprar', 'Buy'))
        : piece(
            r.key,
            [t('Vende por', 'Sells for'), t(`${r.price} (metade do preço)`, `${r.price} (half the price)`)],
            t('Vender', 'Sell'),
          );
    },
  });
}

// The Tavern: one recruit of any class for gold, up to the party cap. `said`: who just joined, on the box of the class
// they came from
export function barPage(gold: number, g: Group, sel: string, said = ''): Page {
  const party = g.members.length,
    full = party >= GROUP_MAX;
  return counter({
    crumbs: [t('Taverna', 'Tavern'), t('Recrutar', 'Recruit')],
    gold: [t('Ouro', 'Gold'), gold],
    note: t(`Grupo ${party} de ${GROUP_MAX}`, `Party ${party} of ${GROUP_MAX}`),
    commands: [
      { id: 'cmd:recruit', label: t('Recrutar', 'Recruit'), picked: true },
      { id: 'cmd:leave', label: t('Sair', 'Leave') },
    ],
    rows: JOBS.map((c) => ({
      key: c,
      face: c,
      name: unitName(c),
      kind: t('recruta', 'recruit'),
      price: RECRUIT_COST,
      why: full
        ? t(
            'Grupo cheio: dispense alguém na ficha para recrutar.',
            'Party is full: dismiss someone on their sheet to recruit.',
          )
        : gold < RECRUIT_COST
          ? t(
              `Faltam ${RECRUIT_COST - gold} de ouro para recrutar.`,
              `${RECRUIT_COST - gold} more gold needed to recruit.`,
            )
          : '',
    })),
    empty: '',
    sel,
    detail: (r) => ({
      head: t('Recruta', 'Recruit'),
      face: r.key,
      name: r.name,
      sub: t(`Custo ${RECRUIT_COST}`, `Cost ${RECRUIT_COST}`),
      gives: statsLine(UNIT_DEFS[r.key]),
      pairs: defenceRows(UNIT_DEFS[r.key]),
      section: t('Habilidades', 'Abilities'),
      fit: UNIT_DEFS[r.key].abilities.map(abilityName).join(' · '),
      said: r.key === sel ? said : '',
      action: t(`Recrutar ${r.name}`, `Recruit ${r.name}`),
    }),
  });
}
