// A notice window drawn in 3D (?note=3d, the default; Fernando, Nov 18: the whole interface in the 3D look), a screen
// of the shared 3D layer (ui3d/layer.ts) in the Status sheet's look (status3d.ts): the game darkened, one parchment
// sheet in the middle with the notice's title on its head, then a legend of marks (the expedition map's seals), its
// paragraphs, a figure (the gold found) and one to three dark plaques for its buttons, the glove on the one in focus.
//   State: nothing here decides anything. While this screen lives, noteWindow (note.ts) hands it each notice with the
//   HTML window it stands for; note-view.ts says where everything goes. Every other screen of the layer stays out
//   while it shows (`solo`), as under the title and its sheets.
//   Input: a window of dialog.ts, unseen, over the drawn sheet, holding the notice as real text and its real buttons,
//   each over its plaque: Enter, a tap, Tab and the screen reader are the window's, Esc, the pad's B, a tap outside
//   and the ✕ close it unless it is `fixed`, and an arrow or the d-pad goes to the plaque seen that way (dialog.ts
//   `walked`, ui3d/walk.ts).
//   A page too short for the sheet takes the wide one, across the page (note-view.ts), at every size.
import { Group, type Mesh, type ShaderMaterial } from 'three';
import { dialog } from '../dialog.ts';
import { type Colors, colors, Hand, rgba } from '../flow3d/draw.ts';
import type { Act } from '../glyphs.ts';
import { NONE, Part, type Quad, type Rgba } from '../hints3d/hints3d.ts';
import { KEYS } from '../hud-pieces.ts';
import { t } from '../i18n.ts';
import { button, el } from '../icons.ts';
import { alpha, clamp01, move } from '../menu3d/column.ts';
import { type Note, type NoteHtml, type NoteMark, setNote3d } from '../note.ts';
import { capMeshes, capRun, capsWidth } from '../ui3d/caps.ts';
import type { Ui3dLayer, Ui3dScreen } from '../ui3d/layer.ts';
import { paintTexture, paperMaterial, quad, type Rgb } from '../ui3d/panel.ts';
import { land, settled, spring } from '../ui3d/spring.ts';
import { textMesh } from '../ui3d/text.ts';
import { neighbour, type Way } from '../ui3d/walk.ts';
import './note3d.css';
import { type NoteLayout, noteLayout, noteWidths, REF, TEXT } from './note-view.ts';

const VEIL: Rgba = [0.03, 0.04, 0.05, 0.72]; // the game behind, as the Status sheet's dark screen
const RULE: Rgba = [0.2, 0.17, 0.1, 0.16]; // the hairline over the figure, in the paper's edge colour
// text sizes in px of the reference (never under 16 px on the page)
const SIZE = { head: 24, row: TEXT, mark: 22, figure: 30, button: 24, foot: 20, close: 24 };
// under the pixel filter's own quad (100), which lays the glove over the sheet, and over every other screen
const OVER = 44;
const tint = (c: Rgb, a = 1): Rgba => [c[0], c[1], c[2], a];

export class Note3d implements Ui3dScreen {
  readonly flat = new Group();
  readonly deep = new Group();
  // the notice as real text and buttons, inside the window: hiding the windows (the sandbox's `hide`) hides the screen
  readonly host = el('div', { class: 'note3d-body' });
  private readonly veil = new Part();
  private readonly part = new Part();
  private readonly ring = new Part(); // around the plaque in focus
  private readonly paint = paintTexture();
  private readonly hand = new Hand(this.deep);
  private readonly open = spring(0);
  private readonly color: Colors;
  private readonly gold: string;
  private paper?: Mesh;
  private now?: { n: Note; html: NoteHtml; buttons: HTMLButtonElement[]; from: Element | null };
  private win?: { overlay: HTMLElement; close(): void };
  private L?: NoteLayout;
  private under?: Ui3dScreen; // what the layer showed alone before this
  private at = 0; // the plaque in focus

