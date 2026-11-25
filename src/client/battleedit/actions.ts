// What each control of the battle builder does (grill, Nov 25): the tabs and pages, the bar's tools and actions, the
// classes, the picked unit's sheet, the battle's map, rules and bags, File's slots, export, import, Play and leaving,
// and the foot's undo, redo and camera. Each edit goes through BattleBuilder.commit: one undo step.
import type { Slot as GearSlot } from '../../shared/battle/equipment.ts';
import type { Control } from '../../shared/battle/scenarios.ts';
import type { Pos, Team } from '../../shared/battle/types.ts';
import { battleToTs, toJson } from '../../shared/mapedit/export.ts';
import { redo, undo } from '../../shared/mapedit/history.ts';
import { parseBattleDoc } from '../../shared/mapedit/parse.ts';
import {
  afterUnits,
  bagStep,
  OBJECTIVES,
  objectiveKind,
  setControl,
  setObjective,
  withMap,
} from '../../shared/mapedit/setup.ts';
import type { Sheet } from '../../shared/mapedit/sheet.ts';
import { placeUnit, removeUnit, setSheet, turnUnit, unitOn } from '../../shared/mapedit/units.ts';
import { t, unitName } from '../i18n.ts';
import { el } from '../icons.ts';
import { openBuilder } from '../mapedit/play-map.ts';
import { unknownLook } from '../mapedit/tools.ts';
import { navigate } from '../nav.ts';
import { store } from '../store.ts';
import type { BattleBuilder } from './builder.ts';
import { BAR, CLASSES, isTool, pages, type Tab } from './panel.ts';
import { play, playWhy } from './play.ts';
import {
  addAbility,
  cycleItem,
  dropAbility,
  missingAbilities,
  type NumberKey,
  setName,
  sheetOfUnit,
  stepNumber,
} from './sheet-edit.ts';
import { SLOTS_KEY, withSlot } from './slots.ts';
import { DEPTHS, nextSource, roomBattle, SEEDS } from './sources.ts';

const at = (u: { x: number; y: number }): Pos => ({ x: u.x, y: u.y });

// What a tool does on a tile: pick the unit there, place one of the class for a side, or remove it
export function applyAt(b: BattleBuilder, p: Pos) {
  b.note = '';
  if (b.tool === 'select') {
    const u = unitOn(b.doc, p);
    b.sel = u?.id ?? null;
    if (u) b.tab = 'sheet';
    b.note = u ? t(`Ficha de ${u.name ?? unitName(u.def)}.`, `${u.name ?? unitName(u.def)}’s sheet.`) : '';
    return;
  }
  if (b.tool === 'remove') return remove(b, p);
  const next = placeUnit(b.doc, p, b.cls, b.tool as Team);
  if (next === b.doc || !b.commit(afterUnits(next))) {
    b.note ||= t('Essa unidade não cabe aqui.', 'That unit does not fit here.');
    return;
  }
  b.sel = unitOn(b.doc, p)?.id ?? null;
}

export function remove(b: BattleBuilder, p: Pos) {
  const u = unitOn(b.doc, p);
  if (u && b.commit(afterUnits(removeUnit(b.doc, p)))) b.note = t('Unidade removida.', 'Unit removed.');
}

// the picked unit, else the one under the cursor, turned a quarter
function turn(b: BattleBuilder, step: 1 | -1) {
  const u = b.unit ?? unitOn(b.doc, b.cursor);
  if (u) b.commit(turnUnit(b.doc, at(u), step));
}

export function nextClass(b: BattleBuilder, dir: 1 | -1) {
  b.cls = CLASSES[(CLASSES.indexOf(b.cls) + dir + CLASSES.length) % CLASSES.length];
  b.note = t(`Classe: ${unitName(b.cls)}.`, `Class: ${unitName(b.cls)}.`);
}

export function pressBar(b: BattleBuilder, i: number) {
  const k = BAR[(i + BAR.length) % BAR.length];
  if (isTool(k)) b.tool = k;
  else if (k === 'turnL' || k === 'turnR') turn(b, k === 'turnL' ? -1 : 1);
  else if (k === 'prev' || k === 'next') nextClass(b, k === 'prev' ? -1 : 1);
  else if (k === 'play') {
    const why = playWhy(b.doc);
    if (why) b.note = t(`Jogar: ${why}.`, `Play: ${why}.`);
    else play({ name: b.name, doc: b.doc });
  }
}

