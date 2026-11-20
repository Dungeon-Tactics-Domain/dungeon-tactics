// Pure side of the 3D command menu (menu3d.ts): what it shows, built from the turn screen the HUD draws (the same rows,
// names and greyed states as the HTML menu) and the Agir primeiro lists beside it, which low-poly model stands for each
// row, and what changed between two draws. No DOM or Three here; tested in tests/ui3d.test.ts.
import { ABILITIES, type AbilityDef } from '../../shared/battle/abilities.ts';
import type { Battle } from '../../shared/battle/battle.ts';
import { subOf } from '../../shared/battle/grid.ts';
import type { Element } from '../../shared/battle/units.ts';
import { UNIT_DEFS } from '../../shared/battle/units.ts';
import { type ActRow, type ActTarget, actActions, actList, actTargets, distanceTo } from '../act-flow.ts';
import { actScreen, screenAction } from '../act-marks.ts';
import {
  abilityNote,
  abilityPages,
  actReason,
  commandName,
  distanceText,
  itemDetail,
  itemName,
  kindTag,
} from '../battle-text.ts';
import { type Command, commandEnabled, commandIndex, menuRows } from '../command.ts';
import type { HudView } from '../hud.ts';
import { abilityName, t, unitName } from '../i18n.ts';

export type IconKind =
  | 'boot'
  | 'sword'
  | 'hourglass'
  | 'scroll'
  | 'shield'
  | 'axe'
  | 'bow'
  | 'dagger'
  | 'flame'
  | 'potion';

export const COMMAND_ICON: Record<Command, IconKind> = {
  move: 'boot',
  undo: 'boot', // the move it takes back
  act: 'sword',
  wait: 'hourglass',
  status: 'scroll',
};

// The model that stands for an ability, read from its general stats like every other rule about abilities (no list of
// ids): what heals is a potion, a spell a flame, a far or pushing shot a bow, a short throw or a long reach a dagger, an
// area an axe, a push a shield
export function abilityIcon3d(a: AbilityDef): IconKind {
  if (a.heal[1]) return 'potion';
  if (a.magic) return 'flame';
  if (a.needsSight && a.range[1] > 1) return a.range[1] > 4 || a.push ? 'bow' : 'dagger';
  if (a.radius) return 'axe';
  if (a.push) return 'shield';
  if (a.range[1] > 1) return 'dagger';
  return 'sword';
}

export interface MenuRow {
  label: string;
  note: string; // an ability's cost and ticks; greyed out, what is missing
  off: boolean;
  kind: IconKind;
  element?: Element;
  below?: boolean; // the note goes on a line under the name (column.ts)
}
export interface SheetView {
  owner: string; // who has the action, on the sheet's head
  name: string;
  kind: IconKind;
  element?: Element;
  pages: { title: string; text: string }[];
  page: number;
}
export interface MenuView {
  head: string; // the acting unit's name, on the command menu's head
  rows: MenuRow[]; // menuRows: Agir · Move · Undo move · Wait · Status, Move and Undo only when they apply
  commands: number[]; // each row's place in COMMANDS, what a click on it chooses
  index: number; // the focused row, or the picked one (Agir) while a list is open
  sub: MenuRow[] | null; // the Agir primeiro lists (act-flow.ts) beside the menu, while one is open
  subTitle: string; // the list's head
  subIndex: number;
  sheet: SheetView | null; // the focused action on the Agir action list
}

const PAGE_TITLE = [() => t('Descrição', 'Description'), () => t('Efeitos', 'Effects'), () => t('Custo', 'Cost')];
const PAGE_EMPTY = [
  () => '',
  () => t('Nenhum efeito além do golpe.', 'No effect beyond the strike.'),
  () => t('Sem custo; sai na hora.', 'No cost; fires at once.'),
];
// each fact of the sheet on its own line, as a sentence
const lines = (facts: string[], i: number) =>
  facts.length ? facts.map((f) => `${f[0].toUpperCase()}${f.slice(1)}.`).join('\n') : PAGE_EMPTY[i]();

// The sheet of the focused row of the action list: an ability's three pages, or an item's one (what it does, itemDetail:
// an item has no reach, effects and cost pages to fill)
export function sheetView(b: Battle, s: Extract<HudView['screen'], { k: 'actions' }>): SheetView | null {
  const a = actActions(b, s.target)[s.index];
  if (!a) return null;
  const owner = unitName(b.actor.def);
  if (a.k === 'item')
    return {
      owner,
      name: itemName(a.id),
      kind: 'potion',
      pages: [{ title: PAGE_TITLE[0](), text: itemDetail(a.id) }],
      page: 0,
    };
  const pages = abilityPages(a.id).map((facts, i) => ({ title: PAGE_TITLE[i](), text: lines(facts, i) }));
  return { owner, name: abilityName(a.id), ...iconOf(a.id), pages, page: (s.page ?? 0) % pages.length };
}

// The command menu's column: the acting unit's name on its head and the rows menuRows shows (Move and Undo move only when
// they apply), each standing for its place in COMMANDS
function column(b: Battle) {
  const cmds = menuRows(b);
  return {
    head: unitName(b.actor.def),
    rows: cmds.map((c) => ({ label: commandName(c), note: '', off: !commandEnabled(b, c), kind: COMMAND_ICON[c] })),
    commands: cmds.map(commandIndex),
  };
}

