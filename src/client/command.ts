// Command menu FFT style (Fernando's request, Nov 12: "recreate the interface the same way as Final Fantasy
// Tactics"; Nov 16: the names, order and steps of The Ivalice Chronicles): Move · Undo move · Abilities · Wait · Status;
// Abilities (the `act` command) opens the Agir primeiro lists (act-flow.ts). Pure (no DOM, no pixel): what each turn screen
// shows and what follows each key. The Game executes; the HUD only draws.
import { ABILITIES } from '../shared/battle/abilities.ts';
import type { Battle } from '../shared/battle/battle.ts';
import { isDeep, tileAt } from '../shared/battle/grid.ts';
import { unitAt } from '../shared/battle/pathing.ts';
import type { Lock, Pos } from '../shared/battle/types.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';
import { type ActTarget, actTargets, targetIndex } from './act-flow.ts';

export type Command = 'move' | 'undo' | 'act' | 'wait' | 'status';
// The menu's index is a place in this list; menuRows says which of them show (Fernando, Nov 18: after a move, Move and
// "Undo move" both show, up to five rows)
export const COMMANDS: Command[] = ['move', 'undo', 'act', 'wait', 'status'];

// The reference's fifth row, Auto-battle, is left out: the game has no auto play for the player
export const commandIndex = (c: Command) => COMMANDS.indexOf(c);

// Hero turn screens: menu → Agir primeiro (targets → actions → spot, act-flow.ts) → menu; Move has its tile map; Wait leads to
// the facing choice (every map since Nov 13). Cancel goes back one step (cancelStep).
export type Screen =
  | { k: 'menu'; index: number }
  | { k: 'map'; command: 'move' }
  | { k: 'facing' }
  // Agir primeiro (Fernando's grill, Nov 19; the only way to act since "Apagar tudo"): the target list, the actions that hit
  // the picked target, the tiles to act from with the best one first; `lock`: a charge aimed at a unit asks where to lock it
  | { k: 'targets'; index: number }
  | { k: 'actions'; target: ActTarget; index: number }
  | { k: 'spot'; target: ActTarget; action: number; index: number; lock?: Lock };

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

export function commandEnabled(b: Battle, c: Command): boolean {
  if (c === 'move') return b.reach().size > 0;
  if (c === 'undo') return canUndoMove(b);
  if (c === 'act') return !b.state.turn.usedAbility && !swimming(b);
  return true;
}

// The rows the menu shows, in COMMANDS order: Move leaves once the unit moved and has no movement left (at the turn's
// start it stays, greyed when boxed in), "Undo move" only while there is a move to take back. 4 rows at the start, 5
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
      b.reach().size && !b.state.turn.moved
        ? 'move'
        : commandEnabled(b, 'act')
          ? 'act'
          : b.reach().size
            ? 'move'
            : 'wait',
    ),
  };
}

// Where Cancel (Esc, B, right button, the Back button) leads from a screen: one step back, on the row it came from. 'undo':
// on the menu after a free move, Cancel undoes it (the reference's Move row reads Reset there); null: nothing to go back to
export function cancelStep(b: Battle, s: Screen): Screen | 'undo' | null {
  if (s.k === 'menu') return canUndoMove(b) ? 'undo' : null;
  if (s.k === 'map') return { k: 'menu', index: commandIndex('move') };
  if (s.k === 'facing') return { k: 'menu', index: commandIndex('wait') };
  if (s.k === 'targets') return { k: 'menu', index: commandIndex('act') };
  if (s.k === 'actions') return { k: 'targets', index: targetIndex(actTargets(b), s.target) };
  return s.lock
    ? { k: 'spot', target: s.target, action: s.action, index: s.index }
    : { k: 'actions', target: s.target, index: s.action };
}

// moves up or down the menu skipping what's grayed out, wrapping around as in FFT
export function stepIndex(index: number, dir: 1 | -1, enabled: boolean[]): number {
  for (let k = 1; k <= enabled.length; k++) {
    const i = (index + dir * k + enabled.length * k) % enabled.length;
    if (enabled[i]) return i;
  }
  return index;
}
