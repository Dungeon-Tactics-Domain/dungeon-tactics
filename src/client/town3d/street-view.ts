// The pages of the 3D windows the street opens (?townmenu=3d; street.ts runs them): the town menu, the dungeon gate's
// quest and what a place still to come says. Built from what the caller read of the saved game; pure, tested in
// tests/town3d.test.ts.
import { type Act, keysText, type Shown } from '../glyphs.ts';
import { t } from '../i18n.ts';
import { chrome, type Hit, type Item, type Page, plaques, text } from './page.ts';
import { HINTS } from './shop-view.ts';
import { G, M } from './town-layout.ts';

// the expedition in progress, if any, and whether New expedition waits for its 2nd press (it ends that one)
export interface Quest {
  live?: { floor: string; gold: number };
  armed?: boolean;
}
// one of the town's own switches at the menu's foot (the debug grid, fluid movement)
export interface Switch {
  label: string;
  value: string;
}

const NEW_HELP = (q: Quest) =>
  q.armed
    ? t(
        'Confirmar: encerra a expedição atual, o ouro achado vai à cidade.',
        'Confirm: ends the current expedition, the gold found goes to town.',
      )
    : q.live
      ? t(
          'Começa outra descida. A expedição atual termina e o ouro achado vai à cidade.',
          'Starts another descent. The current expedition ends and the gold found goes to town.',
        )
      : t('Desce à masmorra com o grupo da cidade.', 'Goes down the dungeon with the town’s party.');
const CONTINUE_HELP = (q: Quest) =>
  t(`Volta ao mapa da expedição: ${q.live?.floor}.`, `Back to the expedition map: ${q.live?.floor}.`);

// the quest's rows, at the gate and in the menu: Continue only with an expedition in progress
const questRows = (q: Quest) => [
  ...(q.live
    ? [
        {
          id: 'quest:continue',
          label: t('Continuar a expedição', 'Continue the expedition'),
          help: CONTINUE_HELP(q),
        },
      ]
    : []),
  {
    id: 'quest:new',
    label: q.armed ? t('Confirmar nova expedição', 'Confirm new expedition') : t('Nova expedição', 'New expedition'),
    help: NEW_HELP(q),
  },
];
const liveLine = (q: Quest) =>
  q.live
    ? t(
        `Expedição em curso: ${q.live.floor} · ${q.live.gold} de ouro achado.`,
        `Expedition in progress: ${q.live.floor} · ${q.live.gold} gold found.`,
      )
    : t('Nenhuma expedição em curso.', 'No expedition in progress.');

