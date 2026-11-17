// The town's speech box drawn in 3D (?talk=3d, the default), a screen of the town's 3D layer after the dialogue of FFT:
// The Ivalice Chronicles (labs refs/fft-ivalice/66 to 68): a parchment box with the speaker's name on a dark plaque
// over its top left corner, the words in the paper's ink, the ▼ when the sentence is out.
//   State and input: the box of talk.ts stays as it is, unseen but for the painted face, which shows over the
//   parchment as it is (its mouth, its hop and the portrait that stands in for it are the box's own). The box types the
//   words, takes Enter, the click, the pad and Esc, and is what a screen reader hears; this screen only copies what it
//   shows, where it shows it. The opening narration (`dark`) and a page too small for the drawing keep the HTML box.
import { Group, type Mesh, type ShaderMaterial } from 'three';
import { colors, label, lift, rgba } from '../flow3d/draw.ts';
import { Part, type Quad } from '../hints3d/hints3d.ts';
import { setTalk3d } from '../talk.ts';
import type { Ui3dLayer, Ui3dScreen } from '../ui3d/layer.ts';
import type { Box } from '../ui3d/layout.ts';
import { paintTexture, paperMaterial, quad } from '../ui3d/panel.ts';
import { dropText, textMesh } from '../ui3d/text.ts';

const OVER = 40; // over the town's HUD pieces, which share the layer

export class Talk3d implements Ui3dScreen {
  readonly flat = new Group();
  private readonly fixed = new Part(); // the name's plaque, the hints, Skip, the ▼
  private readonly paint = paintTexture();
  private readonly color;
  private readonly watch = new MutationObserver(() => {
    this.stale = true;
    this.layer.wake();
  });
  private overlay?: HTMLElement;
  private paper?: Mesh;
  private words?: Quad;
  private stale = false;

  constructor(
    private readonly layer: Ui3dLayer,
    private readonly fits: () => boolean,
  ) {
    this.color = colors(layer);
    this.flat.add(this.fixed.group);
    this.fixed.want = 1;
    layer.add(this);
    setTalk3d((overlay) => this.take(overlay));
  }

  // a conversation opened: its box goes unseen and is drawn here until it closes
  private take(overlay: HTMLElement) {
    if (!this.fits()) return;
    this.overlay = overlay;
    overlay.classList.add('talk3d');
    this.watch.observe(overlay, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'hidden'],
    });
    overlay.addEventListener('focusin', () => this.resize());
    overlay.addEventListener('focusout', () => this.resize());
    this.resize();
  }

  resize() {
    this.fixed.key = '';
    this.stale = true;
    this.layer.wake();
  }

  private clear() {
    this.watch.disconnect();
    this.overlay?.classList.remove('talk3d');
    this.overlay = undefined;
    this.fixed.clear();
    if (this.words) dropText(this.words);
    (this.paper?.material as ShaderMaterial | undefined)?.dispose();
    this.paper?.removeFromParent();
    this.paper = this.words = undefined;
    this.layer.wake();
  }

  private draw() {
    const { layer, overlay, fixed, color: c } = this;
    if (!overlay) return;
    const s = layer.s,
      page = layer.root.getBoundingClientRect(),
      find = (cls: string) => overlay.querySelector<HTMLElement>(cls);
    const rect = (e: Element): Box => {
      const r = e.getBoundingClientRect();
      return { x: r.left - page.left, y: r.top - page.top, w: r.width, h: r.height };
    };
    const box = find('.panel.talk'),
      body = find('.talk-text'),
      name = find('.talk-name'),
      keys = find('.talk-keys'),
      skip = find('.talk-skip'),
      title = find('.talk-title');
    if (!box || !body) return;
    const b = rect(box),
      done = box.classList.contains('done'),
      who = name && !name.hidden ? (name.textContent ?? '') : '',
      focus = document.activeElement;
    const key = JSON.stringify([b, who, done, focus === skip, title?.textContent, layer.dpr, s]);
    if (key !== fixed.key) {
      fixed.clear();
      fixed.key = key;
      (this.paper?.material as ShaderMaterial | undefined)?.dispose();
      this.paper?.removeFromParent();
      const pad = 44 * s;
      this.paper = quad(
        paperMaterial(this.paint, layer.theme, { w: b.w, h: b.h, pad, unit: s, seed: 7 }),
        b.x - pad,
        b.y - pad,
        b.w + 2 * pad,
        b.h + 2 * pad,
        30 + OVER - 1,
      );
      this.flat.add(this.paper);
      const plate = (r: Box, str: string, size: number, hex: string, lit = false) => {
        fixed.box(r.x, r.y, r.w, r.h, 8 * s, rgba(lit ? c.line : c.plate, 0.96), rgba(c.line, 0.9));
        const m = label(layer, s, str, size, hex);
        m.scale.multiplyScalar(Math.min(1, (r.w - 12 * s) / m.scale.x));
        fixed.text(m, r.x + r.w / 2, r.y + r.h / 2);
      };
      // the speaker's name: a dark plaque over the box's top left corner, where the HTML tab stands
      if (who && name) plate(rect(name), who, 30, c.title);
      if (title) plate(rect(title), title.textContent ?? '', 30, c.text);
      if (skip) plate(rect(skip), skip.textContent ?? '', 24, c.text, focus === skip);
      const { inkSoft } = layer.theme;
      if (keys?.offsetParent) {
        const k = rect(keys),
          m = label(layer, s, keys.textContent ?? '', 20, inkSoft);
        fixed.text(m, k.x + k.w - m.scale.x / 2, k.y + k.h / 2);
      }
      if (done) fixed.text(label(layer, s, '▼', 22, inkSoft), b.x + b.w - 26 * s, b.y + b.h - 22 * s);
      lift(fixed, OVER);
    }
    // the words, as far as the box has typed them, at the box's own text size and never under 16 px
    const str = body.textContent ?? '',
      at = rect(body),
      px = Math.max(16, Number.parseFloat(getComputedStyle(body).fontSize));
    const old = this.words; // dropped after the new one is made, so the same words keep their texture
    this.words = undefined;
    if (old) queueMicrotask(() => dropText(old));
    if (!str) return;
    // ponytail: one texture per letter typed (~35 a second for a sentence); one canvas redrawn in place if it ever shows
    const m = textMesh(
      str,
      { size: px, color: layer.theme.ink, font: layer.theme.font, width: at.w, line: px * 1.35 },
      layer.dpr,
    ) as Quad;
    m.scale.multiplyScalar(Math.min(1, (b.y + b.h - at.y - 8 * s) / m.scale.y));
    m.position.set(at.x + m.scale.x / 2, -(at.y + m.scale.y / 2), 0);
    m.renderOrder = 31 + OVER;
    this.words = m;
    this.flat.add(m);
  }

  frame(dt: number) {
    if (this.overlay && !this.overlay.isConnected) this.clear(); // the conversation ended
    if (!this.overlay) return false;
    if (this.stale) {
      this.stale = false;
      this.draw();
    }
    return this.fixed.fade(this.layer.still ? 10 : dt * 3);
  }

  dispose() {
    setTalk3d();
    this.clear(); // the layer went (a lost context): a box on screen is the HTML one again
    this.layer.remove(this);
    this.paint.dispose();
  }
}
