// The title drawn in 3D (Fernando, Nov 17), a screen of the shared 3D layer
// (ui3d/layer.ts), in the structure of FFT: The Ivalice Chronicles' title (labs refs/fft-ivalice/50): the name over
// the turning map, a short plain list of commands with the glove on the one in focus, the keys at the foot.
//   State and input: the title's own window (game/title.ts) stays as it is, unseen, with its real buttons moved under
//   the drawn ones by title-layout.ts: the arrows, Enter, the pad, a tap and a screen reader work as before. This
//   screen only takes each title as it opens (looks3d.ts `title`).
//   The title opens once the battle behind it and its layer are built, behind the loading cover (ready-gate.ts), so
//   it is drawn in 3D from its first frame, at every page size.
import { Group } from 'three';
import { Part, type Quad } from '../hints3d/hints3d.ts';
import { fill } from '../looks3d.ts';
import type { Ui3dLayer, Ui3dScreen } from '../ui3d/layer.ts';
import { type Box, textPx } from '../ui3d/layout.ts';
import { ease } from '../ui3d/spring.ts';
import { textMesh } from '../ui3d/text.ts';
import { neighbour, type Way } from '../ui3d/walk.ts';
import { type Colors, colors, FOCUS, Hand, lift, put, rgba } from './draw.ts';
import { REF, stops, type TitleLayout, titleLayout } from './title-layout.ts';

export class Title3d implements Ui3dScreen {
  readonly flat = new Group();
  readonly deep = new Group();
  private readonly color: Colors;
  private readonly release: () => void;
  private readonly hand = new Hand(this.deep);
  private readonly fixed = new Part();
  private readonly band = new Part(); // under the command in focus
  private title?: HTMLElement; // the title's window on screen, whatever its look
  private taken = false; // drawn in 3D
  private at?: TitleLayout;
  private open = 0;
  private readonly wake = () => this.layer.wake();
  // An arrow or the d-pad (dialog.ts `walked`): the cursor goes to the control seen that way, and stays where it is
  // with none there: no way round from the last command to the first
  private readonly walk = (e: Event) => {
    const L = this.at,
      { main, fs, lang, install } = this,
      els = [main, ...this.rows, install, fs, lang].filter((b) => !!b);
    if (!this.taken || !L) return;
    e.preventDefault();
    const at = els.indexOf(document.activeElement as HTMLButtonElement);
    els[at < 0 ? 0 : neighbour(stops(L, !!lang, !!fs, !!main, !!install), at, (e as CustomEvent<Way>).detail)]?.focus();
  };

  constructor(private readonly layer: Ui3dLayer) {
    this.color = colors(layer);
    this.flat.add(this.band.group, this.fixed.group);
    layer.add(this, 'title');
    this.release = fill('title', (overlay) => this.take(overlay));
  }

  private get rows() {
    return [...(this.title?.querySelectorAll<HTMLButtonElement>('.camp-list > button') ?? [])];
  }
  private get lang() {
    return this.title?.querySelector<HTMLButtonElement>('.title-lang');
  }
  // fullscreen: the quiet shortcut beside the language, or the main button of a phone in the browser
  private get fs() {
    return this.title?.querySelector<HTMLButtonElement>('.title-fs');
  }
  // the install line (install.ts), at the bottom of the right column
  private get install() {
    return this.title?.querySelector<HTMLButtonElement>('.title-install');
  }
  private get main() {
    return this.title?.querySelector<HTMLButtonElement>('.title-main');
  }

  // a title opened
  private take(overlay: HTMLElement) {
    this.drop();
    this.title = overlay;
    overlay.addEventListener('focusin', this.wake);
    overlay.addEventListener('walk', this.walk);
    this.open = 0;
    this.resize();
  }

  // the title left: nothing drawn, its window's places back
  private drop() {
    if (!this.taken) return;
    this.taken = false;
    this.title?.classList.remove('title3d');
    for (const e of [this.title?.querySelector<HTMLElement>('.camp-list'), this.lang, this.fs, this.main, this.install])
      e?.removeAttribute('style');
    if (this.layer.solo === this) this.layer.solo = undefined;
    this.at = undefined;
    this.fixed.clear();
    this.band.clear();
    this.hand.point(this.layer, null, 0, 0, 0, 0, true);
    this.layer.wake();
  }

  resize() {
    if (!this.title?.isConnected) return;
    this.taken = true;
    this.title.classList.add('title3d');
    this.layer.solo = this; // the battle's own 3D pieces stay out of the title, as its HUD does
    this.build();
  }

