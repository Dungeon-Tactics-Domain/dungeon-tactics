// Pure side of the 3D Party screen (town3d.ts draws it): what the HTML one shows (town-party.ts, town-gear.ts), laid
// out like FFT: The Ivalice Chronicles' unit Status (labs refs/fft-ivalice/44, 02): the picked member across the top
// (face, bars, the sheet's totals), the pages as plaques on the left (Status, Equipment, Abilities, Class), the page on
// a parchment panel and, where the reference pages with L1 and R1, the whole roster down the right. Wording and numbers
// come from the HTML screen's helpers. No DOM or Three here; tested in tests/town3d.test.ts.
import { ITEMS, kindOf, SLOTS, type Slot, withGear, worn } from '../../shared/battle/equipment.ts';
import { UNIT_DEFS } from '../../shared/battle/units.ts';
import { abilityDetail, regenLine } from '../battle-text.ts';
import { CHEST_MAX, type Chest, type Equip } from '../chest.ts';
import { DEPLOY_MAX, GROUP_MAX, type Group, JOBS, type Member, roster } from '../group.ts';
import { abilityName, t, unitName } from '../i18n.ts';
import { compareRows, itemName, itemStats, RARITY, sheetRows, slotName } from '../sheet-lines.ts';
import { chestFull, statsLine } from '../town-ui.ts';
import { type Box, bar, chrome, fill, type Hit, type Item, type Page, plaques, text } from './page.ts';
import { P } from './town-layout.ts';

export const PAGES = ['status', 'gear', 'skills', 'job'] as const;
export type PartyPage = (typeof PAGES)[number];
const NAME: Record<PartyPage, () => string> = {
  status: () => 'Status',
  gear: () => t('Equipamento', 'Equipment'),
  skills: () => t('Habilidades', 'Abilities'),
  job: () => t('Classe', 'Class'),
};
const HELP: Record<PartyPage, () => string> = {
  status: () =>
    t(
      'Quem vai à batalha e cada número que a batalha conta.',
      'Who goes to battle and every number the battle counts.',
    ),
  gear: () =>
    t(
      'Troque as peças: cada uma mostra o que muda, agora → depois.',
      'Swap the pieces: each shows what changes, now → after.',
    ),
  skills: () => t('O que a classe sabe fazer.', 'What the class can do.'),
  job: () =>
    t(
      'Trocar muda os números e as habilidades; o equipamento fica.',
      'Changing swaps stats and abilities; equipment stays.',
    ),
};

export interface PartyState {
  group: Group;
  eq: Equip;
  chest: Chest;
}
// `id`: the member whose pages show (the first of the roster when absent or gone); `armed`: Dismiss was pressed once;
// `inside`: the arrows walk the member's page (Enter went in), not the roster (Esc comes back): Fernando, Nov 17
export interface PartyAt {
  id?: string;
  page: PartyPage;
  slot: Slot;
  armed?: boolean;
  inside?: boolean;
}
type Parts = { items: Item[]; hits: Hit[]; list?: Page['list'] };

