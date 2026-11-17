// The battle HUD's corner menu drawn in 3D (localhost ?tools=3d or the ?ui=3d preset; Fernando, Nov 17: every piece of
// the interface in the 3D look, compared with FFT The Ivalice Chronicles), a screen of the shared 3D layer
// (ui3d/layer.ts): the menu button (3 bars) and the Back button as dark slate plates like the banner's pill, and the
// open list as a parchment panel like the command menu's (the reference has no corner menu; its System Menu is a hint
// of the paused battle, refs 12 and 26): a head, one row per tool with its glyph in the icon column, its name, its key
// on a cap and "on"/"off" for the two switches, the row under the mouse lit with the glove beside it.
//   Layout and input: the HTML menu (hud-tools.ts) stays in place, unseen (style.css .hud.tools3d .tools), at the
//   drawn sizes: it is the layout, and its real buttons take the mouse and the taps. A key closes the list and runs its
//   own action, as always. What the rows say is tool-rows.ts'.
import { Group, type Mesh, type ShaderMaterial } from 'three';
import { NONE, Part, PILL, type Quad, type Rgba, WHITE } from '../hints3d/hints3d.ts';
import { t } from '../i18n.ts';
import { alpha, clamp01, Icon, move } from '../menu3d/column.ts';
import { REF } from '../menu3d/menu-layout.ts';
import { toolRows } from '../tool-rows.ts';
import { capMeshes, capRun, capsWidth } from '../ui3d/caps.ts';
import type { Ui3dLayer, Ui3dScreen } from '../ui3d/layer.ts';
import type { Box } from '../ui3d/layout.ts';
import { paintTexture, paperMaterial, quad } from '../ui3d/panel.ts';
import { ease, land, settled, spring } from '../ui3d/spring.ts';
import { textMesh } from '../ui3d/text.ts';

const EDGE: Rgba = [0.82, 0.86, 0.92, 0.35];
const LIT: Rgba = [0.33, 0.37, 0.44, 0.95]; // the menu button while its list is open
const BAR: Rgba = [0.96, 0.95, 0.9, 1];
// text sizes in px of the reference (never under 16 px on the page; a key cap's letters 12)
const SIZE = { head: 24, row: 26, glyph: 26, state: 18, back: 28 };
const OVER = 40; // the list draws over the Height corner and the hints, which share the layer

export class Tools3d implements Ui3dScreen {
  readonly flat = new Group();
  readonly deep = new Group();
  private readonly buttons = new Part();
  private readonly list = new Part();
  private readonly paint = paintTexture();
  private readonly glove = new Icon(null, 'glove', undefined, 0.035);
  private readonly open = spring(0);
  private readonly focusY = spring(0);
  private readonly burger: HTMLElement;
  private readonly back: HTMLElement;
  private readonly menu: HTMLElement;
  private readonly watch = new MutationObserver(() => this.draw());
  private readonly ac = new AbortController();
  private paper?: Mesh;
  private at = { x: 0, y: 0 };
  private rows: Box[] = []; // each row from the list's top left; a row scrolled out of the list is left out
  private focus = -1;
  private rowH = 0;
  private glow = 0;

  // `host`: the HUD's .tools (the menu button, Back and the list); hidden by CSS (the sandbox's `hide`), the layer
  // hides the drawing with it
  constructor(
    private readonly layer: Ui3dLayer,
    readonly host: HTMLElement,
  ) {
    const find = (cls: string) => host.querySelector<HTMLElement>(cls)!;
    this.burger = find('.burger');
    this.back = find('.back');
    this.menu = find('.tools-menu');
    this.flat.add(this.buttons.group, this.list.group);
    this.glove.model.rotation.set(0.2, -0.3, 0);
    this.glove.group.visible = false;
    this.deep.add(this.glove.group);
    layer.root.classList.add('tools3d');
    // the list opening, Back showing and a switch turning are attributes of the HTML menu
    this.watch.observe(host, {
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden', 'aria-checked', 'aria-expanded'],
    });
    const point = (e: Event) => {
      const row = e.target instanceof Element ? e.target.closest('.item') : null;
      this.focus = row ? [...this.menu.children].indexOf(row) : -1;
      this.layer.wake();
    };
    const o = { signal: this.ac.signal };
    this.menu.addEventListener('pointerover', point, o);
    this.menu.addEventListener('focusin', point, o);
    this.menu.addEventListener('pointerleave', point, o);
    this.menu.addEventListener('scroll', () => this.draw(), o); // a phone lying down: the list scrolls
    layer.add(this);
  }

