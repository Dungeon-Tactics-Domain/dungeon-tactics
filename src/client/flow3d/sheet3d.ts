// The windows the title and Options open, drawn in 3D (localhost ?sheets=3d, the default; Fernando, Nov 17: what was
// left in HTML outside the battle): the saved games, quick battle, how to play, credits, the tile marks and the controls,
// one screen of the shared 3D layer (ui3d/layer.ts) for all of them. FFT: The Ivalice
// Chronicles' captures have no counterpart for these, so the look is the game's own 3D screens': the Options' head, a
// parchment sheet as the town's counter, dark plates at the foot, the pointing glove.
//   State and input: the window itself (game/sheets.ts `showSheet`) stays as it is, unseen, its real buttons moved
//   under the drawn ones by sheet-layout.ts and its own box scrolling under the sheet: the arrows, Enter, Esc, the pad,
//   a tap, the wheel and a screen reader work as before. This screen only takes each window as it opens.
//   What it draws comes from the window's data (a list's rows, a text's blocks), never from its DOM, except what a
//   button says while armed (Delete's 2nd tap) and which control holds the focus.
//   The developer menu, a form, has its own screen (dev3d.ts).
import { Group, type Mesh } from 'three';
import type { Sheet } from '../game/sheets.ts';
import { NONE, Part } from '../hints3d/hints3d.ts';
import { fill } from '../looks3d.ts';
import { alpha } from '../menu3d/column.ts';
import type { Faces } from '../ui3d/face.ts';
import type { Ui3dLayer, Ui3dScreen } from '../ui3d/layer.ts';
import { paintTexture, paperMaterial, quad } from '../ui3d/panel.ts';
import { ease } from '../ui3d/spring.ts';
import { wrapLines } from '../ui3d/text.ts';
import { neighbour, type Way } from '../ui3d/walk.ts';
import { type Colors, colors, Hand, lift, rgba, solid } from './draw.ts';
import { REF as OPT } from './options-layout.ts';
import { drawHead, drawLine, drawRow, type Piece } from './sheet-draw.ts';
import { flow, rowBox, type SheetLayout, scrollOf, sheetLayout, shown, sideBox, stops, thumb } from './sheet-layout.ts';

export class Sheet3d implements Ui3dScreen {
  readonly flat = new Group();
  readonly deep = new Group();
  private readonly color: Colors;
  private readonly release: () => void;
  private readonly hand = new Hand(this.deep);
  private readonly paint = paintTexture();
  private readonly faces: Faces = new Map();
  private readonly pen = document.createElement('canvas').getContext('2d')!; // measures the text it wraps
  private readonly veil = new Part();
  private readonly fixed = new Part(); // the name, the note, the plates at the foot
  private readonly band = new Part(); // under the row in focus
  private readonly band2 = new Part(); // under a row's second button in focus
  private readonly mark = new Part(); // the scroll mark
  private paper?: Mesh;
  private pieces: Piece[] = [];
  private content = 0; // height of the list or the text
  private overlay?: HTMLElement; // the window on screen, whatever its look
  private sheet?: Sheet;
  private taken = false; // drawn in 3D
  private at?: SheetLayout;
  private under?: Ui3dScreen; // who held the layer when this window opened (Options, under its Controls)
  private stale = false;
  private open = 0;
  private readonly ac = { stop: new AbortController() };
  private readonly watch = new MutationObserver(() => {
    this.stale = true;
    this.layer.wake();
  });

  constructor(private readonly layer: Ui3dLayer) {
    this.color = colors(layer);
    this.flat.add(this.veil.group, this.band.group, this.band2.group, this.fixed.group, this.mark.group);
    layer.add(this, 'sheets');
    this.release = fill('sheet', (overlay, sheet) => this.take(overlay, sheet));
  }

  // the window's own parts
  private get dialog() {
    return this.overlay?.querySelector<HTMLElement>('.dialog');
  }
  private get close() {
    return this.overlay?.querySelector<HTMLButtonElement>('.dialog-head > button');
  }
  private get link() {
    return this.overlay?.querySelector<HTMLAnchorElement>('.dialog a[href]');
  }
  private get rows() {
    return [...(this.overlay?.querySelectorAll<HTMLButtonElement>('.camp-list > button') ?? [])];
  }

