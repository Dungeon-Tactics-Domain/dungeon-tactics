// Command menu FFT style (Fernando's request, Nov 12: "recreate the interface the same way as Final Fantasy
// Tactics"): Move · Act · Wait · Status, with the abilities submenu under Act. Pure (no DOM): what each turn
// screen shows and what follows each key. The Game executes; the HUD only draws.
import { ABILITIES } from '../shared/battle/abilities.ts';
import type { Battle } from '../shared/battle/battle.ts';
import { isDeep, tileAt } from '../shared/battle/grid.ts';
import { unitAt } from '../shared/battle/pathing.ts';
import type { Lock, Pos } from '../shared/battle/types.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';

export type Command = 'move' | 'act' | 'wait' | 'status';
export const COMMANDS: Command[] = ['move', 'act', 'wait', 'status'];

// Hero turn screens, in FFT order: menu → (Act submenu) → map (pick tile) → "Execute?" → menu.
// Wait leads to the facing choice (every map since Nov 13).
export type Screen =
  | { k: 'menu'; index: number }
  | { k: 'abilities'; index: number }
  | { k: 'map'; command: 'move' | 'act' }
  // `lock`: the 2nd step of a charge aimed at a unit, tile or character (Nov 15, Fernando), with the one in focus
  | { k: 'confirm'; ability: string; target: Pos; yes: boolean; lock?: Lock }
  | { k: 'facing' };

// "Execute?" on a charge aimed at someone asks next where to lock it: the tile, or that character (Nov 15). On empty ground
// there is only the tile
export function needsLock(b: Battle, ability: string, target: Pos): boolean {
  const on = unitAt(b.state, target);
  return ABILITIES[ability].charge > 0 && !!on && on.id !== b.actor.id;
}

// Moved and not yet acted: the Move row becomes "Undo move" and Esc in the menu undoes it (Nov 13, Fernando's request,
// like Tactics Ogre). Moving draws nothing random, so undoing is free; after acting, only Z (which spends an undo)
// since Nov 13 also after acting ("after attacking and moving you can undo the move"), if the last step was a move
// that took no counterattack (Battle.lastFree)
export const canUndoMove = (b: Battle) => b.state.turn.moved && b.lastFree && b.canUndo;

// in deep water you can only move or wait (Nov 13, Fernando's choice; the rule is in previewAbility)
export const swimming = (b: Battle) => isDeep(tileAt(b.grid, b.actor.pos));

export function commandEnabled(b: Battle, c: Command): boolean {
  if (c === 'move') return b.reach().size > 0 || canUndoMove(b);
  if (c === 'act') return !b.state.turn.usedAbility && !swimming(b);
  return true;
}

// ability you can pick right now: without stock or MP it's grayed out, as in FFT
export function abilityEnabled(b: Battle, id: string): boolean {
  const cost = ABILITIES[id].cost;
  return !cost || (b.actor.vars?.[cost[0]] ?? 0) >= cost[1];
}
export const abilitiesOf = (b: Battle) => UNIT_DEFS[b.actor.def].abilities;
// range of the farthest-reaching ability (the dotted line around the player)
export const longestRange = (b: Battle) => Math.max(0, ...abilitiesOf(b).map((id) => ABILITIES[id].range[1]));

// where the menu cursor starts: Move if you can still move, otherwise Act, otherwise Wait. "Undo move" doesn't
// take the cursor: a 2nd Enter after moving would undo the step by accident
export function startScreen(b: Battle): Screen {
  // already moved and not yet acted: Act (the rest of the movement is left for after the hit)
  return {
    k: 'menu',
    index:
      b.reach().size && !b.state.turn.moved
        ? 0
        : commandEnabled(b, 'act')
          ? 1
          : b.reach().size && !canUndoMove(b)
            ? 0
            : 2,
  };
}

// moves up or down the menu skipping what's grayed out, wrapping around as in FFT
export function stepIndex(index: number, dir: 1 | -1, enabled: boolean[]): number {
  for (let k = 1; k <= enabled.length; k++) {
    const i = (index + dir * k + enabled.length * k) % enabled.length;
    if (enabled[i]) return i;
  }
  return index;
}
