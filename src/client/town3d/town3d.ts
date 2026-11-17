// The town's windows drawn in 3D (Shop, Tavern, Party; ?shop=3d, ?party=3d, the default; Fernando, Nov 17), one
// screen of the shared 3D layer (ui3d/layer.ts) for all of them, after FFT: The Ivalice Chronicles' menus: the town
// darkened, parchment panels, dark plaques down the left edge and the pointing glove.
//   State: nothing here decides anything. A window hands it a page (page.ts: what to draw and the buttons, in px of
//   the reference) and it draws that; screens.ts builds the pages from the saved game and runs the actions.
//   Input: the page's buttons as real ones, unseen, over the drawn ones, inside a window of dialog.ts, so keys, pad,
//   mouse and finger work as in every window; the glove points at the one in focus. The list's rows sit in a real
//   scrolling box (wheel, drag and focus scroll it) and the drawing follows.
import { Group, Mesh, ShaderMaterial, type Texture, TextureLoader, Vector4 } from 'three';
import { battleFace } from '../battle-face.ts';
import { dialog } from '../dialog.ts';
import { el } from '../icons.ts';
import { modelOf } from '../markers.ts';
import { alpha, clamp01, Icon, move } from '../menu3d/column.ts';
import type { Ui3dLayer, Ui3dScreen } from '../ui3d/layer.ts';
import { place, REGIONS } from '../ui3d/layout.ts';
import { bandMaterial, paintTexture, paperMaterial, QUAD, QUAD_VERT, quad, type Rgb } from '../ui3d/panel.ts';
import { land, spring } from '../ui3d/spring.ts';
import { dropText, textMesh } from '../ui3d/text.ts';
import type { Box, Hit, Ink, Item, Page, Tone } from './page.ts';
import { T } from './town-layout.ts';

const rgb = (hex: string): Rgb => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255) as Rgb;

const FACE_FRAG = `
precision highp float;
varying vec2 vUv; uniform sampler2D uMap; uniform vec4 uUv; uniform float uAlpha;
void main() { vec4 c = texture2D(uMap, uUv.xy + vUv * uUv.zw); gl_FragColor = vec4(c.rgb, c.a * uAlpha); }`;

export interface WindowOpts {
  name: string;
  onBack?: () => void; // Esc, B, the right button: what opens when the player leaves
  pick(id: string): void; // a button pressed
  focus?(id: string): void; // the cursor landed on a button
  key?(e: KeyboardEvent): void; // a key the window did not take (left and right turn the Party's pages)
}
export interface Window3d {
  // draws the page; `focus`: the button the cursor goes to ('' the page's own start), where it is when absent
  set(page: Page, focus?: string): void;
  at(): string; // the button in focus
  close(): void;
}
// a drawn piece: its full opacity and, inside the list, its row
interface Part {
  mesh: Mesh;
  a: number;
  row?: number;
}

export class Town3d implements Ui3dScreen {
  readonly flat = new Group();
  readonly deep = new Group();
  // the page's buttons, inside a window list so the arrows walk them (dialog.ts); not its children, whose looks the
  // HTML windows own (style.css)
  private readonly hits = el('div', { class: 'town3d-hits' });
  readonly host = el('div', { class: 'camp-list' }, this.hits);
  private readonly rows = el('div', { class: 'town3d-rows' });
  private readonly scroller = el('div', { class: 'town3d-list' }, this.rows);
  private readonly list = new Group(); // what scrolls
  private readonly paint = paintTexture();
  private readonly glove = new Icon(null, 'glove', undefined, 0.035);
  private readonly inks: Record<Ink, string>;
  private readonly tones: Record<Tone, Rgb>;
  private readonly lit: Record<'gold' | 'picked' | 'plate' | 'paper' | 'band', Rgb>;
  private readonly faces = new Map<string, Texture>();
  private readonly open = spring();
  private readonly gx = spring();
  private readonly gy = spring(Number.NaN); // not placed yet: it lands on the first button, no flight from the corner
  private win?: { overlay: HTMLElement; close(): void };
  private opts?: WindowOpts;
  private page?: Page;
  private parts: Part[] = [];
  private plates: { mesh: Mesh; hit: Hit }[] = [];
  private more: Mesh[] = []; // the list's ▲ and ▼, shown while there is more list past that edge
  private buttons = new Map<string, HTMLButtonElement>();
  private shape = ''; // which buttons the host holds
  private focus = '';