export function partyPage({ group: g, eq, chest }: PartyState, at: PartyAt): { id: string; page: Page } {
  const all = roster(g),
    m = all.find((x) => x.id === at.id) ?? all[0],
    mine = eq[m.id] ?? {},
    sheet = withGear(UNIT_DEFS[m.cls], mine); // the numbers with the pieces on, as the battle counts them
  const going = g.deployed.includes(m.id);
  const items: Item[] = chrome({
    crumbs: [t('Grupo', 'Party'), NAME[at.page]()],
    gold: [t('Ouro', 'Gold'), chest.gold],
    note: t(`Grupo ${all.length} de ${GROUP_MAX}`, `Party ${all.length} of ${GROUP_MAX}`),
    help: HELP[at.page](),
    hints: at.inside
      ? t(
          'Setas: mover   ·   Enter: escolher   ·   Esc: voltar à lista',
          'Arrows: move   ·   Enter: choose   ·   Esc: back to the list',
        )
      : t(
          '↑ ↓: membro   ·   ← →: página   ·   Enter: entrar   ·   Esc: sair',
          '↑ ↓: member   ·   ← →: page   ·   Enter: go in   ·   Esc: leave',
        ),
  });

  // the picked member: face, name, class, life and pools (full, as the unit enters a battle) and who goes
  const pools: [string, number, 'hp' | 'mp' | 'sp'][] = [[t('Vida', 'HP'), sheet.hp, 'hp']];
  if (sheet.vars?.mana) pools.push(['MP', sheet.vars.mana, 'mp']);
  if (sheet.vars?.stamina) pools.push(['ST', sheet.vars.stamina, 'sp']);
  items.push(
    fill({ x: P.face.x - 4, y: P.face.y - 4, w: P.face.w + 8, h: P.face.h + 8 }, 'line'),
    fill(P.face, 'plate'),
    { k: 'face', box: P.face, def: m.cls },
    text(m.name, P.name.x, P.name.y, 40, 'light'),
    text(unitName(m.cls), P.name.x, P.name.y + 40, 24, 'dim'),
    text(regenLine(sheet), P.bars.x, P.bars.y + 70, 20, 'dim', { max: 580 }),
    text(
      going ? t('Vai à batalha', 'Goes to battle') : t('Fica na cidade', 'Stays in town'),
      P.tag.x,
      P.tag.y,
      24,
      going ? 'gold' : 'dim',
    ),
  );
  pools.forEach(([label, v, tone], i) => {
    const x = P.bars.x + i * (P.bars.w + P.bars.gap);
    items.push(
      text(label, x, P.bars.y + 18, 24, 'dim'),
      text(`${v}/${v}`, x + P.bars.w, P.bars.y + 18, 26, 'light', { align: 'r' }),
      ...bar({ x, y: P.bars.y + 38, w: P.bars.w, h: 14 }, 1, tone),
    );
  });
  // the sheet's totals beside it, as the reference's two blocks of numbers
  const rows = sheetRows(m.cls, mine);
  rows.forEach(([k, v], i) => {
    const S = P.stats,
      x = S.x + (i % S.cols) * (S.colW + S.gap),
      y = S.y + Math.floor(i / S.cols) * S.rowH + S.rowH / 2;
    items.push(text(k, x, y, 22, 'dim', { max: S.colW - 80 }), text(v, x + S.colW, y, 26, 'light', { align: 'r' }));
  });

  // the roster: who goes to battle first, then who stays; a row picks whose pages show
  const R = P.roster,
    who: Hit[] = [];
  let y = R.y;
  const head = (str: string, ink: 'gold' | 'dim') => {
    items.push(text(str, R.x + 8, y + R.headH / 2, 24, ink));
    y += R.headH;
  };
  all.forEach((x, i) => {
    if (i === 0)
      head(
        t(`Vão à batalha ${g.deployed.length}/${DEPLOY_MAX}`, `Battle party ${g.deployed.length}/${DEPLOY_MAX}`),
        'gold',
      );
    if (i === g.deployed.length) head(t('Ficam na cidade', 'Staying in town'), 'dim');
    const box: Box = { x: R.x, y, w: R.w, h: R.rowH - 4 };
    who.push({ id: `who:${x.id}`, box, name: `${x.name}, ${unitName(x.cls)}`, on: 'dark', picked: x.id === m.id });
    items.push(
      { k: 'face', box: { x: R.x + 52, y: y + 3, w: 48, h: 48 }, def: x.cls },
      text(x.name, R.x + 112, y + box.h / 2, 26, 'light', { max: 120 }),
      text(unitName(x.cls), R.x + R.w - 12, y + box.h / 2, 20, 'dim', { align: 'r', max: 110 }),
    );
    y += R.rowH;
  });

  const tabs = plaques(PAGES.map((p) => ({ id: `tab:${p}`, label: NAME[p](), picked: p === at.page })));
  const body = { status, gear, skills, job }[at.page](m, { g, eq, chest }, at);
  items.push(
    ...tabs.items,
    { k: 'paper', box: P.page, head: P.head },
    text(`${m.name}: ${NAME[at.page]()}`, P.page.x + P.pad, P.page.y + P.head / 2, 26, 'soft'),
    ...body.items,
  );
  // the arrows walk the roster or, once inside, the page's own buttons; the plaques are turned with left and right
  const out = (hits: Hit[], is: boolean) => hits.map((h) => ({ ...h, out: is }));
  const hits = [...out(who, !!at.inside), ...out(tabs.hits, true), ...out(body.hits, !at.inside)];
  return { id: m.id, page: { items, hits, list: body.list } };
}

type Ctx = { g: Group; eq: Equip; chest: Chest };
const X = P.page.x + P.pad,
  TOP = P.page.y + P.head,
  W = P.page.w - 2 * P.pad;
