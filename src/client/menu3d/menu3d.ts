// The command menu drawn in 3D (localhost ?menu3d or ?menu3d=pixel, or `menu3d` in a sandbox spec; Fernando, Nov 16), a
// screen of the shared 3D layer (ui3d/layer.ts): the menu, the abilities submenu that opens over it as a cascade, the
// pointing glove and the ability sheet, on the reference's places (menu-layout.ts); art, text and models are our own.
//   State: nothing here decides anything. The HUD hands it each turn screen; menu-view.ts turns that into what to show
//   and what changed, menu-layout.ts says where, and this file draws and moves it.
//   Input: its own. One transparent button over each drawn row and over each half of the sheet's foot (the page
//   arrows), placed from the same layout; keys and gamepad stay with the turn (hero-turn.ts).
//   Motion: a closed column keeps what it last showed and runs on its springs until it settles: the cascade opens and
//   closes the same way backwards.
import { Group } from 'three';
import type { HudActions, HudView } from '../hud.ts';
import { KEYS } from '../hud-pieces.ts';
import { t } from '../i18n.ts';
import { el } from '../icons.ts';
import type { Ui3dLayer, Ui3dScreen } from '../ui3d/layer.ts';
import { paintTexture } from '../ui3d/panel.ts';
import { land, settled, spring } from '../ui3d/spring.ts';
import { Column, clamp01, Icon, move } from './column.ts';
import { type Box, LEAD, type MenuLayout, menuLayout, REF, rowBox } from './menu-layout.ts';
import { changes, type MenuRow, type MenuView, menuView } from './menu-view.ts';
import { Sheet } from './sheet.ts';

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
    sub.want = sheet.want = next?.sub ? 1 : 0;
    this.hits();
    this.layer.wake();
  }

  resize() {
    if (this.view) this.show(this.view);
    this.hits();
  }

  private show(m: MenuView) {
    const { layer, main, sub } = this,
      sheet = { layer, paint: this.paint };
    const at = (this.at = menuLayout(layer.stage, m.rows.length, m.sub?.length ?? 0, !KEYS));
    const ctx = { ...sheet, s: at.cs };
    [main.x, main.y] = [at.main.x, at.main.y];
    main.set({ title: m.head, w: at.main.w, h: at.main.h, rows: m.rows }, ctx);
    main.focus = m.index;
    if (m.sub) {
      [sub.x, sub.y] = [at.sub.x, at.sub.y];
      sub.set({ title: t('Habilidades', 'Abilities'), w: at.sub.w, h: at.sub.h, rows: m.sub }, ctx);
      sub.focus = m.subIndex;
    }
    if (m.sheet) this.sheet.set(m.sheet, sheet);
  }

  // The buttons over the drawing, rebuilt only when a place or a greyed state changed: the rows of the list in play
  // (the submenu covers the menu while it is open) and the sheet's two arrows
  private hits() {
    const m = this.view,
      at = this.at;
    const key = m && at ? JSON.stringify([at, (m.sub ?? m.rows).map((r) => r.off), !!m.sub]) : '';
    if (key === this.hitKey) return;
    this.hitKey = key;
    this.host.replaceChildren();
    if (!m || !at) return;
    const hit = (b: Box, name: string, off: boolean, click: () => void, over?: () => void) => {
      const e = el('button', { type: 'button', tabIndex: -1, disabled: off, 'aria-label': name, onclick: click });
      if (over) e.addEventListener('pointerenter', over);
      Object.assign(e.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` });
      this.host.append(e);
    };
    const rows = (list: 'menu' | 'abilities', col: Box, rs: MenuRow[], pick: (i: number) => void) =>
      rs.forEach((r, i) => {
        hit(
          rowBox(col, i, at.cs),
          r.label,
          r.off,
          () => pick(i),
          () => this.act.hover(list, i),
        );
      });
    if (m.sub) {
      rows('abilities', at.sub, m.sub, this.act.ability);
      hit(at.prev, t('Página anterior', 'Previous page'), false, () => this.act.page(-1));
      hit(at.next, t('Próxima página', 'Next page'), false, () => this.act.page(1));
    } else rows('menu', at.main, m.rows, this.act.command);
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
    glove.group.visible = this.gloveOut;
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