  constructor(private readonly layer: Ui3dLayer) {
    const css = getComputedStyle(layer.root);
    const token = (name: string) => css.getPropertyValue(`--ui3d-${name}`).trim();
    const { theme } = layer;
    this.inks = {
      ink: theme.ink,
      soft: theme.inkSoft,
      off: theme.inkOff,
      light: token('result-text'),
      dim: token('result-soft'),
      gold: token('result-title'),
      up: token('town-up'),
      down: token('town-down'),
    };
    this.tones = {
      veil: rgb(token('result-veil')),
      bar: rgb(token('result-band')),
      plate: rgb(token('result-plate')),
      line: rgb(token('result-line')),
      band: theme.band,
      track: rgb(token('town-track')),
      hp: rgb(token('town-hp')),
      mp: rgb(token('town-mp')),
      sp: rgb(token('town-sp')),
      stat: rgb(token('town-stat')),
    };
    this.lit = {
      gold: rgb(token('town-gold')),
      picked: rgb(token('town-picked')),
      plate: this.tones.plate,
      paper: theme.lit,
      band: theme.band,
    };
    this.flat.add(this.list);
    this.glove.model.rotation.set(0.2, -0.3, 0);
    this.glove.group.visible = false;
    this.deep.add(this.glove.group);
    const id = (e: Event) => (e.target instanceof Element ? e.target.closest('button') : null)?.dataset.id;
    this.hits.addEventListener('focusin', (e) => {
      const at = id(e);
      if (!at || at === this.focus) return;
      this.focus = at;
      this.layer.wake();
      this.opts?.focus?.(at);
    });
    let seen = ''; // where the pointer last was: a button rebuilt under a resting pointer leaves the cursor to the keys
    this.hits.addEventListener('pointerover', (e) => {
      const at = id(e);
      const here = `${e.clientX},${e.clientY}`;
      if (at && here !== seen) this.buttons.get(at)?.focus({ preventScroll: true }); // the wheel scrolls the list
      seen = here;
    });
    this.hits.addEventListener('click', (e) => {
      const at = id(e);
      if (at) this.opts?.pick(at);
    });
    this.hits.addEventListener('keydown', (e) => this.opts?.key?.(e));
    this.scroller.addEventListener('scroll', () => this.layer.wake());
    layer.add(this);
  }

  // A window over the town: closes the one before it, without its onBack
  window(opts: WindowOpts): Window3d {
    this.hide();
    this.opts = opts;
    const win = (this.win = dialog('town3d', opts.name, [this.host], { onBack: opts.onBack }));
    land(this.open, 0);
    this.open.to = 1;
    return {
      set: (page, focus) => {
        if (this.win !== win) return;
        this.page = page;
        this.build();
        this.sync(focus);
      },
      at: () => this.focus,
      close: () => win.close(),
    };
  }

  private hide() {
    this.win?.close();
    this.win = this.opts = this.page = undefined;
    this.build();
    this.hits.replaceChildren();
    this.buttons.clear();
    this.shape = this.focus = '';
    this.glove.group.visible = false;
    this.layer.wake();
  }

  resize() {
    this.build();
    this.sync();
  }

  // the reference's px on the page: the whole window is one region, centred and scaled as one
  private box(b: Box): Box {
    const o = place(REGIONS.town, this.layer.stage),
      s = this.layer.stage.s;
    return { x: o.x + b.x * s, y: o.y + b.y * s, w: b.w * s, h: b.h * s };
  }

