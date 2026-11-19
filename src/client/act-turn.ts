// The keys, taps and rows of the Agir primeiro screens (act-flow.ts) on a hero's turn: hero-turn.ts hands them here, so it
// stays a dispatcher. Up and down walk a list (never onto an off row), any arrow walks the tiles on the tile choice,
// Confirm goes one screen on, and Cancel is cancelStep's, as on the other screens
import { ABILITIES, defaultLock } from '../shared/battle/abilities.ts';
import type { Battle } from '../shared/battle/battle.ts';
import type { Lock, Pos } from '../shared/battle/types.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';
import { actActions, actTargets, bestSpot, runSpot, spotAt, targetAt } from './act-flow.ts';
import { actScreen, screenAction } from './act-marks.ts';
import { needsLock, type Screen, stepIndex } from './command.ts';
import type { KeyAction } from './keyboard.ts';
import { sfx } from './sound.ts';

// what the Agir screens need of the hero's turn and the Game
export interface ActHost {
  readonly battle: Battle;
  screen: Screen;
  update(): void;
  focus(p: Pos): void; // the camera and the cursor go there
  runAct(run: (b: Battle) => ReturnType<Battle['move']>): Promise<void>;
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
  if (a.k !== 'cursor') return;
  if (s.k === 'spot') {
    const n = screenAction(h.battle, s)?.spots.length ?? 0;
    if (n < 2) return;
    const index = (s.index + (a.dir === 'left' || a.dir === 'up' ? -1 : 1) + n) % n;
    select(h, { ...s, index });
    return;
  }
  if (a.dir !== 'up' && a.dir !== 'down') return;
  const index = stepIndex(s.index, a.dir === 'up' ? -1 : 1, enabledRows(h.battle, s));
  if (index !== s.index) select(h, { ...s, index });
}

// the mouse or Tab on a list row moves the focus there, as the arrows would
export function actHover(h: ActHost, index: number): void {
  const s = h.screen;
  if (s.k === 'spot' && s.lock) {
    if (LOCKS[index] && LOCKS[index] !== s.lock) select(h, { ...s, lock: LOCKS[index] });
    return;
  }
  if (!actScreen(s) || s.k === 'spot' || s.index === index || !enabledRows(h.battle, s)[index]) return;
  select(h, { ...s, index });
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
    h.screen = { k: 'spot', target: s.target, action: index, index: bestSpot(a) };
    h.focus(a.spots[bestSpot(a)].pos);
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

function enabledRows(b: Battle, s: Extract<Screen, { k: 'targets' | 'actions' }>): boolean[] {
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
  } else if (s.k === 'spot') {
    const p = screenAction(b, s)?.spots[s.index]?.pos;
    if (p) h.focus(p);
  }
  h.update();
}
