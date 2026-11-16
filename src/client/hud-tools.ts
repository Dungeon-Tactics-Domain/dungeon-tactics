// The battle HUD's corner menu (3 bars): undo, rotate, whole map, pixel size, fast battle and Options, each with its key.
// Owns its document listeners while open; close() removes them.
import type { HudActions } from './hud.ts';
import { hint } from './hud-pieces.ts';
import { t } from './i18n.ts';
import { button, type Child, el, icon, iconButton, UI_ICON } from './icons.ts';

export class ToolsMenu {
  private readonly toolsMenu = el('div', { class: 'panel tools-menu', role: 'menu', hidden: true });
  private readonly burger = iconButton(
    el('span', { class: 'burger-bars', 'aria-hidden': 'true' }),
    t('Menu', 'Menu'),
    () => this.showTools(!!this.toolsMenu.hidden),
    { class: 'icon burger', 'aria-haspopup': 'menu', 'aria-expanded': 'false' },
  );
  private readonly fastBtn: HTMLElement;
  // a menu button (3 bars) on the HUD panel colour in place of the row of 7 stone buttons (Nov 13, Fernando's request:
  // "crude and inconsistent"); the keys still work and show on each row
  readonly root = el('div', { class: 'tools' }, this.burger, this.toolsMenu);
  // closes on click outside or on any key press (Esc also goes back in the game; the action key keeps acting). The
  // key closes even with focus on the menu button, which keeps it after the click
  private readonly closeOutside = (e: Event) => {
    if (e.type === 'keydown' || !(e.target instanceof Node && this.toolsMenu.parentElement?.contains(e.target)))
      this.showTools(false);
  };

  constructor(act: HudActions) {
    this.fastBtn = this.toolItem('»', t('Batalha rápida', 'Fast battle'), '', () => act.fast(), {
      role: 'menuitemcheckbox',
      'aria-checked': 'false',
    });
    this.toolsMenu.append(
      this.toolItem(icon(UI_ICON.undo), t('Desfazer', 'Undo'), 'Z', () => act.undo()),
      this.toolItem('⟲', t('Girar à esquerda', 'Rotate left'), '⇧R', () => act.rotate(-1)),
      this.toolItem('⟳', t('Girar à direita', 'Rotate right'), 'R', () => act.rotate(1)),
      this.toolItem(icon(UI_ICON.recenter), t('Ver o mapa inteiro', 'Show the whole map'), 'F', () => act.recenter()),
      this.toolItem(icon(UI_ICON.pixel), t('Tamanho do pixel', 'Pixel size'), 'V', () => act.pixel()),
      this.fastBtn,
      this.toolItem(icon(UI_ICON.menu), t('Opções e ajuda', 'Options and help'), 'H', () => act.menu()),
    );
  }

  setFast(on: boolean) {
    this.fastBtn.setAttribute('aria-checked', String(on));
  }
  close() {
    this.showTools(false);
  }

  private showTools(open: boolean) {
    this.toolsMenu.hidden = !open;
    this.burger.setAttribute('aria-expanded', String(open));
    for (const ev of ['pointerdown', 'keydown']) {
      if (open) document.addEventListener(ev, this.closeOutside, true);
      else document.removeEventListener(ev, this.closeOutside, true);
    }
  }
  private toolItem(glyph: Child, label: string, key: string, run: () => void, props: Record<string, unknown> = {}) {
    return button(
      'item',
      [
        el('span', { class: 'tool-label' }, el('span', { class: 'tool-glyph', 'aria-hidden': 'true' }, glyph), label),
        key ? hint(key) : null,
      ],
      () => {
        this.showTools(false);
        run();
      },
      { role: 'menuitem', ...props },
    );
  }
}