  private build() {
    const old = this.parts; // dropped after the new ones are made, so a text both pages show keeps its texture
    this.parts = [];
    this.plates = [];
    const { layer, page } = this,
      s = layer.stage.s;
    const add = (mesh: Mesh, order: number, a = 1, row?: number) => {
      mesh.renderOrder = order;
      (row === undefined ? this.flat : this.list).add(mesh);
      this.parts.push({ mesh, a, row });
      return mesh;
    };
    const band = (b: Box, c: Rgb) => quad(bandMaterial(b.w, b.h, s, c), b.x, b.y, b.w, b.h, 0);
    const draw = (it: Item) => {
      if (it.k === 'paper') {
        const b = this.box(it.box),
          pad = 44 * s;
        const mat = paperMaterial(this.paint, layer.theme, {
          w: b.w,
          h: b.h,
          pad,
          unit: s,
          head: it.head,
          seed: it.box.x,
        });
        return add(quad(mat, b.x - pad, b.y - pad, b.w + 2 * pad, b.h + 2 * pad, 0), 61, 1, it.row);
      }
      if (it.k === 'fill')
        return add(band(this.box(it.box), this.tones[it.tone]), it.tone === 'veil' ? 60 : 63, it.a, it.row);
      if (it.k === 'face') return this.face(it.def, this.box(it.box), (m) => add(m, 64, 1, it.row));
      if (!it.str) return;
      const px = Math.max(16, it.size * s);
      const m = textMesh(
        it.str,
        {
          size: px,
          color: this.inks[it.ink],
          font: layer.theme.font,
          width: it.wrap && it.wrap * s,
          line: it.wrap && px * 1.3,
        },
        layer.dpr,
      );
      m.scale.multiplyScalar(
        Math.min(1, ((it.max ?? Infinity) * s) / m.scale.x, ((it.maxH ?? Infinity) * s) / m.scale.y),
      );
      const at = this.box({ x: it.x, y: it.y, w: 0, h: 0 });
      const left = it.align === 'r' ? at.x - m.scale.x : it.align === 'c' ? at.x - m.scale.x / 2 : at.x;
      m.position.set(left + m.scale.x / 2, -(at.y + (it.wrap ? m.scale.y / 2 : 0)), 0);
      add(m, 64, 1, it.row);
    };
    // each button's plate first: lit by the frame for the one in focus and the picked one
    for (const hit of page?.hits ?? [])
      this.plates.push({ hit, mesh: add(band(this.box(hit.box), this.lit.plate), 62, 1, hit.row) });
    page?.items.forEach(draw);
    this.more = [];
    const L = page?.list;
    if (L && L.rows * L.rowH > L.box.h + 1) {
      const x = L.box.x + L.box.w - 26;
      draw({ k: 'text', str: '▲', x, y: L.box.y + 16, size: 20, ink: 'soft', align: 'c' });
      draw({ k: 'text', str: '▼', x, y: L.box.y + L.box.h - 16, size: 20, ink: 'soft', align: 'c' });
      this.more = this.parts.slice(-2).map((p) => p.mesh);
    }
    for (const { mesh } of old) {
      if (mesh.userData.label) dropText(mesh);
      else {
        mesh.removeFromParent();
        (mesh.material as ShaderMaterial).dispose();
      }
    }
    layer.wake();
  }