// the picked unit's whole new sheet
function sheet(b: BattleBuilder, edit: (u: NonNullable<BattleBuilder['unit']>) => Sheet) {
  const u = b.unit;
  if (u) b.commit(setSheet(b.doc, at(u), edit(u)));
}

export function press(b: BattleBuilder, id: string) {
  const [k, a = '', c = ''] = id.split(':'),
    rest = id.slice(k.length + 1);
  b.note = '';
  if (k === 'tab') {
    b.tab = a as Tab;
    b.sub = 0;
  } else if (k === 'sub') b.sub = Number(a);
  else if (k === 'bar') pressBar(b, Number(a));
  else if (k === 'cls') {
    b.cls = a;
    if (b.tool !== 'hero' && b.tool !== 'enemy') b.tool = 'hero';
  } else if (k === 'page') b.page = Math.max(0, Math.min(pages(b.perPage) - 1, b.page + Number(a)));
  else if (k === 'pick') pickUnit(b, a);
  else if (k === 'num') sheet(b, (u) => stepNumber(u, a as NumberKey, Number(c) as 1 | -1));
  else if (k === 'uname') sheet(b, (u) => setName(u, rest));
  else if (k === 'face') turn(b, Number(a) as 1 | -1);
  else if (k === 'reset') sheet(b, () => ({}));
  else if (k === 'gear') sheet(b, (u) => cycleItem(u, a as GearSlot, Number(c) as 1 | -1));
  else if (k === 'drop') sheet(b, (u) => dropAbility(u, Number(a)));
  else if (k === 'add') stepAdding(b, Number(a) as 1 | -1);
  else if (k === 'addAbility') sheet(b, (u) => (b.adding ? addAbility(u, b.adding) : sheetOfUnit(u)));
  else battle(b, k, a, c) || file(b, k, rest) || foot(b, k);
}

// a unit by id, or the next (1) or previous (-1) one in the list from the one picked
function pickUnit(b: BattleBuilder, a: string) {
  const list = b.doc.units,
    at = list.findIndex((u) => u.id === b.sel),
    dir = Number(a);
  const u = a === '1' || a === '-1' ? list[(at + dir + list.length) % list.length] : list.find((x) => x.id === a);
  if (!(a === '1' || a === '-1')) b.sub = 0; // a unit picked from the list opens on its numbers
  b.sel = u?.id ?? null;
}

function stepAdding(b: BattleBuilder, dir: 1 | -1) {
  const u = b.unit,
    list = u ? missingAbilities(u) : [];
  if (list.length) b.adding = list[(list.indexOf(b.adding ?? '') + dir + list.length) % list.length];
}

// the Battle tab: the map, an expedition room, the objective, who plays each side and the bags
function battle(b: BattleBuilder, k: string, a: string, c: string): boolean {
  const d = b.doc;
  if (k === 'src') b.source = nextSource(b.sources, b.source, Number(a) as 1 | -1).key;
  else if (k === 'useMap') {
    const src = b.sources.find((s) => s.key === b.source);
    if (src) b.commit(withMap(d, src.map));
  } else if (k === 'seed')
    b.seed =
      a === 'new' ? Math.floor(Math.random() * SEEDS[1]) : Math.min(SEEDS[1], Math.max(SEEDS[0], b.seed + Number(a)));
  else if (k === 'depth') b.depth = Math.min(DEPTHS[1], Math.max(DEPTHS[0], b.depth + Number(a)));
  else if (k === 'useRoom') {
    const room = roomBattle(b.seed, b.depth);
    if (!room) b.note = t('Essa semente não gerou sala: tente outra.', 'That seed gave no room: try another.');
    else b.commit(room);
  } else if (k === 'obj') {
    const kinds = OBJECTIVES,
      from = kinds.indexOf(objectiveKind(d));
    // the Beacon is skipped when the heroes have none (setup.ts setObjective leaves the battle as it was)
    for (let i = 1; i < kinds.length; i++) {
      const next = setObjective(d, kinds[(from + i * Number(a) + kinds.length * 4) % kinds.length]);
      if (next !== d && b.commit(next)) break;
    }
  } else if (k === 'turns' && d.objective?.kind === 'survive')
    b.commit(setObjective(d, 'survive', d.objective.turns + Number(a)));
  else if (k === 'ctl') b.commit(setControl(d, a as Team, c as Control));
  else if (k === 'bagSide') b.bagSide = a as Team;
  else if (k === 'bag') b.commit(bagStep(d, b.bagSide, a, Number(c)));
  else return false;
  return true;
}

