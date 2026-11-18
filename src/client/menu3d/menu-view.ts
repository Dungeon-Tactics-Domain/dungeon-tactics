// Pure side of the 3D command menu (menu3d.ts): what it shows, built from the turn screen the HUD draws (the same rows,
// names and greyed states as the HTML menu), which low-poly model stands for each row, and what changed between two
// draws. No DOM or Three here; tested in tests/ui3d.test.ts.
import { ABILITIES, type AbilityDef } from '../../shared/battle/abilities.ts';
import type { Element } from '../../shared/battle/units.ts';
import { abilityNote, abilityPages, commandName } from '../battle-text.ts';
import { abilitiesOf, abilityEnabled, type Command, commandEnabled, commandIndex, menuRows } from '../command.ts';
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
}
export interface SheetView {
  owner: string; // who has the ability, on the sheet's head
  name: string;
  kind: IconKind;
  element?: Element;
  pages: { title: string; text: string }[];
  page: number;
}
export interface MenuView {
  head: string; // the acting unit's name, on the command menu's head
  rows: MenuRow[]; // menuRows: Move · Undo move · Abilities · Wait · Status, Move and Undo only when they apply
  commands: number[]; // each row's place in COMMANDS, what a click on it chooses
  index: number; // the focused row, or the picked one (Abilities) while the submenu is open
  sub: MenuRow[] | null; // the abilities, while the submenu is open
  subIndex: number;
  sheet: SheetView | null; // the focused ability
}

const PAGE_TITLE = [() => t('Descrição', 'Description'), () => t('Efeitos', 'Effects'), () => t('Custo', 'Cost')];
const PAGE_EMPTY = [
  () => '',
  () => t('Nenhum efeito além do golpe.', 'No effect beyond the strike.'),
  () => t('Sem custo; sai na hora.', 'No cost; fires at once.'),
];
// each fact of the ability sheet on its own line, as a sentence
const lines = (facts: string[], i: number) =>
  facts.length ? facts.map((f) => `${f[0].toUpperCase()}${f.slice(1)}.`).join('\n') : PAGE_EMPTY[i]();

// The menu of a turn screen, or null while it is closed (`open`: a hero's turn with nothing playing)
export function menuView(v: HudView, open: boolean): MenuView | null {
  const s = v.screen;
  if (!open || (s.k !== 'menu' && s.k !== 'abilities')) return null;
  const b = v.battle;
  const owner = unitName(b.actor.def);
  const cmds = menuRows(b);
  const ids = s.k === 'abilities' ? abilitiesOf(b) : null;
  const icon = (id: string) => ({ kind: abilityIcon3d(ABILITIES[id]), element: ABILITIES[id].element });
  const id = ids?.[s.index];
  return {
    head: owner,
    rows: cmds.map((c) => ({
      label: commandName(c),
      note: '',
      off: !commandEnabled(b, c),
      kind: COMMAND_ICON[c],
    })),
    commands: cmds.map(commandIndex),
    index: cmds.map(commandIndex).indexOf(s.k === 'menu' ? s.index : commandIndex('act')),
    sub:
      ids?.map((a) => {
        const on = abilityEnabled(b, a);
        return { label: abilityName(a), note: abilityNote(b.actor, ABILITIES[a], on), off: !on, ...icon(a) };
      }) ?? null,
    subIndex: ids ? s.index : -1,
    sheet:
      s.k === 'abilities' && id
        ? {
            owner,
            name: abilityName(id),
            ...icon(id),
            pages: abilityPages(id).map((facts, i) => ({ title: PAGE_TITLE[i](), text: lines(facts, i) })),
            page: s.page ?? 0,
          }
        : null,
  };
}

// What changed from the last draw, for the menu's animations: it comes in or leaves (a confirmed row flashes on its way
// out), the submenu opens in a cascade or folds back (Esc), the focus moves, the page turns
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
