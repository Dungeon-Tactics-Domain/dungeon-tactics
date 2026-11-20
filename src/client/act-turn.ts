// The keys, taps and rows of the Agir primeiro screens (act-flow.ts) on a hero's turn: hero-turn.ts hands them here, so it
// stays a dispatcher. Up and down walk a list (never onto an off row), any arrow walks the tiles on the tile choice,
// Confirm goes one screen on, and Cancel is cancelStep's, as on the other screens
import { ABILITIES, defaultLock } from '../shared/battle/abilities.ts';
import type { Battle } from '../shared/battle/battle.ts';
import { samePos } from '../shared/battle/grid.ts';
import type { Lock, Pos } from '../shared/battle/types.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';
import {
  type ActRef,
  type ActTarget,
  actActions,
  actAims,
  actList,
  actTargets,
  bestSpot,
  runSpot,
  sameRef,
  spotAt,
  targetAt,
  withAim,
} from './act-flow.ts';
import { actScreen, aimCells, screenAction } from './act-marks.ts';
import { needsLock, type Screen, stepIndex, turnPage } from './command.ts';
import type { KeyAction } from './keyboard.ts';
import { sfx } from './sound.ts';
import { neighbour } from './ui3d/walk.ts';

// what the Agir screens need of the hero's turn and the Game
export interface ActHost {
  readonly battle: Battle;
  screen: Screen;
  update(): void;
  focus(p: Pos): void; // the camera and the cursor go there
  runAct(run: (b: Battle) => ReturnType<Battle['move']>): Promise<void>;
  at(p: Pos): { x: number; y: number }; // where a tile is on screen, in pixels (the arrows walk what is seen)
  remember(r: ActRef): void; // the action about to run: Agir opens on it next time (actStart)
}

// the lock step's rows, in order (menu-view.ts draws them)
export const LOCKS: Lock[] = ['unit', 'tile'];