// a dark button on the paper, its name in the middle
const press = (id: string, label: string, box: Box, off = false): Parts => ({
  hits: [{ id, box, name: label, on: 'dark', off }],
  items: [
    text(label, box.x + box.w / 2 + 16, box.y + box.h / 2, 26, off ? 'dim' : 'light', { align: 'c', max: box.w - 90 }),
  ],
});

// Status: who goes to battle, Dismiss (a recruit only; a 2nd press confirms), then each total the battle counts as a
// bar with where it comes from. A button that is off says why under it
function status(m: Member, { g, eq, chest }: Ctx, at: PartyAt): Parts {
  const mine = eq[m.id] ?? {},
    going = g.deployed.includes(m.id),
    alone = going && g.deployed.length === 1, // someone always goes
    fullField = !going && g.deployed.length >= DEPLOY_MAX,
    noRoom = chest.items.length + Object.values(mine).length > CHEST_MAX; // a dismissed recruit's pieces go to the chest
  const deploy = press(
    'deploy',
    going ? t('Deixar na cidade', 'Leave in town') : t('Levar à batalha', 'Bring to battle'),
    { x: X, y: TOP + 14, w: 400, h: 54 },
    alone || fullField,
  );
  const fire = m.recruit
    ? press(
        'fire',
        at.armed ? t('Confirmar: dispensar', 'Confirm: dismiss') : t('Dispensar', 'Dismiss'),
        { x: X + 420, y: TOP + 14, w: 400, h: 54 },
        noRoom,
      )
    : { items: [], hits: [] };
  const why = [
    alone &&
      t(
        'Só este vai à batalha: leve outro antes de deixá-lo na cidade.',
        'Only this one goes to battle: bring someone else before leaving them in town.',
      ),
    fullField &&
      t(
        `Já vão ${DEPLOY_MAX}: deixe alguém na cidade antes.`,
        `${DEPLOY_MAX} already go: leave someone in town first.`,
      ),
    m.recruit && noRoom && t(`Dispensar: ${chestFull()}, venda peças antes.`, `Dismiss: ${chestFull()}, sell first.`),
  ].filter(Boolean);
  const items: Item[] = [...deploy.items, ...fire.items, text(why.join('  '), X, TOP + 88, 20, 'down', { max: W })];
  const rows = sheetRows(m.cls, mine),
    pitch = Math.min(P.statRow, (P.page.h - P.head - 124) / rows.length); // a sheet with more totals packs them closer
  rows.forEach(([k, v, from, share], i) => {
    const y = TOP + 112 + (i + 0.5) * pitch;
    items.push(
      text(k, X, y, 22, 'ink', { max: 230 }),
      ...bar({ x: X + 250, y: y - 6, w: 300, h: 12 }, share, 'stat'),
      text(v, X + 640, y, 24, 'ink', { align: 'r' }),
      text(from, X + 664, y, 18, 'soft', { max: W - 664 }),
    );
  });
  return { items, hits: [...deploy.hits, ...fire.hits] };
}

