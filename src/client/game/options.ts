// Options window, opened from the battle's corner menu (H): the settings in four categories (Game, Sound, Display, Help;
// options-list.ts), the tile marks and the controls in windows over it, plus restart, home and developer at the foot.
// It reads and changes the battle only through OptionsContext.
import type { Scenario } from '../../shared/battle/scenarios.ts';
import { choice, dialog, secondTap } from '../dialog.ts';
import { hintLine } from '../glyphs.ts';
import { KEYS } from '../hud-pieces.ts';
import { t } from '../i18n.ts';
import { button, el } from '../icons.ts';
import { keysShown, liveText } from '../key-hints.ts';
import { type Option, optionRow } from '../option-row.ts';
import type { PixelSettings } from '../pixel-settings.ts';
import { store } from '../store.ts';
import { FREE_KEY, GRID_KEY, parseTownFree, parseTownGrid } from '../town-map.ts';
import { goHome, homeLabel } from './crawl.ts';
import { controls, helpRow, tileMarks } from './options-help.ts';
import { settings, townFree, townGrid } from './options-list.ts';
import { devMenu } from './title.ts';

export interface OptionsContext {
  room: boolean; // an expedition room: leaving it loses the expedition (crawl.ts leftRoom)
  scenario: Scenario;
  busy: boolean; // animation or enemy turn running: restart is disabled
  pixel: () => PixelSettings; // the current settings, read on every change
  setPixel: (p: PixelSettings) => void;
  relayout: () => void; // the interface layout changed: what is not laid out by CSS fits again
  restart: () => void;
}

// The walkable town's debug grid (Nov 16, Fernando: off by default): here and in the town menu, since the town has no Options
export const townGridChoice = (onPick: (on: boolean) => void = () => {}) =>
  choice(
    townGrid(),
    [
      [false, t('Desligada', 'Off')],
      [true, t('Ligada', 'On')],
    ],
    parseTownGrid(store.json(GRID_KEY)),
    (on) => {
      store.set(GRID_KEY, JSON.stringify(on));
      onPick(on);
    },
  );
// Fluid movement in the walkable town instead of the half-tile steps (Nov 16, Fernando: off by default, to compare the two)
export const townFreeChoice = (onPick: (on: boolean) => void = () => {}) =>
  choice(
    townFree(),
    [
      [false, t('Desligado', 'Off')],
      [true, t('Ligado', 'On')],
    ],
    parseTownFree(store.json(FREE_KEY)),
    (on) => {
      store.set(FREE_KEY, JSON.stringify(on));
      onPick(on);
    },
  );

// What the Options window holds, built once and shown by either look: the HTML window below or the 3D screen
// (flow3d/options3d.ts), which draws over these same controls
export type OptionsItem = { head: string } | { option: Option } | { link: string };
// a category (Fernando, Nov 18): the HTML window lists them one under the other, the 3D screen shows one at a time
export interface OptionsSection {
  title: string;
  help: string; // what the category holds
  items: OptionsItem[]; // its rows, in order
  rows: HTMLButtonElement[]; // the button of each, in `list`
}
export interface OptionsBoard {
  title: string;
  note: string; // how a row changes, said once, for the input in use (read again whenever it is drawn)
  sections: OptionsSection[];
  list: HTMLElement; // each section's heading and rows
  help: HTMLElement; // what the row under the cursor does
  actions: HTMLButtonElement[]; // restart, home, developer
}
// the 3D screen takes the board while it is set (as end-screens.ts setBoard3d); undefined from it: no room, the HTML one
type Show3d = (board: OptionsBoard) => { close(): void } | undefined;
let options3d: Show3d | undefined;
export const setOptions3d = (show?: Show3d) => void (options3d = show);

export function optionsWindow(b: OptionsBoard): { close(): void } {
  const d = dialog('menu', b.title, [b.list, b.help, el('div', { class: 'menu-actions' }, ...b.actions)], {
    note: liveText('opt-keys', () => b.note),
  });
  // the goal line left the window (Fernando, Nov 18: the battle's banner already says it): the window's rows without it
  d.overlay.querySelector<HTMLElement>('.dialog')!.style.gridTemplateRows = 'auto minmax(0, 1fr) auto auto';
  return d;
}

// Options (Nov 16, Fernando: the interface on its Final Fantasy Tactics counterpart): the current value at the right of
// each row, left and right change it and the description says what the focused row does. Four categories since Nov 18
// (Game, Sound, Display, Help); what is not a setting (tile marks, controls) opens from Help's rows
export function optionsMenu(o: OptionsContext) {
  const help = el('p', { class: 'opt-help', 'aria-live': 'polite' });
  const describe = (text: string) => (help.textContent = text);
  const marks = t('Marcas do mapa', 'Tile marks'),
    keys = t('Controles', 'Controls');
  const sections: OptionsSection[] = [
    ...settings(o).map((g) => ({
      title: g.title,
      help: g.help,
      items: g.rows.map((option): OptionsItem => ({ option })),
      rows: g.rows.map((r) => optionRow(r, describe)),
    })),
    {
      title: t('Ajuda', 'Help'),
      help: t('O que as marcas do mapa querem dizer e como se joga.', 'What the tile marks mean and how to play.'),
      items: [{ link: marks }, { link: keys }],
      rows: [
        helpRow(
          marks,
          t(
            'O que cada cor e desenho no chão da batalha quer dizer.',
            'What each colour and pattern on the battle floor means.',
          ),
          tileMarks,
          describe,
        ),
        helpRow(
          keys,
          t(
            'Mouse, teclado, controle e toque: o que cada um faz.',
            'Mouse, keyboard, gamepad and touch: what each one does.',
          ),
          controls,
          describe,
        ),
      ],
    },
  ];
  const board: OptionsBoard = {
    title: t('Opções', 'Options'),
    // the keys on a PC, the drawn arrows on touch
    get note() {
      return KEYS
        ? hintLine(keysShown(), [['sides', t('mudar o valor', 'change the value')]])
        : t('◀ ▶ mudam o valor', '◀ ▶ change the value');
    },
    sections,
    list: el('div', { class: 'camp-list opt-list' }, ...sections.flatMap((s) => [el('h3', {}, s.title), ...s.rows])),
    help,
    actions: [
      // during the animation or the enemy turn the loop is still running the old battle
      // the 1st tap only asks: restart erases the saved battle and cannot be undone (mobile audit of Oct 25)
      // a disabled button says why in its own text (design system, Disabled)
      button(
        'secondary',
        o.busy
          ? t('Reiniciar batalha: espere a sua vez', 'Restart battle: wait for your turn')
          : t('Reiniciar batalha', 'Restart battle'),
        (e: Event) => {
          if (!secondTap(e, t('Confirmar: reiniciar a batalha', 'Confirm: restart the battle'))) return;
          d.close();
          o.restart();
        },
        { disabled: o.busy },
      ),
      // home: the town (crawl.ts homeScreen); from a room the 2nd tap confirms losing the expedition
      button('secondary', o.room ? t('Sair da sala', 'Leave the room') : homeLabel(), (e: Event) => {
        if (o.room && !secondTap(e, t('Confirmar: perde a expedição', 'Confirm: the expedition is lost'))) return;
        goHome();
      }),
      button('secondary', t('Desenvolvedor', 'Developer'), () => {
        d.close();
        devMenu();
      }),
    ],
  };
  const three = options3d?.(board); // it puts the cursor on its first category
  const d = three ?? optionsWindow(board);
  if (!three) sections[0].rows[0].focus();
}