  // a window opened
  private take(overlay: HTMLElement, sheet: Sheet) {
    this.drop();
    this.ac.stop.abort();
    const { signal } = (this.ac.stop = new AbortController());
    this.overlay = overlay;
    this.sheet = sheet;
    const wake = () => this.layer.wake();
    overlay.addEventListener('focusin', wake, { signal });
    overlay.addEventListener('scroll', wake, { capture: true, passive: true, signal });
    // the mouse over a control takes the cursor to it, as on the other 3D screens
    overlay.addEventListener(
      'pointerover',
      (e) => {
        if (!this.taken || !(e.target instanceof Element)) return;
        e.target.closest<HTMLElement>('.camp-list > button, .dialog-head > button, a[href]')?.focus({
          preventScroll: true,
        });
      },
      { signal },
    );
    // the arrows and the d-pad go where the eye goes (dialog.ts `walked`)
    overlay.addEventListener('walk', (e) => this.taken && this.walk(e as CustomEvent<Way>), { signal });
    // a text has nothing to walk: the keys scroll it (the window's own buttons sit outside its scrolling box here)
    overlay.addEventListener(
      'keydown',
      (e) => {
        const d = this.dialog;
        if (!this.taken || !d || !sheet.blocks) return;
        const by = {
          PageDown: d.clientHeight * 0.9,
          PageUp: -d.clientHeight * 0.9,
          End: d.scrollHeight,
          Home: -d.scrollHeight,
        }[e.code];
        if (!by) return;
        e.preventDefault();
        d.scrollBy({ top: by });
      },
      { signal },
    );
    this.watch.observe(overlay, {
      subtree: true,
      childList: true,
      characterData: true,
      attributeFilter: ['disabled'],
    });
    this.open = 0;
    this.resize();
  }

  // An arrow or the d-pad: the cursor goes to the control seen that way (ui3d/walk.ts), and stays where it is with
  // nothing there. A list's rows, each one's second button beside it, the plates under the sheet; a text has only the
  // plates, so up and down scroll it
  private walk(e: CustomEvent<Way>) {
    const L = this.at,
      d = this.dialog,
      sheet = this.sheet;
    if (!L || !d || !sheet) return;
    e.preventDefault();
    const way = e.detail;
    if (sheet.blocks && (way === 'up' || way === 'down'))
      return d.scrollBy({ top: (way === 'down' ? 1 : -1) * L.rowH * 1.5 });
    // every control, in the order of its box (sheet-layout.ts `stops`)
    const els = [...this.rows, ...(this.link ? [this.link] : []), this.close];
    const boxes = stops(
      L,
      (sheet.rows ?? []).map((r) => !!r.side),
    );
    const active = document.activeElement;
    // a text's own Back (at its end, for the screen reader) is the drawn Back
    const at = els.findIndex((el) => el === active || (el === this.close && sheet.blocks && d.contains(active)));
    // nothing in focus: the cursor comes in on Back
    els[at < 0 ? els.length - 1 : neighbour(boxes, at, way)]?.focus();
  }

  // the window left: nothing drawn, its places back
  private drop() {
    if (!this.taken) return;
    this.taken = false;
    const { overlay, layer } = this;
    overlay?.classList.remove('sheet3d', 'sheet3d-list');
    for (const e of [this.dialog, this.close, this.link]) e?.removeAttribute('style');
    this.close?.removeAttribute('tabindex');
    // the layer back to whoever had it, if its window is still there (Options under its Controls)
    if (layer.solo === this)
      layer.solo = [...document.querySelectorAll('.overlay')].some((o) => o !== overlay) ? this.under : undefined;
    this.under = this.at = undefined;
    this.clear();
    this.hand.point(layer, null, 0, 0, 0, 0, true);
    layer.wake();
  }