  resize() {
    this.buttons.key = this.list.key = '';
    this.draw();
  }

  private label(str: string, size: number, color: string, floor = 16) {
    const px = Math.max(floor, size * this.layer.s);
    return textMesh(str, { size: px, color, font: this.layer.theme.font }, this.layer.dpr) as Quad;
  }

  // Rebuilds only the part whose state or place changed
  private draw() {
    const { layer, buttons, list } = this,
      s = layer.s,
      page = layer.root.getBoundingClientRect();
    const rect = (e: Element, from = page): Box => {
      const r = e.getBoundingClientRect();
      return { x: r.left - from.left, y: r.top - from.top, w: r.width, h: r.height };
    };
    layer.wake();
    const open = !this.menu.hidden;
    const shown = [this.burger, this.back].filter((e) => e.offsetParent).map((e) => ({ e, r: rect(e) }));
    const key = JSON.stringify([shown.map((b) => b.r), open, layer.dpr, s]);
    buttons.want = 1;
    if (key !== buttons.key) {
      buttons.clear();
      buttons.key = key;
      for (const { e, r } of shown) {
        buttons.box(r.x, r.y, r.w, r.h, 10 * s, e === this.burger && open ? LIT : PILL, EDGE);
        const mid = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
        if (e === this.back) buttons.text(this.label('↩', SIZE.back, WHITE), mid.x, mid.y);
        else {
          // the 3 bars
          const w = r.w * 0.46,
            h = Math.max(2, Math.round(r.h * 0.07));
          for (const k of [-1, 0, 1])
            buttons.box(mid.x - w / 2, Math.round(mid.y + k * 2.4 * h - h / 2), w, h, h / 2, BAR, NONE);
        }
      }
    }

    this.open.to = list.want = open ? 1 : 0;
    if (!open) {
      this.focus = -1;
      return; // it keeps what it showed while it leaves
    }
    const box = rect(this.menu),
      items = [...this.menu.querySelectorAll<HTMLElement>('.item')],
      from = this.menu.getBoundingClientRect();
    // the head is the list's top border, which does not scroll; a row shows only while the whole of it is in the list
    const head = this.menu.clientTop,
      all = items.map((e) => rect(e, from)),
      seen = (r: Box) => r.y >= head - 1 && r.y + r.h <= box.h + 1,
      rows = all.map((r) => (seen(r) ? r : undefined)),
      on = items.map((e) => e.getAttribute('aria-checked') === 'true'),
      data = toolRows();
    this.at = { x: box.x, y: box.y };
    this.rows = rows as Box[];
    const lkey = JSON.stringify([box.w, box.h, rows, on, layer.dpr, s, layer.keys]);
    if (lkey === list.key || !all.length) return;
    this.drop();
    list.key = lkey;
    const { ink, inkSoft } = layer.theme,
      pad = 44 * s,
      iconW = REF.iconW * s;
    this.rowH = all[0].h;
    this.paper = quad(
      paperMaterial(this.paint, layer.theme, {
        w: box.w,
        h: box.h,
        pad,
        unit: s,
        head: head / s,
        iconW: REF.iconW,
        rows: [all[0].y / s, all[0].h / s, all.length],
        seed: 5,
      }),
      -pad,
      -pad,
      box.w + 2 * pad,
      box.h + 2 * pad,
      30 + OVER - 1,
    );
    list.group.add(this.paper);
    const left = (m: Quad, x: number, mid: number) => list.text(m, x + m.scale.x / 2, mid);
    left(this.label(t('Menu', 'Menu'), SIZE.head, inkSoft), 10 * s, head / 2 - s);
    // rows scrolled out above or below: an arrow on the head says so
    if (all.some((r) => r.y < head - 1)) list.text(this.label('▲', 16, inkSoft), box.w - 38 * s, head / 2);
    if (all.some((r) => r.y + r.h > box.h + 1)) list.text(this.label('▼', 16, inkSoft), box.w - 16 * s, head / 2);
    rows.forEach((r, i) => {
      const d = data[i];
      if (!d || !r) return;
      const mid = r.y + r.h / 2;
      list.text(this.label(d.glyph, SIZE.glyph, inkSoft), iconW / 2, mid);
      left(this.label(d.label, SIZE.row, ink), iconW + 8 * s, mid);
      // from the right edge: the key on its cap, then a switch's state in words (colour is never the only signal)
      let x = box.w - 12 * s;
      const caps = d.key && capMeshes(d.key, layer.keys, Math.max(20, 26 * s), layer.dpr, layer.theme.font);
      if (caps) {
        x -= capsWidth(caps, 4 * s);
        capRun((m, cx, cy) => list.text(m, cx, cy), caps, x, mid, 4 * s);
        x -= 10 * s;
      }
      if (d.toggle) {
        const state = this.label(on[i] ? t('ligado', 'on') : t('desligado', 'off'), SIZE.state, on[i] ? ink : inkSoft);
        left(state, x - state.scale.x, mid);
      }
    });
    for (const m of list.group.children) if (m !== this.paper) m.renderOrder += OVER;
  }

