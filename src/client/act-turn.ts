// The keys, taps and rows of the Agir primeiro screens (act-flow.ts) on a hero's turn: hero-turn.ts hands them here, so it
// stays a dispatcher. Up and down walk a list (never onto an off row), any arrow walks the tiles on the tile choice,
// Confirm goes one screen on, and Cancel is cancelStep's, as on the other screens
import { ABILITIES, defaultLock } from '../shared/battle/abilities.ts';
import type { ActionKind } from '../shared/battle/action-slots.ts';
import type { Battle } from '../shared/battle/battle.ts';
import { inBounds, samePos, subOf } from '../shared/battle/grid.ts';
import { aimTile } from '../shared/battle/pathing.ts';
import type { Lock, Pos } from '../shared/battle/types.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';
import {
  type ActRef,
  type ActTarget,
  actActions,
  actAims,
  actGroup,
  actList,
  actTargets,
  bestSpot,
  freeArea,
  groupOf,
  needsSlot,
  runSpot,
  sameRef,
  spotAt,
  targetAt,
  withAim,
} from './act-flow.ts';
import { actScreen, aimAt, screenAction } from './act-marks.ts';
import { needsLock, type Screen, stepIndex, turnPage } from './command.ts';
import type { KeyAction } from './keyboard.ts';
import { sfx } from './sound.ts';
import { neighbour } from './ui3d/walk.ts';

// what the Agir screens need of the hero's turn and the Game
export interface ActHost {
  readonly battle: Battle;
  screen: Screen;
  update(): void;
  // the cursor goes to `p`, the camera between the actor and `p`; with `at` (a tile to act from), between `p`, where
  // the actor will stand, and `at`, what it strikes
  focus(p: Pos, at?: Pos): void;
  runAct(run: (b: Battle) => ReturnType<Battle['move']>): Promise<void>;
  at(p: Pos): { x: number; y: number }; // where a tile is on screen, in pixels (the arrows walk what is seen)
  flat?(p: Pos): { x: number; y: number }; // the same at ground level 0: the grid's own axes, unbent by slopes
  remember(r: ActRef): void; // the action about to run: Agir opens on it next time (actStart)
}

// the lock step's rows, in order (menu-view.ts draws them)
export const LOCKS: Lock[] = ['unit', 'tile'];
// the slot step's rows, in order: the main action above the secondary
export const SLOTS: ActionKind[] = ['main', 'bonus'];

// the two-row step on the tile choice (a charge's lock or a dual action's slot): its rows and the one focused
const stepOf = (s: Screen) =>
  s.k !== 'spot' ? null : s.lock ? { rows: LOCKS, at: s.lock } : s.slot ? { rows: SLOTS, at: s.slot } : null;

export function actKey(h: ActHost, a: KeyAction): void {
  const s = h.screen;
  if (!actScreen(s)) return;
  // the step's two rows (the character above the tile; the main action above the secondary)
  const step = stepOf(s);
  if (step) {
    if (a.k === 'confirm') return void actPick(h, (step.rows as string[]).indexOf(step.at));
    if (a.k === 'cursor' && (a.dir === 'up' || a.dir === 'down')) actHover(h, a.dir === 'up' ? 0 : 1);
    return;
  }
  if (a.k === 'confirm') return void actPick(h, s.k === 'aim' ? 0 : s.index);
  // the action sheet's pages: left and right turn them back and forth, Details (I, the pad's north button) goes on
  if (
    (s.k === 'actions' || s.k === 'acts' || s.k === 'group') &&
    (a.k === 'info' || (a.k === 'cursor' && (a.dir === 'left' || a.dir === 'right')))
  ) {
    actPage(h, a.k === 'cursor' && a.dir === 'left' ? -1 : 1);
    return;
  }
  if (a.k !== 'cursor') return;
  // on the map the arrow goes to the nearest aim or tile that way on screen, as the 3D windows do (neighbour); a grid
  // step was a slant on the diamond view and missed (Fernando, Nov 19: "the arrows don't go the right way")
  if (s.k === 'aim') {
    const at = stepAim(h, s.at, a.dir);
    if (at) select(h, { ...s, at });
    return;
  }
  if (s.k === 'spot') {
    const boxes = (mapPoints(h.battle, s) ?? []).map((p) => ({ ...h.at(p), w: 0, h: 0 }));
    const index = neighbour(boxes, s.index, a.dir);
    if (index !== s.index) select(h, { ...s, index });
    return;
  }
  // on the target list left and right walk the listed units on the map as they are seen, up and down the list: the
  // list and the map are one choice (Fernando's grill, Nov 19: "the three at the same time")
  if (s.k === 'targets' && (a.dir === 'left' || a.dir === 'right')) {
    const units = actTargets(h.battle, s.only, s.other).flatMap((r, i) =>
      r.k === 'unit' ? [{ i, ...h.at(r.pos) }] : [],
    );
    const at = units.findIndex((u) => u.i === s.index);
    const next = neighbour(
      units.map((u) => ({ x: u.x, y: u.y, w: 0, h: 0 })),
      at,
      a.dir,
    );
    if (at >= 0 && next !== at) select(h, { ...s, index: units[next].i });
    return;
  }
  if (a.dir !== 'up' && a.dir !== 'down') return;
  const index = stepIndex(s.index, a.dir === 'up' ? -1 : 1, enabledRows(h.battle, s));
  if (index !== s.index) select(h, moved(s, index));
}

