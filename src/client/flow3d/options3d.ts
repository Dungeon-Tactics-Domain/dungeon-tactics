// Options drawn in 3D (localhost ?options=3d or the ?ui=3d preset; Fernando, Nov 17: every piece of the interface in the
// 3D look, beside its FFT counterpart), a screen of the shared 3D layer (ui3d/layer.ts): the battle darkened, the title
// over a hairline and, since Nov 18 (Fernando), three columns: the categories, the open category's rows with the glove
// on the one in focus and each value drawn as what it is (options-row.ts), and what the option in focus does. The
// window's commands stand side by side under the three, and the band at the foot says what the keys do.
//   State: nothing here decides anything but which category is open. While this screen lives, optionsMenu
//   (game/options.ts) hands it the board the HTML window would get; options-view.ts turns it into what to show and
//   options-layout.ts says where, and where an arrow takes the cursor.
//   Input: the board's own rows and buttons and a button per category, unseen, under the drawing, inside a window of
//   dialog.ts, sized by the same layout: the arrows, Enter, Esc, the pad, a tap on an arrow or on the bar and the list's
//   own scroll work as in the HTML window, and so does a screen reader. The glove points at whatever holds the focus.
//   A page too small for the layout (options-layout.ts `fitsOptions`) and a lost WebGL context get the HTML window.
import { Group } from 'three';
import { dialog } from '../dialog.ts';
import { type OptionsBoard, optionsWindow, setOptions3d } from '../game/options.ts';
import { Part, type Quad } from '../hints3d/hints3d.ts';
import { KEYS } from '../hud-pieces.ts';
import { t } from '../i18n.ts';
import { button, el } from '../icons.ts';
import { keysShown, onShown } from '../key-hints.ts';
import type { Ui3dLayer, Ui3dScreen } from '../ui3d/layer.ts';
import { textPx } from '../ui3d/layout.ts';
import { ease } from '../ui3d/spring.ts';
import { textMesh } from '../ui3d/text.ts';
import type { Way } from '../ui3d/walk.ts';
import { type Colors, colors, FOCUS, Hand, lift, put, rgba } from './draw.ts';
import {
  fitsOptions,
  itemBox,
  type OptionsLayout,
  optionsLayout,
  optionsTab,
  optionsWalk,
  REF,
  type Spot,
  shown,
  thumb,
} from './options-layout.ts';
import { drawRow } from './options-row.ts';
import { optionsHints, optionsView } from './options-view.ts';

export class Options3d implements Ui3dScreen {
  readonly flat = new Group();
  readonly deep = new Group();
  // the board's controls under the drawing; it sits in the window, so hiding the windows hides the screen
  readonly host = el('div', { class: 'options3d-hits' });
  private readonly color: Colors;
  private readonly hand = new Hand(this.deep);
  private readonly veil = new Part();
  private readonly fixed = new Part(); // title, categories, description, commands, hint band
  private readonly band = new Part(); // under the row in focus
  private readonly mark = new Part(); // the scroll mark
  private rows: Part[] = [];
  private readonly watch = new MutationObserver(() => this.touch());
  private readonly unhear: () => void;
  private board?: OptionsBoard;
  private tabs: HTMLButtonElement[] = []; // a category each
  private buttons: HTMLButtonElement[] = [];
  private cat = 0; // the open category
  private keys?: AbortController; // Q and E, while the screen is open
  private at?: OptionsLayout;
  private win?: { overlay: HTMLElement; close(): void };
  private html?: { close(): void }; // the HTML window that took over (no room, or the context was lost)
  private stale = false;
  private open = 0;

