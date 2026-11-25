// What the map builder's side panel holds (Nov 25, spec "Screen"): the category tabs and each category's rows as plain
// cells (id, text, kind), the tool bar's buttons and the foot's. Text through t(); the layout places them (layout.ts)
// and the screen draws them (window3d/builder3d.ts). Pure and tested.
import { PALETTE } from '../../content/map-palette.ts';
import { type MapDoc, SIZE } from '../../shared/mapedit/doc.ts';
import { ACTIONS, type Shown } from '../glyphs.ts';
import { t } from '../i18n.ts';
import type { Cell, Row } from './layout.ts';
import { picOf } from './pics.ts';
import { BAR, type Brush, sameTool, type Tool } from './tools.ts';

export const TABS = ['paint', 'relief', 'map', 'file'] as const;
export type Tab = (typeof TABS)[number];
export const TAB_NAMES: Record<Tab, () => string> = {
  paint: () => t('Pintar', 'Paint'),
  relief: () => t('Relevo', 'Relief'),
  map: () => t('Mapa', 'Map'),
  file: () => t('Arquivo', 'File'),
};

export interface PanelState {
  tab: Tab;
  doc: MapDoc;
  tool: Tool;
  picked: string; // the Paint panel's entry, the bar's Palette tool
  page: number; // the Paint panel's page
  perPage: number; // entries a page shows (2 per row)
  slots: string[]; // the saved maps' names, newest last
  playWhy: string | null; // why Play cannot open now; null when it can
  canUndo: boolean;
  canRedo: boolean;
  brush: Brush;
  shown: Shown; // the key hints in use (key-hints.ts)
  finger: boolean; // a finger is playing: no keys on the buttons (ui3d/layer.ts finger)
}

const button = (id: string, text: string, more: Partial<Cell> = {}): Cell => ({ id, text, kind: 'button', ...more });
const label = (id: string, text: string, grow = 1): Cell => ({ id, text, kind: 'label', grow });
// "Altura + · 5": a tool's name with its key while the keys show
const withKey = (text: string, key: string, s: PanelState) =>
  s.shown === 'keyboard' && !s.finger ? `${text} · ${key}` : text;

export const pages = (perPage: number) => Math.max(1, Math.ceil(PALETTE.length / Math.max(2, perPage)));

export function tabCells(tab: Tab): Cell[] {
  return TABS.map((k) => button(`tab:${k}`, TAB_NAMES[k](), { on: k === tab }));
}

export function barCells(s: PanelState): Cell[] {
  return BAR.map((slot, i) =>
    button(`bar:${i}`, withKey(t(...slot.name), ACTIONS.tools.keys[i], s), {
      on: sameTool(slot.tool(s.picked), s.tool),
      pic: picOf(`bar:${i}`, s.picked) ?? undefined,
    }),
  );
}

// the foot: brush, undo, redo (their keys are in the help line: a third of the panel holds no key beside the word);
// then the camera (↺ ↻, top view, zoom out and in)
export function footCells(s: PanelState): Cell[][] {
  return [
    [
      button('brush', s.brush === 1 ? t('Pincel 1x1', 'Brush 1x1') : t('Pincel 3x3', 'Brush 3x3'), {
        on: s.brush === 3,
      }),
      button('undo', t('↶ Desfazer', '↶ Undo'), { off: !s.canUndo }),
      button('redo', t('↷ Refazer', '↷ Redo'), { off: !s.canRedo }),
    ],
    [button('rotL', '↺'), button('rotR', '↻'), button('top', '⊞'), button('zoomOut', '−'), button('zoomIn', '+')],
  ];
}

export function panelRows(s: PanelState): Row[] {
  if (s.tab === 'paint') return paintRows(s);
  if (s.tab === 'relief') return reliefRows(s);
  if (s.tab === 'map') return mapRows(s);
  return fileRows(s);
}