  // a unit's painted face on its neutral frame, else the top of its rendered portrait
  private face(def: string, b: Box, add: (m: Mesh) => void) {
    const f = battleFace(def),
      url = f ? `/chars/${f.sheet}` : `/chars/${modelOf(def)}.webp`,
      uv = new Vector4(0, 0, f ? 1 / f.frames : 1, 1);
    const mat = new ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: FACE_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: { uMap: { value: null }, uUv: { value: uv }, uAlpha: { value: 1 } },
    });
    const crop = (tex: Texture) => {
      const { width: w, height: h } = tex.image as HTMLImageElement;
      if (!f && h > w) uv.set(0, 1 - w / h, 1, w / h);
      this.layer.wake();
    };
    // one texture per picture; a face asked for while its picture still loads is fitted when it lands
    let tex = this.faces.get(url);
    if (!tex) {
      const made = (tex = new TextureLoader().load(url, () => made.dispatchEvent({ type: 'ready' } as never)));
      this.faces.set(url, tex);
    }
    if (tex.image) crop(tex);
    else tex.addEventListener('ready' as never, () => crop(tex));
    mat.uniforms.uMap.value = tex;
    const m = new Mesh(QUAD, mat);
    m.scale.set(b.w, b.h, 1);
    m.position.set(b.x + b.w / 2, -(b.y + b.h / 2), 0);
    add(m);
  }

  // The page's buttons over what was drawn: kept while the page holds the same ones (a redraw must not move the
  // focus), rebuilt when they change. The list's rows go in the scrolling box, where the first of them stands
  private sync(focus?: string) {
    const { page } = this;
    if (!page) return;
    const s = this.layer.stage.s,
      inside = this.hits.contains(document.activeElement); // read before a rebuild drops the focused button
    const shape = JSON.stringify(page.hits.map((h) => [h.id, h.row !== undefined]));
    if (shape !== this.shape) {
      this.shape = shape;
      this.buttons = new Map(page.hits.map((h) => [h.id, el('button', { type: 'button', 'data-id': h.id })]));
      const first = page.hits.findIndex((h) => h.row !== undefined);
      const out = (hits: Hit[]) => hits.filter((h) => h.row === undefined).map((h) => this.buttons.get(h.id)!);
      this.rows.replaceChildren(...page.hits.filter((h) => h.row !== undefined).map((h) => this.buttons.get(h.id)!));
      this.hits.replaceChildren(
        ...out(page.hits.slice(0, Math.max(0, first))),
        ...(first < 0 ? [] : [this.scroller]),
        ...out(page.hits.slice(Math.max(0, first))),
      );
    }
    const px = (b: Box) => ({ left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` });
    const lb = page.list && this.box(page.list.box);
    if (lb && page.list) {
      Object.assign(this.scroller.style, px(lb));
      this.rows.style.height = `${page.list.rows * page.list.rowH * s}px`;
    }
    for (const h of page.hits) {
      const b = this.buttons.get(h.id)!,
        at = this.box(h.box);
      Object.assign(b.style, px(lb && h.row !== undefined ? { ...at, x: at.x - lb.x, y: at.y - lb.y } : at));
      b.disabled = !!h.off;
      b.setAttribute('aria-label', h.name);
      b.toggleAttribute('aria-current', !!h.picked);
    }
    // the cursor: where asked, else where it was, else the picked row, else the first button that can be pressed
    const live = (id?: string) => (id && !this.buttons.get(id)?.disabled ? this.buttons.get(id) : undefined);
    const here = live(focus) ?? (focus === undefined && inside ? live(this.focus) : undefined);
    const to =
      here ?? live(page.hits.find((h) => h.picked && h.on === 'paper')?.id) ?? live(page.hits.find((h) => !h.off)?.id);
    if (to && to !== document.activeElement) {
      to.focus();
      land(this.gy, Number.NaN); // a new page: the glove lands where the cursor is
    }
    this.focus = to?.dataset.id ?? '';
  }

  frame(dt: number, time: number) {
    if (this.win && !this.win.overlay.isConnected) this.hide(); // closed from outside (Esc, the game)
    const { page, layer, glove } = this;
    if (!page) return false;
    const s = layer.stage.s,
      still = layer.still;
    move(this.open, dt, still, 240, 31);
    const o = clamp01(this.open.x);
    // the list: scrolled as its box is, a row fading out as it leaves the box
    const L = page.list,
      lb = L && this.box(L.box),
      scroll = this.scroller.scrollTop;
    this.list.position.y = scroll;
    const shown = (row?: number) => {
      if (row === undefined || !L || !lb) return 1;
      const top = row * L.rowH * s - scroll;
      return clamp01(1 - Math.max(0, -top, top + L.rowH * s - lb.h) / (0.4 * L.rowH * s));
    };
    for (const p of this.parts) alpha(p.mesh, p.a * o * shown(p.row));
    const past = this.scroller.scrollHeight - this.scroller.clientHeight - scroll;
    this.more.forEach((m, i) => void alpha(m, (i ? past : scroll) > 1 ? o : 0));
    for (const { mesh, hit } of this.plates) {
      const on = hit.id === this.focus,
        dark = hit.on === 'dark';
      const c = dark
        ? on
          ? this.lit.gold
          : hit.picked
            ? this.lit.picked
            : this.lit.plate
        : on
          ? this.lit.paper
          : this.lit.band;
      const u = (mesh.material as ShaderMaterial).uniforms;
      u.uColor.value.set(...c);
      u.uAlpha.value = o * shown(hit.row) * (dark ? (hit.off ? 0.55 : 0.94) : on ? 1 : hit.picked ? 0.55 : 0);
    }
    // the glove points at the button in focus from its left (inside a plaque, which starts at the page's edge)
    const hit = page.hits.find((h) => h.id === this.focus);
    const see = hit ? o * shown(hit.row) : 0;
    glove.group.visible = see > 0.004;
    if (hit) {
      const b = this.box(hit.box);
      this.gx.to = b.x + (hit.on === 'dark' && hit.box.x < T.hand ? 58 : -T.hand / 2 + 6) * s;
      this.gy.to = b.y + b.h / 2 - (hit.row === undefined ? 0 : scroll);
      if (Number.isNaN(this.gy.x)) {
        land(this.gx);
        land(this.gy);
      }
      move(this.gx, dt, still, 330, 25);
      move(this.gy, dt, still, 330, 25);
      const nudge = still ? 0 : Math.sin(time * 5.2) * 3.2 * s;
      glove.group.position.set(layer.snap(this.gx.x + nudge), -layer.snap(this.gy.x), 300);
      glove.group.scale.setScalar(T.hand * s * see);
    }
    return !still; // the glove sways for as long as the window shows
  }

  dispose() {
    this.hide();
    this.layer.remove(this);
    this.glove.dispose();
    this.paint.dispose();
    for (const tex of this.faces.values()) tex.dispose();
    this.host.remove();
  }
}
