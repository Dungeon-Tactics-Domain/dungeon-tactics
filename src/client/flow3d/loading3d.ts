// The loading screen in 3D (Fernando, Nov 18), drawn on a layer of its own over the loading cover (loading.ts) while
// the game downloads: the count of files in the theme's serif over a bar, in the result's dark tokens. The game's own
// layer does not exist yet (the HUD that owns it is only built once everything landed), so this one lives for the
// download alone and leaves with the cover. It ticks on the page's frames: there is no battle clock yet.
import { Group } from 'three';
import { Part } from '../hints3d/hints3d.ts';
import { loadingLayout } from '../ready-gate.ts';
import type { Ui3dLayer, Ui3dScreen } from '../ui3d/layer.ts';
import { ease } from '../ui3d/spring.ts';
import { type Colors, colors, label, put, rgba } from './draw.ts';

export class Loading3d implements Ui3dScreen {
  readonly flat = new Group();
  private readonly color: Colors;
  private readonly fixed = new Part(); // the line and the bar's track
  private readonly fill = new Part();
  private line = '';
  private share = 0;
  private button?: HTMLButtonElement; // Reload, when the load failed
  private shown = -1; // the share the fill was last drawn at
  private live = true;

  constructor(private readonly layer: Ui3dLayer) {
    this.color = colors(layer);
    this.flat.add(this.fixed.group, this.fill.group);
    this.fixed.want = this.fill.want = 1;
    layer.add(this, 'loading');
    const tick = (now: number) => {
      if (!this.live) return;
      layer.frame(now);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // `share`: 0 to 1 of the files; `line`: what the cover says; `button`: Reload, once the load failed
  set(share: number, line: string, button?: HTMLButtonElement) {
    this.share = share;
    if (line !== this.line || button !== this.button) {
      this.line = line;
      this.button = button;
      this.resize();
    }
    this.layer.wake();
  }

  resize() {
    const { layer, fixed, color: c } = this,
      L = loadingLayout(layer.w, layer.h, layer.s);
    fixed.clear();
    put(fixed, label(layer, layer.s, this.line, 22, c.text), L.line.x, L.line.y, 'centre', layer.w - 32);
    const k = L.button,
      button = this.button;
    if (button) {
      // the title's colour on its edge: the one control, and the one in focus
      fixed.box(k.x, k.y, k.w, k.h, 8 * layer.s, rgba(c.plate, 1), rgba(c.title, 1));
      put(
        fixed,
        label(layer, layer.s, button.textContent ?? '', 22, c.title),
        k.x + k.w / 2,
        k.y + k.h / 2,
        'centre',
        k.w - 16,
      );
      button.style.cssText = `position: absolute; z-index: 2; left: ${k.x}px; top: ${k.y}px; width: ${k.w}px; height: ${k.h}px`;
    } else fixed.box(L.bar.x, L.bar.y, L.bar.w, L.bar.h, L.bar.h / 2, rgba(c.band, 1), rgba(c.line, 0.9));
    this.shown = -1;
    layer.wake();
  }

  frame(dt: number) {
    const { layer, fill } = this,
      still = layer.still;
    // reduced motion: the bar jumps to its place
    const at = still || this.shown < 0 ? this.share : ease(this.shown, this.share, dt, 10);
    const moving = Math.abs(at - this.share) > 0.002;
    if (at !== this.shown) {
      const L = loadingLayout(layer.w, layer.h, layer.s);
      fill.clear();
      if (at > 0 && !this.button)
        fill.box(L.bar.x, L.bar.y, Math.max(L.bar.h, L.bar.w * at), L.bar.h, L.bar.h / 2, rgba(this.color.title, 1));
      this.shown = at;
    }
    // no fade in: the screen is there on its first frame
    const fading = [this.fixed, fill].map((p) => p.fade(10)).some(Boolean);
    return moving || fading;
  }

  // with its layer: nothing else draws on it
  dispose() {
    if (!this.live) return;
    this.live = false;
    this.fixed.clear();
    this.fill.clear();
    this.layer.remove(this);
    this.layer.dispose();
  }
}
