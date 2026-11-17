// Command menu FFT style (Fernando's request, Nov 12: "recreate the interface the same way as Final Fantasy
// Tactics"; Nov 16: the names, order and steps of The Ivalice Chronicles): Move · Abilities · Wait · Status, with the
// abilities submenu under Abilities (the `act` command). Pure (no DOM, no pixel): what each turn screen shows and what
// follows each key. The Game executes; the HUD only draws.
import { ABILITIES } from '../shared/battle/abilities.ts';
import type { Battle } from '../shared/battle/battle.ts';
import { canPay } from '../shared/battle/combat.ts';
import { isDeep, tileAt } from '../shared/battle/grid.ts';
import { unitAt } from '../shared/battle/pathing.ts';
import type { Lock, Pos } from '../shared/battle/types.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';

export type Command = 'move' | 'act' | 'wait' | 'status';
export const COMMANDS: Command[] = ['move', 'act', 'wait', 'status'];

// The reference's fifth row, Auto-battle, is left out: the game has no auto play for the player
export const commandIndex = (c: Command) => COMMANDS.indexOf(c);

// Hero turn screens, in FFT order: menu → (Abilities submenu) → map (pick tile) → strike preview → menu.
// Wait leads to the facing choice (every map since Nov 13). Cancel goes back one step (cancelStep).
export type Screen =
  | { k: 'menu'; index: number }
  // `page`: the ability sheet's page (?menucss), 0 to PAGES - 1; a new ability opens on the first
  | { k: 'abilities'; index: number; page?: number }
  | { k: 'map'; command: 'move' | 'act' }
  // the strike preview on a picked target: Confirm runs it, Cancel goes back to aiming (no Yes/No to toggle, Nov 16)
  // `lock`: the 2nd step of a charge aimed at a unit, tile or character (Nov 15, Fernando), with the one in focus
  | { k: 'confirm'; ability: string; target: Pos; lock?: Lock }
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

// ability you can pick right now: without the mana, stamina, stock or MP it costs it's grayed out, as in FFT
export const abilityEnabled = (b: Battle, id: string) => canPay(b.actor, ABILITIES[id]);
export const abilitiesOf = (b: Battle) => UNIT_DEFS[b.actor.def].abilities;
// range of the farthest-reaching ability (the dotted line around the player)
export const longestRange = (b: Battle) => Math.max(0, ...abilitiesOf(b).map((id) => ABILITIES[id].range[1]));

// where the menu cursor starts: Move if you can still move, otherwise Act, otherwise Wait. "Undo move" doesn't
// take the cursor: a 2nd Enter after moving would undo the step by accident
export function startScreen(b: Battle): Screen {
  // already moved and not yet acted: Abilities (the rest of the movement is left for after the hit)
  return {
    k: 'menu',
    index: commandIndex(
      b.reach().size && !b.state.turn.moved
        ? 'move'
        : commandEnabled(b, 'act')
          ? 'act'
          : b.reach().size && !canUndoMove(b)
            ? 'move'
            : 'wait',
    ),
  };
}

// Where Cancel (Esc, B, right button, the Back button) leads from a screen: one step back, on the row it came from.
// `aiming`: the ability being aimed on the Act map. 'undo': on the menu after a free move, Cancel undoes it (the
// reference's Move row reads Reset there); null: nothing to go back to
export function cancelStep(b: Battle, s: Screen, aiming: string | null = null): Screen | 'undo' | null {
  const row = (id: string | null): Screen => ({ k: 'abilities', index: Math.max(0, abilitiesOf(b).indexOf(id ?? '')) });
  if (s.k === 'menu') return canUndoMove(b) ? 'undo' : null;
  if (s.k === 'abilities') return { k: 'menu', index: commandIndex('act') };
  if (s.k === 'map') return s.command === 'move' ? { k: 'menu', index: commandIndex('move') } : row(aiming);
  if (s.k === 'facing') return { k: 'menu', index: commandIndex('wait') };
  if (s.lock) return { k: 'confirm', ability: s.ability, target: s.target }; // the lock step: back to the preview
  // a self-centred ability never went through the map
  return ABILITIES[s.ability].range[1] === 0 ? row(s.ability) : { k: 'map', command: 'act' };
}

// the ability sheet's pages (battle-text.ts abilityPages), turned with left and right, wrapping around
export const PAGES = 3;
export const turnPage = (page: number, dir: 1 | -1) => (page + dir + PAGES) % PAGES;

// The lock step's two choices sit side by side, the character on the left: left and right go to the one on that side
// and stay there at the end, up and down have nothing to go to (Fernando, Nov 17: the cursor follows what is seen)
export const lockStep = (lock: Lock, dir: 'up' | 'down' | 'left' | 'right'): Lock =>
  dir === 'left' ? 'unit' : dir === 'right' ? 'tile' : lock;

// moves up or down the menu skipping what's grayed out, wrapping around as in FFT
export function stepIndex(index: number, dir: 1 | -1, enabled: boolean[]): number {
  for (let k = 1; k <= enabled.length; k++) {
    const i = (index + dir * k + enabled.length * k) % enabled.length;
    if (enabled[i]) return i;
  }
  return index;
}