export function actKey(h: ActHost, a: KeyAction): void {
  const s = h.screen;
  if (!actScreen(s)) return;
  // the lock step's two rows, the character above the tile
  if (s.k === 'spot' && s.lock) {
    if (a.k === 'confirm') return void actPick(h, LOCKS.indexOf(s.lock));
    if (a.k === 'cursor' && (a.dir === 'up' || a.dir === 'down')) actHover(h, a.dir === 'up' ? 0 : 1);
    return;
  }
  if (a.k === 'confirm') return void actPick(h, s.index);
  // the action sheet's pages: left and right turn them back and forth, Details (I, the pad's north button) goes on
  if (
    (s.k === 'actions' || s.k === 'acts') &&
    (a.k === 'info' || (a.k === 'cursor' && (a.dir === 'left' || a.dir === 'right')))
  ) {
    actPage(h, a.k === 'cursor' && a.dir === 'left' ? -1 : 1);
    return;
  }
  if (a.k !== 'cursor') return;
  // on the map the arrow goes to the nearest aim or tile that way on screen, as the 3D windows do (neighbour); a grid
  // step was a slant on the diamond view and missed (Fernando, Nov 19: "the arrows don't go the right way")
  if (s.k === 'aim' || s.k === 'spot') {
    const boxes = (mapPoints(h.battle, s) ?? []).map((p) => ({ ...h.at(p), w: 0, h: 0 }));
    const index = neighbour(boxes, s.index, a.dir);
    if (index !== s.index) select(h, { ...s, index });
    return;
  }
  // on the target list left and right walk the listed units on the map as they are seen, up and down the list: the
  // list and the map are one choice (Fernando's grill, Nov 19: "the three at the same time")
  if (s.k === 'targets' && (a.dir === 'left' || a.dir === 'right')) {
    const units = actTargets(h.battle, s.only).flatMap((r, i) => (r.k === 'unit' ? [{ i, ...h.at(r.pos) }] : []));
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

// where the Agir list opens: on the unit's last action while it is on, else on "Escolher alvo" (Fernando's grill, Nov 19)
export function actStart(b: Battle, last?: ActRef): Screen {
  const i = last ? actList(b).findIndex((r) => sameRef(last, r) && r.k !== 'pick' && r.enabled) : -1;
  return { k: 'acts', index: Math.max(0, i) };
}

// the action sheet turns to its next or previous page
export function actPage(h: ActHost, dir: 1 | -1): void {
  const s = h.screen;
  if (s.k !== 'actions' && s.k !== 'acts') return;
  sfx('cursor');
  h.screen = { ...s, page: turnPage(s.page ?? 0, dir) };
  h.update();
}

// another row of the list is focused: an action opens its sheet on the first page
const moved = (s: Extract<Screen, { k: 'acts' | 'targets' | 'actions' }>, index: number): Screen =>
  s.k === 'actions'
    ? { k: 'actions', target: s.target, index }
    : s.k === 'acts'
      ? { k: 'acts', index }
      : { ...s, index };

// the mouse or Tab on a list row moves the focus there, as the arrows would
export function actHover(h: ActHost, index: number): void {
  const s = h.screen;
  if (s.k === 'spot' && s.lock) {
    if (LOCKS[index] && LOCKS[index] !== s.lock) select(h, { ...s, lock: LOCKS[index] });
    return;
  }
  if (!actScreen(s) || s.k === 'spot' || s.k === 'aim' || s.index === index || !enabledRows(h.battle, s)[index]) return;
  select(h, moved(s, index));
}

// the row a map tile stands for on this screen: a listed unit, an aim or a tile to act from; -1 for none
function indexAt(b: Battle, s: Screen, p: Pos): number {
  if (s.k === 'targets') return targetAt(actTargets(b, s.only), b, p);
  if (s.k === 'spot' && !s.lock) return spotAt(screenAction(b, s)!, p, UNIT_DEFS[b.actor.def].size ?? 1);
  if (s.k === 'aim')
    return actAims(screenAction(b, s)!).findIndex((aim) => aimCells(b, aim).some((c) => samePos(c, p)));
  return -1;
}

// a tap on the map: on the target list a unit picks its row (twice: goes on), on the tile choice a tile does the same.
// The camera stays: sliding to the tile moved it from under the pointer, so a 2nd click on the same pixel missed it
export function actTap(h: ActHost, p: Pos): boolean {
  const s = h.screen;
  if (!actScreen(s)) return false;
  const i = indexAt(h.battle, s, p);
  if (i < 0) return true; // also the lock step, answered on its rows
  if (i === s.index) void actPick(h, i);
  else select(h, { ...s, index: i }, false);
  return true;
}

// the mouse over the map focuses the unit, aim or tile under it, as a first click would (the camera stays)
export function actHoverMap(h: ActHost, p: Pos): void {
  const s = h.screen;
  if (!actScreen(s) || s.k === 'actions') return;
  const i = indexAt(h.battle, s, p);
  if (i >= 0 && i !== s.index) select(h, { ...s, index: i }, false);
}

// Confirm (or a click on a row): the picked target opens its actions, an action on opens its tiles, a tile runs it
export async function actPick(h: ActHost, index: number): Promise<void> {
  const s = h.screen,
    b = h.battle;
  if (!actScreen(s)) return;
  if (s.k === 'acts') {
    const row = actList(b)[index];
    if (!row?.enabled) return sfx('cancel');
    sfx('confirm');
    // "Escolher alvo" lists everyone; an ability or an item lists only who it can hit this turn
    const only = row.k === 'pick' ? undefined : { k: row.k, id: row.id };
    h.screen = { k: 'targets', index: 0, only };
    const first = actTargets(b, only)[0];
    if (first?.k === 'unit') h.focus(first.pos);
    return h.update();
  }
  if (s.k === 'targets') {
    const target = actTargets(b, s.only)[index];
    if (!target) return;
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
    const aim = all && actAims(all)[index];
    if (!all || !aim) return sfx('cancel');
    sfx('confirm');
    const a = withAim(all, aim);
    h.screen = { k: 'spot', target: s.target, action: s.action, index: bestSpot(a, b), aim, only: s.only };
    h.focus(a.spots[bestSpot(a, b)].pos);
    return h.update();
  }
  const a = screenAction(b, s);
  const spot = a?.spots[s.lock ? s.index : index];
  if (!a || !spot) return sfx('cancel');
  sfx('confirm');
  // a charge aimed at someone asks first where to lock it (Nov 15), starting on the ability's usual lock
  if (!s.lock && a.k === 'ability' && needsLock(b, a.id, spot.aim)) {
    h.screen = { ...s, index, lock: defaultLock(ABILITIES[a.id]) };
    return h.update();
  }
  const lock = s.lock && LOCKS[index];
  h.remember({ k: a.k, id: a.id });
  await h.runAct((battle) => {
    const { walk, act } = runSpot(battle, a, spot, lock || undefined);
    return [...walk, ...(act ?? [])];
  });
}

// the picked action's next step: where an area lands when it has several aims, else the tiles to act from
function openAction(h: ActHost, target: ActTarget, action: number, only?: ActRef): void {
  const b = h.battle,
    a = actActions(b, target)[action];
  // several aims (an area): where it lands first, starting on the best tile's aim
  const aims = actAims(a);
  const best = a.spots[bestSpot(a, b)];
  if (aims.length) h.screen = { k: 'aim', target, action, index: aims.findIndex((p) => samePos(p, best.aim)), only };
  else h.screen = { k: 'spot', target, action, index: bestSpot(a, b), only };
  h.focus(aims.length ? best.aim : best.pos);
  h.update();
}

// what the arrows walk on a map screen (the aims, or the tiles to act from); null on a list
function mapPoints(b: Battle, s: Screen): Pos[] | null {
  if (s.k !== 'aim' && s.k !== 'spot') return null;
  const a = screenAction(b, s);
  if (!a) return [];
  return s.k === 'aim' ? actAims(a) : a.spots.map((sp) => sp.pos);
}

// every row takes the cursor, an off one too: it shows its sheet and reach, and Confirm on it only says no (Fernando,
// Nov 19: "the disabled skills must still let the cursor pass over them")
function enabledRows(b: Battle, s: Extract<Screen, { k: 'acts' | 'targets' | 'actions' }>): boolean[] {
  const rows = s.k === 'acts' ? actList(b) : s.k === 'targets' ? actTargets(b, s.only) : actActions(b, s.target);
  return rows.map(() => true);
}

// a new focus: the camera goes to the focused target or tile, unless the pointer picked it (`follow` false)
function select(h: ActHost, s: Screen, follow = true) {
  sfx('cursor');
  h.screen = s;
  const b = h.battle;
  if (follow && s.k === 'targets') {
    const t = actTargets(b, s.only)[s.index];
    if (t?.k === 'unit') h.focus(t.pos);
  } else if (follow && (s.k === 'aim' || s.k === 'spot')) {
    const p = mapPoints(b, s)?.[s.index];
    if (p) h.focus(p);
  }
  h.update();
}
