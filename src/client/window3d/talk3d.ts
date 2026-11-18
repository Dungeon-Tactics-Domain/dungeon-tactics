// The speech box drawn in 3D (?talk=3d, the default), a screen of the 3D layer of the town and of the battle alike,
// after the dialogue of FFT: The Ivalice Chronicles (labs refs/fft-ivalice/66 to 68): a parchment box with the
// speaker's name on a dark plaque over its top left corner, the words in the paper's ink, the ▼ when the sentence is
// out. The opening narration (`dark`) has no box: the page goes to night under the Beacon's blue glow, which breathes
// (still under Reduce motion), and the words stand large in its middle, with Skip drawn at the foot for a finger.
//   State and input: the box of talk.ts stays, unseen, its face too (Nov 18: drawn here, talk-face.ts, on the frame
//   its mouth is on). The box types the words, takes Enter, the click, the pad and Esc, and is what a screen reader
//   hears; this screen copies what it says. Where each part goes is talk-layout.ts, no measure of the HTML: the box,
//   the strip and Skip are seated from the same numbers by style on the elements, taken back when the drawing goes.
import { Group, type Mesh, ShaderMaterial, Vector2 } from 'three';
import { colors, label, lift, rgba } from '../flow3d/draw.ts';
import { Part, type Quad } from '../hints3d/hints3d.ts';
import { fill } from '../looks3d.ts';
import { modelOf } from '../markers.ts';
import { faceOf } from '../talk.ts';
import type { Ui3dLayer, Ui3dScreen } from '../ui3d/layer.ts';
import type { Box } from '../ui3d/layout.ts';
import { paintTexture, paperMaterial, QUAD_VERT, quad, type Rgb } from '../ui3d/panel.ts';
import { safeSides } from '../ui3d/safe-area.ts';
import { dropText, lineCount, textMesh, textWidth } from '../ui3d/text.ts';
import { TalkFace } from './talk-face.ts';
import { talkLayout } from './talk-layout.ts';

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
  private readonly face = new TalkFace(() => this.layer.wake(), 31 + OVER);
  private faceEl?: HTMLElement | null; // the unseen face of talk.ts: who speaks and the frame its mouth is on

  constructor(private readonly layer: Ui3dLayer) {
    this.color = colors(layer);
    this.flat.add(this.fixed.group, this.face.group);
    this.fixed.want = 1;
    layer.add(this, 'talk');
    this.release = fill('talk', (overlay) => this.take(overlay));
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
    if (this.dark) overlay.style.animation = 'none'; // the HTML night's pulse, which would tint the page over the drawn one
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
    for (const e of this.overlay?.querySelectorAll('.panel.talk, .talk-title, .talk-skip, .talk-face') ?? [])
      e.removeAttribute('style');
    this.overlay = undefined;
    if (this.layer.solo === this) this.layer.solo = undefined;
    this.fixed.clear();
    if (this.words) dropText(this.words);
    (this.paper?.material as ShaderMaterial | undefined)?.dispose();
    this.paper?.removeFromParent();
    this.paper = this.words = undefined;
    this.face.set('', '', undefined, 0);
    this.layer.wake();
  }

  private draw() {
    const { layer, overlay, fixed, dark, color: c } = this;
    if (!overlay) return;
    const s = layer.s,
      font = layer.theme.font,
      find = (cls: string) => overlay.querySelector<HTMLElement>(cls);
    const box = find('.panel.talk'),
      body = find('.talk-text'),
      name = find('.talk-name'),
      keys = find('.talk-keys'),
      skip = find('.talk-skip'),
      title = find('.talk-title');
    if (!box || !body) return;
    const done = box.classList.contains('done'),
      who = name && !name.hidden ? (name.textContent ?? '') : '',
      str = body.textContent ?? '',
      focus = document.activeElement;
    const L = talkLayout({
        pageW: layer.w,
        pageH: layer.h,
        safe: safeSides(),
        dark,
        face: !!who,
        name: textWidth(who, 24, font),
        title: textWidth(title?.textContent ?? '', 24, font),
        skip: textWidth(skip?.textContent ?? '', 16, font),
        lines: (width, size) => lineCount(str, { size, font, width }, layer.dpr),
      }),
      b = L.box;
    // the real box under the drawn one (the face stands in it), the strip and Skip too, whatever the style sheet says
    // (the narration's style sheet leaves Skip out: `display` brings it back)
    const seat = (e: HTMLElement | null, r: Box | undefined, more = '') =>
      r &&
      e?.setAttribute(
        'style',
        `position:fixed;margin:0;left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;min-height:0;${more}`,
      );
    seat(box, b);
    seat(title, L.title);
    seat(skip, L.skip, 'display:block');
    // the face in the box's corner, drawn: the HTML one stays in place, unseen, as the rest of the box
    this.faceEl = find('.talk-face');
    this.faceEl?.setAttribute('style', 'opacity:0');
    const at = L.face && who ? { x: b.x + 16, y: b.y + 20, w: L.face, h: L.face } : undefined;
    this.face.set(this.faceEl?.dataset.def ?? '', who, at, performance.now());
    const key = JSON.stringify([
      b,
      who,
      this.faceEl?.dataset.def,
      done,
      focus === skip,
      title?.textContent,
      layer.dpr,
      s,
    ]);
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
      // the face's frame: the HTML one's colours (style.css .face-sheet); the Beacon, with no picture, its gem
      if (at) {
        const css = getComputedStyle(document.documentElement),
          k = L.face / 132,
          def = this.faceEl?.dataset.def ?? '';
        if (faceOf(def) || modelOf(def))
          fixed.box(
            at.x,
            at.y,
            at.w,
            at.h,
            0,
            rgba(css.getPropertyValue('--paper-hi').trim()),
            rgba(css.getPropertyValue('--paper-edge').trim()),
          );
        else fixed.box(at.x + 18 * k, at.y + 18 * k, 96 * k, 96 * k, 48 * k, rgba('#2bb8d6'), rgba('#bff7ff'));
      }
      if (L.name) plate(L.name, who, 30, c.title);
      if (title && L.title) plate(L.title, title.textContent ?? '', 30, c.text);
      if (skip) plate(L.skip, skip.textContent ?? '', 24, c.text, focus === skip);
      const inkSoft = dark ? c.soft : layer.theme.inkSoft;
      let foot = b.y + b.h; // under the narration's last line: its hint, then its ▼
      if (keys?.textContent) {
        const k = L.keys,
          m = label(layer, s, keys.textContent, 20, inkSoft);
        // the narration's hint is centred under the words; the box's ends at its right
        fixed.text(m, dark ? k.x : k.x - m.scale.x / 2, k.y);
        foot = b.y + b.h + 28;
      }
      // the box's ▼ sits in its corner; the narration has no corner, so it goes under the words, in the middle
      if (done && dark) fixed.text(label(layer, s, '▼', 22, c.text), b.x + b.w / 2, foot + 20 * s);
      else if (done) fixed.text(label(layer, s, '▼', 22, inkSoft), b.x + b.w - 26 * s, b.y + b.h - 22 * s);
      lift(fixed, OVER);
    }
    // the words, as far as the box has typed them
    const tx = L.text,
      px = L.size;
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
        width: tx.w,
        line: L.line,
        centre: dark,
      },
      layer.dpr,
    ) as Quad;
    // the box holds its words whatever their length; the narration's grows with them
    if (!dark) m.scale.multiplyScalar(Math.min(1, (b.y + b.h - tx.y - 8 * s) / m.scale.y));
    m.position.set(dark ? tx.x + tx.w / 2 : tx.x + m.scale.x / 2, -(tx.y + m.scale.y / 2), 0);
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
    const hops = this.face.frame(Number(this.faceEl?.dataset.frame ?? 0), performance.now(), this.layer.still);
    const moving = this.fixed.fade(this.layer.still ? 10 : dt * 3) || hops;
    if (!this.dark || this.layer.still) return moving;
    // the Beacon breathes every 4 s, as the HTML night did
    const glow = (this.paper?.material as ShaderMaterial | undefined)?.uniforms.uGlow;
    if (glow) glow.value = GLOW * (0.8 + 0.2 * Math.sin((t * Math.PI) / 2));
    return true;
  }

  dispose() {
    this.release(); // only its own hook: another layer's box may have taken the place since
    this.clear();
    this.layer.remove(this);
    this.paint.dispose();
    this.face.dispose();
  }
}