// where the Agir list opens: on the unit's last action while it is on (its group's row for one in a group), else on
// "Escolher alvo" (Fernando's grill, Nov 19)
export function actStart(b: Battle, last?: ActRef): Screen {
  const group = last && groupOf(b, last);
  const on = last && (group ? actGroup(b, group) : actList(b)).some((r) => sameRef(last, r) && r.enabled);
  const i = on ? actList(b).findIndex((r) => (group ? r.k === 'group' && r.group === group : sameRef(last, r))) : -1;
  return { k: 'acts', index: Math.max(0, i) };
}

// the action sheet turns to its next or previous page
export function actPage(h: ActHost, dir: 1 | -1): void {
  const s = h.screen;
  if (s.k !== 'actions' && s.k !== 'acts' && s.k !== 'group') return;
  sfx('cursor');
  h.screen = { ...s, page: turnPage(s.page ?? 0, dir) };
  h.update();
}

// another row of the list is focused: an action opens its sheet on the first page
const moved = (s: Extract<Screen, { k: 'acts' | 'group' | 'targets' | 'actions' }>, index: number): Screen =>
  s.k === 'actions'
    ? { k: 'actions', target: s.target, index }
    : s.k === 'acts'
      ? { k: 'acts', index }
      : s.k === 'group'
        ? { k: 'group', group: s.group, index }
        : { ...s, index };

// the mouse or Tab on a list row moves the focus there, as the arrows would
export function actHover(h: ActHost, index: number): void {
  const s = h.screen;
  if (s.k === 'spot' && s.lock) {
    if (LOCKS[index] && LOCKS[index] !== s.lock) select(h, { ...s, lock: LOCKS[index] });
    return;
  }
  if (s.k === 'spot' && s.slot) {
    if (SLOTS[index] && SLOTS[index] !== s.slot) select(h, { ...s, slot: SLOTS[index] });
    return;
  }
  if (!actScreen(s) || s.k === 'spot' || s.k === 'aim' || s.index === index || !enabledRows(h.battle, s)[index]) return;
  select(h, moved(s, index));
}

// the row a map tile stands for on this screen: a listed unit, an aim or a tile to act from; -1 for none
function indexAt(b: Battle, s: Screen, p: Pos): number {
  if (s.k === 'targets') return targetAt(actTargets(b, s.only, s.other), b, p);
  if (s.k === 'spot' && !stepOf(s)) return spotAt(screenAction(b, s)!, p, UNIT_DEFS[b.actor.def].size ?? 1);
  return -1;
}

