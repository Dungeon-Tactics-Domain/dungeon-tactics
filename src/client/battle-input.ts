// Battle input: the keyboard, the mouse or touch on the canvas and the gamepad, all sent to the Game as the same actions.
import { padDialog } from './dialog.ts';
import { emptyMemory, padActions } from './gamepad.ts';
import { tabbed } from './icons.ts';
import { padSeen } from './key-hints.ts';
import { type KeyAction, keyAction, pageKeeps } from './keyboard.ts';
import { onLeave, screenSignal } from './nav.ts';
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
  const signal = screenSignal(); // the window's listeners leave with the battle's screen (nav.ts)
  // TouchInput attaches its listeners to the canvas in the constructor; nothing else needs a reference
  const touch = new TouchInput(canvas, {
    tap: (x, y) => act.tap(x, y),
    hover: (x, y) => act.hover(x, y),
    pan: (dx, dy) => scene.pan(dx, dy),
    zoom: (f) => scene.zoom(f),
    rotate: (dir) => scene.rotate(dir),
  });
  // right button cancels, like FFT's "back"
  // the canvas outlives the screen a while (its renderer may be held by a texture kept between screens): what
  // listens on it leaves too, so it holds nothing of the battle
  onLeave(() => touch.dispose());
  const back = (e: Event) => {
    e.preventDefault();
    act.key({ k: 'cancel' });
  };
  canvas.addEventListener('contextmenu', back, { signal });
  // Keyboard (Fernando's request, Oct 25): every action has a key. The key -> action translation is pure (keyboard.ts).
  // With a dialog open, the keys belong to it (Esc closes, Tab moves between buttons, up and down walk its list: dialog.ts).
  const onKey = (e: KeyboardEvent) => {
    const a = keyAction(e);
    // F2 opens and closes the debug panel over any window, its own included (game/debug-menu.ts)
    if (a?.k === 'debug') {
      e.preventDefault();
      return act.key(a);
    }
    if (document.querySelector('.overlay')) return;
    if (!a) return;
    // confirm only on press: holding Enter to speed up the enemy must not pick the hero's 1st command by accident
    if (e.repeat && a.k === 'confirm') return void e.preventDefault();
    // the 3D menu's buttons, when it is open (menu3d.ts hits)
    if (pageKeeps(a, !!document.querySelector('.menu3d-hits button'), tabbed())) return;
    e.preventDefault(); // on the map Tab does not jump between buttons, Space does not scroll, F3 does not open the browser search
    // a focus Tab put on the 3D menu stays, and follows the game's (Menu3d.update)
    if (!document.activeElement?.closest('.menu3d-hits')) (document.activeElement as HTMLElement | null)?.blur();
    act.key(a);
  };
  addEventListener('keydown', onKey, { signal });
  // holding Enter or Space fast-forwards the battle (timing.ts); switching tabs releases it, otherwise it stayed fast-forwarded with no key held
  const hold = (on: boolean) => (e: KeyboardEvent) =>
    e.key === 'Enter' || e.key === ' ' ? (pace.key = on) : undefined;
  addEventListener('keydown', hold(true), { signal });
  addEventListener('keyup', hold(false), { signal });
  addEventListener('blur', () => (pace.key = false), { signal });
  // the Enter that left the screen is never heard coming up: the next screen does not open fast-forwarded
  onLeave(() => (pace.key = pace.pad = false));

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
    for (const a of actions) if (a.k === 'debug' || !padDialog(a)) act.key(a); // L3 as F2 above
  };
}