  private build() {
    const { layer, fixed, color: c, title } = this,
      rows = this.rows,
      list = title?.querySelector<HTMLElement>('.camp-list'),
      { lang, fs, main, install } = this;
    if (!title || !list) return;
    const L = (this.at = titleLayout(layer.w, layer.h, rows.length, !!fs)),
      s = L.s;
    const px = (v: number) => `${v}px`;
    Object.assign(list.style, { left: px(L.rows[0].x), top: px(L.rows[0].y), width: px(L.rows[0].w) });
    list.style.setProperty('--t3-row', px(L.rows[0].h));
    const seat = (b: HTMLElement | null | undefined, r: Box) =>
      b && Object.assign(b.style, { left: px(r.x), top: px(r.y), width: px(r.w), height: px(r.h) });
    seat(lang, L.lang);
    seat(fs, L.fs);
    seat(install, L.install);
    seat(main, L.main);
    // `px`: page px; the other texts shrink with the pieces on a small page (textPx), as Options' do
    const mesh = (str: string, px: number, hex: string) =>
      textMesh(str, { size: px, color: hex, font: layer.theme.font }, layer.dpr) as Quad;
    const text = (str: string, size: number, hex: string) => mesh(str, textPx(size, s), hex);
    fixed.clear();
    // the art darkened a little, the name and the list over it
    fixed.box(-8, -8, layer.w + 16, layer.h + 16, 0, rgba(c.veil, 0.5));
    // the name with its own dark copy under it: it must read over grass, snow or sand
    const name = (title.querySelector('h2')?.textContent ?? '').toUpperCase();
    for (const [hex, off] of [
      [c.veil, L.name.size / 24], // 5 px of the reference's 120 px name
      [c.title, 0],
    ] as const)
      put(fixed, mesh(name, L.name.size, hex), L.name.x + off * 0.7, L.name.y + off, 'centre', layer.w - 48 * s);
    fixed.box(L.rule.x, L.rule.y, L.rule.w, L.rule.h, 0, rgba(c.line, 0.9));
    put(fixed, text('◆', 14, c.line), L.name.x, L.rule.y + L.rule.h / 2, 'centre');
    fixed.box(L.plate.x, L.plate.y, L.plate.w, L.plate.h, 8 * s, rgba(c.band, 0.78), rgba(c.line, 0.7));
    rows.forEach((b, i) => {
      const r = L.rows[i],
        mid = r.y + r.h / 2,
        note = b.querySelector('small')?.textContent ?? '';
      const tag = note ? put(fixed, text(note, REF.size.note, c.soft), r.x + r.w - 12 * s, mid, 'right') : null;
      const room = r.w - L.inset - (tag ? tag.scale.x + 24 * s : 12 * s);
      put(fixed, text(b.firstChild?.textContent ?? '', REF.size.row, c.text), r.x + L.inset, mid, 'left', room);
      // the developer's row closes the list under a hairline: a tool apart from the game's commands. On the row's own
      // top edge, so no row moves and every unseen button stays under its drawing
      if (b.classList.contains('dev-row'))
        fixed.box(r.x + 12 * s, r.y, r.w - 24 * s, Math.max(1, s), 0, rgba(c.line, 0.7));
    });
    // the keys, only where there is a keyboard (the title's own foot says them or not)
    const foot = title.querySelector('.title-foot')?.firstChild;
    const keys = foot && foot.nodeName !== 'BUTTON' ? (foot.textContent ?? '').replace(/[\s·]+$/, '') : '';
    if (keys) put(fixed, text(keys, REF.size.foot, c.text), L.foot.x, L.foot.y, 'centre');
    // the language button and the quiet fullscreen shortcut: a dark plate each, the same look
    for (const [b, r] of [
      [lang, L.lang],
      [fs, L.fs],
      [install, L.install],
    ] as const)
      if (b) {
        fixed.box(r.x, r.y, r.w, r.h, 6 * s, rgba(c.plate, 0.95), rgba(c.line, 0.8));
        put(
          fixed,
          text(b.textContent ?? '', REF.size.lang, c.text),
          r.x + r.w / 2,
          r.y + r.h / 2,
          'centre',
          r.w - 16 * s,
        );
      }
    // the window's one main button (a phone in the browser): light plate, dark words, apart from every other control
    if (main) {
      const r = L.main;
      fixed.box(r.x, r.y, r.w, r.h, 8 * s, rgba(c.title), rgba(c.line));
      put(
        fixed,
        text(main.textContent ?? '', REF.main.size, c.veil),
        r.x + r.w / 2,
        r.y + r.h / 2,
        'centre',
        r.w - 24 * s,
      );
    }
    lift(fixed, 40);
    this.band.clear();
    this.band.box(0, 0, L.rows[0].w, L.rows[0].h, 6 * s, FOCUS, rgba(c.line, 0.6));
    lift(this.band, 44);
    this.hand.reset();
    layer.wake();
  }

  frame(dt: number, time: number) {
    // the title closed (a command took the player elsewhere): nothing left to show
    if (this.title && !this.title.isConnected) {
      this.drop();
      this.title = undefined;
    }
    const L = this.at;
    if (!L) return false;
    const { layer } = this,
      still = layer.still || dt === 0; // a stopped clock lands everything too
    const o = (this.open = still ? 1 : ease(this.open, 1, dt, 8));
    const set = (p: Part, a: number) => {
      p.want = a;
      p.fade(10);
    };
    set(this.fixed, o);
    const active = document.activeElement,
      row = this.rows.indexOf(active as HTMLButtonElement);
    const r =
      row >= 0
        ? L.rows[row]
        : active === this.lang
          ? L.lang
          : active === this.fs
            ? L.fs
            : active === this.install
              ? L.install
              : active === this.main
                ? L.main
                : null;
    set(this.band, row >= 0 ? o : 0);
    if (r) this.band.group.position.set(r.x, -r.y, 0);
    // on a command the glove stands inside its row, as the reference; on the language button, at its left
    const at = r && row >= 0 ? { ...r, x: r.x + L.inset - 8 * L.s } : r;
    this.hand.point(layer, at, o, REF.hand * L.s, dt, time, still);
    return !layer.still; // the glove sways for as long as the title shows
  }

  dispose() {
    this.drop();
    this.title?.removeEventListener('focusin', this.wake);
    this.title?.removeEventListener('walk', this.walk);
    this.release();
    this.layer.remove(this);
    this.hand.dispose();
  }
}
