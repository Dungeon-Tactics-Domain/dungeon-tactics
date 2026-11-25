// What the battle builder's side panel holds (Nov 25, mirroring the map builder's panel.ts): the tabs Units, Sheet,
// Battle and File, the tool bar's nine plates and the foot, as plain cells the map builder's layout places
// (mapedit/layout.ts) and its 3D screen draws (window3d/builder3d.ts). The Sheet and Battle tabs are in panel-pages.ts.
// Pure and tested.
import { UNIT_LIST } from '../../content/units.ts';
import type { Team } from '../../shared/battle/types.ts';
import type { BattleDoc, MapUnit } from '../../shared/mapedit/battle.ts';
import { ACTIONS, type Shown } from '../glyphs.ts';
import { t, unitName } from '../i18n.ts';
import type { Cell, Row } from '../mapedit/layout.ts';
import { battleRows, sheetRows } from './panel-pages.ts';

export const TABS = ['units', 'sheet', 'battle', 'file'] as const;
export type Tab = (typeof TABS)[number];
const TAB_NAMES: Record<Tab, () => string> = {
  units: () => t('Unidades', 'Units'),
  sheet: () => t('Ficha', 'Sheet'),
  battle: () => t('Batalha', 'Battle'),
  file: () => t('Arquivo', 'File'),
};

// what a tap or Enter on the map does
export type Tool = 'select' | 'hero' | 'enemy' | 'remove';
// the bar's plates, keys 1 to 9: the four tools, then turning the unit at the cursor, the class to place and Play
export const BAR = ['select', 'hero', 'enemy', 'remove', 'turnL', 'turnR', 'prev', 'next', 'play'] as const;
export const isTool = (k: string): k is Tool => ['select', 'hero', 'enemy', 'remove'].includes(k);

// every class of the game's content, the Beacon last (spec: place units like the debug panel's Spawn)
export const CLASSES = UNIT_LIST.map((u) => u.id);

export interface BattlePanel {
  tab: Tab;
  sub: number; // the Sheet's and the Battle's own page
  doc: BattleDoc;
  unit: MapUnit | null; // the unit picked (its Sheet)
  cls: string; // the class Hero and Enemy place
  tool: Tool;
  page: number; // the Units tab's page of classes
  perPage: number;
  name: string; // the slot's name
  slots: string[]; // the saved battles' names, newest last
  playWhy: string | null; // why Play cannot open now; null when it can
  canUndo: boolean;
  canRedo: boolean;
  shown: Shown;
  finger: boolean;
  source: string; // the map the Battle tab offers (sources.ts), by its label
  seed: number; // an expedition room's seed and depth
  depth: number;
  bagSide: Team;
  adding: string | null; // the ability the Sheet's Add row offers
}

export const button = (id: string, text: string, more: Partial<Cell> = {}): Cell => ({
  id,
  text,
  kind: 'button',
  ...more,
});
export const label = (id: string, text: string, grow = 1): Cell => ({ id, text, kind: 'label', grow });
export const sideName = (team: Team) => (team === 'hero' ? t('Herói', 'Hero') : t('Inimigo', 'Enemy'));

export const pages = (perPage: number) => Math.max(1, Math.ceil(CLASSES.length / Math.max(2, perPage)));

export const tabCells = (tab: Tab): Cell[] => TABS.map((k) => button(`tab:${k}`, TAB_NAMES[k](), { on: k === tab }));

function barName(k: (typeof BAR)[number], s: BattlePanel): string {
  if (k === 'select') return t('Escolher', 'Pick');
  if (k === 'hero' || k === 'enemy') return `${sideName(k)}: ${unitName(s.cls)}`;
  if (k === 'remove') return t('Remover', 'Remove');
  if (k === 'turnL') return t('Virar ↺', 'Turn ↺');
  if (k === 'turnR') return t('Virar ↻', 'Turn ↻');
  if (k === 'prev') return t('◀ Classe', '◀ Class');
  if (k === 'next') return t('Classe ▶', 'Class ▶');
  return s.playWhy ? t(`Jogar: ${s.playWhy}`, `Play: ${s.playWhy}`) : t('Jogar', 'Play');
}

export const barCells = (s: BattlePanel): Cell[] =>
  BAR.map((k, i) =>
    button(
      `bar:${i}`,
      s.shown === 'keyboard' && !s.finger ? `${barName(k, s)} · ${ACTIONS.tools.keys[i]}` : barName(k, s),
      { on: k === s.tool, off: k === 'play' && !!s.playWhy },
    ),
  );

export const footCells = (s: BattlePanel): Cell[][] => [
  [
    button('undo', t('↶ Desfazer', '↶ Undo'), { off: !s.canUndo }),
    button('redo', t('↷ Refazer', '↷ Redo'), { off: !s.canRedo }),
    button('top', '⊞'),
  ],
  [button('rotL', '↺'), button('rotR', '↻'), button('zoomOut', '−'), button('zoomIn', '+'), button('recenter', '⌖')],
];

export function panelRows(s: BattlePanel): Row[] {
  if (s.tab === 'units') return unitRows(s);
  if (s.tab === 'sheet') return sheetRows(s);
  if (s.tab === 'battle') return battleRows(s);
  return fileRows(s);
}

// the classes two by two, a page at a time, and how many stand on each side
function unitRows(s: BattlePanel): Row[] {
  const per = Math.max(2, s.perPage - (s.perPage % 2)),
    page = Math.min(s.page, pages(per) - 1),
    shown = CLASSES.slice(page * per, page * per + per),
    count = (team: Team) => s.doc.units.filter((u) => u.team === team).length,
    rows: Row[] = [
      {
        cells: [
          label(
            'count',
            t(
              `Heróis ${count('hero')} · Inimigos ${count('enemy')}`,
              `Heroes ${count('hero')} · Enemies ${count('enemy')}`,
            ),
          ),
        ],
      },
    ];
  for (let i = 0; i < shown.length; i += 2)
    rows.push({ cells: shown.slice(i, i + 2).map((id) => button(`cls:${id}`, unitName(id), { on: id === s.cls })) });
  rows.push({
    cells: [
      button('page:-1', '◀', { off: page === 0 }),
      label('pageNo', `${page + 1} / ${pages(per)}`, 2),
      button('page:1', '▶', { off: page >= pages(per) - 1 }),
    ],
  });
  return rows;
}

// the slots come last, newest first; the ones past the panel's foot are cut
function fileRows(s: BattlePanel): Row[] {
  return [
    { cells: [label('nameLabel', t('Nome', 'Name')), { id: 'name', text: s.name, kind: 'input', grow: 4 }] },
    { cells: [button('save', t(`Salvar “${s.name}”`, `Save “${s.name}”`))] },
    { cells: [button('json', t('Exportar JSON', 'Export JSON')), button('ts', t('Exportar .ts', 'Export .ts'))] },
    { cells: [{ id: 'paste', text: '', kind: 'area' }], tall: 2 },
    { cells: [button('import', t('Importar JSON colado', 'Import pasted JSON'))] },
    {
      cells: [button('mapedit', t('Editar o mapa', 'Edit the map')), button('leave', t('Sair', 'Leave'))],
    },
    ...[...s.slots]
      .reverse()
      .map((name): Row => ({ cells: [button(`slot:${name}`, t(`Abrir “${name}”`, `Open “${name}”`))] })),
  ];
}
