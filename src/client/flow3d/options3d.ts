// Options drawn in 3D (localhost ?options=3d or the ?ui=3d preset; Fernando, Nov 17: every piece of the interface in the
// 3D look, beside its FFT counterpart), a screen of the shared 3D layer (ui3d/layer.ts), laid out like FFT: The Ivalice
// Chronicles' settings (labs refs/fft-ivalice/15 and 16): the battle darkened, the title over a hairline, one list with
// the glove on the row in focus, each value drawn as what it is (a choice in a box, a bar with its number, a switch),
// and the message band at the foot. The goal and the window's commands take the place of the reference's pictures.
//   State: nothing here decides anything. While this screen lives, optionsMenu (game/options.ts) hands it the board the
//   HTML window would get; options-view.ts turns it into what to show and options-layout.ts says where.
//   Input: the board's own rows and buttons, unseen, under the drawing, inside a window of dialog.ts, sized by the same
//   layout: the arrows, Enter, Esc, the pad, a tap on an arrow or on the bar and the list's own scroll work as in the
//   HTML window, and so does a screen reader. The glove points at whatever holds the focus.
//   A page too small for the layout (options-layout.ts `fits`) and a lost WebGL context get the HTML window.
import { Group } from 'three';
import { dialog } from '../dialog.ts';
import { type OptionsBoard, optionsWindow, setOptions3d } from '../game/options.ts';
import { NONE, Part, type Rgba } from '../hints3d/hints3d.ts';
import { t } from '../i18n.ts';
import { button, el } from '../icons.ts';
import type { Ui3dLayer, Ui3dScreen } from '../ui3d/layer.ts';
import { ease } from '../ui3d/spring.ts';
import type { Way } from '../ui3d/walk.ts';
import { type Colors, colors, FOCUS, Hand, label, lift, put, rgba, solid } from './draw.ts';
import { fits, itemBox, type OptionsLayout, optionsLayout, optionsWalk, REF, shown, thumb } from './options-layout.ts';
import { optionsView, type RowView } from './options-view.ts';

const ON = '#4daf7c'; // a switch turned on, the green of the Height number
const OFF: Rgba = [0.42, 0.39, 0.33, 1];

