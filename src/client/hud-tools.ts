// The battle HUD's corner menu (3 bars): undo, rotate, whole map, pixel size, fast battle, fps counter and Options, each with its key.
// Owns its document listeners while open; close() removes them.
import { fpsOn } from './fps.ts';
import { fullscreenLabel, fullscreenNow, toggleFullscreen } from './fullscreen.ts';
import type { Act } from './glyphs.ts';
import type { HudActions } from './hud.ts';
import { hint } from './hud-pieces.ts';
import { t } from './i18n.ts';
import { button, type Child, el, icon, iconButton, UI_ICON } from './icons.ts';
import { pixelValue, type Tool, toolRows } from './tool-rows.ts';

export class ToolsMenu {
  private readonly toolsMenu = el('div', { class: 'panel tools-menu', role: 'menu', hidden: true });
  private readonly burger = iconButton(
    el('span', { class: 'burger-bars', 'aria-hidden': 'true' }),
    t('Menu', 'Menu'),
    () => this.showTools(!!this.toolsMenu.hidden),
    { class: 'icon burger', 'aria-haspopup': 'menu', 'aria-expanded': 'false' },
  );
  // Undo on the screen, left of Back and the menu button: for the fingers, and since Nov 18 for the mouse too. Always
  // there, faded with no step to take back (Fernando, Nov 18; setUndo)
  readonly undo: HTMLElement;
  private readonly undoRow: HTMLElement;
  private readonly fastBtn: HTMLElement;
  private readonly fpsBtn: HTMLElement;
  private readonly pixelBtn: HTMLElement;
  private readonly fullBtn?: HTMLElement;
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
    const off = () => this.undo.getAttribute('aria-disabled') === 'true';
    const undo = () => {
      this.close();
      if (!off()) act.undo();
    };
    this.undo = iconButton('↶', t('Desfazer', 'Undo'), undo, { class: 'icon undo', 'aria-disabled': 'true' });
    this.root.prepend(this.undo);
    // the rows are tool-rows.ts'; here only what each runs and the four that have an icon of the atlas
    const run: Record<Tool, () => void> = {
      undo: () => off() || act.undo(),
      rotateLeft: () => act.rotate(-1),
      rotateRight: () => act.rotate(1),
      recenter: () => act.recenter(),
      pixel: () => act.pixel(),
      fast: () => act.fast(),
      fps: () => act.fps(),
      fullscreen: () => toggleFullscreen(),
      menu: () => act.menu(),
    };
    const drawn: Partial<Record<Tool, string>> = {
      undo: UI_ICON.undo,
      recenter: UI_ICON.recenter,
      pixel: UI_ICON.pixel,
      menu: UI_ICON.menu,
    };
    const items = new Map(
      toolRows(true, fullscreenNow()).map((r) => {
        const glyph = drawn[r.tool] ? icon(drawn[r.tool]!) : r.glyph;
        const props = r.toggle && { role: 'menuitemcheckbox', 'aria-checked': String(r.tool === 'fps' && fpsOn()) };
        return [r.tool, this.toolItem(glyph, r.label, r.key, run[r.tool], props)] as const;
      }),
    );
    this.fpsBtn = items.get('fps')!;
    this.fastBtn = items.get('fast')!;
    this.pixelBtn = items.get('pixel')!;
    this.fullBtn = items.get('fullscreen');
    this.pixelBtn.querySelector('.tool-label')?.after(el('span', { class: 'tool-value' }));
    this.undoRow = items.get('undo')!;
    this.toolsMenu.append(...items.values());
    this.setUndo(false);
  }

  // a step to take back or none: the button and the list's row stay, faded and dead with none
  setUndo(can: boolean) {
    for (const e of [this.undo, this.undoRow]) e.setAttribute('aria-disabled', String(!can));
  }
  // the pixel size in use, on its row (tools3d.ts reads it back)
  setPixel(size: number) {
    const v = this.pixelBtn.querySelector('.tool-value')!;
    v.textContent = pixelValue(size);
    this.pixelBtn.dataset.value = v.textContent;
  }
  setFps(on: boolean) {
    this.fpsBtn.setAttribute('aria-checked', String(on));
  }
  setFast(on: boolean) {
    this.fastBtn.setAttribute('aria-checked', String(on));
  }
  close() {
    this.showTools(false);
  }

  private showTools(open: boolean) {
    // the fullscreen row says what a tap does now: it settles after the menu closed, so it is read again on opening
    const full = this.fullBtn?.querySelector('.tool-label')?.lastChild;
    if (open && full) full.textContent = fullscreenLabel(!!fullscreenNow());
    this.toolsMenu.hidden = !open;
    this.burger.setAttribute('aria-expanded', String(open));
    for (const ev of ['pointerdown', 'keydown']) {
      if (open) document.addEventListener(ev, this.closeOutside, true);
      else document.removeEventListener(ev, this.closeOutside, true);
    }
  }
  private toolItem(glyph: Child, label: string, key: Act | '', run: () => void, props?: Record<string, unknown>) {
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
