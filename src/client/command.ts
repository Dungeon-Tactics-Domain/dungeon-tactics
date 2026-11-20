// Command menu FFT style (Fernando's request, Nov 12: "recreate the interface the same way as Final Fantasy
// Tactics"; Nov 16: the names, order and steps of The Ivalice Chronicles): Move · Undo move · Abilities · Wait · Status;
// Abilities (the `act` command) opens the Agir primeiro lists (act-flow.ts). Pure (no DOM, no pixel): what each turn screen
// shows and what follows each key. The Game executes; the HUD only draws.
import { ABILITIES } from '../shared/battle/abilities.ts';
import { freeSlot } from '../shared/battle/action-slots.ts';
import type { Battle } from '../shared/battle/battle.ts';
import { isDeep, samePos, tileAt } from '../shared/battle/grid.ts';
import { unitAt } from '../shared/battle/pathing.ts';
import type { Lock, Pos } from '../shared/battle/types.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';
import {
  type ActRef,
  type ActTarget,
  actActions,
  actAims,
  actList,
  actTargets,
  sameRef,
  targetIndex,
} from './act-flow.ts';

export type Command = 'move' | 'undo' | 'act' | 'wait' | 'status';
// The menu's index is a place in this list; menuRows says which of them show (Fernando, Nov 18: after a move, Move and
// "Undo move" both show, up to five rows)
export const COMMANDS: Command[] = ['act', 'move', 'undo', 'wait', 'status'];

// The reference's fifth row, Auto-battle, is left out: the game has no auto play for the player
export const commandIndex = (c: Command) => COMMANDS.indexOf(c);

// Hero turn screens: menu → Agir primeiro (targets → actions → spot, act-flow.ts) → menu; Move has its tile map; Wait leads to
// the facing choice (every map since Nov 13). Cancel goes back one step (cancelStep).
export type Screen =
  | { k: 'menu'; index: number }
  | { k: 'map'; command: 'move' }
  | { k: 'facing' }
  // The Agir list (Fernando, Nov 19): "Escolher alvo" opens the targets, then the abilities and items (act-flow.ts actList)
  | { k: 'acts'; index: number; page?: number }
  // Agir primeiro (Fernando's grill, Nov 19; the only way to act since "Apagar tudo"): the target list, the actions that hit
  // the picked target, the tiles to act from with the best one first; `lock`: a charge aimed at a unit asks where to lock it
  // `only`: the ability or item picked straight on the Agir list; the targets are who it can hit, and the screens after
  // keep it so Cancel walks back through them
  | { k: 'targets'; index: number; only?: ActRef }
  // `page`: the action sheet's page (menu3d/), 0 to PAGES - 1; another action opens on the first
  | { k: 'actions'; target: ActTarget; index: number; page?: number }
  // an action with several aims (an area) picks where it lands first (`index` into actAims), then the tiles aiming there
  | { k: 'aim'; target: ActTarget; action: number; index: number; only?: ActRef }
  | { k: 'spot'; target: ActTarget; action: number; index: number; lock?: Lock; aim?: Pos; only?: ActRef };

// A charge aimed at someone asks next where to lock it: the tile, or that character (Nov 15). On empty ground
// there is only the tile
export function needsLock(b: Battle, ability: string, target: Pos): boolean {
  const on = unitAt(b.state, target);
  return ABILITIES[ability].charge > 0 && !!on && on.id !== b.actor.id;
}

// Moved: the "Undo move" row shows under Move and Esc in the menu undoes it (Nov 13, Fernando's request, like Tactics
// Ogre; Nov 18: a row of its own, Move stays while movement is left). Moving draws nothing random, so undoing is free; after acting, only Z (which spends an undo)
// since Nov 13 also after acting ("after attacking and moving you can undo the move"), if the last step was a move
// that took no counterattack (Battle.lastFree)
export const canUndoMove = (b: Battle) => b.state.turn.moved && b.lastFree && b.canUndo;

// in deep water you can only move or wait (Nov 13, Fernando's choice; the rule is in previewAbility)
export const swimming = (b: Battle) => isDeep(tileAt(b.grid, b.actor.pos));

