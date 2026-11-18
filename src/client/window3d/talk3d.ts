// The speech box drawn in 3D (?talk=3d, the default), a screen of the 3D layer of the town and of the battle alike,
// after the dialogue of FFT: The Ivalice Chronicles (labs refs/fft-ivalice/66 to 68): a parchment box with the
// speaker's name on a dark plaque over its top left corner, the words in the paper's ink, the ▼ when the sentence is
// out. The opening narration (`dark`) has no box: the page goes to night under the Beacon's blue glow, which breathes
// (still under Reduce motion), and the words stand large in its middle, with Skip drawn at the foot for a finger.
//   State and input: the box of talk.ts stays as it is, unseen but for the painted face, which shows over the
//   parchment as it is (its mouth, its hop and the portrait that stands in for it are the box's own). The box types the
//   words, takes Enter, the click, the pad and Esc, and is what a screen reader hears; this screen only copies what it
//   shows, where it shows it, at any size of page: its boxes are the HTML's own, which already fit a phone.
//   style.css is not this file's to change while the HTML look still lives there: what the narration needs unseen
//   or moved is set on the elements here, and taken back when the drawing goes.
import { Group, type Mesh, ShaderMaterial, Vector2 } from 'three';
import { colors, label, lift, rgba } from '../flow3d/draw.ts';
import { Part, type Quad } from '../hints3d/hints3d.ts';
import { setTalk3d } from '../talk.ts';
import type { Ui3dLayer, Ui3dScreen } from '../ui3d/layer.ts';
import type { Box } from '../ui3d/layout.ts';
import { paintTexture, paperMaterial, QUAD_VERT, quad, type Rgb } from '../ui3d/panel.ts';
import { dropText, textMesh } from '../ui3d/text.ts';

const OVER = 40; // over the HUD's own pieces, which share the layer

