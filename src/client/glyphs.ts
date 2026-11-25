// What a key hint shows (Fernando, Nov 17: gamepad icons in place of the keys): the one table action → key → pad button,
// the controller's family from its `gamepad.id`, and which of them the screen shows, by the Options and by the input last
// used. Every hint, key cap and help line of the game reads this table; no key is written by hand anywhere else. Pure
// and tested (tests/glyphs.test.ts): no DOM, no Three. The drawing is glyph-art.ts, the live state key-hints.ts.
import { t } from './i18n.ts';

export type Family = 'xbox' | 'playstation' | 'switch';
export type Shown = 'keyboard' | Family; // what the hints are drawn as
export type GlyphMode = 'auto' | Shown; // the Options' choice (dt:glyphs)
export const GLYPH_MODES: GlyphMode[] = ['auto', 'keyboard', 'xbox', 'playstation', 'switch'];
export const parseGlyphMode = (v: string | null | undefined): GlyphMode =>
  GLYPH_MODES.includes(v as GlyphMode) ? (v as GlyphMode) : 'auto';

// The family by the pad's id, as the browsers write it ("Xbox 360 Controller (XInput STANDARD GAMEPAD)", "DualSense
// Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)", Firefox's "054c-0ce6-…"): the maker's USB id
// first, then the name. One it does not know is drawn as an Xbox pad (Fernando's decision)
export function familyOf(id: string): Family {
  const s = id.toLowerCase();
  if (/054c|playstation|dualsense|dualshock|ps[345]\b/.test(s)) return 'playstation';
  if (/057e|nintendo|switch|joy-?con|pro controller/.test(s)) return 'switch';
  return 'xbox';
}

// Automatic follows the input last used: a pad button brings the pad's icons, a key brings the keys back, and the mouse
// changes nothing (it never reaches here). A fixed choice holds whatever is plugged in
export const shownFor = (mode: GlyphMode, last: 'key' | 'pad', family: Family): Shown =>
  mode === 'auto' ? (last === 'pad' ? family : 'keyboard') : mode;

// a pad counts as in use while a button is down or a stick is off its rest (gamepad.ts DEAD)
export const padBusy = (buttons: boolean[], axes: number[]) =>
  buttons.some(Boolean) || axes.some((a) => Math.abs(a) > 0.5);

// A pad button by where it sits (the browser's standard mapping, gamepad.ts): the face buttons by position, since each
// family writes another letter on them
export type PadGlyph =
  | 'south'
  | 'east'
  | 'west'
  | 'north'
  | 'lb'
  | 'rb'
  | 'lt'
  | 'rt'
  | 'select'
  | 'start'
  | 'dpad' // the whole cross
  | 'dpadH' // its left and right arms
  | 'dpadV' // its up and down arms
  | 'lstick'
  | 'rstick'
  | 'r3' // pressing the right stick
  | 'l3'; // pressing the left stick

// which button of gamepad.ts each glyph is (its index in the standard mapping; a stick has none)
export const PAD_INDEX: Partial<Record<PadGlyph, number>> = {
  south: 0,
  east: 1,
  west: 2,
  north: 3,
  lb: 4,
  rb: 5,
  lt: 6,
  rt: 7,
  select: 8,
  start: 9,
  l3: 10,
  r3: 11,
};