function paintRows(s: PanelState): Row[] {
  const per = Math.max(2, s.perPage - (s.perPage % 2)),
    page = Math.min(s.page, pages(per) - 1),
    shown = PALETTE.slice(page * per, page * per + per),
    rows: Row[] = [];
  for (let i = 0; i < shown.length; i += 2)
    rows.push({
      cells: shown
        .slice(i, i + 2)
        .map((e) =>
          button(`pal:${e.id}`, t(...e.name), { on: s.tool.k === 'paint' && s.tool.entry === e.id, pic: e.id }),
        ),
    });
  rows.push({
    cells: [
      button('page:-1', '◀', { off: page === 0 }),
      label('pageNo', `${page + 1} / ${pages(per)}`, 2),
      button('page:1', '▶', { off: page >= pages(per) - 1 }),
    ],
  });
  return rows;
}

function reliefRows(s: PanelState): Row[] {
  const tool = (i: number) =>
    button(`bar:${i}`, t(...BAR[i].name), {
      on: sameTool(BAR[i].tool(s.picked), s.tool),
      pic: picOf(`bar:${i}`, s.picked) ?? undefined,
    });
  return [
    { cells: [tool(4), tool(5)] },
    { cells: [tool(6)] },
    { cells: [button('auto', t('Rampas automáticas', 'Auto-ramps'))] },
  ];
}

function mapRows(s: PanelState): Row[] {
  const { width: w, height: h } = s.doc;
  const size = (id: 'w' | 'h', name: string, v: number): Row => ({
    cells: [
      label(`${id}Name`, name, 2),
      button(`${id}:-1`, '−', { off: v <= SIZE[0] }),
      label(`${id}Value`, String(v)),
      button(`${id}:1`, '+', { off: v >= SIZE[1] }),
    ],
  });
  const edge = (id: string, name: string, n: number): Row => ({
    cells: [
      label(`${id}Name`, name, 2),
      button(`edge:${id}:1`, '+', { off: n >= SIZE[1] }),
      button(`edge:${id}:-1`, '−', { off: n <= SIZE[0] }),
    ],
  });
  return [
    size('w', t('Largura', 'Width'), w),
    size('h', t('Altura do mapa', 'Map height'), h),
    edge('left', t('Coluna à esquerda', 'Column on the left'), w),
    edge('right', t('Coluna à direita', 'Column on the right'), w),
    edge('top', t('Linha em cima', 'Row on top'), h),
    edge('bottom', t('Linha embaixo', 'Row at the bottom'), h),
    { cells: [button('clear', t(`Limpar (${w}x${h} de grama)`, `Clear (${w}x${h} of grass)`))] },
  ];
}

// the slots come last, newest first: the ones past the panel's foot are cut, never Play (a tablet fits two)
function fileRows(s: PanelState): Row[] {
  const slots = [...s.slots].reverse();
  return [
    { cells: [label('nameLabel', 'PT'), { id: 'name', text: s.doc.name, kind: 'input', grow: 5 }] },
    { cells: [label('enLabel', 'EN'), { id: 'en', text: s.doc.en, kind: 'input', grow: 5 }] },
    { cells: [button('save', t(`Salvar “${s.doc.name}”`, `Save “${s.doc.name}”`))] },
    {
      cells: [button('json', t('Exportar JSON', 'Export JSON')), button('ts', t('Exportar .ts', 'Export .ts'))],
    },
    { cells: [{ id: 'paste', text: '', kind: 'area' }], tall: 2 },
    { cells: [button('import', t('Importar JSON colado', 'Import pasted JSON'))] },
    {
      cells: [
        button('play', s.playWhy ? t(`Jogar: ${s.playWhy}`, `Play: ${s.playWhy}`) : t('Jogar', 'Play'), {
          off: !!s.playWhy,
        }),
        button('leave', t('Sair', 'Leave')),
      ],
    },
    ...slots.map((name): Row => ({ cells: [button(`slot:${name}`, t(`Abrir “${name}”`, `Open “${name}”`))] })),
  ];
}
