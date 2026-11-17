// The town's HUD and the window of a place: the battle HUD's pieces dressed for the town.
import { type Place, TOWN } from '../../content/crawl/town.ts';
import { dialog } from '../dialog.ts';
import { keysText } from '../glyphs.ts';
import { KEYS } from '../hud.ts';
import { loadTownSkin } from '../hud-skin.ts';
import { t } from '../i18n.ts';
import { button, el, iconButton } from '../icons.ts';
import { keysShown } from '../key-hints.ts';
import { sfx } from '../sound.ts';
import { openBar, openShop } from '../town-shop.ts';
import { openParty, town3d } from '../town-ui.ts';
import { questGate } from './crawl.ts';

// the battle HUD's pieces: the name in the tile info's corner, the prompt as the help line, the menu button in the
// top right corner; as a .hud it hides while someone talks (style.css)
export function townHud(prompt: HTMLElement, balloon: HTMLElement, menu: () => void) {
  const hud = el(
    'div',
    { class: `hud${KEYS ? ' kbd' : ''}` },
    el('div', { class: 'panel tile-info' }, t(TOWN.name, TOWN.en)),
    prompt,
    balloon,
    el(
      'div',
      { class: 'tools' },
      iconButton(
        el('span', { class: 'burger-bars', 'aria-hidden': 'true' }),
        t(`Menu da cidade (${keysText('cancel', keysShown())})`, `Town menu (${keysText('cancel', keysShown())})`),
        menu,
        { class: 'icon burger' },
      ),
    ),
  );
  void loadTownSkin(hud); // the windows' 3D look (hud-skin.ts)
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
  if (town3d.soon?.(name, says)) return;
  const d = dialog('title', name, [
    el('p', {}, says),
    button('primary', t('Voltar à rua', 'Back to the street'), () => d.close()),
  ]);
  d.overlay.querySelector<HTMLButtonElement>('.primary')!.focus();
}
