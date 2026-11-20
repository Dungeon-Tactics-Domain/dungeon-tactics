// Pure side of the 3D command menu (menu3d.ts): what it shows, built from the turn screen the HUD draws (the same rows,
// names and greyed states as the HTML menu) and the Agir primeiro lists beside it, which low-poly model stands for each
// row, and what changed between two draws. No DOM or Three here; tested in tests/ui3d.test.ts.
import { ABILITIES, type AbilityDef } from '../../shared/battle/abilities.ts';
import type { Battle } from '../../shared/battle/battle.ts';
import { subOf } from '../../shared/battle/grid.ts';
import type { Element } from '../../shared/battle/units.ts';
import { UNIT_DEFS } from '../../shared/battle/units.ts';
import {
  type ActGroup,
  type ActRef,
  type ActRow,
  type ActTarget,
  actActions,
  actGroup,
  actList,
  actTargets,
  distanceTo,
  groupOf,
  sameRef,
} from '../act-flow.ts';
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
import { type Command, canAct, commandEnabled, commandIndex, menuRows, swimming } from '../command.ts';
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
  // how deep the open list is: 0 the menu alone, 1 the Agir list beside it, 2 and on the list before it took the menu's
  // place (Fernando's grill, Nov 19: the second column slides left over the first, the third opens where it was)
  depth: number;
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

// The sheet of the focused row of the action list or of the Agir list (on or off: Fernando, Nov 19, the cursor passes over
// an off one to read it): an ability's three pages, or an item's one (what it does, itemDetail: an item has no reach,
// effects and cost pages to fill)
export function sheetView(b: Battle, a: ActRow | undefined, page = 0): SheetView | null {
  if (!a || a.k === 'pick' || a.k === 'group') return null;
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
  return { owner, name: abilityName(a.id), ...iconOf(a.id), pages, page: page % pages.length };
}

// The command menu's column: the acting unit's name on its head and the rows menuRows shows (Move and Undo move only when
// they apply), each standing for its place in COMMANDS
function column(b: Battle) {
  const cmds = menuRows(b);
  return {
    head: unitName(b.actor.def),
    rows: cmds.map((c) => ({
      label: commandName(c),
      note: c === 'act' ? actNote(b) : '',
      off: !commandEnabled(b, c),
      kind: COMMAND_ICON[c],
    })),
    commands: cmds.map(commandIndex),
  };
}

// The Agir row's note (Fernando, Nov 19): a big dot for the main action and a small one for the secondary, hollow once
// spent, after why nothing can be done this turn when so (the row still opens, to look at the actions and their reach)
function actNote(b: Battle) {
  const { turn } = b.state;
  const dots = `${turn.main ? '◯' : '⬤'} ${turn.bonus ? '○' : '●'}`;
  const why = !canAct(b)
    ? swimming(b)
      ? t('na água', 'in water')
      : t('sem ações', 'no actions')
    : actList(b).some((r) => r.k !== 'pick' && r.enabled)
      ? ''
      : t('sem alvos', 'no targets');
  return [why, dots].filter(Boolean).join('  ');
}

// The menu of a turn screen, or null while it is closed (`open`: a hero's turn with nothing playing)
export function menuView(v: HudView, open: boolean): MenuView | null {
  const s = v.screen;
  if (open && actScreen(s) && s.k !== 'aim' && (s.k !== 'spot' || s.lock)) return actView(v, s);
  if (!open || s.k !== 'menu') return null;
  const col = column(v.battle);
  return { ...col, index: col.commands.indexOf(s.index), depth: 0, sub: null, subTitle: '', subIndex: -1, sheet: null };
}

type ListScreen = Extract<HudView['screen'], { k: 'acts' | 'group' | 'targets' | 'actions' | 'spot' }>;
const GROUP_NAME: Record<ActGroup, () => string> = {
  skills: () => t('Técnicas', 'Skills'),
  magic: () => t('Magias', 'Magic'),
  items: () => t('Itens', 'Items'),
};
const GROUP_ICON: Record<ActGroup, IconKind> = { skills: 'axe', magic: 'flame', items: 'potion' };

// The list a screen shows, its head and its focused row
function list(b: Battle, s: ListScreen): { title: string; rows: MenuRow[]; index: number } {
  if (s.k === 'spot')
    return {
      title: t(
        `${abilityName(screenAction(b, s)?.id ?? '')}: travar onde?`,
        `${abilityName(screenAction(b, s)?.id ?? '')}: lock on?`,
      ),
      rows: [
        { label: t('No personagem', 'On the character'), note: '', off: false, kind: 'sword' },
        { label: t('Na casa', 'On the tile'), note: '', off: false, kind: 'boot' },
      ],
      index: s.lock === 'tile' ? 1 : 0,
    };
  if (s.k === 'acts') return { title: t('Agir', 'Act'), rows: actList(b).map((a) => listRow(b, a)), index: s.index };
  if (s.k === 'group')
    return { title: GROUP_NAME[s.group](), rows: actGroup(b, s.group).map((a) => listRow(b, a)), index: s.index };
  if (s.k === 'targets')
    return {
      title: t('Alvo', 'Target'),
      rows: actTargets(b, s.only, s.other).map((r) => targetRow(b, r)),
      index: s.index,
    };
  return { title: t('Ação', 'Action'), rows: actActions(b, s.target).map((a) => listRow(b, a)), index: s.index };
}

