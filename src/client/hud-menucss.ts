// ?menucss (localhost; menucss.css): the FFT command menu as parchment in HTML and CSS, kept beside the 3D menu to compare
// (Fernando, Nov 16). The HUD's own menu and submenu sit bottom right, with an ability sheet over them and one pointing
// glove that slides from row to row. Rows are rebuilt only when they change, so the focus and flash animations play once
// per key, not on every mouse step over the map.
import { PAGES, type Screen } from './command.ts';
import type { HudActions, HudView } from './hud.ts';
import { renderAbilities, renderCommands, renderSheet } from './hud-menus.ts';
import { t, unitName } from './i18n.ts';
import { el } from './icons.ts';

export class MenuCss {
  private readonly sheet = el('section', {
    class: 'panel sheet',
    'aria-label': t('Ficha da habilidade', 'Ability sheet'),
    hidden: true,
  });
  private readonly glove = el('div', { class: 'glove', 'aria-hidden': 'true' });
  private last: Screen | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly commands: HTMLElement,
    private readonly abilities: HTMLElement,
    private readonly act: HudActions,
  ) {
    root.classList.add('menucss');
    root.append(this.sheet, this.glove);
  }

  // `data-leave` tells the closing animation apart: Esc in the submenu folds it back, any other way out flashes the
  // chosen row
  render(v: HudView, open: boolean) {
    const s = v.screen,
      was = this.last;
    this.last = s;
    if (was && was.k !== s.k) this.root.dataset.leave = was.k === 'abilities' && s.k === 'menu' ? 'back' : 'confirm';
    // which way the sheet slides: a new page from its side, a new ability turns the big icon
    if (s.k === 'abilities')
      this.sheet.dataset.turn =
        was?.k !== 'abilities' || was.index !== s.index
          ? 'swap'
          : (s.page ?? 0) === (was.page ?? 0)
            ? ''
            : ((s.page ?? 0) - (was.page ?? 0) + PAGES) % PAGES === 1
              ? 'next'
              : 'prev';
    patch(this.commands, (box) => {
      renderCommands(box, v, open, this.act);
      // FFT names the acting unit on top of the command menu (inside the draw, or every compare would differ)
      const head = box.querySelector('.panel-head');
      if (head) head.textContent = unitName(v.battle.actor.def);
    });
    patch(this.abilities, (box) => renderAbilities(box, v, open, this.act));
    patch(this.sheet, (box) => renderSheet(box, v, open, this.act));
    this.point();
  }

  // the glove beside the focused row: offsets, not the on-screen box, so it lands where the row ends up even while the
  // submenu is still springing open. Called on each draw and each frame (a resize moves the menus)
  point() {
    const panel = this.abilities.hidden ? this.commands : this.abilities;
    const row = panel.hidden ? null : panel.querySelector<HTMLElement>('.item.focus');
    if (!row) return void this.glove.classList.remove('on');
    const x = `${panel.offsetLeft + row.offsetLeft}px`,
      y = `${panel.offsetTop + row.offsetTop + row.offsetHeight / 2}px`;
    if (this.glove.style.getPropertyValue('--x') !== x) this.glove.style.setProperty('--x', x);
    if (this.glove.style.getPropertyValue('--y') !== y) this.glove.style.setProperty('--y', y);
    // first appearance: lands on the row, then fades in (the slide only runs while it shows, menucss.css)
    if (!this.glove.classList.contains('on')) {
      void this.glove.offsetWidth;
      this.glove.classList.add('on');
    }
  }
}

// Draws a menu into a bare copy of its box and moves the new rows in only when they differ, keeping the box itself (its
// open and close animations) and the rows a redraw would only repeat. A hidden menu keeps its last rows for the close
function patch(box: HTMLElement, draw: (box: HTMLElement) => void) {
  const fresh = box.cloneNode(false) as HTMLElement;
  draw(fresh);
  box.hidden = fresh.hidden;
  if (!fresh.hidden && fresh.innerHTML !== box.innerHTML) box.replaceChildren(...fresh.childNodes);
}