  constructor(private readonly layer: Ui3dLayer) {
    this.color = colors(layer);
    this.flat.add(this.veil.group, this.band.group, this.fixed.group, this.mark.group);
    // the focus moved or the list scrolled (scroll does not bubble: taken on its way down)
    this.host.addEventListener('focusin', () => this.touch());
    this.host.addEventListener('scroll', () => this.layer.wake(), { capture: true, passive: true });
    this.unhear = onShown(() => this.touch()); // the hints follow the input in use
    setOptions3d((b) => this.show(b));
    layer.add(this, 'options');
  }

  // what the controls say changed (a value, an armed button's text, a button going off): draw it again
  private touch() {
    this.stale = true;
    this.layer.wake();
  }

  private show(board: OptionsBoard) {
    if (!fitsOptions(this.layer.w, this.layer.h)) return undefined;
    this.hide();
    this.html = undefined;
    this.board = board;
    // a category is open while the cursor is on it. Enter, Space and the pad's A (a click with no pointer) go into its
    // rows; a tap or a click only opens it, for the next one to land on a row
    this.tabs = board.sections.map((sec, i) =>
      button('secondary', sec.title, (e) => void ((e as MouseEvent).detail ? this.tabs[i].focus() : this.go('right')), {
        onfocus: () => {
          this.pick(i);
          board.help.textContent = sec.help;
        },
      }),
    );
    // a full screen has no outside to tap and no ✕: its own way back, the last of the commands
    this.buttons = [...board.actions, button('secondary', t('Voltar', 'Back'), () => this.win?.close())];
    this.host.replaceChildren(...this.tabs, board.list, board.help, ...this.buttons);
    for (const h of board.list.querySelectorAll<HTMLElement>('h3')) h.style.display = 'none'; // the column names them
    // Esc and the pad's B on a row are a step back to its category; anywhere else they close the screen
    const win = (this.win = dialog('options3d', board.title, [this.host], { leave: () => this.leave() }));
    win.overlay.addEventListener('walk', (e) => {
      if (this.go((e as CustomEvent<Way>).detail)) e.preventDefault();
    });
    win.overlay.addEventListener('shoulder', (e) => this.turn((e as CustomEvent<-1 | 1>).detail));
    // Q and E as the shoulders, wherever the focus is, but not under a window opened over this one (Tile marks)
    this.keys = new AbortController();
    addEventListener(
      'keydown',
      (e) => {
        const top = [...document.querySelectorAll('.overlay')].at(-1) === win.overlay;
        if (!top || e.ctrlKey || e.altKey || e.metaKey || (e.code !== 'KeyQ' && e.code !== 'KeyE')) return;
        e.preventDefault();
        this.turn(e.code === 'KeyQ' ? -1 : 1);
      },
      { signal: this.keys.signal },
    );
    this.watch.observe(this.host, { subtree: true, childList: true, characterData: true, attributes: true });
    this.open = 0;
    this.cat = -1;
    this.layer.solo = this; // the battle's own 3D pieces stay out, as its HUD does
    this.tabs[0].focus();
    this.hand.reset();
    return { close: () => (this.html ?? this.win)?.close() };
  }

  // where the cursor is, by what holds the focus
  private spot(): Spot | null {
    const a = document.activeElement as HTMLButtonElement;
    const find = (zone: Spot['zone'], els: HTMLButtonElement[] = []): Spot | null =>
      els.includes(a) ? { zone, i: els.indexOf(a) } : null;
    return find('cat', this.tabs) ?? find('row', this.board?.sections[this.cat]?.rows) ?? find('cmd', this.buttons);
  }
  private focus(to: Spot) {
    const els = { cat: this.tabs, row: this.board?.sections[this.cat]?.rows ?? [], cmd: this.buttons };
    els[to.zone][to.i]?.focus();
  }