// the narration's night: the veil with the Beacon's glow a third of the way down, `uGlow` its strength
const NIGHT_FRAG = `
precision highp float;
varying vec2 vUv;
uniform vec2 uSize;
uniform vec3 uVeil;
uniform float uGlow;
void main() {
  float d = length((vUv - vec2(0.5, 0.7)) * uSize) / length(uSize);
  gl_FragColor = vec4(mix(uVeil, vec3(0.35, 0.67, 1.0), uGlow * (1.0 - smoothstep(0.0, 0.4, d))), 0.96);
}`;
const GLOW = 0.3;
// where Skip stands in the narration, which the HTML one leaves out: the page's bottom right corner
const SKIP_AT = 'display:block;position:fixed;right:24px;bottom:calc(24px + env(safe-area-inset-bottom, 0px))';

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
  private dark = false;
  private paper?: Mesh; // the parchment, or the narration's night
  private readonly release: () => void;
  private words?: Quad;
  private stale = false;

  constructor(private readonly layer: Ui3dLayer) {
    this.color = colors(layer);
    this.flat.add(this.fixed.group);
    this.fixed.want = 1;
    layer.add(this);
    this.release = setTalk3d((overlay) => this.take(overlay));
  }

  // a conversation opened: its box goes unseen and is drawn here until it closes
  private take(overlay: HTMLElement) {
    // a full screen holds the layer (the title, Options): the HTML box shows over it. Its own hold is the conversation
    // before this one, which the next frame would have let go
    if (this.layer.solo && this.layer.solo !== this) return;
    if (this.overlay) this.clear();
    this.overlay = overlay;
    this.dark = overlay.classList.contains('dark');
    overlay.classList.add('talk3d');
    this.layer.solo = this; // the HUD's own 3D pieces stay out, as the HUD does while someone talks
    if (this.dark) {
      overlay.style.animation = 'none'; // the HTML night's pulse, which would tint the page over the drawn one
      overlay.querySelector<HTMLElement>('.talk-skip')?.setAttribute('style', SKIP_AT);
    }
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
    this.overlay?.style.removeProperty('animation');
    this.overlay?.querySelector('.talk-skip')?.removeAttribute('style');
    this.overlay = undefined;
    if (this.layer.solo === this) this.layer.solo = undefined;
    this.fixed.clear();
    if (this.words) dropText(this.words);
    (this.paper?.material as ShaderMaterial | undefined)?.dispose();
    this.paper?.removeFromParent();
    this.paper = this.words = undefined;
    this.layer.wake();
  }

  private draw() {
    const { layer, overlay, fixed, dark, color: c } = this;
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
      this.paper = dark
        ? quad(
            new ShaderMaterial({
              vertexShader: QUAD_VERT,
              fragmentShader: NIGHT_FRAG,
              transparent: true,
              depthTest: false,
              depthWrite: false,
              uniforms: {
                uSize: { value: new Vector2(layer.w, layer.h) },
                uVeil: { value: rgba(c.veil).slice(0, 3) as Rgb },
                uGlow: { value: GLOW },
              },
            }),
            0,
            0,
            layer.w,
            layer.h,
            30 + OVER - 1,
          )
        : quad(
            paperMaterial(this.paint, layer.theme, { w: b.w, h: b.h, pad, unit: s, seed: 7 }),
            b.x - pad,
            b.y - pad,
            b.w + 2 * pad,
            b.h + 2 * pad,
            30 + OVER - 1,
          );
      this.flat.add(this.paper);
      // in focus: a light ring around the same dark plaque and the words in the title's light, so the text keeps its
      // contrast (on a lit plaque it fell to 3.9:1)
      const plate = (r: Box, str: string, size: number, hex: string, lit = false) => {
        const ring = 3 * s;
        if (lit) fixed.box(r.x - ring, r.y - ring, r.w + 2 * ring, r.h + 2 * ring, 8 * s + ring, rgba(c.title));
        fixed.box(r.x, r.y, r.w, r.h, 8 * s, rgba(c.plate, lit ? 1 : 0.96), rgba(c.line, 0.9));
        const m = label(layer, s, str, size, lit ? c.title : hex);
        m.scale.multiplyScalar(Math.min(1, (r.w - 12 * s) / m.scale.x));
        fixed.text(m, r.x + r.w / 2, r.y + r.h / 2);
      };
      // the speaker's name: a dark plaque over the box's top left corner, where the HTML tab stands
      if (who && name) plate(rect(name), who, 30, c.title);
      if (title) plate(rect(title), title.textContent ?? '', 30, c.text);
      if (skip) plate(rect(skip), skip.textContent ?? '', 24, c.text, focus === skip);
      const inkSoft = dark ? c.soft : layer.theme.inkSoft;
      let foot = b.y + b.h; // under the narration's last line: its hint, then its ▼
      if (keys?.offsetParent) {
        const k = rect(keys),
          m = label(layer, s, keys.textContent ?? '', 20, inkSoft);
        // the narration's hint is centred under the words; the box's ends at its right
        fixed.text(m, dark ? k.x + k.w / 2 : k.x + k.w - m.scale.x / 2, k.y + k.h / 2);
        foot = k.y + k.h;
      }
      // the box's ▼ sits in its corner; the narration has no corner, so it goes under the words, in the middle
      if (done && dark) fixed.text(label(layer, s, '▼', 22, c.text), b.x + b.w / 2, foot + 20 * s);
      else if (done) fixed.text(label(layer, s, '▼', 22, inkSoft), b.x + b.w - 26 * s, b.y + b.h - 22 * s);
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
      {
        size: px,
        color: dark ? c.text : layer.theme.ink,
        font: layer.theme.font,
        width: at.w,
        line: px * (dark ? 1.5 : 1.35),
        centre: dark,
      },
      layer.dpr,
    ) as Quad;
    // the box holds its words whatever their length; the narration's grows with them
    if (!dark) m.scale.multiplyScalar(Math.min(1, (b.y + b.h - at.y - 8 * s) / m.scale.y));
    m.position.set(dark ? at.x + at.w / 2 : at.x + m.scale.x / 2, -(at.y + m.scale.y / 2), 0);
    m.renderOrder = 31 + OVER;
    this.words = m;
    this.flat.add(m);
  }

  frame(dt: number, t: number) {
    if (this.overlay && !this.overlay.isConnected) this.clear(); // the conversation ended
    if (!this.overlay) return false;
    if (this.stale) {
      this.stale = false;
      this.draw();
    }
    const moving = this.fixed.fade(this.layer.still ? 10 : dt * 3);
    if (!this.dark || this.layer.still) return moving;
    // the Beacon breathes every 4 s, as the HTML night did
    const glow = (this.paper?.material as ShaderMaterial | undefined)?.uniforms.uGlow;
    if (glow) glow.value = GLOW * (0.8 + 0.2 * Math.sin((t * Math.PI) / 2));
    return true;
  }

  dispose() {
    this.release(); // only its own hook: another layer's box may have taken the place since
    this.clear(); // the layer went (a lost context): a box on screen is the HTML one again
    this.layer.remove(this);
    this.paint.dispose();
  }
}