// Equipment: the 7 slots in a column with what each holds; the open one beside it: its piece with what it gives and
// Remove, then the chest's pieces of its kind, each with the totals it would change (now → after; the arrow carries
// the direction with the colour). Pressing a chest piece puts it on
function gear(m: Member, { eq, chest }: Ctx, at: PartyAt): Parts {
  const mine = eq[m.id] ?? {},
    full = chest.items.length >= CHEST_MAX,
    it = worn(mine, at.slot);
  const items: Item[] = [],
    hits: Hit[] = [];
  SLOTS.forEach((s, i) => {
    const box: Box = { x: X - 10, y: TOP + 10 + i * P.slotH, w: P.slotW, h: P.slotH - 4 },
      w = worn(mine, s),
      mid = box.y + box.h / 2;
    hits.push({
      id: `slot:${s}`,
      box,
      name: `${slotName(s)}: ${w ? itemName(w) : t('vazio', 'empty')}`,
      on: 'paper',
      picked: s === at.slot,
    });
    items.push(
      text(slotName(s), box.x + 16, mid, 20, 'soft', { max: 150 }),
      text(w ? itemName(w) : t('vazio', 'empty'), box.x + 176, mid, 26, w ? 'ink' : 'off', { max: P.slotW - 190 }),
    );
  });
  const x = X + P.slotW + 30,
    w = W - P.slotW - 30;
  items.push(text(slotName(at.slot), x, TOP + 34, 28, 'ink'));
  if (it) {
    const off = press('off', t('Tirar', 'Remove'), { x: x + w - 190, y: TOP + 62, w: 190, h: 50 }, full);
    hits.push({ ...off.hits[0], name: t(`Tirar ${itemName(it)}`, `Remove ${itemName(it)}`) });
    items.push(
      ...off.items,
      text(itemName(it), x, TOP + 76, 26, 'ink', { max: w - 210 }),
      text(`${RARITY[it.rarity]()} · ${itemStats(it)}`, x, TOP + 106, 20, 'soft', { max: w - 210 }),
      text(full ? chestFull() : '', x + w, TOP + 128, 20, 'down', { align: 'r' }),
    );
  } else items.push(text(t('Vazio.', 'Empty.'), x, TOP + 86, 24, 'off'));
  items.push(
    fill({ x, y: TOP + 144, w, h: 34 }, 'band'),
    text(t('No baú', 'In the chest'), x + 10, TOP + 161, 22, 'ink'),
  );
  const fits = [...new Set(chest.items)].filter((id) => ITEMS[id].kind === kindOf(at.slot));
  const box: Box = { x, y: TOP + 186, w, h: 4 * P.gearRow };
  fits.forEach((id, i) => {
    const top = box.y + i * P.gearRow,
      changes = compareRows(m.cls, mine, at.slot, id);
    const ups = changes.filter((c) => c[3]).length;
    hits.push({
      id: `row:${id}`,
      box: { x, y: top, w, h: P.gearRow },
      name: t(`Equipar ${itemName(ITEMS[id])}`, `Equip ${itemName(ITEMS[id])}`),
      on: 'paper',
      row: i,
    });
    items.push(
      text(itemName(ITEMS[id]), x + 16, top + 24, 26, 'ink', { max: w - 180, row: i }),
      text(RARITY[ITEMS[id].rarity](), x + w - 16, top + 24, 20, 'soft', { align: 'r', row: i }),
      text(
        changes.map(([k, now, after, up]) => `${k} ${now} → ${after} ${up ? '▲' : '▼'}`).join('  ·  ') ||
          t('nada muda', 'no change'),
        x + 16,
        top + 54,
        20,
        !changes.length ? 'soft' : ups === changes.length ? 'up' : ups ? 'ink' : 'down',
        { max: w - 32, row: i },
      ),
    );
  });
  if (!fits.length)
    items.push(
      text(
        t(
          'Nada deste tipo no baú: a Loja da cidade vende peças comuns.',
          'Nothing of this kind in the chest: the town Shop sells common pieces.',
        ),
        x,
        box.y + 8,
        22,
        'soft',
        { wrap: w },
      ),
    );
  return { items, hits, list: fits.length ? { box, rowH: P.gearRow, rows: fits.length } : undefined };
}

// Abilities: each one of the class with what it does
function skills(m: Member): Parts {
  const all = UNIT_DEFS[m.cls].abilities,
    pitch = Math.min(96, (P.page.h - P.head - 20) / all.length);
  return {
    hits: [],
    items: all.flatMap((a, i) => [
      text(abilityName(a), X, TOP + 28 + i * pitch, 26, 'ink'),
      text(abilityDetail(a), X + 20, TOP + 46 + i * pitch, 20, 'soft', { wrap: W - 20, maxH: pitch - 48 }),
    ]),
  };
}

// Class (like FFT's Job): a card per class, the member's own marked; the numbers and abilities become the new class's
function job(m: Member): Parts {
  const J = P.job;
  const box = (i: number): Box => ({ x: X + i * (J.w + J.gap), y: TOP + 30, w: J.w, h: J.h });
  return {
    // the glove at the card's foot, under the numbers: at its middle it lay over the name of the card to the left
    hits: JOBS.map((c, i) => ({
      id: `job:${c}`,
      box: box(i),
      name: unitName(c),
      on: 'paper',
      picked: c === m.cls,
      hand: J.h - 22,
    })),
    items: JOBS.flatMap((c, i) => {
      const b = box(i);
      return [
        { k: 'face', box: { x: b.x + (J.w - 150) / 2, y: b.y + 14, w: 150, h: 150 }, def: c } as Item,
        text(unitName(c), b.x + J.w / 2, b.y + 192, 26, 'ink', { align: 'c', max: J.w - 16 }),
        text(c === m.cls ? t('atual', 'current') : '', b.x + J.w / 2, b.y + 224, 20, 'soft', { align: 'c' }),
        text(statsLine(UNIT_DEFS[c]).replaceAll(' · ', '\n'), b.x + 22, b.y + 250, 20, 'soft', {
          wrap: J.w - 30,
          maxH: 130,
        }),
      ];
    }),
  };
}
