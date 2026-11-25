// The command menu drawn in 3D (Fernando, Nov 16; through the pixel filter with ?pixel=1 or a spec's `uiPixel`), a
// screen of the shared 3D layer (ui3d/layer.ts): the menu, the Agir primeiro list that opens over it as a cascade, the
// pointing glove and the action sheet, on the reference's places (menu-layout.ts); art, text and models are our own.
//   State: nothing here decides anything. The HUD hands it each turn screen; menu-view.ts turns that into what to show
//   and what changed, menu-layout.ts says where, and this file draws and moves it.
//   Input: its own. One transparent button over each drawn row and over each half of the sheet's foot (the page
//   arrows), placed from the same layout, a `menu` Tab walks and a screen reader names; the other keys and the gamepad
//   stay with the turn (hero-turn.ts).
//   Motion: a closed column keeps what it last showed and runs on its springs until it settles: the cascade opens and
//   closes the same way backwards.
import { Group } from 'three';
import type { HudActions, HudView } from '../hud.ts';
import { KEYS } from '../hud-pieces.ts';
import { t } from '../i18n.ts';
import { el } from '../icons.ts';
import type { Ui3dLayer, Ui3dScreen } from '../ui3d/layer.ts';
import { place, REGIONS } from '../ui3d/layout.ts';
import { paintTexture } from '../ui3d/panel.ts';
import { land, settled, spring } from '../ui3d/spring.ts';
import { Column, clamp01, Icon, move } from './column.ts';
import { type Box, LEAD, type MenuLayout, menuLayout, REF, rowBox, SHOWN, windowTop } from './menu-layout.ts';
import { changes, type MenuRow, type MenuView, menuView } from './menu-view.ts';
import { Sheet } from './sheet.ts';

// the rows a column shows from `top`, and its head marking the rows hidden above and below
const page = (rows: MenuRow[], top: number) => rows.slice(top, top + SHOWN);
const title = (head: string, n: number, top: number) =>
  `${head}${top > 0 || n > top + SHOWN ? `  ${top > 0 ? '▲' : ''}${n > top + SHOWN ? '▼' : ''}` : ''}`;

export class Menu3d implements Ui3dScreen {
  readonly flat = new Group();
  readonly deep = new Group();
  readonly host = el('div', { class: 'menu3d-hits' });
  private readonly paint = paintTexture();
  private readonly main = new Column('disc', 10, 0, 1.7);
  private readonly sub = new Column('tile', 20, 100, 8.2);
  private readonly sheet = new Sheet();
  private readonly glove = new Icon(null, 'glove', undefined, 0.035);
  private readonly gx = spring();
  private readonly gy = spring();
  private gloveOut = false;
  private view: MenuView | null = null;
  private at?: MenuLayout;
  private hitKey = '';
  // each column's first row shown (menu-layout.ts SHOWN)
  private mainTop = 0;
  private subTop = 0;
  private drag: { y: number; moved: boolean } | null = null;

  constructor(
    private readonly layer: Ui3dLayer,
    private readonly act: HudActions,
  ) {
    this.flat.add(this.main.ui, this.sub.ui, this.sheet.ui);
    this.deep.add(this.main.icons, this.sub.icons, this.sheet.icons, this.glove.group);
    this.glove.model.rotation.set(0.2, -0.3, 0);
    layer.root.classList.add('menu3d');
    layer.root.append(this.host);
    layer.add(this, 'menu');
    this.scrolling();
  }

