// A column of the 3D command menu (menu3d.ts): the menu or the Agir list, as a parchment panel with a row per command or
// ability, each with its text and a low-poly icon standing on a plate. Built from data (menu-view.ts) at places the
// layout gives (menu-layout.ts); rebuilt only when what it shows changes, while the focus and every motion are state of
// the frame: springs for the opening and the focus band, eases for the glow and the lift.
import { Group, Mesh, type ShaderMaterial, type Texture } from 'three';
import type { Element } from '../../shared/battle/units.ts';
import { iconMaterial } from '../ui3d/icons.ts';
import type { Ui3dLayer } from '../ui3d/layer.ts';
import { textPx } from '../ui3d/layout.ts';
import { bandMaterial, paperMaterial, quad, type Rgb } from '../ui3d/panel.ts';
import { land, type Spring, settled, spring, stepSpring } from '../ui3d/spring.ts';
import { dropText, textMesh } from '../ui3d/text.ts';
import { REF } from './menu-layout.ts';
import type { MenuRow } from './menu-view.ts';
import { dropModel, type ModelKind, type Plate, takeModel } from './models.ts';

// what the columns draw with
export interface Ctx {
  layer: Ui3dLayer;
  s?: number; // a scale of its own instead of the layer's (the columns on touch: menu-layout.ts touchScale)
  paint: Texture; // the panels' painted detail (ui3d/panel.ts)
}
export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const MOVE_BLUE: Rgb = [0.29, 0.56, 0.89];
export const alpha = (m: Mesh, a: number) => ((m.material as ShaderMaterial).uniforms.uAlpha.value = a);
// reduced motion: the spring is already where it is going
export function move(sp: Spring, dt: number, still: boolean, k?: number, c?: number) {
  if (still) land(sp);
  else stepSpring(sp, dt, k, c);
}
// Text in the theme's serif. `size` is in px of the 1080p layout; on the page it never goes under 16 px, the game's
// minimum (design system, section 8)
export function label(
  { layer, s = layer.s }: Ctx,
  str: string,
  size: number,
  color: string,
  width?: number,
  line?: number,
) {
  const px = textPx(size, s);
  return textMesh(
    str,
    { size: px, color, font: layer.theme.font, width, line: line && Math.max(line * s, px * 1.3) },
    layer.dpr,
  );
}

// A model standing on its plate (a dark disc for a command, a red tile for an ability; none for the glove and the
// emblem). The plate stays flat; the model rests a little turned so its depth shows, and sways or spins on top
export const REST: [number, number] = [0.24, -0.42];
export class Icon {
  readonly group = new Group();
  readonly model: Mesh;
  private readonly mats: ShaderMaterial[] = [];
  constructor(
    private readonly plate: Plate | null,
    private readonly kind: ModelKind,
    private readonly element?: Element,
    outline = 0,
  ) {
    if (plate) this.group.add(this.mesh(plate));
    this.model = this.mesh(kind, element);
    if (outline) this.model.add(this.mesh(kind, element, outline));
    if (plate) {
      this.model.scale.setScalar(0.74);
      this.model.position.z = 0.6; // clear of the plate at any turn
    }
    this.model.rotation.set(REST[0], REST[1], 0);
    this.group.add(this.model);
  }
  private mesh(kind: ModelKind, element?: Element, hull = 0) {
    const mat = iconMaterial(hull);
    this.mats.push(mat);
    return new Mesh(takeModel(kind, element), mat);
  }
  tone(gray: number, flash: number) {
    for (const m of this.mats) {
      m.uniforms.uGray.value = gray;
      m.uniforms.uFlash.value = flash;
    }
  }
  dispose() {
    this.group.removeFromParent();
    for (const m of this.mats) m.dispose();
    // one take per mesh: the plate, the model and its outline
    if (this.plate) dropModel(this.plate);
    for (let i = this.plate ? 1 : 0; i < this.mats.length; i++) dropModel(this.kind, this.element);
  }
}

export interface ColumnData {
  title: string;
  w: number; // page px
  h: number;
  rows: MenuRow[];
}

