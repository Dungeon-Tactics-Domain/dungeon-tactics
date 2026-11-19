import { describe, expect, it } from 'vitest';
import { cancel, freshUi, hoverTile, selectMode } from '../src/client/interaction.ts';
import { cycleUnit, gridStep, keyAction, pageKeeps } from '../src/client/keyboard.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { flat, HIT_SEED, stateOf } from './battle-helpers.ts';

const key = (k: string, extra: Partial<KeyboardEvent> = {}) =>
  keyAction({ key: k, code: '', shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, ...extra });

describe('game keys', () => {
  it('WASD and arrows move the cursor in the four screen directions', () => {
    expect(key('w')).toEqual({ k: 'cursor', dir: 'up' });
    expect(key('ArrowUp')).toEqual({ k: 'cursor', dir: 'up' });
    expect(key('a')).toEqual({ k: 'cursor', dir: 'left' });
    expect(key('S')).toEqual({ k: 'cursor', dir: 'down' }); // Caps Lock changes nothing
    expect(key('ArrowRight')).toEqual({ k: 'cursor', dir: 'right' });
  });

  it('confirm, cancel, cycle, space bar and shortcuts', () => {
    expect(key('Enter')).toEqual({ k: 'confirm' });
    expect(key(' ')).toEqual({ k: 'confirm' });
    expect(key('i')).toEqual({ k: 'info' });
    expect(key('Escape')).toEqual({ k: 'cancel' });
    expect(key('Backspace')).toEqual({ k: 'cancel' });
    expect(key('Tab')).toEqual({ k: 'cycle', dir: 1 });
    expect(key('Tab', { shiftKey: true })).toEqual({ k: 'cycle', dir: -1 });
    expect(key('1')).toEqual({ k: 'slot', index: 0 });
    expect(key('3')).toBeNull(); // the abilities are no longer on the numbers
    expect(key('z')).toEqual({ k: 'undo' });
    expect(key('p')).toEqual({ k: 'wait' });
    expect(key('r')).toEqual({ k: 'rotate', dir: 1 });
    expect(key('R', { shiftKey: true })).toEqual({ k: 'rotate', dir: -1 });
    expect(key('v')).toBeNull(); // the pixel art key left with it (Nov 18)
    expect(key('q')).toEqual({ k: 'zoom', factor: 1.15 });
    expect(key('e')).toEqual({ k: 'zoom', factor: 1 / 1.15 });
    expect(key('f')).toEqual({ k: 'recenter' });
    expect(key('h')).toEqual({ k: 'help' });
    expect(key('PageDown')).toEqual({ k: 'turns', dir: 1 });
    expect(key('PageUp')).toEqual({ k: 'turns', dir: -1 });
  });

  it('a held key repeats moves, not Esc, P or Z', () => {
    const held = { repeat: true };
    expect(key('Escape', held)).toBeNull(); // backed out and then undid the move
    expect(key('Backspace', held)).toBeNull();
    expect(key('p', held)).toBeNull(); // skipped the facing choice
    expect(key('z', held)).toBeNull(); // spent every undo
    expect(key('Escape')).toEqual({ k: 'cancel' });
    expect(key('ArrowUp', held)).toEqual({ k: 'cursor', dir: 'up' });
    expect(key('Tab', held)).toEqual({ k: 'cycle', dir: 1 });
    expect(key('e', held)).toEqual({ k: 'zoom', factor: 1 / 1.15 });
    // main.ts drops a held confirm itself, after keeping Space from scrolling
    expect(key('Enter', held)).toEqual({ k: 'confirm' });
  });

  it('browser shortcut (Ctrl, Alt, Cmd) and unknown key are left to the browser', () => {
    expect(key('r', { ctrlKey: true })).toBeNull();
    expect(key('w', { metaKey: true })).toBeNull();
    expect(key('x')).toBeNull();
    expect(key('8')).toBeNull();
  });
});

