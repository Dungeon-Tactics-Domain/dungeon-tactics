import { describe, expect, it } from 'vitest';
import {
  abilityEnabled,
  canUndoMove,
  commandEnabled,
  longestRange,
  startScreen,
  stepIndex,
} from '../src/client/command.ts';
import { emptyMemory, padActions } from '../src/client/gamepad.ts';
import { ABILITIES } from '../src/shared/battle/abilities.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';
import { flat, stateOf } from './battle-helpers.ts';

// FFT-style interface (Nov 12): command menu and gamepad
const duel = () =>
  new Battle(
    flat(6, 6),
    stateOf([
      { id: 'a', def: 'warrior', team: 'hero', x: 1, y: 1 },
      { id: 'b', def: 'soldier', team: 'enemy', x: 2, y: 1 },
      { id: 'beacon', def: 'beacon', team: 'hero', x: 5, y: 5 },
    ]),
  );

describe('command menu', () => {
  it('dotted line: the range of the farthest-reaching ability', () => {
    expect(longestRange(duel())).toBe(Math.max(...UNIT_DEFS.warrior.abilities.map((id) => ABILITIES[id].range[1])));
    const archer = new Battle(
      flat(6, 6),
      stateOf([
        { id: 'a', def: 'archer', team: 'hero', x: 1, y: 1 },
        { id: 'b', def: 'soldier', team: 'enemy', x: 4, y: 4 },
      ]),
    );
    expect(longestRange(archer)).toBe(7); // Shot: 2 to 7
  });

  it('starts on Move; after moving, on Act; after moving and acting, on Wait', () => {
    const b = duel();
    expect(startScreen(b)).toEqual({ k: 'menu', index: 0 });
    b.move({ x: 2, y: 2 });
    expect(startScreen(b)).toEqual({ k: 'menu', index: 1 });
    b.act('strike', { x: 2, y: 1 });
    expect(commandEnabled(b, 'act')).toBe(false);
    // movement left (Nov 13, movement in parts): back to Move
    expect(startScreen(b)).toEqual({ k: 'menu', index: 0 });
  });

  // Nov 13, Fernando's request, as in Tactics Ogre: after moving and before acting, Move becomes "Desfazer movimento" (undo move)
  it("moved and didn't act: Move undoes the movement (for free), without the menu cursor landing on it", () => {
    const b = duel();
    expect(canUndoMove(b)).toBe(false);
    b.move({ x: 2, y: 2 });
    expect(canUndoMove(b)).toBe(true);
    expect(commandEnabled(b, 'move')).toBe(true);
    expect(startScreen(b)).toEqual({ k: 'menu', index: 1 }); // the 2nd Enter after moving doesn't undo by accident
    const undos = b.undosLeft;
    expect(b.undo()).toBe(true);
    expect(b.actor.pos).toEqual({ x: 1, y: 1 });
    expect(b.undosLeft).toBe(undos);
    expect(canUndoMove(b)).toBe(false);
    expect(startScreen(b)).toEqual({ k: 'menu', index: 0 }); // back to the menu from before moving
  });

  it('after acting, a move that drew a counter cannot be undone (before or after moving)', () => {
    const moved = duel();
    moved.move({ x: 2, y: 2 });
    moved.act('strike', { x: 2, y: 1 });
    expect(canUndoMove(moved)).toBe(false);
    expect(commandEnabled(moved, 'move')).toBe(moved.reach().size > 0); // only moves again if movement is left
    const acted = duel();
    acted.act('strike', { x: 2, y: 1 });
    acted.move({ x: 1, y: 2 });
    expect(canUndoMove(acted)).toBe(false);
  });

  it('acted, then a free move: the cursor skips "Undo move" and starts on Wait', () => {
    const b = new Battle(
      flat(8, 8),
      stateOf([
        { id: 'a', def: 'archer', team: 'hero', x: 1, y: 1 },
        { id: 'b', def: 'soldier', team: 'enemy', x: 5, y: 1 },
        { id: 'beacon', def: 'beacon', team: 'hero', x: 7, y: 7 },
      ]),
    );
    b.act('shot', { x: 5, y: 1 });
    b.move({ x: 1, y: 2 });
    expect(canUndoMove(b)).toBe(true); // a soldier cannot answer a shot, so the move took no counter
    expect(b.reach().size).toBeGreaterThan(0);
    // the Move row reads "Undo move" now: a 2nd Enter on it would undo the step
    expect(startScreen(b)).toEqual({ k: 'menu', index: 2 });
  });

  it('up and down skip what is disabled and wrap around', () => {
    expect(stepIndex(1, 1, [false, true, true, true])).toBe(2);
    expect(stepIndex(3, 1, [false, true, true, true])).toBe(1);
    expect(stepIndex(1, -1, [false, true, true, true])).toBe(3);
  });

  it('an ability without stock is greyed out', () => {
    const b = duel();
    expect(abilityEnabled(b, 'strike')).toBe(true);
  });
});