// the aim step's free cursor: the whole tile next to `at` along the grid axis the arrow stands for, anywhere on the map
// (Nov 21). Picking the nearest neighbour on screen zigzagged on the diamond view and two arrows could share an axis
// (Fernando, Nov 24: "o movimento esta bugando com o direcional"): the 4 axes, in their order around the screen, go to
// the 4 arrows with the turn that fits best, a near tie kept on the first turn, so each arrow keeps one axis
const AXES: Pos[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];
const ARROW = { right: 0, down: 1, left: 2, up: 3 }; // clockwise from the right on screen (y down)
const TIE = 0.15; // radians of error a later turn must save to win: the perspective's slant is under it
function stepAim(h: ActHost, at: Pos, dir: 'up' | 'down' | 'left' | 'right'): Pos | null {
  const k = subOf(h.battle.grid),
    seen = h.flat ?? h.at, // ground level: a raised tile bent the axis (Nov 24)
    o = seen(at);
  const turn = (a: number) => (a + 2 * Math.PI) % (2 * Math.PI);
  // off the map there is no tile to measure (it threw on a corner): the opposite neighbour, turned half round, is the axis
  const axes = AXES.map((d) => {
    const p = { x: at.x + d.x * k, y: at.y + d.y * k },
      out = !inBounds(h.battle.grid, p),
      c = seen(out ? { x: at.x - d.x * k, y: at.y - d.y * k } : p);
    return { d, a: turn(Math.atan2(c.y - o.y, c.x - o.x) + (out ? Math.PI : 0)) };
  }).sort((p, q) => p.a - q.a);
  const off = (a: number, b: number) => Math.min(turn(a - b), turn(b - a));
  let best = 0,
    least = Infinity;
  for (let r = 0; r < 4; r++) {
    const err = axes.reduce((sum, _, i) => sum + off(axes[(i + r) % 4].a, (i * Math.PI) / 2), 0);
    if (err < least - TIE) [best, least] = [r, err];
  }
  const d = axes[(ARROW[dir] + best) % 4].d,
    p = { x: at.x + d.x * k, y: at.y + d.y * k };
  return inBounds(h.battle.grid, p) ? p : null; // at the map's edge it stops
}
const sameAim = (b: Battle, p: Pos, q: Pos) => samePos(aimTile(b.grid, b.state, p), aimTile(b.grid, b.state, q));

// a tap on the map: on the target list a unit picks its row (twice: goes on), on the tile choice a tile does the same.
// The camera stays: sliding to the tile moved it from under the pointer, so a 2nd click on the same pixel missed it
export function actTap(h: ActHost, p: Pos): boolean {
  const s = h.screen;
  if (!actScreen(s)) return false;
  if (s.k === 'aim') {
    if (sameAim(h.battle, p, s.at)) void actPick(h, 0);
    else select(h, { ...s, at: p }, false);
    return true;
  }
  const i = indexAt(h.battle, s, p);
  // a unit of the side the list is not showing (Nov 25 split): the list swaps to that side, on its row
  if (i < 0 && s.k === 'targets') {
    const other = { ...s, other: !s.other },
      j = indexAt(h.battle, other, p);
    if (j >= 0) select(h, { ...other, index: j }, false);
    return true;
  }
  if (i < 0) return true; // also the lock and slot steps, answered on their rows
  if (i === s.index) void actPick(h, i);
  else select(h, { ...s, index: i }, false);
  return true;
}

// the mouse over the map focuses the unit, aim or tile under it, as a first click would (the camera stays)
export function actHoverMap(h: ActHost, p: Pos): void {
  const s = h.screen;
  if (!actScreen(s) || s.k === 'actions' || s.k === 'group') return;
  if (s.k === 'aim') {
    if (!sameAim(h.battle, p, s.at)) select(h, { ...s, at: p }, false);
    return;
  }
  const i = indexAt(h.battle, s, p);
  if (i >= 0 && i !== s.index) select(h, { ...s, index: i }, false);
}