  constructor(private readonly layer: Ui3dLayer) {
    this.color = colors(layer);
    this.gold = getComputedStyle(layer.root).getPropertyValue('--ui3d-town-gold').trim();
    this.flat.add(this.veil.group, this.part.group, this.ring.group);
    this.host.addEventListener('pointerover', this.point);
    layer.add(this, 'note');
    setNote3d((n, html) => this.show(n, html));
  }

  // the cursor follows the focus and the mouse
  private readonly point = (e: Event) => {
    const b = (e.target as Element).closest('button');
    const i = this.now?.buttons.indexOf(b as HTMLButtonElement) ?? -1;
    if (i < 0 && (e.type === 'pointerover' || !b)) return;
    if (e.type === 'pointerover') return this.now?.buttons[i].focus();
    this.at = i; // -1: the window's ✕ (Tab reaches it), which shows its own line
    this.mark();
  };

  // false: the sheet does not fit this page, the HTML window is the one to open
  private show(n: Note, html: NoteHtml): boolean {
    this.hide();
    const leave = (then?: () => void) => () => {
      this.hide();
      then?.();
    };
    const buttons = n.buttons.map((b) => button('primary', b.label, leave(b.run)));
    this.now = { n, html, buttons, from: document.activeElement };
    this.host.replaceChildren(
      ...(n.legend?.length ? [el('ul', {}, ...n.legend.map(([, says]) => el('li', {}, says)))] : []),
      ...(n.text ?? []).map((p) => el('p', {}, p)),
      ...(n.figure ? [el('p', {}, `${n.figure[0]}: ${n.figure[1]}`)] : []),
      ...buttons,
    );
    this.win = dialog('note3d', n.title, [this.host], { fixed: n.fixed, onBack: leave(n.onBack) });
    this.win.overlay.addEventListener('focusin', this.point);
    // the arrows and the d-pad go to the plaque seen that way, and stay with none there; from the ✕, to the first one
    this.win.overlay.addEventListener('walk', (e) => {
      e.preventDefault();
      buttons[this.at < 0 ? 0 : neighbour(this.L?.buttons ?? [], this.at, (e as CustomEvent<Way>).detail)]?.focus();
    });
    this.under = this.layer.solo;
    this.layer.solo = this;
    this.build();
    this.at = 0;
    buttons[0].focus();
    this.hand.reset();
    land(this.open, 0);
    this.open.to = this.part.want = this.veil.want = this.ring.want = 1;
    return true;
  }

  private hide() {
    const from = this.now?.from;
    this.win?.close();
    if (this.layer.solo === this) this.layer.solo = this.under;
    this.win = this.now = this.L = this.under = undefined;
    this.drop();
    this.hand.point(this.layer, null, 0, 0, 0, 0, true);
    this.layer.wake();
    // the focus back where it was (the map's place, the row that opened it)
    if (from instanceof HTMLElement && from.isConnected) from.focus({ preventScroll: true });
  }

  resize() {
    if (this.now) this.build();
  }

  private label(str: string, size: number, color: string, u: number, width?: number) {
    const px = Math.max(16, size * u);
    return textMesh(
      str,
      { size: px, color, font: this.layer.theme.font, width, line: px * 1.3 },
      this.layer.dpr,
    ) as Quad;
  }

  // a legend's mark, as the map draws a place (town3d/map-draw.ts): gold while open, sunk once cleared, an empty
  // pale ring when no way leads there; the flag is its pole and its cloth
  private seal(m: NoteMark, x: number, y: number, size: number, u: number) {
    const { part, layer } = this,
      { theme } = layer,
      ink = tint(theme.edge);
    if (m.look === 'flag') {
      part.box(x + size * 0.3, y + size * 0.1, 3 * u, size * 0.8, 0, ink);
      part.box(x + size * 0.3 + 3 * u, y + size * 0.1, size * 0.45, size * 0.32, 2 * u, rgba(this.gold), ink);
      return;
    }
    const body = { open: rgba(this.gold), ahead: tint(theme.shade), cleared: tint(theme.band), skipped: NONE }[m.look];
    const hex = { open: this.color.title, ahead: theme.ink, cleared: theme.ink, skipped: theme.inkSoft }[m.look];
    part.box(x, y, size, size, m.square ? 7 * u : size, body, m.look === 'skipped' ? rgba(theme.inkOff) : ink);
    (part.group.children.at(-1) as Quad).material.uniforms.uLine.value = (m.look === 'open' ? 3 : 2) * u;
    part.text(this.label(m.glyph, SIZE.mark, hex, u), x + size / 2, y + size / 2);
  }

