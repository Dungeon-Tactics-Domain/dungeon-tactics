// The map builder's controls (Nov 25): real buttons, the two name fields and the paste box, kept by id so the focus
// and the typed text survive a redraw, seated unseen on the boxes of layout.ts, while window3d/builder3d.ts draws them
// (client CLAUDE.md: the 3D screen draws over its HTML skeleton, which keeps the input and the screen reader).
import { t } from '../i18n.ts';
import { el } from '../icons.ts';
import type { Box } from '../ui3d/layout.ts';
import type { BuilderItem, BuilderView } from '../window3d/builder3d.ts';
import type { Cell } from './layout.ts';

export interface Placed {
  cell: Cell;
  box: Box;
}

const px = (v: number) => `${v}px`;

export class BuilderUi {
  readonly root = el('div', { class: 'hud mapedit', role: 'application' });
  private readonly controls = new Map<string, HTMLElement>();
  padFocus = false; // the pad walks the panel: its focus is drawn without :focus-visible

  // `press`: a button's id; `typed`: a name field's id and its text
  constructor(
    private readonly press: (id: string) => void,
    private readonly typed: (id: string, text: string) => void,
  ) {}

  private control(cell: Cell): HTMLElement {
    const have = this.controls.get(cell.id);
    if (have && have.dataset.kind === cell.kind) return have;
    have?.remove();
    const e =
      cell.kind === 'input'
        ? el('input', {
            type: 'text',
            maxlength: 40,
            oninput: () => this.typed(cell.id, (e as HTMLInputElement).value),
          })
        : cell.kind === 'area'
          ? el('textarea', {
              spellcheck: 'false',
              oninput: () => this.typed(cell.id, (e as HTMLTextAreaElement).value),
            })
          : cell.kind === 'label'
            ? el('span')
            : el('button', {
                type: 'button',
                onclick: (ev: MouseEvent) => {
                  this.press(cell.id);
                  // a click or a tap leaves the focus on the page: a key pressed later would light the button
                  // (:focus-visible) and Enter would press it again instead of painting at the cursor
                  if (ev.detail > 0) (ev.currentTarget as HTMLElement).blur();
                },
              });
    e.dataset.kind = cell.kind;
    e.dataset.id = cell.id;
    this.controls.set(cell.id, e);
    this.root.append(e);
    return e;
  }

  // the cells shown now: each control seated on its box and told its text; the ones gone leave
  show(placed: Placed[], panel: Box, note: BuilderView['note'], hints: BuilderView['hints']): BuilderView {
    const ids = new Set(placed.map((p) => p.cell.id));
    for (const [id, e] of this.controls)
      if (!ids.has(id)) {
        e.remove();
        this.controls.delete(id);
      }
    const items = placed.map(({ cell, box }): BuilderItem => {
      const e = this.control(cell);
      Object.assign(e.style, { left: px(box.x), top: px(box.y), width: px(box.w), height: px(box.h) });
      if (e instanceof HTMLInputElement) {
        if (document.activeElement !== e) e.value = cell.text;
        e.setAttribute(
          'aria-label',
          cell.id === 'name' ? t('Nome em português', 'Portuguese name') : t('Nome em inglês', 'English name'),
        );
      } else if (e instanceof HTMLButtonElement) {
        e.textContent = cell.text;
        e.setAttribute('aria-disabled', String(!!cell.off));
        e.setAttribute('aria-pressed', String(!!cell.on));
      } else if (!(e instanceof HTMLTextAreaElement)) e.textContent = cell.text;
      const focus = document.activeElement === e && (this.padFocus || e.matches(':focus-visible, input, textarea'));
      const text = e instanceof HTMLInputElement || e instanceof HTMLTextAreaElement ? e.value : cell.text;
      return { box, text, kind: cell.kind, on: cell.on, off: cell.off, focus };
    });
    return { panel, items, note, hints };
  }

  get(id: string) {
    return this.controls.get(id);
  }
  // the controls a pad walks, in the order shown, with their boxes
  walkable(): HTMLElement[] {
    return [...this.controls.values()].filter((e) => e.dataset.kind !== 'label');
  }
}
