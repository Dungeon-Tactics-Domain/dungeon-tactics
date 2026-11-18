// The 3D pieces the battle HUD only feeds (hud-skin.ts loads them): the combat bar (bar3d/), the instruction banner,
// Height and button hints (hints3d/), "Execute?" (confirm3d/), the corner menu (window3d/), and the screens that take
// their window by themselves (the end of battle, Options, the title, Status, the speech box...).
// Types only: their chunks come through hud-skin.ts.
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
// draws over; `tools`: the corner menu's root, which the 3D one draws over. The layer disposes every piece with itself
export function pieces3d(
  skin: HudSkin,
  layer: Ui3dLayer,
  active: HTMLElement,
  confirm: HTMLElement,
  tools: HTMLElement,
): Pieces3d {
  for (const make of skin.screens) make(layer);
  skin.tools3d(layer, tools); // reads the HTML menu's own state
  return { bar: skin.bar3d(layer, active), hints: skin.hints3d(layer), confirm: skin.confirm3d(layer, confirm) };
}