  private drop() {
    (this.paper?.material as ShaderMaterial | undefined)?.dispose();
    this.paper = undefined;
    this.list.clear();
  }

  frame(dt: number, time: number) {
    const { layer, list, glove } = this,
      s = layer.s,
      still = layer.still,
      e = still ? 10 : dt;
    move(this.open, dt, still, 300, 19); // a little under critical: the list drops a hair past its place and settles
    const o = this.open.x;
    let moving = this.buttons.fade(e);
    moving = list.fade(e) || moving;
    // the list drops in from a little above
    list.group.position.set(layer.snap(this.at.x), -layer.snap(this.at.y - (1 - clamp01(o)) * 12 * s), 0);
    const row = this.rows[this.focus];
    if (row) {
      this.focusY.to = row.y + row.h / 2;
      if (this.glow < 0.02) land(this.focusY); // the band appears on its row, it does not fly in
      move(this.focusY, dt, still, 420, 30);
    }
    this.glow = ease(this.glow, row ? 1 : 0, e, 14);
    if (this.paper) {
      alpha(this.paper, list.alpha);
      const u = (this.paper.material as ShaderMaterial).uniforms;
      u.uTime.value = time;
      u.uLift.value = clamp01(o);
      u.uFocus.value.set(this.focusY.x / s, this.rowH / s, this.glow, 0);
    }
    // the glove points at the row under the mouse
    const shown = this.glow * list.alpha;
    glove.group.visible = shown > 0.004;
    if (glove.group.visible) {
      const nudge = still ? 0 : Math.sin(time * 5.2) * 3.2 * s;
      glove.group.position.set(
        layer.snap(this.at.x - (REF.hand / 2) * s + nudge),
        -layer.snap(this.at.y + this.focusY.x),
        300,
      );
      glove.group.scale.setScalar(REF.hand * s * shown);
    }
    return !still && (moving || !settled(this.open) || glove.group.visible);
  }

  dispose() {
    this.layer.remove(this);
    this.watch.disconnect();
    this.ac.abort();
    this.buttons.clear();
    this.drop();
    this.glove.dispose();
    this.paint.dispose();
    this.layer.root.classList.remove('tools3d');
  }
}