// Everything the game shows a key for. `keys`: one cap each, as keyboard.ts reads them; `pad`: the buttons that do the
// same on a gamepad, empty when none does (the hint then hides while the pad's icons show)
export const ACTIONS = {
  confirm: { keys: ['Enter'], pad: ['south'] },
  cancel: { keys: ['Esc'], pad: ['east'] },
  status: { keys: ['C'], pad: ['west'] },
  info: { keys: ['I'], pad: ['north'] },
  undo: { keys: ['Z'], pad: ['select'] },
  help: { keys: ['H'], pad: ['start'] },
  rotateLeft: { keys: ['⇧R'], pad: ['lb'] },
  rotateRight: { keys: ['R'], pad: ['rb'] },
  zoom: { keys: ['Q', 'E'], pad: ['lt', 'rt'] },
  // zoom, rotate and (keys only: the pad row was 439 of 440 px at 1280, Nov 16) the top view under one hint
  camera: { keys: ['Q', 'E', 'R', 'T'], pad: ['lt', 'rt', 'lb', 'rb'] },
  turns: { keys: ['PgUp', 'PgDn'], pad: ['rstick'] }, // scroll the turn list, or the open window (dialog.ts scrollWindow)
  move: { keys: ['↑', '↓', '←', '→'], pad: ['dpad'] }, // the cursor, a menu's focus
  sides: { keys: ['←', '→'], pad: ['dpadH'] }, // a value, a page
  tabs: { keys: ['Q', 'E'], pad: ['lb', 'rb'] }, // the category before and after, in Options (flow3d/options3d.ts)
  walk: { keys: ['W', 'A', 'S', 'D'], pad: ['lstick'] }, // the town
  wait: { keys: ['P'], pad: [] },
  face: { keys: ['V'], pad: [] },
  cycle: { keys: ['Tab'], pad: [] },
  slots: { keys: ['1'], pad: [] },
  recenter: { keys: ['F'], pad: [] },
  fps: { keys: ['F3'], pad: [] },
  // the turn list folded to its faces and back (hud-queue.ts); on the pad the right stick sideways since R3 went to the
  // top view (Nov 25)
  fold: { keys: ['L'], pad: ['rstick'] },
  // the camera straight down and back (Fernando, Nov 25: as Tactics Ogre's tactical view; scene/top-view.ts)
  top: { keys: ['T'], pad: ['r3'] },
  // the debug panel (game/debug-menu.ts; Fernando, Nov 25: a menu of its own, apart from Esc); the left stick's press
  // is free in battle, since that stick only moves the cursor
  debug: { keys: ['F2'], pad: ['l3'] },
  // the map builder (mapedit/keys.ts; Nov 25): the bar's tools, the brush, undo and redo of an edit, plain ground at
  // the cursor, and the pad's way into the side panel. The pad's X walks the tools one by one
  tools: { keys: ['1', '2', '3', '4', '5', '6', '7', '8', '9'], pad: ['west'] },
  brush: { keys: ['B'], pad: ['north'] },
  editUndo: { keys: ['Ctrl+Z'], pad: ['select'] },
  redo: { keys: ['Ctrl+Y'], pad: [] },
  erase: { keys: ['Del'], pad: ['east'] },
  panel: { keys: ['Tab'], pad: ['start'] },
  // the battle builder's live map edit, on and off (battleedit/live-mode.ts): every pad button already has a battle
  // action, so the pad opens it from the debug panel's row and leaves it with Menu (the map builder's panel button)
  live: { keys: ['M'], pad: [] },
} as const satisfies Record<string, { keys: readonly string[]; pad: readonly PadGlyph[] }>;
export type Act = keyof typeof ACTIONS;

// the actions a gamepad has no button for: their hints hide with the pad's icons (they stay in the menus)
export const PADLESS = (Object.keys(ACTIONS) as Act[]).filter((a) => !ACTIONS[a].pad.length);

// What each family writes on a button. The standard mapping goes by position, so a Switch pad's Confirm (the bottom
// face button) is its B, not its A
const NAMES: Record<Family, Partial<Record<PadGlyph, string>>> = {
  xbox: {
    south: 'A',
    east: 'B',
    west: 'X',
    north: 'Y',
    lb: 'LB',
    rb: 'RB',
    lt: 'LT',
    rt: 'RT',
    select: 'View',
    start: 'Menu',
  },
  playstation: {
    south: '✕',
    east: '○',
    west: '□',
    north: '△',
    lb: 'L1',
    rb: 'R1',
    lt: 'L2',
    rt: 'R2',
    select: 'Share',
    start: 'Options',
  },
  switch: {
    south: 'B',
    east: 'A',
    west: 'Y',
    north: 'X',
    lb: 'L',
    rb: 'R',
    lt: 'ZL',
    rt: 'ZR',
    select: '−',
    start: '+',
  },
};
// a button's name in words, for a line of text and for whoever cannot see the drawing
export function padName(g: PadGlyph, family: Family): string {
  if (g === 'dpad') return t('Direcional', 'D-pad');
  if (g === 'dpadH') return t('Direcional ← →', 'D-pad ← →');
  if (g === 'dpadV') return t('Direcional ↑ ↓', 'D-pad ↑ ↓');
  if (g === 'lstick') return t('Analógico esquerdo', 'Left stick');
  if (g === 'rstick') return t('Analógico direito', 'Right stick');
  if (g === 'r3') return family === 'playstation' ? 'R3' : 'RS';
  if (g === 'l3') return family === 'playstation' ? 'L3' : 'LS';
  return NAMES[family][g] ?? '';
}

// One drawn cap: a key with its letters, or a pad button of a family
export type Cap = { key: string } | { pad: PadGlyph; family: Family };
// the caps of an action as shown now; null when the pad's icons show and the pad has no button for it
export function capsOf(act: Act, shown: Shown): Cap[] | null {
  const a = ACTIONS[act];
  if (shown === 'keyboard') return a.keys.map((key) => ({ key }));
  return a.pad.length ? a.pad.map((pad) => ({ pad, family: shown })) : null;
}
// the same in words ("Enter", "Q E R", "LT RT LB RB", "✕"); null as capsOf
export const keysText = (act: Act, shown: Shown): string | null =>
  capsOf(act, shown)
    ?.map((c) => ('key' in c ? c.key : padName(c.pad, c.family)))
    .join(' ') ?? null;

// A line of hints in words, "Enter: escolher   ·   Esc: sair", without the ones the pad has no button for
export const hintLine = (shown: Shown, pairs: [Act, string][], sep = '   ·   '): string =>
  pairs.flatMap(([act, text]) => (capsOf(act, shown) ? [`${keysText(act, shown)}: ${text}`] : [])).join(sep);
