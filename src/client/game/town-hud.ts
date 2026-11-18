// The town's HUD and the window of a place: the battle HUD's pieces dressed for the town.
import { type Place, TOWN } from '../../content/crawl/town.ts';
import { KEYS } from '../hud.ts';
import { gearButtons } from '../hud-tools.ts';
import { t } from '../i18n.ts';
import { el } from '../icons.ts';
import { looks3d } from '../looks3d.ts';
import { sfx } from '../sound.ts';
import { openBar, openShop } from '../town-shop.ts';
import { openParty } from '../town-ui.ts';
import { questGate } from './crawl.ts';

// the battle HUD's pieces: the name in the tile info's corner, the prompt as the help line, the gear (Options) and
// ↺ ↻ in the top right corner, as in battle (Fernando, Nov 18 night: no ☰ anywhere); as a .hud it hides while someone
// talks (style.css)
export function townHud(prompt: HTMLElement, balloon: HTMLElement, options: () => void, rotate: (dir: 1 | -1) => void) {
  const hud = el(
    'div',
    { class: `hud${KEYS ? ' kbd' : ''}` },
    el('div', { class: 'panel tile-info' }, t(TOWN.name, TOWN.en)),
    prompt,
    balloon,
    gearButtons(options, rotate).root,
  );
  return hud;
}

// a place's window: the existing ones (Fernando, Nov 15), the gate's quest rows, or what a place without one yet says
export function openPlace(pl: Place) {
  sfx('confirm');
  const name = t(...pl.name);
  if (pl.id === 'gate') return questGate(name);
  if (pl.id === 'guild') return openParty();
  if (pl.id === 'shop') return openShop();
  if (pl.id === 'tavern') return openBar(() => {});
  const says = pl.soon ? t(...pl.soon) : '';
  looks3d.soon?.(name, says); // drawn by town3d/street.ts
}