// Hit ids: `quest:continue`, `quest:new`, `open:shop`, `open:bar`, `open:party`, `title`, `street` (the way out a
// finger has: the window has no ✕) and `sw:<n>`. `at`: the row in
// focus, whose line the help band says
export function menuPage(o: {
  name: string;
  gold: number;
  party: [have: number, max: number];
  quest: Quest;
  switches: Switch[];
  at?: string;
  keys?: Shown; // what the help line names: the keys or a pad's buttons
}): Page {
  const key = (a: Act) => keysText(a, o.keys ?? 'keyboard');
  const rows = [
    ...questRows(o.quest),
    { id: 'open:shop', label: t('Loja', 'Shop'), help: t('Compra e vende equipamento.', 'Buys and sells gear.') },
    {
      id: 'open:bar',
      label: t('Taverna', 'Tavern'),
      help: t('Recruta gente para o grupo.', 'Recruits people for the party.'),
    },
    {
      id: 'open:party',
      label: t('Grupo', 'Party'),
      help: t('Fichas, equipamento e classe de cada membro.', 'Each member’s sheet, gear and class.'),
    },
    {
      id: 'title',
      label: t('Voltar ao título', 'Back to title'),
      help: t('Sai da cidade para a tela de título.', 'Leaves the town for the title screen.'),
    },
    { id: 'street', label: t('Voltar à rua', 'Back to the street'), help: t('Fecha o menu.', 'Closes the menu.') },
    ...o.switches.map((s, i) => ({
      id: `sw:${i}`,
      label: s.label,
      note: s.value,
      help: t(
        `${key('confirm')} ou ${key('sides')} liga ou desliga.`,
        `${key('confirm')} or ${key('sides')} turns it on or off.`,
      ),
    })),
  ] as { id: string; label: string; help: string; note?: string }[];
  const R = M.rows,
    B = M.box;
  const box = (i: number) => ({ x: R.x, y: R.y + i * (R.h + R.gap), w: R.w, h: R.h });
  const hits: Hit[] = rows.map((r, i) => ({ id: r.id, box: box(i), name: r.label, on: 'dark' }));
  const at = rows.find((r) => r.id === o.at) ?? rows[0];
  const items: Item[] = [
    ...chrome({ crumbs: [o.name], gold: [t('Ouro', 'Gold'), o.gold], help: at.help, hints: HINTS() }),
    ...rows.flatMap((r, i) => {
      const mid = box(i).y + R.h / 2;
      return [
        text(r.label, R.x + M.label, mid, 30, 'light', { max: R.w - M.label - (r.note ? 200 : 30) }),
        ...(r.note ? [text(r.note, R.x + R.w - 28, mid, 24, 'dim', { align: 'r' as const })] : []),
      ];
    }),
    { k: 'paper', box: B, head: M.head },
    text(o.name, B.x + M.pad, B.y + M.head / 2, 26, 'ink'),
    text(
      t(`Grupo: ${o.party[0]} de ${o.party[1]}`, `Party: ${o.party[0]} of ${o.party[1]}`),
      B.x + M.pad,
      B.y + 100,
      26,
      'ink',
    ),
    text(liveLine(o.quest), B.x + M.pad, B.y + 140, 24, 'soft', { wrap: B.w - 2 * M.pad, maxH: 100 }),
  ];
  return { items, hits };
}

// a place's window: plaques at the left edge, the place's words on a parchment box
function placePage(o: {
  name: string;
  gold: number;
  rows: { id: string; label: string; help: string }[];
  lines: string[];
  at?: string;
}): Page {
  const cmd = plaques(o.rows);
  const at = o.rows.find((r) => r.id === o.at) ?? o.rows[0];
  const B = G.box;
  return {
    hits: cmd.hits,
    items: [
      ...chrome({ crumbs: [o.name], gold: [t('Ouro', 'Gold'), o.gold], help: at.help, hints: HINTS() }),
      ...cmd.items,
      { k: 'paper', box: B, head: G.head },
      text(o.name, B.x + G.pad, B.y + G.head / 2, 26, 'ink'),
      text(o.lines.join('\n'), B.x + G.pad, B.y + G.head + 30, 28, 'ink', {
        wrap: B.w - 2 * G.pad,
        maxH: B.h - G.head - 60,
      }),
    ],
  };
}

// The dungeon gate. Hit ids: `quest:continue`, `quest:new` and `stay`
export const gatePage = (o: { name: string; gold: number; floors: number; quest: Quest; at?: string }): Page =>
  placePage({
    ...o,
    rows: [
      ...questRows(o.quest),
      {
        id: 'stay',
        label: t('Ficar na cidade', 'Stay in town'),
        help: t('Volta à rua.', 'Back to the street.'),
      },
    ],
    lines: [
      t(`${o.floors} andares de salas e um chefe no fim.`, `${o.floors} floors of rooms and a boss at the end.`),
      ...(o.quest.live ? [liveLine(o.quest)] : []),
    ],
  });

// A place without a window yet: what it says and the way back. Hit id: `stay`
export const soonPage = (o: { name: string; gold: number; says: string }): Page =>
  placePage({
    ...o,
    rows: [
      { id: 'stay', label: t('Voltar à rua', 'Back to the street'), help: t('Volta à rua.', 'Back to the street.') },
    ],
    lines: [o.says],
  });
