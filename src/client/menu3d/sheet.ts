// The ability sheet of the 3D command menu (menu3d.ts): who has the ability on the head, its icon turning on its tile,
// its name, and one page of its numbers at a time under the page's title, with the page counter on the foot. Places are
// px of the 1920x1080 layout (menu-layout.ts REF) times the page's scale.
import { Group, type Mesh, type ShaderMaterial } from 'three';
import type { Ui3dLayer } from '../ui3d/layer.ts';
import { REGIONS } from '../ui3d/layout.ts';
import { bandMaterial, paperMaterial, quad, type Rgb } from '../ui3d/panel.ts';
import { land, pageStep, settled, spring } from '../ui3d/spring.ts';
import { dropText } from '../ui3d/text.ts';
import { alpha, type Ctx, clamp01, Icon, label, move, REST } from './column.ts';
import { REF } from './menu-layout.ts';
import type { SheetView } from './menu-view.ts';

export class Sheet {
  readonly ui = new Group();
  readonly icons = new Group();
  readonly open = spring();
  readonly page = spring(); // counts turns without wrapping, so the last page slides on to the first
  want = 0;
  private at = 0; // the page it is going to
  private count = 1;
  private kick = 0; // 1 when another ability took the sheet, fading: the icon jumps and the name settles in
  private key = '';
  private paper?: ShaderMaterial;
  private fixed: Mesh[] = []; // bands and the head's text: they only fade with the sheet
  private texts: Mesh[] = [];
  private name?: Mesh;
  private pages: { m: Mesh; x: number; i: number }[] = [];
  private counter: Mesh[] = [];
  private icon?: Icon;
  private emblem?: Icon;

  set(d: SheetView, ctx: Ctx) {
    const { layer } = ctx,
      s = layer.s;
    const { page, ...what } = d;
    const key = JSON.stringify([what, s, layer.dpr]);
    // another ability opens on the page asked for; the same one turns to it
    this.count = d.pages.length;
    this.page.to += pageStep(this.at, page, this.count);
    this.at = page;
    if (key === this.key) return;
    land(this.page);
    this.kick = this.key ? 1 : 0;
    this.clear();
    this.key = key;
    const w = REGIONS.detail.w * s,
      h = REGIONS.detail.h * s,
      pad = 44 * s;
    const { ink, inkSoft, shade, band: dark } = layer.theme;
    this.paper = paperMaterial(ctx.paint, layer.theme, {
      w,
      h,
      pad,
      unit: s,
      head: 47,
      foot: REF.sheetFoot,
      seed: 5.3,
    });
    this.ui.add(quad(this.paper, -pad, -pad, w + 2 * pad, h + 2 * pad, 30));
    const band = (x: number, y: number, bw: number, bh: number, color: Rgb) => {
      const m = quad(bandMaterial(bw * s, bh * s, s, color), x * s, y * s, bw * s, bh * s, 31);
      this.fixed.push(m);
      this.ui.add(m);
    };
    band(117, 60, 267, 46, shade); // under the name
    band(16, 167, 368, 33, dark); // under the page's title
    const put = (m: Mesh, x: number, mid: number) => {
      m.position.set(x * s + m.scale.x / 2, -mid * s, 0);
      m.renderOrder = 32;
      this.texts.push(m);
      this.ui.add(m);
      return m;
    };
    this.fixed.push(put(label(ctx, d.owner, 25, inkSoft), 52, 23));
    this.name = put(label(ctx, d.name, 28, ink), 126, 83);
    d.pages.forEach((p, i) => {
      // on the darkest band only the full ink reads (4.9:1; the soft one 3.6:1)
      const title = put(label(ctx, p.title, 21, ink), 24, 183.5);
      const body = label(ctx, p.text, 25, ink, 356 * s, 39);
      put(body, 20, 208 + body.scale.y / s / 2);
      this.pages.push({ m: title, x: title.position.x, i }, { m: body, x: body.position.x, i });
      const n = label(ctx, `‹  ${i + 1} / ${d.pages.length}  ›`, 22, inkSoft);
      this.counter.push(put(n, 200 - n.scale.x / s / 2, 541));
    });
    this.icon = new Icon('tile', d.kind, d.element);
    this.icon.group.position.set(layer.snap(61 * s), -layer.snap(107 * s), 0);
    this.emblem = new Icon(null, 'gem');
    this.emblem.group.position.set(layer.snap(29 * s), -layer.snap(23 * s), 0);
    this.icons.add(this.icon.group, this.emblem.group);
  }

  frame(dt: number, time: number, layer: Ui3dLayer, x: number, y: number) {
    const still = layer.still,
      s = layer.s,
      n = this.count;
    this.open.to = this.want;
    move(this.open, dt, still, 210, 21);
    move(this.page, dt, still, 190, 21);
    this.kick = still ? 0 : this.kick * Math.exp(-dt * 8);
    const o = this.open.x,
      a = clamp01(o * 1.8);
    this.ui.visible = this.icons.visible = a > 0.004 && !!this.paper;
    if (!this.paper) return;
    // comes in from the right edge it sits against
    for (const g of [this.ui, this.icons])
      g.position.set(layer.snap(x + 30 * s * (1 - o)), -layer.snap(y), g === this.icons ? 200 : 0);
    this.paper.uniforms.uAlpha.value = a;
    this.paper.uniforms.uLift.value = 0.35;
    for (const m of this.fixed) alpha(m, a);
    if (this.name) {
      alpha(this.name, a * (1 - 0.8 * this.kick));
      this.name.position.y = -(83 - 7 * this.kick) * s;
    }
    // the page in view sits still; the one leaving slides out to its side and fades, the one coming slides in. A page
    // out of view is not drawn at all
    const near = (i: number) => ((((i - this.page.x + n / 2) % n) + n) % n) - n / 2;
    const show = (m: Mesh, v: number) => {
      m.visible = v > 0.004;
      alpha(m, v);
    };
    for (const p of this.pages) {
      const off = near(p.i);
      p.m.position.x = p.x + off * 90 * s;
      show(p.m, a * clamp01(1 - Math.abs(off) * 1.5) * (1 - 0.8 * this.kick));
    }
    this.counter.forEach((m, i) => show(m, Math.abs(near(i)) < 0.5 ? a : 0));
    const size = clamp01(o * 1.4);
    if (this.icon) {
      this.icon.group.scale.setScalar(90 * s * size * (1 + 0.14 * this.kick));
      this.icon.model.rotation.y = REST[1] + layer.turn(still ? 0 : time * 1.5);
      this.icon.model.position.y = still ? 0 : 0.03 * Math.sin(time * 2.4);
    }
    if (this.emblem) {
      this.emblem.group.scale.setScalar(27 * s * size);
      this.emblem.model.rotation.y = layer.turn(still ? 0 : time * 0.9);
    }
  }

  get busy() {
    return !settled(this.open) || !settled(this.page) || this.kick > 0.01;
  }

  clear() {
    this.icon?.dispose();
    this.emblem?.dispose();
    for (const m of this.texts) dropText(m);
    for (const m of [...this.ui.children] as Mesh[]) {
      m.removeFromParent();
      (m.material as ShaderMaterial).dispose();
    }
    this.fixed = [];
    this.texts = [];
    this.pages = [];
    this.counter = [];
    this.icon = this.emblem = undefined;
    this.name = undefined;
    this.paper = undefined;
    this.key = '';
  }
}
