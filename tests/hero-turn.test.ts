import { describe, expect, it } from 'vitest';
import { commandIndex } from '../src/client/command.ts';
import { HeroTurn, type TurnHost } from '../src/client/hero-turn.ts';
import type { Ui } from '../src/client/interaction.ts';
import type { KeyAction } from '../src/client/keyboard.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { flat, stateOf } from './battle-helpers.ts';

// The turn screens key by key, in the steps of FFT: The Ivalice Chronicles (Nov 16): menu, Abilities (the Agir primeiro
// lists, act-turn.test.ts) and Cancel one step back. The Game and the scene are stand-ins: only what the screens ask of them
function turn() {
  const battle = new Battle(
    flat(6, 6),
    stateOf([
      { id: 'a', def: 'warrior', team: 'hero', x: 1, y: 1 },
      { id: 'b', def: 'soldier', team: 'enemy', x: 2, y: 1 },
      { id: 'beacon', def: 'beacon', team: 'hero', x: 5, y: 5 },
    ]),
  );
  const calls: string[] = [];
  const host: TurnHost = {
    battle,
    busy: false,
    heroTurn: true,
    update: (ui: Ui) => {
      t.ui = ui;
    },
    runAct: async () => {},
    execute: async () => void calls.push('execute'),
    endTurn: async () => void calls.push('endTurn'),
    undo: () => void calls.push('undo'),
    status: () => void calls.push('status'),
    save: () => {},
  };
  // heading 0: the camera straight, so "right" is +x on the grid
  const scene = { heading: 0, focusOn: () => {}, sync: () => {}, pick: () => null } as unknown as ConstructorParameters<
    typeof HeroTurn
  >[1];
  const t = new HeroTurn(host, scene);
  const press = (...keys: KeyAction[]) => keys.forEach((k) => t.key(k));
  return { t, battle, calls, press };
}
const ok: KeyAction = { k: 'confirm' };
const esc: KeyAction = { k: 'cancel' };
describe('turn screens, key by key', () => {
  it('Abilities opens the target list; Cancel there goes back to the menu on Abilities', () => {
    const { t, press } = turn();
    expect(t.screen).toEqual({ k: 'menu', index: commandIndex('move') });
    press({ k: 'cursor', dir: 'up' }, ok);
    expect(t.screen).toEqual({ k: 'acts', index: 0 });
    press(ok); // "Escolher alvo"
    expect(t.screen).toEqual({ k: 'targets', index: 0 });
    press(esc);
    expect(t.screen).toEqual({ k: 'acts', index: 0 });
    press(esc);
    expect(t.screen).toEqual({ k: 'menu', index: commandIndex('act') });
  });

  it('Status and Wait run their own commands', () => {
    const { t, calls } = turn();
    t.chooseCommand(commandIndex('status'));
    t.chooseCommand(commandIndex('wait'));
    expect(calls).toEqual(['status', 'endTurn']);
  });

  // Fernando, Nov 18: after a move both rows show; Move opens the movement left, Undo move takes the step back
  it('after a move: Move opens the map again, Undo move undoes, and the arrows walk all five rows', () => {
    const { t, battle, calls, press } = turn();
    battle.move({ x: 1, y: 2 });
    expect(battle.reach().size).toBeGreaterThan(0);
    t.screen = { k: 'menu', index: commandIndex('act') };
    press({ k: 'cursor', dir: 'down' });
    expect(t.screen).toEqual({ k: 'menu', index: commandIndex('move') });
    press({ k: 'cursor', dir: 'down' });
    expect(t.screen).toEqual({ k: 'menu', index: commandIndex('undo') });
    t.chooseCommand(commandIndex('undo'));
    expect(calls).toEqual(['undo']);
    t.chooseCommand(commandIndex('move'));
    expect(t.screen).toEqual({ k: 'map', command: 'move' });
  });

  it('the facing choice: Confirm passes the turn, Cancel goes back to the menu on Wait', () => {
    const { t, calls, press } = turn();
    t.screen = { k: 'facing' }; // where the Game leaves it after Wait
    press(esc);
    expect(t.screen).toEqual({ k: 'menu', index: commandIndex('wait') });
    t.screen = { k: 'facing' };
    press(ok);
    expect(calls).toEqual(['endTurn']);
  });

  it('Move map: Cancel goes back to the menu on Move, and Cancel there does nothing', () => {
    const { t, calls, press } = turn();
    press(ok);
    expect(t.screen).toEqual({ k: 'map', command: 'move' });
    press(esc);
    expect(t.screen).toEqual({ k: 'menu', index: commandIndex('move') });
    press(esc);
    expect(t.screen.k).toBe('menu');
    expect(calls).toEqual([]);
  });

  it('the number 1 picks Move', () => {
    const { t, press } = turn();
    press({ k: 'slot', index: 0 });
    expect(t.screen).toEqual({ k: 'map', command: 'move' });
  });

  it('after a free move, Cancel on the menu undoes it', () => {
    const { t, battle, calls, press } = turn();
    battle.move({ x: 1, y: 2 });
    press(esc);
    expect(calls).toEqual(['undo']);
    expect(t.screen.k).toBe('menu');
  });
});