  // An arrow or the d-pad (dialog.ts `walked`): the cursor goes where optionsWalk says. Left and right on a row with a
  // value are the row's own (option-row.ts): they change it, and this says false
  private go(way: Way): boolean {
    const L = this.at,
      at = this.spot();
    if (!L) return false;
    if (!at) this.tabs[this.cat]?.focus();
    else if (at.zone === 'row' && way !== 'up' && way !== 'down' && document.activeElement?.querySelector('.opt-value'))
      return false;
    else
      this.focus(
        optionsWalk(
          L,
          at,
          way,
          this.cat,
          this.buttons.map((b) => b.disabled),
        ),
      );
    return true;
  }
  private leave() {
    if (this.spot()?.zone !== 'row') return false;
    this.tabs[this.cat].focus();
    return true;
  }
  // Q and E, the pad's shoulders: the category before or after, the cursor staying in its column
  private turn(dir: -1 | 1) {
    const zone = this.spot()?.zone ?? 'cat',
      to = optionsTab(this.cat, this.tabs.length, dir);
    if (to === this.cat) return;
    if (zone === 'cat') return this.tabs[to].focus();
    this.pick(to);
    if (zone === 'row') this.focus({ zone, i: 0 });
  }
  // opens a category: only its rows stay in the list, from the top
  private pick(cat: number) {
    const b = this.board;
    if (!b || cat === this.cat) return;
    this.cat = cat;
    b.sections.forEach((sec, i) => {
      this.tabs[i].setAttribute('aria-pressed', String(i === cat)); // the open one, for whoever cannot see the drawing
      for (const row of sec.rows) row.style.display = i === cat ? '' : 'none';
    });
    b.list.scrollTop = 0;
    this.build();
  }

  private hide() {
    this.watch.disconnect();
    this.keys?.abort();
    // the list as the HTML window has it: every category under its name
    for (const e of this.board?.list.children ?? []) e.removeAttribute('style');
    this.board?.list.removeAttribute('style');
    for (const b of this.board?.actions ?? []) b.removeAttribute('style');
    this.win?.close();
    if (this.layer.solo === this) this.layer.solo = undefined;
    this.win = this.board = this.at = undefined;
    for (const p of [this.veil, this.fixed, this.band, this.mark, ...this.rows]) p.clear();
    for (const p of this.rows) p.group.removeFromParent();
    this.rows = [];
    this.hand.point(this.layer, null, 0, 0, 0, 0, true);
    this.layer.wake();
  }

  // the HTML window takes the same board, where it was
  private fall() {
    // only a screen still open: one already closed (a command restarted the battle) has nothing to hand over
    const board = this.win?.overlay.isConnected ? this.board : undefined,
      focus = document.activeElement,
      first = board?.sections[this.cat]?.rows[0];
    this.hide();
    if (!board) return;
    this.html = optionsWindow(board);
    // a category has no button there: the first row of the one that was open
    (focus instanceof HTMLElement && focus.isConnected ? focus : first)?.focus();
  }

  resize() {
    if (!this.board) return;
    if (fitsOptions(this.layer.w, this.layer.h)) this.build();
    else this.fall();
  }

  // text in the theme's serif, `size` in px of the 1080p layout, shrinking with the pieces on a small page (textPx)
  private label = (str: string, size: number, hex: string, wrap?: number) => {
    const px = textPx(size, this.at?.s ?? 1);
    const o = { size: px, color: hex, font: this.layer.theme.font, width: wrap, line: wrap && px * 1.35 };
    return textMesh(str, o, this.layer.dpr) as Quad;
  };