// `data` is what the column last showed, kept while it closes
export class Column {
  readonly ui = new Group();
  readonly icons = new Group();
  readonly open = spring();
  readonly focusY = spring();
  // px off its place, settling to 0: a list sliding over from the next column (menu3d.ts, a third column opening)
  readonly shift = spring();
  want = 0; // 1 open, 0 closed; `open` follows it once `hold` runs out
  hold = 0; // seconds a confirmed column stays up, so its flash is seen before it leaves
  flash = 0;
  focus = -1;
  glow = 0; // how lit the focus band is, eased to 1 as the column opens
  x = 0;
  y = 0;
  data: ColumnData | null = null;
  private key = '';
  private paper?: ShaderMaterial;
  private texts: Mesh[] = [];
  private rows: { label: Mesh; x: number; icon: Icon }[] = [];
  private lift: number[] = [];
  private s = 1;

  constructor(
    private readonly plate: 'disc' | 'tile',
    private readonly order: number,
    private readonly z: number,
    private readonly seed: number,
  ) {}

  // the focused row's middle, from the panel's top
  get rowY() {
    return this.focus < 0 ? 0 : (REF.head + (this.focus + 0.5) * REF.row) * this.s;
  }

  set(d: ColumnData, ctx: Ctx) {
    const { layer } = ctx;
    const s = (this.s = ctx.s ?? layer.s);
    const key = JSON.stringify([d, s, layer.dpr]);
    this.data = d;
    if (key === this.key) return;
    this.clear();
    this.key = key;
    const pad = 44 * s;
    const { ink, inkSoft, inkOff } = layer.theme;
    this.paper = paperMaterial(ctx.paint, layer.theme, {
      w: d.w,
      h: d.h,
      pad,
      unit: s,
      head: REF.head,
      iconW: REF.iconW,
      rows: [REF.head, REF.row, d.rows.length],
      seed: this.seed,
    });
    this.ui.add(quad(this.paper, -pad, -pad, d.w + 2 * pad, d.h + 2 * pad, this.order));
    const put = (m: Mesh, x: number, mid: number) => {
      m.position.set(x + m.scale.x / 2, -mid, 0);
      m.renderOrder = this.order + 1;
      this.texts.push(m);
      this.ui.add(m);
      return m;
    };
    put(label(ctx, d.title, 24, inkSoft), 10 * s, (REF.head / 2 - 1) * s);
    d.rows.forEach((r, i) => {
      const mid = (REF.head + (i + 0.5) * REF.row) * s;
      // a greyed row's note says what is missing: it stays readable (soft ink), only the name fades. `below`: the note is
      // a line under the name (the Agir list's reason, Fernando's grill of Nov 19), so a long one never pushes the name out
      const below = r.below && !!r.note;
      const left = (REF.iconW + 8) * s;
      const width = d.w - (REF.iconW + 8 + 7 + 12) * s;
      const note = r.note ? label(ctx, r.note, below ? 18 : 20, inkSoft) : null;
      if (note && below) note.scale.multiplyScalar(Math.min(1, width / note.scale.x));
      if (note) put(note, below ? left : d.w - 12 * s - note.scale.x, below ? mid + 13 * s : mid + s);
      // a long name beside a note shrinks to the room left (a small page: the 16 px floor widens the text, not the row)
      const name = label(ctx, r.label, below ? 26 : 30, r.off ? inkOff : ink);
      const room = width - (note && !below ? note.scale.x + 10 * s : 0);
      name.scale.multiplyScalar(Math.min(1, room / name.scale.x));
      const text = put(name, left, below ? mid - 9 * s : mid);
      if (r.gauge !== undefined) {
        // Move's bar along the row's foot: the track in the panel's shade, the half tiles left in the walk marks' blue
        const y = mid + 17 * s,
          h = 5 * s;
        const bar = (w: number, c: Rgb, o: number) => {
          const m = quad(bandMaterial(w, h, s, c), left, y, w, h, o);
          this.texts.push(m);
          this.ui.add(m);
        };
        bar(width, layer.theme.shade, this.order + 1);
        if (r.gauge > 0) bar(width * clamp01(r.gauge), MOVE_BLUE, this.order + 2);
      }
      const icon = new Icon(r.plate ?? this.plate, r.kind, r.element);
      icon.group.position.set(layer.snap((REF.iconW * s) / 2), -layer.snap(mid), 0);
      this.icons.add(icon.group);
      this.rows.push({ label: text, x: text.position.x, icon });
    });
    this.lift.length = d.rows.length;
  }