export class Options3d implements Ui3dScreen {
  readonly flat = new Group();
  readonly deep = new Group();
  // the board's controls under the drawing; it sits in the window, so hiding the windows hides the screen
  readonly host = el('div', { class: 'options3d-hits' });
  private readonly color: Colors;
  private readonly hand = new Hand(this.deep);
  private readonly veil = new Part();
  private readonly fixed = new Part(); // title, goal, commands, message band
  private readonly band = new Part(); // under the row in focus
  private readonly mark = new Part(); // the scroll mark
  private rows: Part[] = [];
  private readonly watch = new MutationObserver(() => this.touch());
  private board?: OptionsBoard;
  private buttons: HTMLButtonElement[] = [];
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
    setOptions3d((b) => this.show(b));
    layer.add(this);
  }

  // what the controls say changed (a value, an armed button's text, a button going off): draw it again
  private touch() {
    this.stale = true;
    this.layer.wake();
  }

  private show(board: OptionsBoard) {
    if (!fits(this.layer.w, this.layer.h)) return undefined;
    this.hide();
    this.html = undefined;
    this.board = board;
    // a full screen has no outside to tap and no ✕: its own way back, the last of the commands
    this.buttons = [...board.actions, button('secondary', t('Voltar', 'Back'), () => this.win?.close())];
    this.host.replaceChildren(board.list, board.help, ...this.buttons);
    this.win = dialog('options3d', board.title, [this.host]);
    this.win.overlay.addEventListener('walk', (e) => this.walk(e as CustomEvent<Way>));
    this.watch.observe(this.host, { subtree: true, childList: true, characterData: true, attributes: true });
    this.open = 0;
    this.layer.solo = this; // the battle's own 3D pieces stay out, as its HUD does
    this.build();
    return { close: () => (this.html ?? this.win)?.close() };
  }

  // An arrow or the d-pad (dialog.ts `walked`): the cursor goes where optionsWalk says, past a command that is off.
  // Left and right on a row with a value are the row's own (option-row.ts): they change it
  private walk(e: CustomEvent<Way>) {
    const L = this.at,
      b = this.board,
      way = e.detail;
    if (!L || !b) return;
    const els = [...b.list.querySelectorAll<HTMLButtonElement>('.opt-row'), ...this.buttons];
    const at = els.indexOf(document.activeElement as HTMLButtonElement);
    if ((way === 'left' || way === 'right') && els[at]?.querySelector('.opt-value')) return;
    e.preventDefault();
    const heads = b.items.map((it) => 'head' in it);
    const step = (from: number, to: Way) => optionsWalk(L, heads, b.list.scrollTop, from, to);
    let to = at < 0 ? 0 : step(at, way);
    // a command that is off (Restart on the enemy's turn): on to the next one down or up its column
    for (let next = to; els[to]?.disabled; to = next)
      if ((next = step(to, way === 'up' ? 'up' : 'down')) === to) return;
    els[to]?.focus();
  }

  private hide() {
    this.watch.disconnect();
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
      focus = document.activeElement;
    this.hide();
    if (!board) return;
    this.html = optionsWindow(board);
    if (focus instanceof HTMLElement && focus.isConnected) focus.focus();
  }

  resize() {
    if (!this.board) return;
    if (fits(this.layer.w, this.layer.h)) this.build();
    else this.fall();
  }

  private label(str: string, size: number, hex: string, wrap?: number) {
    return label(this.layer, this.at?.s ?? 1, str, size, hex, wrap);
  }

  // the layout, the controls sized by it, and everything drawn again
  private build() {
    const b = this.board;
    if (!b) return;
    const { layer } = this;
    const L = (this.at = optionsLayout(
      layer.w,
      layer.h,
      b.items.map((it) => 'head' in it),
      this.buttons.length,
    ));
    const px = (v: number) => `${v}px`;
    Object.assign(b.list.style, { left: px(L.list.x), top: px(L.list.y), width: px(L.list.w), height: px(L.list.h) });
    const vars = {
      row: L.rowH,
      head: L.headH,
      value: L.value,
      arrow: L.arrow,
      num: L.number,
      pad: (REF.knob / 2) * L.s,
    };
    for (const [k, v] of Object.entries(vars)) this.host.style.setProperty(`--o3-${k}`, px(v));
    this.buttons.forEach((el, i) => {
      const r = L.buttons[i];
      Object.assign(el.style, { left: px(r.x), top: px(r.y), width: px(r.w), height: px(r.h) });
    });
    this.veil.clear();
    this.veil.box(-8, -8, layer.w + 16, layer.h + 16, 0, rgba(this.color.veil)); // solid, as the reference: the battle's own 3D pieces stay under it
    lift(this.veil, 30);
    for (const p of this.rows) {
      p.clear();
      p.group.removeFromParent();
    }
    this.rows = b.items.map(() => {
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
    this.hand.reset();
  }

  // what changed since the last draw: each row by its own key, the fixed part by its
  private sync() {
    const b = this.board,
      L = this.at;
    if (!b || !L) return;
    this.stale = false;
    const view = optionsView(b.items);
    view.forEach((row, i) => {
      const key = JSON.stringify(row);
      if (key === this.rows[i].key) return;
      this.rows[i].clear();
      this.row(this.rows[i], row, L);
      this.rows[i].key = key;
    });
    const focus = this.buttons.indexOf(document.activeElement as HTMLButtonElement);
    const names = this.buttons.map((el) => [el.lastChild?.textContent ?? '', el.disabled]);
    const key = JSON.stringify([b.help.textContent, names, focus, b.note]);
    if (key === this.fixed.key) return;
    const { fixed, color: c } = this,
      s = L.s;
    fixed.clear();
    fixed.key = key;
    put(fixed, this.label(b.title, REF.size.title, c.title), L.title.x, L.title.y, 'centre');
    fixed.box(L.rule.x, L.rule.y, L.rule.w, L.rule.h, 0, rgba(c.line, 0.9));
    put(fixed, this.label('◆', 14, c.line), L.title.x, L.rule.y + L.rule.h / 2, 'centre');
    put(fixed, this.label(b.note, REF.size.note, c.soft), L.note.x, L.note.y, 'right');
    // the goal, where the reference shows its pictures
    fixed.box(L.goal.x, L.goal.y, L.goal.w, L.goal.h, 6 * s, rgba(c.band, 0.72), rgba(c.line, 0.6));
    const goal = this.label(b.goal, REF.size.value, c.text, L.goal.w - 48 * s);
    put(fixed, goal, L.goal.x + 24 * s, L.goal.y + L.goal.h / 2, 'left');
    this.buttons.forEach((el, i) => {
      const r = L.buttons[i],
        lit = i === focus;
      fixed.box(r.x, r.y, r.w, r.h, 6 * s, rgba(lit ? c.line : c.plate, 0.95), rgba(lit ? c.title : c.line, 0.8));
      const name = this.label(String(names[i][0]), REF.size.button, el.disabled ? c.soft : c.text);
      put(fixed, name, r.x + r.w / 2, r.y + r.h / 2, 'centre', r.w - 24 * s);
    });
    // the message band: what the row in focus does
    fixed.box(-8, L.help.y, L.help.w + 16, L.help.h, 0, rgba(c.band, 0.8));
    for (const y of [L.help.y, L.help.y + L.help.h - 2 * s])
      fixed.box(-8, y, L.help.w + 16, 2 * s, 0, rgba(c.line, 0.7));
    const help = this.label(b.help.textContent ?? '', REF.size.help, c.text, L.helpText.w);
    help.scale.multiplyScalar(Math.min(1, (L.help.h - 8 * s) / help.scale.y));
    put(fixed, help, L.helpText.x, L.helpText.y, 'centre');
    lift(fixed, 40);
  }

  // one item of the list, from its own top left
  private row(p: Part, v: RowView, L: OptionsLayout) {
    const { color: c } = this,
      { paper } = this.layer.theme,
      s = L.s,
      w = L.list.w;
    if (v.kind === 'head') {
      put(p, this.label(v.label, REF.size.head, c.title), 0, L.headH * 0.55);
      p.box(0, L.headH - 6 * s, w, Math.max(1, s), 0, rgba(c.line, 0.7));
      return lift(p, 40);
    }
    const mid = L.rowH / 2,
      left = w - L.value + L.arrow, // the value between the two arrows
      right = w - L.arrow;
    put(p, this.label(v.label, REF.size.label, c.text), L.inset, mid, 'left', w - L.value - L.inset - 12 * s);
    const arrow = (str: string, x: number) => put(p, this.label(str, REF.size.label, c.soft), x, mid, 'centre');
    if (v.kind === 'link') {
      arrow('▸', right + L.arrow / 2);
      return lift(p, 40);
    }
    // a switch has no arrows, as the reference: a tap anywhere on it turns it
    if (v.kind !== 'toggle') {
      arrow('‹', left - L.arrow / 2);
      arrow('›', right + L.arrow / 2);
    }
    if (v.kind === 'pick') {
      const h = REF.box * s;
      p.box(left, mid - h / 2, right - left, h, 6 * s, solid(paper), rgba(this.layer.theme.ink, 0.8));
      const text = this.label(v.text, REF.size.value, this.layer.theme.ink);
      put(p, text, (left + right) / 2, mid, 'centre', right - left - 16 * s);
    } else if (v.kind === 'bar') {
      const pad = (REF.knob / 2) * s,
        x = left + L.number + pad,
        tw = right - pad - x,
        th = REF.track * s,
        k = REF.knob * s;
      put(p, this.label(v.text, REF.size.value, c.text), left + L.number - 8 * s, mid, 'right');
      p.box(x, mid - th / 2, tw, th, th / 2, rgba(c.plate), rgba(c.line, 0.9));
      if (v.fill > 0) p.box(x, mid - th / 2, tw * v.fill, th, th / 2, rgba(c.text));
      p.box(x + tw * v.fill - k / 2, mid - k / 2, k, k, k / 2, solid(paper), rgba(this.layer.theme.ink, 0.8));
    } else {
      const tw = REF.toggle.w * s,
        th = REF.toggle.h * s,
        k = th - 8 * s,
        x = right - tw;
      put(p, this.label(v.text, REF.size.value, v.on ? c.text : c.soft), x - 14 * s, mid, 'right');
      p.box(x, mid - th / 2, tw, th, th / 2, v.on ? rgba(ON) : OFF, rgba(c.line, 0.9));
      p.box(v.on ? x + tw - k - 4 * s : x + 4 * s, mid - k / 2, k, k, k / 2, solid(paper), NONE);
    }
    lift(p, 40);
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
    // the row in focus is lit and the glove points at it; on a command, at the command
    const active = document.activeElement;
    const row = [...b.list.children].indexOf(active as Element),
      cmd = this.buttons.indexOf(active as HTMLButtonElement);
    const r = row >= 0 ? itemBox(L, row, scroll) : cmd >= 0 ? L.buttons[cmd] : null;
    const see = r ? (row >= 0 ? shown(L, r) : 1) * o : 0;
    set(this.band, row >= 0 ? see : 0);
    if (r) this.band.group.position.set(r.x, -r.y, 0);
    this.hand.point(layer, r, see, REF.hand * s, dt, time, still);
    return !layer.still; // the glove sways for as long as the screen shows
  }

  dispose() {
    this.fall(); // the layer went (a lost context): the HTML window opens in its place
    setOptions3d();
    this.layer.remove(this);
    this.hand.dispose();
    this.host.remove();
  }
}