  private build(wide = false): boolean {
    const { layer, part, veil, now } = this;
    if (!now) return false;
    this.drop();
    const { n } = now,
      { ink, inkSoft } = layer.theme,
      c = this.color,
      W = noteWidths(layer.stage, n.legend?.length ?? 0, wide),
      u = W.u;
    const legend = (n.legend ?? []).map(([, says]) => this.label(says, SIZE.row, ink, u, W.legendText));
    const text = (n.text ?? []).map((p) => this.label(p, SIZE.row, ink, u, W.inner));
    const L = noteLayout(
      layer.stage,
      { legend: legend.map((m) => m.scale.y), text: text.map((m) => m.scale.y), figure: !!n.figure },
      n.buttons.length,
      wide,
    );
    const left = (m: Quad, x: number, mid: number) => part.text(m, x + m.scale.x / 2, mid);
    // every text made goes on the part, so `drop` frees it whether the sheet fits or not
    legend.forEach((m, i) => {
      const r = L.legend[i],
        size = REF.mark * u;
      this.seal(n.legend![i][0], r.x, r.y, size, u);
      left(m, r.x + (REF.mark + REF.markGap) * u, r.y + Math.max(size, m.scale.y) / 2);
    });
    text.forEach((m, i) => left(m, L.text[i].x, L.text[i].y + m.scale.y / 2));
    if (!L.fits && !wide) {
      this.drop();
      return this.build(true);
    }
    this.L = L;
    veil.box(-8, -8, layer.w + 16, layer.h + 16, 0, VEIL);
    const pad = 44 * u;
    this.paper = quad(
      paperMaterial(this.paint, layer.theme, {
        w: L.box.w,
        h: L.box.h,
        pad,
        unit: u,
        head: REF.head,
        foot: REF.foot,
        seed: 11,
      }),
      -pad,
      -pad,
      L.box.w + 2 * pad,
      L.box.h + 2 * pad,
      30 + OVER - 1,
    );
    part.group.add(this.paper);
    left(this.label(n.title, SIZE.head, inkSoft, u), 10 * u, L.head / 2 - u);
    // the drawn ✕ sits under the window's real one (note3d.css): a 44 px square on the top right corner
    if (!n.fixed) part.text(this.label('✕', SIZE.close, inkSoft, u), L.box.w - 22, Math.max(L.head / 2, 14));
    if (n.figure && L.figure) {
      const f = L.figure,
        mid = f.y + f.h / 2,
        value = this.label(n.figure[1], SIZE.figure, ink, u);
      part.box(f.x, f.y, f.w, 1, 0, RULE);
      left(this.label(n.figure[0], SIZE.row, inkSoft, u), f.x, mid);
      left(value, f.x + f.w - value.scale.x, mid);
    }
    L.buttons.forEach((b, i) => {
      part.box(b.x, b.y, b.w, b.h, 6 * u, rgba(c.plate, 0.96), rgba(c.line));
      const m = this.label(n.buttons[i].label, SIZE.button, c.text, u);
      m.scale.multiplyScalar(Math.min(1, (b.w - 24 * u) / m.scale.x));
      part.text(m, b.x + b.w / 2, b.y + b.h / 2);
      // the real button under its plaque
      Object.assign(now.buttons[i].style, {
        left: `${b.x}px`,
        top: `${b.y}px`,
        width: `${b.w}px`,
        height: `${b.h}px`,
      });
    });
    // the foot: what the buttons do, for the device at hand
    const mid = L.box.h - L.foot / 2;
    let x = L.box.w - 14 * u;
    const hint = (act: Act | null, says: string) => {
      const m = this.label(says, SIZE.foot, inkSoft, u);
      left(m, (x -= m.scale.x), mid);
      const caps = act && capMeshes(act, layer.keys, Math.max(22, 28 * u), layer.dpr, layer.theme.font);
      if (caps) {
        x -= 10 * u + capsWidth(caps, 4 * u);
        capRun((cap, cx, cy) => part.text(cap, cx, cy), caps, x, mid, 4 * u);
      }
      x -= 24 * u;
    };
    if (KEYS) {
      if (!n.fixed) hint('cancel', t('Fechar', 'Close'));
      hint('confirm', t('Escolher', 'Choose'));
    } else if (!n.fixed) hint(null, t('Toque fora para fechar', 'Tap outside to close'));
    for (const m of [...veil.group.children, ...part.group.children]) if (m !== this.paper) m.renderOrder += OVER;
    for (const m of veil.group.children) m.renderOrder -= 4; // under the sheet
    // the window takes the sheet's box, so a tap outside it closes
    const box = this.win?.overlay.firstElementChild as HTMLElement | null;
    if (box)
      Object.assign(box.style, {
        left: `${L.box.x}px`,
        top: `${L.box.y}px`,
        width: `${L.box.w}px`,
        height: `${L.box.h}px`,
      });
    this.mark();
    return true;
  }