  // the layout, the controls sized by it, and everything drawn again
  private build() {
    const b = this.board;
    if (!b) return;
    const { layer } = this;
    const count = b.sections[this.cat]?.rows.length ?? 0;
    const L = (this.at = optionsLayout(layer.w, layer.h, this.tabs.length, count, this.buttons.length));
    const px = (v: number) => `${v}px`;
    const seat = (e: HTMLElement, r: { x: number; y: number; w: number; h: number }) =>
      Object.assign(e.style, { left: px(r.x), top: px(r.y), width: px(r.w), height: px(r.h) });
    seat(b.list, L.list);
    const vars = { row: L.rowH, value: L.value, arrow: L.arrow, num: L.number, pad: (REF.knob / 2) * L.s };
    for (const [k, v] of Object.entries(vars)) this.host.style.setProperty(`--o3-${k}`, px(v));
    this.tabs.forEach((e, i) => void seat(e, L.cats[i]));
    this.buttons.forEach((e, i) => void seat(e, L.buttons[i]));
    this.veil.clear();
    this.veil.box(-8, -8, layer.w + 16, layer.h + 16, 0, rgba(this.color.veil)); // solid, as the reference: the battle's own 3D pieces stay under it
    lift(this.veil, 30);
    for (const p of this.rows) {
      p.clear();
      p.group.removeFromParent();
    }
    this.rows = Array.from({ length: count }, () => {
      const p = new Part();
      this.flat.add(p.group);
      return p;
    });
    this.fixed.key = '';
    this.band.clear();
    this.band.box(0, 0, L.list.w, L.rowH, 6 * L.s, FOCUS, rgba(this.color.line, 0.6));
    lift(this.band, 34);
    this.mark.clear();
    const th = thumb(L, 0);
    if (th) this.mark.box(0, 0, th.w, th.h, th.w / 2, rgba(this.color.line, 0.9));
    lift(this.mark, 40);
    this.sync();
  }

  // what changed since the last draw: each row by its own key, the fixed part by its
  private sync() {
    const b = this.board,
      L = this.at,
      sec = b?.sections[this.cat];
    if (!b || !L || !sec) return;
    this.stale = false;
    const view = optionsView(sec.items);
    view.forEach((row, i) => {
      const key = JSON.stringify(row);
      if (key === this.rows[i].key) return;
      this.rows[i].clear();
      drawRow(this.rows[i], row, L, this.layer, this.color, this.label);
      this.rows[i].key = key;
    });
    const at = this.spot();
    const names = this.buttons.map((e) => [e.lastChild?.textContent ?? '', e.disabled]);
    // the description: the row's or the category's; a command says what it does in its own name
    const about =
      at?.zone === 'cmd' ? ['', ''] : [at?.zone === 'row' ? view[at.i].label : sec.title, b.help.textContent ?? ''];
    const hints = optionsHints(at?.zone ?? 'cat', keysShown(), KEYS);
    const key = JSON.stringify([about, names, at, this.cat, hints]);
    if (key === this.fixed.key) return;
    const { fixed, color: c } = this,
      s = L.s;
    fixed.clear();
    fixed.key = key;
    put(fixed, this.label(b.title, REF.size.title, c.title), L.title.x, L.title.y, 'centre');
    fixed.box(L.rule.x, L.rule.y, L.rule.w, L.rule.h, 0, rgba(c.line, 0.9));
    put(fixed, this.label('◆', 14, c.line), L.title.x, L.rule.y + L.rule.h / 2, 'centre');
    // the categories: the open one lit, as a command menu's row with its submenu open
    b.sections.forEach((it, i) => {
      const r = L.cats[i],
        lit = i === this.cat,
        g = 4 * s;
      fixed.box(
        r.x,
        r.y + g,
        r.w,
        r.h - 2 * g,
        6 * s,
        rgba(lit ? c.line : c.plate, lit ? 0.5 : 0.7),
        rgba(c.line, 0.7),
      );
      const name = this.label(it.title, REF.size.head, lit ? c.title : c.text);
      put(fixed, name, r.x + L.inset, r.y + r.h / 2, 'left', r.w - 2 * L.inset);
      if (lit) put(fixed, this.label('▸', REF.size.label, c.title), r.x + r.w - L.inset, r.y + r.h / 2, 'right');
    });
    // what the option in focus does, where the reference shows its pictures
    const d = L.side,
      pad = 24 * s;
    fixed.box(d.x, d.y, d.w, d.h, 6 * s, rgba(c.band, 0.72), rgba(c.line, 0.6));
    if (about[0]) {
      const head = this.label(about[0], REF.size.head, c.title, d.w - 2 * pad);
      put(fixed, head, d.x + pad, d.y + pad + head.scale.y / 2, 'left');
      const under = d.y + pad + head.scale.y + 10 * s;
      fixed.box(d.x + pad, under, d.w - 2 * pad, Math.max(1, s), 0, rgba(c.line, 0.7));
      const text = this.label(about[1], REF.size.help, c.text, d.w - 2 * pad);
      text.scale.multiplyScalar(Math.min(1, (d.y + d.h - pad - under - 12 * s) / text.scale.y));
      put(fixed, text, d.x + pad, under + 12 * s + text.scale.y / 2, 'left');
    }
    const focus = at?.zone === 'cmd' ? at.i : -1;
    this.buttons.forEach((e, i) => {
      const r = L.buttons[i],
        lit = i === focus;
      fixed.box(r.x, r.y, r.w, r.h, 6 * s, rgba(lit ? c.line : c.plate, 0.95), rgba(lit ? c.title : c.line, 0.8));
      const name = this.label(String(names[i][0]), REF.size.button, e.disabled ? c.soft : lit ? c.title : c.text); // 4.9:1 on the lit plate
      put(fixed, name, r.x + r.w / 2, r.y + r.h / 2, 'centre', r.w - 24 * s);
    });
    // the band at the foot: what the keys do where the cursor is
    fixed.box(-8, L.help.y, L.help.w + 16, L.help.h, 0, rgba(c.band, 0.8));
    for (const y of [L.help.y, L.help.y + L.help.h - 2 * s])
      fixed.box(-8, y, L.help.w + 16, 2 * s, 0, rgba(c.line, 0.7));
    put(fixed, this.label(hints, REF.size.help, c.text), L.helpText.x, L.helpText.y, 'centre', L.helpText.w);
    lift(fixed, 40);
  }