  // `slide`: px to the left of its place while closed (the submenu comes out of the menu); `rise`: how far it stands off
  // the screen (shadow); `active`: its focus is the one the player moves
  frame(dt: number, time: number, layer: Ui3dLayer, slide: number, rise: number, active: boolean) {
    const still = layer.still;
    if (this.hold > 0) this.hold -= dt;
    else this.open.to = this.want;
    move(this.open, dt, still, 300, 19); // under-damped: the column pops a little past its size and settles
    this.focusY.to = this.rowY;
    move(this.focusY, dt, still, 420, 30);
    move(this.shift, dt, still, 300, 30);
    this.flash = still ? 0 : this.flash * Math.exp(-dt * 9);
    const ease = still ? 1 : 1 - Math.exp(-dt * 14);
    this.glow += (1 - this.glow) * ease;
    const o = this.open.x,
      a = clamp01(o * 2.2),
      size = 0.86 + 0.14 * o,
      s = this.s,
      d = this.data;
    this.ui.visible = this.icons.visible = a > 0.004 && !!d;
    if (!d || !this.paper) return;
    // scaled about the middle of its left edge, where it hangs from the menu
    const left = layer.snap(this.x + this.shift.x - slide * (1 - o)),
      top = layer.snap(this.y + (d.h / 2) * (1 - size) + 10 * s * (1 - clamp01(o)));
    for (const g of [this.ui, this.icons]) {
      g.position.set(left, -top, g === this.icons ? this.z : 0);
      g.scale.setScalar(size);
    }
    const u = this.paper.uniforms;
    u.uAlpha.value = a;
    u.uLift.value = rise * clamp01(o);
    u.uTime.value = time;
    u.uFocus.value.set(this.focusY.x / s, REF.row, this.focus < 0 ? 0 : this.glow, this.flash);
    for (const m of this.texts) alpha(m, a);
    this.rows.forEach((row, i) => {
      const on = i === this.focus ? 1 : 0;
      const lift = (this.lift[i] = (this.lift[i] ?? 0) + (on * (active ? 1 : 0) - (this.lift[i] ?? 0)) * ease);
      row.label.position.x = row.x + 7 * s * lift;
      // the focused icon rises off its plate, sways and bobs; a confirmed one jumps
      const hit = this.flash * on;
      row.icon.group.scale.setScalar(REF.icon * s * clamp01(o * 1.5) * (1 + 0.18 * lift + 0.3 * hit));
      row.icon.model.rotation.y = REST[1] + layer.turn(Math.sin(time * 2.6) * 0.62 * lift);
      row.icon.model.position.y = still ? 0 : 0.05 * lift * Math.sin(time * 5.2);
      row.icon.tone(d.rows[i].off ? 1 : 0, hit * 0.55);
    });
  }

  // the row in focus lands where it is, lit: a column opens with its row already chosen
  settleFocus() {
    land(this.focusY, this.rowY);
    this.glow = 1;
  }

  get busy() {
    return this.hold > 0 || !settled(this.open) || !settled(this.focusY) || !settled(this.shift) || this.flash > 0.01;
  }

  clear() {
    for (const row of this.rows) row.icon.dispose();
    for (const m of this.texts) dropText(m);
    for (const m of [...this.ui.children] as Mesh[]) {
      m.removeFromParent();
      (m.material as ShaderMaterial).dispose();
    }
    this.rows = [];
    this.texts = [];
    this.paper = undefined;
    this.key = '';
  }
}