  private clear() {
    for (const p of [this.veil, this.fixed, this.band, this.band2, this.mark]) p.clear();
    for (const p of this.pieces) {
      for (const m of p.more) {
        m.removeFromParent();
        (m.material as { dispose(): void }).dispose();
      }
      p.part.clear();
      p.part.group.removeFromParent();
    }
    this.pieces = [];
    if (this.paper) {
      this.paper.removeFromParent();
      (this.paper.material as { dispose(): void }).dispose();
      this.paper = undefined;
    }
  }

  resize() {
    const { overlay, sheet, layer } = this;
    if (!overlay?.isConnected || !sheet) return;
    if (!this.taken) {
      this.taken = true;
      this.under = layer.solo === this ? undefined : layer.solo;
      layer.solo = this; // the battle's own 3D pieces and the screen under this window stay out
    }
    overlay.classList.add('sheet3d');
    overlay.classList.toggle('sheet3d-list', !!sheet.rows);
    this.build();
  }

  // the layout, the window's controls sized by it, and everything drawn again
  private build() {
    const { layer, sheet } = this,
      d = this.dialog;
    if (!sheet || !d) return;
    const L = (this.at = sheetLayout(layer.w, layer.h, {
      tall: sheet.rows?.some((r) => r.face),
      side: sheet.rows?.some((r) => r.side),
      link: !!this.link,
    }));
    const px = (v: number) => `${v}px`;
    const place = (e: HTMLElement | null | undefined, b: { x: number; y: number; w: number; h: number }) =>
      e && Object.assign(e.style, { left: px(b.x), top: px(b.y), width: px(b.w), height: px(b.h) });
    // the window's box is the sheet's scrolling window; its ✕ is the drawn Back, the link the plate beside it
    Object.assign(d.style, { margin: `${px(L.box.y)} 0 0 ${px(L.box.x)}`, width: px(L.box.w), height: px(L.box.h) });
    d.style.setProperty('--s3-row', px(L.rowH));
    d.style.setProperty('--s3-side', px(L.side));
    place(this.close, L.foot.at(-1)!);
    place(this.link, L.foot[0]);
    // a text's own Back, at its end, is Tab's way out: the ✕ first in the window would come before the link drawn left
    // of it (Nov 18: Tab in the order seen); the arrows, Esc and a click still reach it
    if (sheet.blocks) this.close?.setAttribute('tabindex', '-1');
    this.draw();
    // the window scrolls as far as the drawing has to: room under its own content for what the drawn one has more
    d.style.setProperty('--s3-more', '0px');
    d.style.setProperty('--s3-more', px(Math.max(0, this.content - d.scrollHeight)));
    this.hand.reset();
  }

  private draw() {
    const { layer, sheet, color: c } = this,
      L = this.at;
    if (!sheet || !L) return;
    this.stale = false;
    this.clear();
    const s = L.s,
      { theme } = layer;
    this.veil.box(-8, -8, layer.w + 16, layer.h + 16, 0, rgba(c.veil)); // solid, as the Options
    lift(this.veil, 30);
    const pad = 44 * s,
      P = L.panel;
    const paper = paperMaterial(this.paint, theme, { w: P.w, h: P.h, pad, unit: s, seed: 7 });
    this.paper = quad(paper, P.x - pad, P.y - pad, P.w + 2 * pad, P.h + 2 * pad, 62);
    this.flat.add(this.paper);
    this.fixed.key = '';

    const piece = (top: number, h: number): Piece => {
      const p = { part: new Part(), top, h, more: [] as Mesh[] };
      this.flat.add(p.part.group);
      this.pieces.push(p);
      return p;
    };
    const buttons = this.rows;
    let at = 0;
    for (const [i, row] of (sheet.rows ?? []).entries()) {
      const p = piece(i * L.rowH, L.rowH);
      drawRow(layer, this.faces, p, row, L, row.side ? buttons[at + 1] : undefined);
      at += row.side ? 2 : 1;
      lift(p.part, 40);
    }
    this.content = (sheet.rows?.length ?? 0) * L.rowH;
    if (sheet.blocks) {
      const read = flow(sheet.blocks, L, (str, max, size) => {
        this.pen.font = `500 ${size}px ${theme.font}`;
        return wrapLines(str, max, (part) => this.pen.measureText(part).width);
      });
      for (const line of read.lines) {
        const p = piece(line.top, line.h);
        drawLine(layer, p.part, line, L);
        lift(p.part, 40);
      }
      this.content = read.height;
    }
    // the focus bands, on the paper and under the row's text
    this.band.box(0, 0, L.box.w - L.side, L.rowH, 6 * s, solid(theme.lit), rgba(theme.ink, 0.45));
    lift(this.band, 34);
    const sb = sideBox(L, 0, 0);
    this.band2.box(0, 0, sb.w, sb.h, 6 * s, solid(theme.lit), NONE);
    lift(this.band2, 34);
    const th = thumb(L, this.content, 0);
    if (th) this.mark.box(0, 0, th.w, th.h, th.w / 2, rgba(theme.ink, 0.55));
    lift(this.mark, 40);
    layer.wake();
  }