  frame(dt: number, time: number) {
    // closed from outside (Esc, a command, the game): nothing left to show
    if (this.win && !this.win.overlay.isConnected) this.hide();
    const L = this.at,
      b = this.board;
    if (!L || !b) return false;
    if (this.stale) this.sync();
    const { layer } = this,
      s = L.s,
      still = layer.still || dt === 0; // a stopped clock (the bench's pause) lands everything too
    const o = (this.open = still ? 1 : ease(this.open, 1, dt, 12));
    const set = (p: Part, a: number) => {
      p.want = a;
      p.fade(10); // the fade is the screen's own: each part lands on it at once
    };
    set(this.veil, o);
    set(this.fixed, o);
    const scroll = b.list.scrollTop;
    this.rows.forEach((p, i) => {
      const r = itemBox(L, i, scroll);
      p.group.position.set(r.x, -r.y, 0);
      set(p, shown(L, r) * o);
    });
    const th = thumb(L, scroll);
    if (th) this.mark.group.position.set(th.x, -th.y, 0);
    set(this.mark, o);
    // the row in focus is lit and the glove points at it; on a category or a command, at that
    const at = this.spot();
    const row = at?.zone === 'row' ? itemBox(L, at.i, scroll) : null;
    const r = row ?? (at ? (at.zone === 'cat' ? L.cats : L.buttons)[at.i] : null);
    const see = r ? (row ? shown(L, row) : 1) * o : 0;
    set(this.band, row ? see : 0);
    if (row) this.band.group.position.set(row.x, -row.y, 0);
    this.hand.point(layer, r, see, Math.max(22, REF.hand * s), dt, time, still);
    return !layer.still; // the glove sways for as long as the screen shows
  }

  dispose() {
    this.fall(); // the layer went (a lost context): the HTML window opens in its place
    setOptions3d();
    this.unhear();
    this.layer.remove(this);
    this.hand.dispose();
    this.host.remove();
  }
}