function file(b: BattleBuilder, k: string, rest: string): boolean {
  if (k === 'save') save(b);
  else if (k === 'slot') {
    const s = b.slots.find((x) => x.name === rest);
    if (s) {
      b.name = s.name;
      b.sel = null;
      if (!b.commit(s.doc)) b.show(b.hist); // the same battle: the name still changes
      b.note = t(`Aberto: ${s.name}.`, `Opened: ${s.name}.`);
    }
  } else if (k === 'json' || k === 'ts') exportBattle(b, k);
  else if (k === 'import') importBattle(b);
  else if (k === 'mapedit') openBuilder(b.doc.map);
  else if (k === 'leave') navigate('');
  else return false;
  return true;
}

function foot(b: BattleBuilder, k: string) {
  const s = b.scene;
  if (k === 'undo') b.show(undo(b.hist));
  else if (k === 'redo') b.show(redo(b.hist));
  else if (k === 'rotL') s.rotate(-1);
  else if (k === 'rotR') s.rotate(1);
  else if (k === 'top') void s.top.toggle();
  else if (k === 'zoomOut') s.zoom(1.15);
  else if (k === 'zoomIn') s.zoom(1 / 1.15);
  else if (k === 'recenter') s.resetView();
}

function save(b: BattleBuilder) {
  b.slots = withSlot(b.slots, { name: b.name, doc: b.doc });
  store.set(SLOTS_KEY, JSON.stringify(b.slots));
  b.note = store.saved(SLOTS_KEY)
    ? t(`Salvo neste navegador como “${b.name}”.`, `Saved in this browser as “${b.name}”.`)
    : t(
        'O navegador não guardou: o espaço está cheio ou bloqueado.',
        'The browser did not keep it: storage is full or blocked.',
      );
}

// JSON or .ts of the whole battle: a download, the clipboard, and the text in the paste box
function exportBattle(b: BattleBuilder, kind: 'json' | 'ts') {
  const text = kind === 'json' ? toJson(b.doc) : battleToTs(b.doc),
    base = b.doc.map.id,
    name = kind === 'json' ? `${base}-battle.json` : `${base.replace(/_/g, '-')}-battle.ts`;
  const url = URL.createObjectURL(new Blob([text], { type: kind === 'json' ? 'application/json' : 'text/plain' }));
  el('a', { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  const box = b.ui.get('paste') as HTMLTextAreaElement | undefined;
  if (box) box.value = text;
  b.note = t(`Baixado: ${name}.`, `Downloaded: ${name}.`);
  // the clipboard can refuse (no focus, a headless browser): the download and the paste box still hold the text
  navigator.clipboard?.writeText(text).then(
    () => tell(b, t(`Baixado e copiado: ${name}.`, `Downloaded and copied: ${name}.`)),
    () =>
      tell(
        b,
        t(
          `Baixado: ${name}. A área de transferência recusou a cópia.`,
          `Downloaded: ${name}. The clipboard refused the copy.`,
        ),
      ),
  );
}

function importBattle(b: BattleBuilder) {
  const box = b.ui.get('paste') as HTMLTextAreaElement | undefined;
  let raw: unknown = null;
  try {
    raw = JSON.parse(box?.value ?? '');
  } catch {
    raw = null;
  }
  const doc = parseBattleDoc(raw);
  if (!doc) {
    b.note = t(
      'Não é uma batalha do construtor: cole o JSON exportado.',
      'Not a builder battle: paste an exported JSON.',
    );
    return;
  }
  // a look the game cannot draw would leave the scene unbuilt: refused here, at the paste
  const odd = unknownLook(doc.map);
  if (odd) {
    b.note = t(`Um piso que o jogo não desenha: "${odd}".`, `A look the game does not draw: "${odd}".`);
    return;
  }
  b.sel = null;
  b.commit(doc);
  b.note = t(`Importada: ${doc.units.length} unidades.`, `Imported: ${doc.units.length} units.`);
}

function tell(b: BattleBuilder, note: string) {
  b.note = note;
  b.render();
}
