// The 3D pieces the battle HUD only feeds (localhost looks; hud-skin.ts loads them): the combat bar (bar3d/), the
// instruction banner, Height and button hints (hints3d/), "Execute?" (confirm3d/), the end of battle (result3d/), the
// corner menu and the Status window (window3d/).
// Types only: the game online never fetches them.
import type { Bar3d } from './bar3d/bar3d.ts';
import type { Confirm3d } from './confirm3d/confirm3d.ts';
import type { Hints3d } from './hints3d/hints3d.ts';
import type { HudSkin } from './hud-skin.ts';
import type { Ui3dLayer } from './ui3d/layer.ts';

export interface Pieces3d {
  bar?: Bar3d;
  hints?: Hints3d;
  confirm?: Confirm3d;
}

// `active`: the acting unit's HTML panel, which the 3D bar stands for; `confirm`: the "Execute?" window, which the 3D one
// draws over. The layer disposes every piece with itself
// `tools`: the corner menu's root, which the 3D one draws over
export function pieces3d(
  skin: HudSkin,
  layer: Ui3dLayer,
  active: HTMLElement,
  confirm: HTMLElement,
  tools: HTMLElement,
): Pieces3d {
  skin.result3d?.(layer); // takes the end of battle by itself (end-screens.ts `setBoard3d`)
  for (const make of skin.flow3d ?? []) make(layer); // each takes its screen by itself (options.ts `setOptions3d`)
  skin.tools3d?.(layer, tools); // reads the HTML menu's own state
  skin.status3d?.(layer); // takes the Status window by itself (status-window.ts `setStatus3d`)
  return { bar: skin.bar3d?.(layer, active), hints: skin.hints3d?.(layer), confirm: skin.confirm3d?.(layer, confirm) };
}