describe('gamepad', () => {
  const pad = (buttons: number[], axes: number[] = [0, 0]) => ({
    buttons: Array.from({ length: 16 }, (_, i) => buttons.includes(i)),
    axes,
  });

  it('A confirms and B cancels only on press, not while held', () => {
    const mem = emptyMemory();
    expect(padActions(pad([0]), mem, 0)).toEqual([{ k: 'confirm' }]);
    expect(padActions(pad([0]), mem, 50)).toEqual([]);
    expect(padActions(pad([]), mem, 100)).toEqual([]);
    expect(padActions(pad([1]), mem, 150)).toEqual([{ k: 'cancel' }]);
  });

  it('d-pad and analog stick move the cursor and repeat while held (300 ms, then every 120 ms)', () => {
    const mem = emptyMemory();
    expect(padActions(pad([12]), mem, 0)).toEqual([{ k: 'cursor', dir: 'up' }]);
    expect(padActions(pad([12]), mem, 200)).toEqual([]);
    expect(padActions(pad([12]), mem, 310)).toEqual([{ k: 'cursor', dir: 'up' }]);
    expect(padActions(pad([12]), mem, 380)).toEqual([]);
    expect(padActions(pad([12]), mem, 440)).toEqual([{ k: 'cursor', dir: 'up' }]);
    expect(padActions(pad([], [0.9, 0.1]), emptyMemory(), 0)).toEqual([{ k: 'cursor', dir: 'right' }]);
    expect(padActions(pad([], [0.3, 0.2]), emptyMemory(), 0)).toEqual([]); // dead zone
  });

  it('the right stick up and down scrolls the turn list, repeating while held; left and right do nothing', () => {
    const mem = emptyMemory();
    expect(padActions(pad([], [0, 0, 0, 0.9]), mem, 0)).toEqual([{ k: 'turns', dir: 1 }]);
    expect(padActions(pad([], [0, 0, 0, 0.9]), mem, 200)).toEqual([]);
    expect(padActions(pad([], [0, 0, 0, 0.9]), mem, 310)).toEqual([{ k: 'turns', dir: 1 }]);
    // flipping the stick is a new press, not the held one
    expect(padActions(pad([], [0, 0, 0, -0.9]), mem, 330)).toEqual([{ k: 'turns', dir: -1 }]);
    expect(padActions(pad([], [0, 0, 0.9, 0.2]), emptyMemory(), 0)).toEqual([]);
  });

  it('shoulder buttons rotate the camera, Start opens the menu, Back undoes', () => {
    const mem = emptyMemory();
    expect(padActions(pad([4, 9]), mem, 0)).toEqual([{ k: 'rotate', dir: -1 }, { k: 'help' }]);
    expect(padActions(pad([8]), emptyMemory(), 0)).toEqual([{ k: 'undo' }]);
  });
});