  // The plaque in focus turns gold (FFT's gold plaque, as the town's windows; the light text keeps 4.5:1 on it) and
  // the glove points at it: colour is not the only sign. The ✕ in focus takes a dark line around its square
  private mark() {
    const { ring, L } = this,
      b = L?.buttons[this.at],
      u = Math.max(this.layer.s, 16 / TEXT),
      ink = tint(this.layer.theme.edge);
    ring.clear();
    if (b) ring.box(b.x, b.y, b.w, b.h, 6 * u, rgba(this.gold), ink);
    else if (L && this.now && !this.now.n.fixed) ring.box(L.box.w - 42, 2, 40, 40, 6, NONE, ink);
    const line = ring.group.children[0] as Quad | undefined;
    if (line) {
      line.material.uniforms.uLine.value = 2 * u;
      line.renderOrder += OVER + 0.5; // over the plaque, under its name
    }
    this.layer.wake();
  }

  private drop() {
    (this.paper?.material as ShaderMaterial | undefined)?.dispose();
    this.paper = undefined;
    this.part.clear();
    this.veil.clear();
    this.ring.clear();
  }

  frame(dt: number, time: number) {
    // closed from outside (the game, a 'close' event): nothing left to show
    if (this.win && !this.win.overlay.isConnected) this.hide();
    if (!this.now || !this.L) return false;
    const { layer, part, veil, ring, L } = this,
      still = layer.still,
      e = still ? 10 : dt;
    move(this.open, dt, still, 240, 20); // a little under critical: the sheet drops a hair past its place and settles
    const fading = [part.fade(e), veil.fade(e), ring.fade(e)].some(Boolean);
    if (this.paper) alpha(this.paper, part.alpha);
    const rise = (1 - clamp01(this.open.x)) * 18 * layer.s,
      x = layer.snap(L.box.x),
      y = layer.snap(L.box.y - rise);
    part.group.position.set(x, -y, 0);
    ring.group.position.set(x, -y, 0);
    const b = L.buttons[this.at],
      size = 56 * Math.max(layer.s, 16 / TEXT);
    // beside a lone plaque; with more than one, on the plaque's own left end, off the one before it
    const inset = L.buttons.length > 1 ? size * 0.8 : 0;
    this.hand.point(layer, b && { ...b, x: x + b.x + inset, y: y + b.y }, part.alpha, size, dt, time, still);
    return !still || fading || !settled(this.open); // the glove sways for as long as the notice shows
  }

  dispose() {
    const html = this.now?.html;
    if (this.now) this.now.from = null;
    this.hide();
    setNote3d();
    this.layer.remove(this);
    this.hand.dispose();
    this.paint.dispose();
    if (html) html(); // the layer went (a lost context): the HTML window in its place
  }
}