// an action can still be taken this turn: a slot is free (a secondary fits whichever) and the unit is not swimming
export const canAct = (b: Battle) => !!freeSlot(b.state.turn, 'bonus') && !swimming(b);

export function commandEnabled(b: Battle, c: Command): boolean {
  if (c === 'move') return b.reach().size > 0;
  if (c === 'undo') return canUndoMove(b);
  return true;
}

// The rows the menu shows, in COMMANDS order: Move leaves once the unit moved and has no movement left (at the turn's
// start it stays, greyed when boxed in), "Undo move" only while there is a move to take back. Agir always shows and opens, even with nothing left to
// do, to look at every action and its reach (Fernando, Nov 19; its row says why, menu-view.ts). 4 rows at the start, 5
// after a move with movement left
export const menuRows = (b: Battle): Command[] =>
  COMMANDS.filter((c) =>
    c === 'move' ? !b.state.turn.moved || b.reach().size > 0 : c === 'undo' ? canUndoMove(b) : true,
  );

// range of the farthest-reaching ability (the dotted line around the player)
export const longestRange = (b: Battle) =>
  Math.max(0, ...UNIT_DEFS[b.actor.def].abilities.map((id) => ABILITIES[id].range[1]));

// where the menu cursor starts: Move if you can still move, otherwise Act, otherwise Wait. "Undo move" never takes the
// cursor: a 2nd Enter after moving would undo the step by accident
export function startScreen(b: Battle): Screen {
  // already moved and not yet acted: Abilities (the rest of the movement is left for after the hit)
  return {
    k: 'menu',
    index: commandIndex(
      b.reach().size && !b.state.turn.moved ? 'move' : canAct(b) ? 'act' : b.reach().size ? 'move' : 'wait',
    ),
  };
}

// Where Cancel (Esc, B, right button, the Back button) leads from a screen: one step back, on the row it came from. 'undo':
// on the menu after a free move, Cancel undoes it (the reference's Move row reads Reset there); null: nothing to go back to
export function cancelStep(b: Battle, s: Screen): Screen | 'undo' | null {
  if (s.k === 'menu') return canUndoMove(b) ? 'undo' : null;
  if (s.k === 'map') return { k: 'menu', index: commandIndex('move') };
  if (s.k === 'facing') return { k: 'menu', index: commandIndex('wait') };
  if (s.k === 'acts') return { k: 'menu', index: commandIndex('act') };
  if (s.k === 'targets') {
    const row = s.only ? actList(b).findIndex((r) => sameRef(s.only!, r)) : 0;
    return { k: 'acts', index: Math.max(0, row) };
  }
  if (s.k === 'actions') return { k: 'targets', index: targetIndex(actTargets(b), s.target) };
  const { only } = s;
  // an action picked on the Agir list has no actions screen: it goes back to that list's targets
  const out = only
    ? ({ k: 'targets', index: targetIndex(actTargets(b, only), s.target), only } as const)
    : ({ k: 'actions', target: s.target, index: s.action } as const);
  const back = { target: s.target, action: s.action, only };
  if (s.k === 'aim') return out;
  if (s.lock) return { k: 'spot', ...back, index: s.index, aim: s.aim };
  if (!s.aim) return out;
  const aim = s.aim;
  const aims = actAims(actActions(b, s.target)[s.action]);
  return {
    k: 'aim',
    ...back,
    index: Math.max(
      0,
      aims.findIndex((p) => samePos(p, aim)),
    ),
  };
}

// the action sheet's pages (battle-text.ts abilityPages), turned with left and right, wrapping around
export const PAGES = 3;
export const turnPage = (page: number, dir: 1 | -1) => (page + dir + PAGES) % PAGES;

// moves up or down the menu skipping what's grayed out, wrapping around as in FFT
export function stepIndex(index: number, dir: 1 | -1, enabled: boolean[]): number {
  for (let k = 1; k <= enabled.length; k++) {
    const i = (index + dir * k + enabled.length * k) % enabled.length;
    if (enabled[i]) return i;
  }
  return index;
}