  frame(dt: number, time: number) {
    // the window closed (Esc, a command, the game): nothing left to show
    if (this.overlay && !this.overlay.isConnected) {
      this.drop();
      this.overlay = this.sheet = undefined;
      this.watch.disconnect();
      this.ac.stop.abort();
    }
    const L = this.at,
      d = this.dialog;
    if (!L || !d || !this.sheet) return false;
    if (this.stale) this.draw();
    const { layer } = this,
      s = L.s,
      still = layer.still || dt === 0; // a stopped clock lands everything too
    const o = (this.open = still ? 1 : ease(this.open, 1, dt, 12));
    const set = (p: Part, a: number) => {
      p.want = a;
      p.fade(10); // the fade is the screen's own: each part lands on it at once
    };
    set(this.veil, o);
    if (this.paper) alpha(this.paper, o);
    const scroll = scrollOf(L, this.content, d.scrollTop / Math.max(1, d.scrollHeight - d.clientHeight));
    for (const p of this.pieces) {
      p.part.group.position.set(L.box.x, -(L.box.y + p.top - scroll), 0);
      set(p.part, shown(L, p.top - scroll, p.h) * o);
      for (const m of p.more) alpha(m, p.part.alpha);
    }
    const th = thumb(L, this.content, scroll);
    if (th) this.mark.group.position.set(th.x, -th.y, 0);
    set(this.mark, o);
    // what holds the focus: a row (or its second button), or a plate at the foot (the window's own Back is the ✕'s)
    const active = document.activeElement,
      rows = this.sheet.rows ?? [],
      index = this.rows.indexOf(active as HTMLButtonElement);
    let row = -1,
      second = false;
    for (let i = 0, b = 0; i < rows.length && row < 0; b += rows[i++].side ? 2 : 1)
      if (index === b || (rows[i].side && index === b + 1)) {
        row = i;
        second = index !== b;
      }
    const back = active === this.close || (!!this.sheet.blocks && d.contains(active)); // a text's own Back too
    const foot = active === this.link ? 0 : back ? L.foot.length - 1 : -1;
    const key = String(foot);
    if (key !== this.fixed.key) {
      drawHead(layer, this.color, this.fixed, this.sheet, L, this.link?.textContent, foot);
      this.fixed.key = key;
    }
    set(this.fixed, o);
    const r = row < 0 ? L.foot[foot] : second ? sideBox(L, row, scroll) : rowBox(L, row, scroll);
    const see = r ? (row < 0 ? 1 : shown(L, row * L.rowH - scroll, L.rowH)) * o : 0;
    set(this.band, row >= 0 && !second ? see : 0);
    set(this.band2, row >= 0 && second ? see : 0);
    if (r) (second ? this.band2 : this.band).group.position.set(r.x, -r.y, 0);
    this.hand.point(layer, r, see, OPT.hand * s, dt, time, still);
    return !layer.still; // the glove sways for as long as the sheet shows
  }

  dispose() {
    this.drop();
    this.watch.disconnect();
    this.ac.stop.abort();
    this.release();
    this.layer.remove(this);
    this.hand.dispose();
    this.paint.dispose();
    for (const tex of this.faces.values()) tex.dispose();
  }
}