  // The wheel and a finger's drag over the list in play walk its focus a row at a time; the window follows the focus
  private scrolling() {
    const h = this.host;
    h.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (e.deltaY) this.step(Math.sign(e.deltaY));
      },
      { passive: false },
    );
    h.addEventListener('pointerdown', (e) => void (this.drag = { y: e.clientY, moved: false }));
    h.addEventListener('pointermove', (e) => {
      const d = this.drag,
        row = REF.row * (this.at?.cs ?? this.layer.s);
      if (!d || e.pointerType === 'mouse') return;
      // the finger's drag pulls the list: up shows the rows below
      const n = Math.trunc((d.y - e.clientY) / row);
      if (!n) return;
      d.y -= n * row;
      d.moved = true;
      this.step(n);
    });
    for (const ev of ['pointerup', 'pointercancel']) h.addEventListener(ev, () => setTimeout(() => (this.drag = null)));
    // a drag ends on a row without picking it
    h.addEventListener('click', (e) => this.drag?.moved && e.stopPropagation(), true);
  }

  private step(by: number) {
    const m = this.view;
    if (!m) return;
    const n = (m.sub ?? m.rows).length,
      i = Math.max(0, Math.min(n - 1, (m.sub ? m.subIndex : m.index) + by));
    if (m.sub) this.act.hover('abilities', i);
    else this.act.hover('menu', m.commands[i]);
  }

  // Called by the HUD with each turn screen; `open`: a hero's turn with nothing playing
  update(v: HudView, open: boolean) {
    const { main, sub, sheet } = this;
    const next = menuView(v, open),
      ch = changes(this.view, next);
    this.view = next;
    // a confirmed row flashes and holds its column a moment: Act as the submenu opens, a command or an ability as the
    // menu leaves for the map. Esc out of the submenu confirms nothing: the cascade just runs backwards
    if (ch.has('cascade')) main.flash = 1;
    // a third list: the second slides from its place over the menu's and flashes the picked row, the new one opens where
    // it was; closing it runs backwards (Fernando's grill, Nov 19)
    const lead = LEAD * (this.at?.cs ?? this.layer.s);
    // the list sliding into the menu's place keeps the rows it showed; the one coming back starts where the menu was
    if (ch.has('deeper')) [this.mainTop, this.subTop] = [this.subTop, 0];
    if (ch.has('shallower')) [this.subTop, this.mainTop] = [this.mainTop, 0];
    if (ch.has('deeper') && !this.layer.still) {
      main.shift.x = lead;
      main.flash = 1;
      sub.open.x = 0;
    }
    if (ch.has('shallower') && !this.layer.still) sub.shift.x = -lead;
    if (ch.has('leave')) {
      (sub.want ? sub : main).flash = 1;
      if (!this.layer.still) main.hold = sub.hold = 0.15;
    }
    if (next) {
      this.show(next);
      // a column opens with its row already lit
      if (!main.want) main.settleFocus();
      if (next.sub && !sub.want) sub.settleFocus();
    }
    main.want = next ? 1 : 0;
    sub.want = next?.sub ? 1 : 0;
    sheet.want = next?.sheet ? 1 : 0;
    const tabbed = this.host.contains(document.activeElement);
    this.hits();
    // a focus Tab brought in follows the game's (arrows, a pad) and outlives the buttons being rebuilt (the submenu)
    if (tabbed && next) (this.host.children[next.sub ? next.subIndex : next.index] as HTMLElement | undefined)?.focus();
    this.layer.wake();
  }

  resize() {
    if (this.view) this.show(this.view);
    this.hits();
  }

  private show(m: MenuView) {
    const { layer, main, sub } = this,
      sheet = { layer, paint: this.paint };
    // a phone stands the menu in the combat bar's bottom right corner (menu-layout.ts cornerLayout)
    const bar = place(REGIONS.bar, layer.small),
      foot = layer.phone ? bar.y + bar.h : undefined;
    this.mainTop = windowTop(m.rows.length, m.index, this.mainTop);
    this.subTop = m.sub ? windowTop(m.sub.length, m.subIndex, this.subTop) : 0;
    const shown = (n: number) => Math.min(n, SHOWN);
    const at = (this.at = menuLayout(layer.stage, shown(m.rows.length), shown(m.sub?.length ?? 0), !KEYS, foot));
    const ctx = { ...sheet, s: at.cs };
    // the menu slides to its new place (Agir opening pushes it left, closing brings it back; Fernando, Nov 24)
    if (main.want && !layer.still) main.shift.x += main.x - at.main.x;
    [main.x, main.y] = [at.main.x, at.main.y];
    main.set(
      {
        title: title(m.head, m.rows.length, this.mainTop),
        w: at.main.w,
        h: at.main.h,
        rows: page(m.rows, this.mainTop),
      },
      ctx,
    );
    main.focus = m.index - this.mainTop;
    if (m.sub) {
      [sub.x, sub.y] = [at.sub.x, at.sub.y];
      sub.set(
        {
          title: title(m.subTitle, m.sub.length, this.subTop),
          w: at.sub.w,
          h: at.sub.h,
          rows: page(m.sub, this.subTop),
        },
        ctx,
      );
      sub.focus = m.subIndex - this.subTop;
    }
    if (m.sheet) this.sheet.set(m.sheet, sheet);
  }

  // The buttons over the drawing, rebuilt only when a place or a greyed state changed: the rows of the list in play
  // (the list covers the menu while it is open) and the sheet's two arrows
  private hits() {
    const m = this.view,
      at = this.at;
    // the commands and the names too: two lists of as many rows may hold other rows (after Undo move; the target list
    // opening where the Agir list was kept its buttons named after the abilities)
    const key =
      m && at
        ? JSON.stringify([
            at,
            (m.sub ?? m.rows).map((r) => [r.label, r.off]),
            !!m.sub,
            !!m.sheet,
            m.commands,
            this.mainTop,
            this.subTop,
          ])
        : '';
    if (key === this.hitKey) return;
    this.hitKey = key;
    this.host.replaceChildren();
    // a menu for the screen reader and for Tab (Nov 18), named by its column's head
    if (!m || !at) return void ['role', 'aria-label'].forEach((k) => this.host.removeAttribute(k));
    this.host.setAttribute('role', 'menu');
    this.host.setAttribute('aria-label', m.sub ? m.subTitle : m.head);
    const hit = (b: Box, name: string, off: boolean, click: () => void, over?: () => void) => {
      const e = el('button', { type: 'button', role: 'menuitem', disabled: off, 'aria-label': name, onclick: click });
      // the mouse or Tab on a row moves the drawn focus there
      if (over) for (const ev of ['pointerenter', 'focus']) e.addEventListener(ev, over);
      Object.assign(e.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` });
      this.host.append(e);
    };
    // a menu row stands for its place in COMMANDS (menuRows leaves Undo move out), an ability for its own
    const rows = (list: 'menu' | 'abilities', col: Box, rs: MenuRow[], top: number, pick: (i: number) => void) =>
      page(rs, top).forEach((r, i) => {
        const index = list === 'menu' ? m.commands[top + i] : top + i;
        hit(
          rowBox(col, i, at.cs),
          r.label,
          // a row that is off still takes the click, which only says no (Agir Nov 19, the greyed Move Nov 21)
          false,
          () => pick(index),
          () => this.act.hover(list, index),
        );
      });
    if (m.sub) {
      rows('abilities', at.sub, m.sub, this.subTop, this.act.pick);
      if (m.sheet) {
        hit(at.prev, t('Página anterior', 'Previous page'), false, () => this.act.page(-1));
        hit(at.next, t('Próxima página', 'Next page'), false, () => this.act.page(1));
      }
    } else rows('menu', at.main, m.rows, this.mainTop, this.act.command);
  }

  frame(dt: number, time: number) {
    const { main, sub, sheet, layer, glove, at } = this,
      s = at?.cs ?? layer.s,
      still = layer.still;
    // the menu under the open submenu only steps back a little: on the reference it keeps its light, under the shadow
    main.frame(dt, time, layer, 0, 0, !sub.want);
    sub.frame(dt, time, layer, LEAD * s * 0.55, 1, true);
    sheet.frame(dt, time, layer, at?.sheet.x ?? 0, at?.sheet.y ?? 0);
    // the glove points at the focused row of the column in play, sliding from one to the other
    const col = sub.want ? sub : main;
    this.gx.to = col.x - 31 * s;
    this.gy.to = col.y + col.rowY;
    const shown = clamp01(main.open.x * 1.6);
    if (!this.gloveOut) for (const g of [this.gx, this.gy]) land(g); // appears in place, does not fly in
    this.gloveOut = shown > 0.004;
    move(this.gx, dt, still, 330, 25);
    move(this.gy, dt, still, 330, 25);
    // a finger is its own pointer: the glove only covers the map (Fernando, Nov 18; a key or a pad brings it back)
    glove.group.visible = this.gloveOut && !layer.finger;
    const nudge = still ? 0 : Math.sin(time * 5.2) * 3.2 * s + col.flash * 10 * s;
    glove.group.position.set(layer.snap(this.gx.x + nudge), -layer.snap(this.gy.x), 300);
    glove.group.scale.setScalar(REF.hand * s * shown);
    glove.group.rotation.z = Math.max(-0.4, Math.min(0.4, -this.gy.v * 0.0016)); // leans into its slide
    // it sways while it is up; closed and settled, the last frame drawn is the empty one. Reduced motion: every spring
    // has already landed, one draw is enough
    const up = main.want || main.open.x > 0.004 || sub.open.x > 0.004 || sheet.open.x > 0.004;
    const moving = main.busy || sub.busy || sheet.busy || !settled(this.gx) || !settled(this.gy);
    return !still && (!!up || moving);
  }

  dispose() {
    this.layer.remove(this);
    for (const part of [this.main, this.sub, this.sheet]) part.clear();
    this.glove.dispose();
    this.paint.dispose();
    this.host.remove();
    this.layer.root.classList.remove('menu3d');
  }
}