describe('cursor follows the camera', () => {
  // initial camera (π/4): the map shows as a diamond; screen up is the grid -y axis
  const START = Math.PI / 4;
  it('in the initial camera each direction is a different grid axis', () => {
    expect(gridStep('up', START)).toEqual({ x: 0, y: -1 });
    expect(gridStep('right', START)).toEqual({ x: 1, y: 0 });
    expect(gridStep('down', START)).toEqual({ x: 0, y: 1 });
    expect(gridStep('left', START)).toEqual({ x: -1, y: 0 });
  });

  it('rotating the camera 90° rotates the directions too (W is still screen up)', () => {
    const turned = START + Math.PI / 2;
    expect(gridStep('up', turned)).toEqual({ x: -1, y: 0 });
    expect(gridStep('right', turned)).toEqual({ x: 0, y: -1 });
    // four turns return to the start
    expect(gridStep('up', START + 2 * Math.PI)).toEqual(gridStep('up', START));
    // straight camera (8 angles, Nov 13): each arrow moves straight on screen; at 0° "up" is -y
    expect([gridStep('up', 0), gridStep('right', 0), gridStep('down', 0), gridStep('left', 0)]).toEqual([
      { x: 0, y: -1 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
    ]);
    expect(gridStep('up', Math.PI / 2)).toEqual({ x: -1, y: 0 });
  });
});

describe('cursor in battle', () => {
  const at = (x: number, y = 0) => ({ x, y });
  const scene = () =>
    new Battle(
      flat(8, 3),
      stateOf(
        [
          { id: 'a', def: 'archer', team: 'hero', x: 0, y: 1 },
          { id: 'b', def: 'beacon', team: 'hero', x: 0, y: 0 },
          { id: 'f', def: 'soldier', team: 'enemy', x: 4, y: 1 },
        ],
        HIT_SEED,
      ),
    );

  it('hovering the cursor over a tile marks the preview, with no invalid-tile warning', () => {
    const b = scene();
    expect(hoverTile(b, freshUi(b), at(2, 1)).pending).toEqual(at(2, 1));
    const far = hoverTile(b, freshUi(b), at(7, 2));
    expect(far.pending).toBeNull();
    expect(far.invalid).toBe(false);
  });

  it('cancel clears the marked tile and keeps Move', () => {
    const b = scene();
    const ui = hoverTile(b, selectMode(b, freshUi(b), { k: 'move' }), at(2, 1));
    expect(ui.pending).toEqual(at(2, 1));
    const once = cancel(ui);
    expect(once.pending).toBeNull();
    expect(once.mode).toEqual({ k: 'move' });
  });

  it('Tab cycles through living units in order and wraps around', () => {
    const b = scene();
    expect(cycleUnit(b.state, at(0, 1), 1)).toEqual(at(0, 0));
    expect(cycleUnit(b.state, at(4, 1), 1)).toEqual(at(0, 1));
    expect(cycleUnit(b.state, at(0, 1), -1)).toEqual(at(4, 1));
    expect(cycleUnit(b.state, at(7, 2), 1)).toEqual(at(0, 1)); // cursor on an empty tile: starts from the first
  });
});

describe('Tab and the 3D menu (Nov 18, accessibility)', () => {
  it('with a menu open Tab stays with the page; on the map it cycles units', () => {
    const tab = key('Tab')!;
    expect(pageKeeps(tab, true, false)).toBe(true);
    expect(pageKeeps(key('Tab', { shiftKey: true })!, true, false)).toBe(true);
    expect(pageKeeps(tab, false, false)).toBe(false);
    expect(pageKeeps(tab, false, true)).toBe(false); // a tabbed ☰ on the map: Tab still jumps between units
  });
  it('Enter and Space press the button Tab reached, else they go to the game', () => {
    for (const k of ['Enter', ' ']) {
      expect(pageKeeps(key(k)!, true, true)).toBe(true);
      expect(pageKeeps(key(k)!, false, true)).toBe(true);
      expect(pageKeeps(key(k)!, true, false)).toBe(false);
    }
  });
  it('arrows and every other key stay with the game', () => {
    for (const k of ['ArrowDown', 'Escape', 'z', 'c']) expect(pageKeeps(key(k)!, true, true)).toBe(false);
  });
});
