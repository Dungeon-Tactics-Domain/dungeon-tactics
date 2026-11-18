// Battle input: the keyboard, the mouse or touch on the canvas and the gamepad, all sent to the Game as the same actions.
import { padDialog } from './dialog.ts';
import { emptyMemory, padActions } from './gamepad.ts';
import { tabbed } from './icons.ts';
import { padSeen } from './key-hints.ts';
import { type KeyAction, keyAction, pageKeeps } from './keyboard.ts';
import type { BattleScene } from './scene.ts';
import { pace } from './timing.ts';
import { TouchInput } from './touch-input.ts';

export interface InputActions {
  key(a: KeyAction): void;
  tap(x: number, y: number): void;
  hover(x: number, y: number): void;
}

// attaches the listeners and returns the gamepad reader, which the Game calls every frame
export function battleInput(canvas: HTMLCanvasElement, scene: BattleScene, act: InputActions): () => void {
  // TouchInput attaches its listeners to the canvas in the constructor; nothing else needs a reference
  new TouchInput(canvas, {
    tap: (x, y) => act.tap(x, y),
    hover: (x, y) => act.hover(x, y),
    pan: (dx, dy) => scene.pan(dx, dy),
    zoom: (f) => scene.zoom(f),
    rotate: (dir) => scene.rotate(dir),
  });
  // right button cancels, like FFT's "back"
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    act.key({ k: 'cancel' });
  });
  // Keyboard (Fernando's request, Oct 25): every action has a key. The key -> action translation is pure (keyboard.ts).
  // With a dialog open, the keys belong to it (Esc closes, Tab moves between buttons, up and down walk its list: dialog.ts).
  addEventListener('keydown', (e) => {
    if (document.querySelector('.overlay')) return;
    const a = keyAction(e);
    if (!a) return;
    // confirm only on press: holding Enter to speed up the enemy must not pick the hero's 1st command by accident
    if (e.repeat && a.k === 'confirm') return void e.preventDefault();
    // the 3D menu's buttons and "Execute?"'s, when one is open (menu3d.ts hits, hud-menus.ts renderConfirm)
    if (pageKeeps(a, !!document.querySelector('.menu3d-hits button, .hud .confirm:not([hidden]) button'), tabbed()))
      return;
    e.preventDefault(); // on the map Tab does not jump between buttons, Space does not scroll, F3 does not open the browser search
    // a focus Tab put on the 3D menu stays, and follows the game's (Menu3d.update)
    if (!document.activeElement?.closest('.menu3d-hits')) (document.activeElement as HTMLElement | null)?.blur();
    act.key(a);
  });
  // holding Enter or Space fast-forwards the battle (timing.ts); switching tabs releases it, otherwise it stayed fast-forwarded with no key held
  const hold = (on: boolean) => (e: KeyboardEvent) =>
    e.key === 'Enter' || e.key === ' ' ? (pace.key = on) : undefined;
  addEventListener('keydown', hold(true));
  addEventListener('keyup', hold(false));
  addEventListener('blur', () => (pace.key = false));

  // Gamepad (gamepad.ts): reads the first pad every frame and sends actions through the same path as the keyboard. With a
  // dialog open, the pad moves between its buttons (A presses, B closes).
  const pad = emptyMemory();
  let primed = false;
  return () => {
    const gp = [...(navigator.getGamepads?.() ?? [])].find((g) => g?.connected);
    pace.pad = !!gp?.buttons[0]?.pressed; // holding A (or x) fast-forwards the battle
    if (!gp) return;
    padSeen(gp);
    const actions = padActions(
      { buttons: gp.buttons.map((b) => b.pressed), axes: [...gp.axes] },
      pad,
      performance.now(),
    );
    // 1st frame with a pad: only records what was already pressed (the A that entered the stage does not pick the 1st command)
    if (!primed) return void (primed = true);
    for (const a of actions) if (!padDialog(a)) act.key(a);
  };
}