// The screen whose list stood beside this one's: it slides into the menu's place while this one opens where it was
// (Fernando's grill, Nov 19). The Agir list's is the menu itself (null), as is the lock step's
function parent(b: Battle, s: ListScreen): ListScreen | null {
  const at = (rows: ActRow[], ref: ActRef) =>
    Math.max(
      0,
      rows.findIndex((r) => sameRef(ref, r)),
    );
  if (s.k === 'group')
    return {
      k: 'acts',
      index: Math.max(
        0,
        actList(b).findIndex((r) => r.k === 'group' && r.group === s.group),
      ),
    };
  if (s.k === 'targets') {
    if (!s.only) return { k: 'acts', index: 0 };
    const group = groupOf(b, s.only);
    return group
      ? { k: 'group', group, index: at(actGroup(b, group), s.only) }
      : { k: 'acts', index: at(actList(b), s.only) };
  }
  if (s.k === 'actions') {
    const i = actTargets(b).findIndex((r) => JSON.stringify(r) === JSON.stringify(s.target));
    return { k: 'targets', index: Math.max(0, i) };
  }
  return null;
}
const depthOf = (b: Battle, s: ListScreen | null): number => (s ? 1 + depthOf(b, parent(b, s)) : 0);

// The Agir primeiro lists in the submenu's place, under the command menu with Act picked: the targets (who, with its life)
// or the actions on the picked one (an off one says why in its note, Fernando's grill of Nov 19: always visible), or a
// charge's lock step on the tile choice (the character, the tile)
function actView(v: HudView, s: ListScreen): MenuView {
  const b = v.battle;
  const here = list(b, s),
    up = parent(b, s);
  const menu = up ? list(b, up) : null;
  return {
    ...column(b),
    ...(menu && { head: menu.title, rows: menu.rows }),
    index: menu ? menu.index : menuRows(b).map(commandIndex).indexOf(commandIndex('act')),
    depth: depthOf(b, s),
    sub: here.rows,
    subTitle: here.title,
    subIndex: here.index,
    sheet:
      s.k === 'actions'
        ? sheetView(b, actActions(b, s.target)[s.index], s.page)
        : s.k === 'acts'
          ? sheetView(b, actList(b)[s.index], s.page)
          : s.k === 'group'
            ? sheetView(b, actGroup(b, s.group)[s.index], s.page)
            : null,
  };
}

// a row of the target list: who, its life and how far it is from the acting unit now (cells: half tiles, as Move shows)
function targetRow(b: Battle, r: ActTarget): MenuRow {
  if (r.k === 'side')
    return r.side === 'ally'
      ? { label: t('Escolher aliados', 'Pick allies'), note: '', off: false, kind: 'shield' }
      : { label: t('Escolher inimigos', 'Pick enemies'), note: '', off: false, kind: 'sword' };
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

// a row of the Agir list or of the actions screen: its note (an off one's reason, Fernando's grill of Nov 19) is a line
// under the name, on or off: with the target count it grew long enough to squeeze the name out beside it (Nov 19 capture)
function listRow(b: Battle, a: ActRow): MenuRow {
  if (a.k === 'pick')
    return a.enabled
      ? { label: t('Escolher alvo', 'Pick a target'), note: '', off: false, kind: 'sword' }
      : {
          label: t('Escolher alvo', 'Pick a target'),
          note: t('sem alvos', 'no targets'),
          off: true,
          below: true,
          kind: 'sword',
        };
  if (a.k === 'group')
    return {
      label: GROUP_NAME[a.group](),
      note: a.enabled ? reachText(a) : t('sem alvos', 'no targets'),
      off: !a.enabled,
      below: true,
      kind: GROUP_ICON[a.group],
    };
  const off = { off: !a.enabled, below: true };
  if (a.k === 'item')
    return {
      label: itemName(a.id),
      note: [kindTag(a), a.enabled ? `×${a.count}` : actReason(a), reachText(a)].filter(Boolean).join(' · '),
      kind: 'potion',
      ...off,
    };
  return {
    label: abilityName(a.id),
    note: [kindTag(a), a.enabled ? abilityNote(b.actor, ABILITIES[a.id], true) : actReason(a), reachText(a)]
      .filter(Boolean)
      .join(' · '),
    ...iconOf(a.id),
    ...off,
  };
}
// how many targets a row of the Agir list has this turn (only that list counts them)
const reachText = (a: { reach?: number }) =>
  a.reach ? t(`${a.reach} alvo${a.reach > 1 ? 's' : ''}`, `${a.reach} target${a.reach > 1 ? 's' : ''}`) : '';
const iconOf = (id: string) => ({ kind: abilityIcon3d(ABILITIES[id]), element: ABILITIES[id].element });

// What changed from the last draw, for the menu's animations: it comes in or leaves (a confirmed row flashes on its way
// out), the list opens in a cascade or folds back (Esc), the focus moves, the page turns
// `deeper`, `shallower`: a list opened from the one beside the menu, or closed back to it (the columns slide)
export type Change = 'enter' | 'leave' | 'cascade' | 'fold' | 'focus' | 'page' | 'deeper' | 'shallower';
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
  if (prev.sub && next.sub && next.depth > prev.depth) out.add('deeper');
  if (prev.sub && next.sub && next.depth < prev.depth) out.add('shallower');
  const focus = (v: MenuView) => (v.sub ? `s${v.depth}.${v.subIndex}` : `m${v.index}`);
  if (focus(prev) !== focus(next)) out.add('focus');
  if (prev.sheet && next.sheet && prev.sheet.page !== next.sheet.page) out.add('page');
  return out;
}
