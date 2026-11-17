import { describe, expect, it } from 'vitest';
import { commandIndex } from '../src/client/command.ts';
import { HeroTurn, type TurnHost } from '../src/client/hero-turn.ts';
import type { Ui } from '../src/client/interaction.ts';
import type { KeyAction } from '../src/client/keyboard.ts';
import { Battle } from '../src/shared/battle/battle.ts';
import { UNIT_DEFS } from '../src/shared/battle/units.ts';
import { flat, stateOf } from './battle-helpers.ts';

// The turn screens key by key, in the steps of FFT: The Ivalice Chronicles (Nov 16): menu, Abilities, target, preview,
// and Cancel one step back. The Game and the scene are stand-ins: only what the screens ask of them
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
const strike = UNIT_DEFS.warrior.abilities.indexOf('strike');

describe('turn screens, key by key', () => {
  it('Abilities opens the submenu; Cancel there goes back to the menu on Abilities', () => {
    const { t, press } = turn();
    expect(t.screen).toEqual({ k: 'menu', index: commandIndex('move') });
    press({ k: 'cursor', dir: 'down' }, ok);
    expect(t.screen.k).toBe('abilities');
    press(esc);
    expect(t.screen).toEqual({ k: 'menu', index: commandIndex('act') });
  });

  it('Status and Wait are the 4th and 3rd rows', () => {
    const { t, calls } = turn();
    t.chooseCommand(3);
    t.chooseCommand(2);
    expect(calls).toEqual(['status', 'endTurn']);
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

  it('target, then the preview: arrows toggle nothing, Confirm runs it', async () => {
    const { t, calls, press } = turn();
    t.chooseCommand(commandIndex('act'));
    t.chooseAbility(strike);
    expect(t.screen).toEqual({ k: 'map', command: 'act' });
    press({ k: 'cycle', dir: 1 }); // Tab: from the warrior to the soldier
    expect(t.cursor).toEqual({ x: 2, y: 1 });
    press(ok);
    const preview = { k: 'confirm', ability: 'strike', target: { x: 2, y: 1 } };
    expect(t.screen).toEqual(preview);
    expect(calls).toEqual([]); // nothing ran yet
    press({ k: 'cursor', dir: 'left' }, { k: 'cursor', dir: 'down' });
    expect(t.screen).toEqual(preview);
    press(ok);
    await Promise.resolve();
    expect(calls).toEqual(['execute']);
  });

  it('Cancel on the preview goes back to aiming with the target kept, then to the submenu on that ability', () => {
    const { t, calls, press } = turn();
    t.chooseCommand(commandIndex('act'));
    t.chooseAbility(strike);
    press({ k: 'cycle', dir: 1 }, ok, esc);
    expect(t.screen).toEqual({ k: 'map', command: 'act' });
    expect(t.ui.pending).toEqual({ x: 2, y: 1 });
    expect(t.cursor).toEqual({ x: 2, y: 1 });
    press(esc);
    expect(t.screen).toEqual({ k: 'abilities', index: strike });
    expect(t.cursor).toEqual({ x: 1, y: 1 }); // back on the acting unit
    expect(calls).toEqual([]);
  });

  it("the preview's Back button is the same Cancel", () => {
    const { t, press } = turn();
    t.chooseCommand(commandIndex('act'));
    t.chooseAbility(strike);
    press({ k: 'cycle', dir: 1 }, ok);
    void t.answer(false);
    expect(t.screen).toEqual({ k: 'map', command: 'act' });
  });

  it('an invalid target opens no preview', () => {
    const { t, press } = turn();
    t.chooseCommand(commandIndex('act'));
    t.chooseAbility(strike);
    press(ok); // the cursor is still on the warrior itself
    expect(t.screen).toEqual({ k: 'map', command: 'act' });
  });

  it('after a free move, Cancel on the menu undoes it', () => {
    const { t, battle, calls, press } = turn();
    battle.move({ x: 1, y: 2 });
    press(esc);
    expect(calls).toEqual(['undo']);
    expect(t.screen.k).toBe('menu');
  });
});
