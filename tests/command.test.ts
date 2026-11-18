import { describe, expect, it } from 'vitest';
import { commandName } from '../src/client/battle-text.ts';
import {
  abilityEnabled,
  COMMANDS,
  cancelStep,
  canUndoMove,
  commandEnabled,
  commandIndex,
  lockStep,
  longestRange,
  menuRows,
  startScreen,
  stepIndex,
  turnPage,
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
    expect(startScreen(b)).toEqual({ k: 'menu', index: commandIndex('move') });
    b.move({ x: 2, y: 2 });
    expect(startScreen(b)).toEqual({ k: 'menu', index: commandIndex('act') });
    b.act('strike', { x: 2, y: 1 });
    expect(commandEnabled(b, 'act')).toBe(false);
    // movement left (Nov 13, movement in parts): back to Move
    expect(startScreen(b)).toEqual({ k: 'menu', index: commandIndex('move') });
  });

  // Nov 13, Fernando's request, as in Tactics Ogre: after moving, "Desfazer movimento" (undo move); Nov 18: its own row
  it("moved and didn't act: Undo move takes the movement back (for free), without the menu cursor landing on it", () => {
    const b = duel();
    expect(canUndoMove(b)).toBe(false);
    b.move({ x: 2, y: 2 });
    expect(canUndoMove(b)).toBe(true);
    expect(commandEnabled(b, 'undo')).toBe(true);
    expect(commandEnabled(b, 'move')).toBe(b.reach().size > 0); // Move is Move again, for the movement left
    expect(startScreen(b)).toEqual({ k: 'menu', index: commandIndex('act') }); // a 2nd Enter doesn't undo by accident
    const undos = b.undosLeft;
    expect(b.undo()).toBe(true);
    expect(b.actor.pos).toEqual({ x: 1, y: 1 });
    expect(b.undosLeft).toBe(undos);
    expect(canUndoMove(b)).toBe(false);
    expect(startScreen(b)).toEqual({ k: 'menu', index: commandIndex('move') }); // back to the menu from before moving
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

  it('acted, then a free move: the cursor skips "Undo move" and starts on Move, for the movement left', () => {
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
    // Move is still Move (Nov 18); "Undo move" under it never takes the cursor
    expect(startScreen(b)).toEqual({ k: 'menu', index: commandIndex('move') });
    expect(menuRows(b)).toEqual(['move', 'undo', 'act', 'wait', 'status']);
  });

  // Fernando, Nov 17: the cursor follows what is seen. "On the character" sits left of "On the tile"
  it('the lock step: left and right go to the choice on that side, stay at the end, and up and down do nothing', () => {
    expect(lockStep('tile', 'left')).toBe('unit');
    expect(lockStep('unit', 'right')).toBe('tile');
    expect(lockStep('unit', 'left')).toBe('unit'); // the left end: no way round
    expect(lockStep('tile', 'right')).toBe('tile'); // the right end
    for (const lock of ['unit', 'tile'] as const)
      for (const dir of ['up', 'down'] as const) expect(lockStep(lock, dir)).toBe(lock);
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

// Nov 16: the names, order and steps of FFT: The Ivalice Chronicles
describe('command list', () => {
  it('Move, Undo move, Abilities, Wait, Status, in the order of the reference', () => {
    expect(COMMANDS).toEqual(['move', 'undo', 'act', 'wait', 'status']);
    expect(COMMANDS.map((c) => commandName(c))).toEqual([
      'Mover',
      'Desfazer movimento', // the reference's Reset
      'Habilidades',
      'Esperar',
      'Status',
    ]);
  });

  it('Status always opens; Abilities closes after acting and in deep water it never opened', () => {
    const b = duel();
    expect(COMMANDS.map((c) => commandEnabled(b, c))).toEqual([true, false, true, true, true]); // nothing to undo yet
    b.act('strike', { x: 2, y: 1 });
    expect(commandEnabled(b, 'act')).toBe(false);
    expect(commandEnabled(b, 'wait') && commandEnabled(b, 'status')).toBe(true);
  });
});

describe('Cancel goes back one step', () => {
  const strike = UNIT_DEFS.warrior.abilities.indexOf('strike');
  const target = { x: 2, y: 1 };

  it('submenu to the menu on Abilities; Move map to the menu on Move; facing to the menu on Wait', () => {
    const b = duel();
    expect(cancelStep(b, { k: 'abilities', index: 2, page: 1 })).toEqual({ k: 'menu', index: commandIndex('act') });
    expect(cancelStep(b, { k: 'map', command: 'move' })).toEqual({ k: 'menu', index: commandIndex('move') });
    expect(cancelStep(b, { k: 'facing' })).toEqual({ k: 'menu', index: commandIndex('wait') });
  });

  it('Act map to the submenu, on the ability that was being aimed', () => {
    const b = duel();
    expect(cancelStep(b, { k: 'map', command: 'act' }, 'strike')).toEqual({ k: 'abilities', index: strike });
    const last = UNIT_DEFS.warrior.abilities.at(-1)!;
    expect(cancelStep(b, { k: 'map', command: 'act' }, last)).toEqual({
      k: 'abilities',
      index: UNIT_DEFS.warrior.abilities.length - 1,
    });
  });

  it('preview back to aiming; the lock step back to the preview', () => {
    const b = duel();
    expect(cancelStep(b, { k: 'confirm', ability: 'strike', target })).toEqual({ k: 'map', command: 'act' });
    expect(cancelStep(b, { k: 'confirm', ability: 'strike', target, lock: 'unit' })).toEqual({
      k: 'confirm',
      ability: 'strike',
      target,
    });
  });

  it('a self-centred ability never went through the map: its preview goes back to the submenu', () => {
    const self = Object.keys(ABILITIES).find((id) => ABILITIES[id].range[1] === 0)!;
    const owner = Object.keys(UNIT_DEFS).find((d) => UNIT_DEFS[d].abilities.includes(self))!;
    const mine = new Battle(
      flat(6, 6),
      stateOf([
        { id: 'a', def: owner, team: 'hero', x: 1, y: 1 },
        { id: 'b', def: 'soldier', team: 'enemy', x: 4, y: 4 },
      ]),
    );
    expect(cancelStep(mine, { k: 'confirm', ability: self, target: mine.actor.pos })).toEqual({
      k: 'abilities',
      index: UNIT_DEFS[owner].abilities.indexOf(self),
    });
  });

  it('on the menu: nothing to go back to, or the free move is undone', () => {
    const b = duel();
    expect(cancelStep(b, { k: 'menu', index: 0 })).toBeNull();
    b.move({ x: 2, y: 2 });
    expect(cancelStep(b, { k: 'menu', index: 1 })).toBe('undo');
    b.act('strike', target); // the move drew a counter: no longer free
    expect(cancelStep(b, { k: 'menu', index: 2 })).toBeNull();
  });

  it('walking the whole way back from the lock step ends on the menu, one screen per Cancel', () => {
    const b = duel();
    const seen: string[] = [];
    let s = cancelStep(b, { k: 'confirm', ability: 'strike', target, lock: 'tile' }, 'strike');
    while (s && s !== 'undo') {
      seen.push(s.k === 'confirm' ? 'preview' : s.k === 'map' ? `map:${s.command}` : s.k);
      s = cancelStep(b, s, 'strike');
    }
    expect(seen).toEqual(['preview', 'map:act', 'abilities', 'menu']);
    expect(s).toBeNull();
  });
});

describe('ability sheet page', () => {
  it('turns both ways and wraps around the three pages', () => {
    expect([turnPage(0, 1), turnPage(2, 1), turnPage(0, -1), turnPage(1, -1)]).toEqual([1, 0, 2, 0]);
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

// Fernando, Nov 18: after a move the menu keeps Move (while movement is left) and shows "Undo move" under it
describe('menu rows in each state of the turn', () => {
  // an archer far from the soldier: shooting draws no counter, so the move after it stays free to undo
  const range = () =>
    new Battle(
      flat(8, 8),
      stateOf([
        { id: 'a', def: 'archer', team: 'hero', x: 1, y: 1 },
        { id: 'b', def: 'soldier', team: 'enemy', x: 5, y: 1 },
        { id: 'beacon', def: 'beacon', team: 'hero', x: 7, y: 7 },
      ]),
    );
  // walks one tile at a time until the movement runs out
  const walkAll = (b: Battle) => {
    for (let n = 0; n < 50 && b.reach().size; n++) b.move(b.reach().values().next().value!.pos);
  };

  it('the turn starts with 4 rows: Move, Abilities, Wait, Status', () => {
    expect(menuRows(range())).toEqual(['move', 'act', 'wait', 'status']);
  });

  it('moved with movement left: 5 rows, Undo move right under Move', () => {
    const b = range();
    b.move({ x: 1, y: 2 });
    expect(b.reach().size).toBeGreaterThan(0);
    expect(menuRows(b)).toEqual(['move', 'undo', 'act', 'wait', 'status']);
  });

  it('moved with no movement left: Move leaves, Undo move stays', () => {
    const b = range();
    walkAll(b);
    expect(b.reach().size).toBe(0);
    expect(canUndoMove(b)).toBe(true);
    expect(menuRows(b)).toEqual(['undo', 'act', 'wait', 'status']);
  });

  it('after attacking: Move for the movement left, no Undo move with nothing to take back', () => {
    const b = range();
    b.act('shot', { x: 5, y: 1 });
    expect(menuRows(b)).toEqual(['move', 'act', 'wait', 'status']);
    expect(commandEnabled(b, 'act')).toBe(false);
  });

  it('no step to undo (the move drew a counter): only Move, never Undo move', () => {
    const b = duel();
    b.move({ x: 2, y: 2 });
    b.act('strike', { x: 2, y: 1 });
    expect(canUndoMove(b)).toBe(false);
    expect(menuRows(b)).toEqual([...(b.reach().size ? ['move'] : []), 'act', 'wait', 'status']);
  });
});
