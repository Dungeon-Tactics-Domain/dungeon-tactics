// The HTML a `hide` name of the sandbox still has on the page (hud.ts, talk.ts, dialog.ts, entry.ts, fps.ts), hidden
// the way the sandbox always did. Only until the HTML interface is deleted (Fernando, Nov 18: the whole interface is
// 3D): the 3D pieces never come through here, the layer hides them by name (ui-pieces.ts). This file goes with the
// panels it names.
import type { Hidden, Panel } from './sandbox-spec.ts';

const HTML: Record<Panel, string> = {
  tile: '.panel.tile-info',
  queue: '.panel.queue',
  help: '.panel.help',
  banner: '.panel.banner, .announce',
  tools: '.hud .tools',
  menu: '.panel.commands, .panel.abilities, .panel.confirm, .panel.sheet, .glove',
  units: '.active-slot, .target-slot',
  strikes: '.strikes',
  numbers: '.floats',
  fps: '.fps',
  dialogs: '.overlay',
};

// visibility, not display: the panels keep their size, so the camera frames the map the same with or without the HUD
export function hideHtml(style: HTMLStyleElement, hide: readonly Hidden[]) {
  const names = hide.includes('all') ? Object.keys(HTML) : hide.filter((h) => h in HTML);
  style.textContent = names.length
    ? `${names.map((h) => HTML[h as Panel]).join(', ')} { visibility: hidden !important; }`
    : '';
}