// The menu of a turn screen, or null while it is closed (`open`: a hero's turn with nothing playing)
export function menuView(v: HudView, open: boolean): MenuView | null {
  const s = v.screen;
  if (open && actScreen(s) && s.k !== 'aim' && (s.k !== 'spot' || s.lock)) return actView(v, s);
  if (!open || s.k !== 'menu') return null;
  const col = column(v.battle);
  return { ...col, index: col.commands.indexOf(s.index), sub: null, subTitle: '', subIndex: -1, sheet: null };
}

// The Agir primeiro lists in the submenu's place, under the command menu with Act picked: the targets (who, with its life)
// or the actions on the picked one (an off one says why in its note, Fernando's grill of Nov 19: always visible), or a
// charge's lock step on the tile choice (the character, the tile)
function actView(v: HudView, s: Extract<HudView['screen'], { k: 'acts' | 'targets' | 'actions' | 'spot' }>): MenuView {
  const b = v.battle;
  const charge = s.k === 'spot' ? screenAction(b, s)?.id : undefined;
  const sub: MenuRow[] =
    s.k === 'spot'
      ? [
          { label: t('No personagem', 'On the character'), note: '', off: false, kind: 'sword' },
          { label: t('Na casa', 'On the tile'), note: '', off: false, kind: 'boot' },
        ]
      : s.k === 'acts'
        ? actList(b).map((a) => listRow(b, a))
        : s.k === 'targets'
          ? actTargets(b, s.only).map((r) => targetRow(b, r))
          : actActions(b, s.target).map((a) => listRow(b, a));
  return {
    ...column(b),
    index: menuRows(b).map(commandIndex).indexOf(commandIndex('act')),
    sub,
    subTitle:
      s.k === 'spot'
        ? t(`${abilityName(charge ?? '')}: travar onde?`, `${abilityName(charge ?? '')}: lock on?`)
        : s.k === 'acts'
          ? t('Agir', 'Act')
          : s.k === 'targets'
            ? t('Alvo', 'Target')
            : t('Ação', 'Action'),
    subIndex: s.k === 'spot' ? (s.lock === 'tile' ? 1 : 0) : s.index,
    sheet: s.k === 'actions' ? sheetView(b, s) : null,
  };
}

// a row of the target list: who, its life and how far it is from the acting unit now (cells: half tiles, as Move shows)
function targetRow(b: Battle, r: ActTarget): MenuRow {
  if (r.k === 'direct')
    return { label: abilityName(r.ability), note: t('na área', 'on the area'), off: false, ...iconOf(r.ability) };
  const u = b.state.units.find((x) => x.id === r.unit)!;
  const mine = u.team === b.actor.team;
  // the shield or sword icon says ally or enemy; the word went so the name keeps its size (Nov 19 capture)
  const self = u.id === b.actor.id;
  const far = self ? t('você', 'you') : distanceText(distanceTo(b, u.id), subOf(b.grid) > 1);
  const note = [`${u.hp}/${UNIT_DEFS[u.def].hp}`, far].join(' · ');
  return { label: unitName(u.def), note, off: false, kind: mine ? 'shield' : 'sword' };
}

// a row of the Agir list or of the actions screen: an off one says why below its name (Fernando's grill of Nov 19)
function listRow(b: Battle, a: ActRow): MenuRow {
  if (a.k === 'pick') return { label: t('Escolher alvo', 'Pick a target'), note: '', off: false, kind: 'sword' };
  const off = { off: !a.enabled, below: !a.enabled };
  if (a.k === 'item')
    return {
      label: itemName(a.id),
      note: [kindTag(a), a.enabled ? `×${a.count}` : actReason(a)].filter(Boolean).join(' · '),
      kind: 'potion',
      ...off,
    };
  return {
    label: abilityName(a.id),
    note: [kindTag(a), a.enabled ? abilityNote(b.actor, ABILITIES[a.id], true) : actReason(a)]
      .filter(Boolean)
      .join(' · '),
    ...iconOf(a.id),
    ...off,
  };
}
const iconOf = (id: string) => ({ kind: abilityIcon3d(ABILITIES[id]), element: ABILITIES[id].element });

// What changed from the last draw, for the menu's animations: it comes in or leaves (a confirmed row flashes on its way
// out), the list opens in a cascade or folds back (Esc), the focus moves, the page turns
export type Change = 'enter' | 'leave' | 'cascade' | 'fold' | 'focus' | 'page';
export function changes(prev: MenuView | null, next: MenuView | null): Set<Change> {
  const out = new Set<Change>();
  if (!prev && !next) return out;
  if (!next) return out.add('leave');
  if (!prev) {
    out.add('enter');
    if (next.sub) out.add('cascade');
    return out;
  }
  if (!prev.sub && next.sub) out.add('cascade');
  if (prev.sub && !next.sub) out.add('fold');
  const focus = (v: MenuView) => (v.sub ? `s${v.subIndex}` : `m${v.index}`);
  if (focus(prev) !== focus(next)) out.add('focus');
  if (prev.sheet && next.sheet && prev.sheet.page !== next.sheet.page) out.add('page');
  return out;
}
