// The keys, taps and rows of the Agir primeiro screens (act-flow.ts) on a hero's turn: hero-turn.ts hands them here, so it
// stays a dispatcher. Up and down walk a list (never onto an off row), any arrow walks the tiles on the tile choice,
// Confirm goes one screen on, and Cancel is cancelStep's, as on the other screens
import { ABILITIES, defaultLock } from '../shared/battle/abilities.ts';
import type { Battle } from '../shared/battle/battle.ts';
import { samePos } from '../shared/battle/grid.ts';
import type { Lock, Pos } from '../shared/battle/types.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';
import {
  actActions,
  actAims,
  actList,
  actTargets,
  bestSpot,
  runSpot,
  spotAt,
  targetAt,
  toward,
  withAim,
} from './act-flow.ts';
import { actScreen, aimCells, screenAction } from './act-marks.ts';
import { needsLock, type Screen, stepIndex, turnPage } from './command.ts';
import type { KeyAction, ScreenDir } from './keyboard.ts';
import { sfx } from './sound.ts';

// what the Agir screens need of the hero's turn and the Game
export interface ActHost {
  readonly battle: Battle;
  screen: Screen;
  update(): void;
  focus(p: Pos): void; // the camera and the cursor go there
  runAct(run: (b: Battle) => ReturnType<Battle['move']>): Promise<void>;
  step(dir: ScreenDir): Pos; // an arrow's grid step for the camera's heading (keyboard.ts gridStep)
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
  if (s.k === 'actions' && (a.k === 'info' || (a.k === 'cursor' && (a.dir === 'left' || a.dir === 'right')))) {
    actPage(h, a.k === 'cursor' && a.dir === 'left' ? -1 : 1);
    return;
  }
  if (a.k !== 'cursor') return;
  // on the map the arrow goes to the nearest aim or tile that way on screen, as the Move cursor does (Nov 19)
  if (s.k === 'aim' || s.k === 'spot') {
    const points = mapPoints(h.battle, s) ?? [];
    const index = points[s.index] ? toward(points, points[s.index], h.step(a.dir)) : -1;
    if (index >= 0) select(h, { ...s, index });
    return;
  }
  if (a.dir !== 'up' && a.dir !== 'down') return;
  const index = stepIndex(s.index, a.dir === 'up' ? -1 : 1, enabledRows(h.battle, s));
  if (index !== s.index) select(h, moved(s, index));
}

// the action sheet turns to its next or previous page
export function actPage(h: ActHost, dir: 1 | -1): void {
  const s = h.screen;
  if (s.k !== 'actions') return;
  sfx('cursor');
  h.screen = { ...s, page: turnPage(s.page ?? 0, dir) };
  h.update();
}

// another row of the list is focused: an action opens its sheet on the first page
const moved = (s: Extract<Screen, { k: 'acts' | 'targets' | 'actions' }>, index: number): Screen =>
  s.k === 'actions' ? { k: 'actions', target: s.target, index } : { ...s, index };

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

// a tap on the map: on the target list a unit picks its row (twice: goes on), on the tile choice a tile does the same
export function actTap(h: ActHost, p: Pos): boolean {
  const s = h.screen,
    b = h.battle;
  if (!actScreen(s)) return false;
  if (s.k === 'spot' && s.lock) return true; // the lock step is answered on its rows
  const i =
    s.k === 'targets'
      ? targetAt(actTargets(b), b, p)
      : s.k === 'spot'
        ? spotAt(screenAction(b, s)!, p, UNIT_DEFS[b.actor.def].size ?? 1)
        : s.k === 'aim'
          ? actAims(screenAction(b, s)!).findIndex((aim) => aimCells(b, aim).some((c) => samePos(c, p)))
          : -1;
  if (i < 0) return true;
  if (i === s.index) void actPick(h, i);
  else select(h, { ...s, index: i });
  return true;
}

// Confirm (or a click on a row): the picked target opens its actions, an action on opens its tiles, a tile runs it
export async function actPick(h: ActHost, index: number): Promise<void> {
  const s = h.screen,
    b = h.battle;
  if (!actScreen(s)) return;
  if (s.k === 'acts') {
    // prototype: only "Escolher alvo" works yet; the other rows do nothing
    if (actList(b)[index]?.k !== 'pick') return sfx('cancel');
    sfx('confirm');
    h.screen = { k: 'targets', index: 0 };
    return h.update();
  }
  if (s.k === 'targets') {
    const target = actTargets(b)[index];
    if (!target) return;
    const acts = actActions(b, target);
    sfx('confirm');
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
    // several aims (an area): where it lands first, starting on the best tile's aim
    const aims = actAims(a);
    if (aims.length) {
      const best = a.spots[bestSpot(a, b)].aim;
      h.screen = { k: 'aim', target: s.target, action: index, index: aims.findIndex((p) => samePos(p, best)) };
      h.focus(best);
    } else {
      h.screen = { k: 'spot', target: s.target, action: index, index: bestSpot(a, b) };
      h.focus(a.spots[bestSpot(a, b)].pos);
    }
    return h.update();
  }
  if (s.k === 'aim') {
    const all = screenAction(b, s);
    const aim = all && actAims(all)[index];
    if (!all || !aim) return sfx('cancel');
    sfx('confirm');
    const a = withAim(all, aim);
    h.screen = { k: 'spot', target: s.target, action: s.action, index: bestSpot(a, b), aim };
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
  await h.runAct((battle) => {
    const { walk, act } = runSpot(battle, a, spot, lock || undefined);
    return [...walk, ...(act ?? [])];
  });
}

// what the arrows walk on a map screen (the aims, or the tiles to act from); null on a list
function mapPoints(b: Battle, s: Screen): Pos[] | null {
  if (s.k !== 'aim' && s.k !== 'spot') return null;
  const a = screenAction(b, s);
  if (!a) return [];
  return s.k === 'aim' ? actAims(a) : a.spots.map((sp) => sp.pos);
}

function enabledRows(b: Battle, s: Extract<Screen, { k: 'acts' | 'targets' | 'actions' }>): boolean[] {
  if (s.k === 'acts') return actList(b).map((r) => r.k === 'pick' || r.enabled);
  return s.k === 'targets' ? actTargets(b).map(() => true) : actActions(b, s.target).map((a) => a.enabled);
}

// a new focus: the camera goes to the focused target or tile
function select(h: ActHost, s: Screen) {
  sfx('cursor');
  h.screen = s;
  const b = h.battle;
  if (s.k === 'targets') {
    const t = actTargets(b)[s.index];
    if (t?.k === 'unit') h.focus(t.pos);
  } else if (s.k === 'aim' || s.k === 'spot') {
    const p = mapPoints(b, s)?.[s.index];
    if (p) h.focus(p);
  }
  h.update();
}