// Confirm (or a click on a row): the picked target opens its actions, an action on opens its tiles, a tile runs it
export async function actPick(h: ActHost, index: number): Promise<void> {
  const s = h.screen,
    b = h.battle;
  if (!actScreen(s)) return;
  if (s.k === 'acts' || s.k === 'group') {
    const row = s.k === 'acts' ? actList(b)[index] : actGroup(b, s.group)[index];
    if (!row?.enabled) return sfx('cancel');
    sfx('confirm');
    // a group opens its column on its first action that is on
    if (row.k === 'group') {
      h.screen = {
        k: 'group',
        group: row.group,
        index: Math.max(
          0,
          actGroup(b, row.group).findIndex((r) => r.enabled),
        ),
      };
      return h.update();
    }
    // "Escolher alvo" lists everyone; an ability or an item lists only who it can hit this turn
    return openTargets(h, row.k === 'pick' ? undefined : { k: row.k, id: row.id });
  }
  if (s.k === 'targets') {
    const target = actTargets(b, s.only, s.other)[index];
    if (!target) return;
    // the last row swaps the list to the other side
    if (target.k === 'side') {
      sfx('confirm');
      return openTargets(h, s.only, !s.other);
    }
    const acts = actActions(b, target);
    sfx('confirm');
    // from the Agir list's ability or item, the action is already chosen: straight to its aim or tile step
    if (s.only)
      return openAction(
        h,
        target,
        acts.findIndex((a) => a.k === s.only!.k && a.id === s.only!.id),
        s.only,
      );
    h.screen = {
      k: 'actions',
      target,
      index: Math.max(
        0,
        acts.findIndex((a) => a.enabled),
      ),
    };
    return h.update();
  }
  if (s.k === 'actions') {
    const a = actActions(b, s.target)[index];
    if (!a?.enabled) return sfx('cancel');
    sfx('confirm');
    return openAction(h, s.target, index);
  }
  if (s.k === 'aim') {
    const all = screenAction(b, s);
    const aim = aimAt(b, s); // the free cursor may stand where the area cannot land: it says no
    if (!all || !aim) return sfx('cancel');
    sfx('confirm');
    const a = withAim(all, aim);
    h.screen = { k: 'spot', target: s.target, action: s.action, index: bestSpot(a, b), aim, only: s.only };
    const best = a.spots[bestSpot(a, b)];
    h.focus(best.pos, best.aim);
    return h.update();
  }
  const a = screenAction(b, s);
  const spot = a?.spots[stepOf(s) ? s.index : index];
  if (!a || !spot) return sfx('cancel');
  sfx('confirm');
  // a charge aimed at someone asks first where to lock it (Nov 15), starting on the ability's usual lock
  if (!s.lock && a.k === 'ability' && needsLock(b, a.id, spot.aim)) {
    h.screen = { ...s, index, lock: defaultLock(ABILITIES[a.id]) };
    return h.update();
  }
  // a dual action with both slots free asks which one last (Nov 20), starting on the main
  if (!s.slot && needsSlot(b, a)) {
    h.screen = { ...s, index, slot: 'main' };
    return h.update();
  }
  const lock = s.lock && LOCKS[index];
  const as = s.slot && SLOTS[index];
  h.remember({ k: a.k, id: a.id });
  await h.runAct((battle) => {
    const { walk, act } = runSpot(battle, a, spot, lock || undefined, as || undefined);
    return [...walk, ...(act ?? [])];
  });
}

// the target list, its first row focused on the map
function openTargets(h: ActHost, only?: ActRef, other = false) {
  h.screen = { k: 'targets', index: 0, only, ...(other && { other }) };
  const first = actTargets(h.battle, only, other)[0];
  if (first?.k === 'unit') h.focus(first.pos);
  h.update();
}

// the picked action's next step: where an area lands when it has several aims, else the tiles to act from
function openAction(h: ActHost, target: ActTarget, action: number, only?: ActRef): void {
  const b = h.battle,
    a = actActions(b, target)[action];
  // several aims (an area): where it lands first, the free cursor starting on the best aim at the picked target
  const area = actAims(freeArea(b, a)).length > 0;
  const best = a.spots[bestSpot(a, b)];
  if (area) h.screen = { k: 'aim', target, action, at: best.aim, only };
  else h.screen = { k: 'spot', target, action, index: bestSpot(a, b), only };
  if (area) h.focus(best.aim);
  else h.focus(best.pos, best.aim);
  h.update();
}

// what the arrows walk on the tile choice (the tiles to act from); null elsewhere
function mapPoints(b: Battle, s: Screen): Pos[] | null {
  if (s.k !== 'spot') return null;
  return screenAction(b, s)?.spots.map((sp) => sp.pos) ?? [];
}

// every row takes the cursor, an off one too: it shows its sheet and reach, and Confirm on it only says no (Fernando,
// Nov 19: "the disabled skills must still let the cursor pass over them")
function enabledRows(b: Battle, s: Extract<Screen, { k: 'acts' | 'group' | 'targets' | 'actions' }>): boolean[] {
  const rows =
    s.k === 'acts'
      ? actList(b)
      : s.k === 'group'
        ? actGroup(b, s.group)
        : s.k === 'targets'
          ? actTargets(b, s.only, s.other)
          : actActions(b, s.target);
  return rows.map(() => true);
}

// a new focus: the camera goes to the focused target or tile, unless the pointer picked it (`follow` false)
function select(h: ActHost, s: Screen, follow = true) {
  sfx('cursor');
  h.screen = s;
  const b = h.battle;
  if (follow && s.k === 'targets') {
    const t = actTargets(b, s.only, s.other)[s.index];
    if (t?.k === 'unit') h.focus(t.pos);
  } else if (follow && s.k === 'aim') h.focus(s.at);
  else if (follow && s.k === 'spot') {
    const sp = screenAction(b, s)?.spots[s.index];
    if (sp) h.focus(sp.pos, sp.aim);
  }
  h.update();
}
