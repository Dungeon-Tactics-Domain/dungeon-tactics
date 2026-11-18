// The effects over the battle drawn on the shared 3D layer (ui3d/layer.ts; Fernando, Nov 18: the whole interface in 3D),
// one screen, handed each of them through looks3d.ts while it lives (the battle's layer and the town's):
//   numbers: damage and healing over a unit's chest, an embossed glyph on its own texture (black outline, gold ring on a
//   strong strike, a star on magic), kept on the chest by scene/float-numbers.ts and moved through its 1.5 s here;
//   note: the sword and the damage a Move destination draws, beside the cursor;
//   said: the objective banner ("Until Dawn"), the banner's pill, larger, in the middle of the screen;
//   rain: the victory confetti, slips of paper tumbling in 3D and catching the light, one draw call;
//   fps: the performance counter (F3), over its own HTML node, which stays as its box and its on/off.
// Numbers, banner and confetti run on the wall clock, like the CSS they stand for: the speed-up, the death slow motion
// and a paused bench never leave one hanging. It takes no input. Reduced motion: numbers and banner stand still, no
// confetti. The pure side is effects-view.ts.
import './effects3d.css';
import { Color, DoubleSide, Group, InstancedMesh, Object3D, PlaneGeometry, ShaderMaterial } from 'three';
import { type Effects, fill, type NumberMark } from '../looks3d.ts';
import { Icon } from '../menu3d/column.ts';
import { TIMING } from '../timing.ts';
import type { Ui3dLayer, Ui3dScreen } from '../ui3d/layer.ts';
import { safeSides } from '../ui3d/safe-area.ts';
import { dropText, imageMesh, textMesh } from '../ui3d/text.ts';
import {
  ANNOUNCE,
  announceStretch,
  CONFETTI,
  confettiSlips,
  FPS,
  fpsBox,
  numberLook,
  numberPose,
  type Slip,
  slipAt,
} from './effects-view.ts';
import { LINE, Part, PILL, type Quad, type Rgba, WHITE } from './hints3d.ts';

// a CSS colour as the shaders take it: "#rrggbb" or "rgb(a)(r, g, b, a)", which is how the tokens are written
function rgba(css: string): Rgba {
  if (css.startsWith('#')) return [...[1, 3, 5].map((i) => Number.parseInt(css.slice(i, i + 2), 16) / 255), 1] as Rgba;
  const n = (css.match(/[\d.]+/g) ?? []).map(Number);
  return [n[0] / 255, n[1] / 255, n[2] / 255, n[3] ?? 1];
}

const STAR = ' ✦'; // a thin space and the star, as the CSS writes it
const RING = 4; // px of gold around a strong strike's outline
const padOf = (crit: boolean) => (crit ? RING : 0) + 8; // CSS px around the glyph, for the outline, the ring and its shadow

// A number on its own canvas, in device px: a black copy a little below (the glyph stands out of the page), the gold
// ring of a strong strike closed by a dark glow, the black outline, the colour, and a shade towards its foot
function drawNumber(
  text: string,
  color: string,
  gold: string,
  star: boolean,
  crit: boolean,
  px: number,
  font: string,
  dpr: number,
) {
  const cv = document.createElement('canvas'),
    g = cv.getContext('2d')!;
  const fontOf = (size: number) => `400 ${size * dpr}px ${font}`;
  g.font = fontOf(px);
  const w = g.measureText(text).width;
  g.font = fontOf(px * 0.6);
  const pad = padOf(crit) * dpr,
    deep = Math.max(1, px * 0.05) * dpr,
    wide = w + (star ? g.measureText(STAR).width : 0);
  cv.width = Math.ceil(wide + 2 * pad);
  cv.height = Math.ceil(px * dpr + 2 * pad);
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  // the star: 0.6 of the size and raised, since the fallback font draws it twice a digit's size
  const parts: [str: string, size: number, x: number, up: number][] = [[text, px, pad, 0]];
  if (star) parts.push([STAR, px * 0.6, pad + w, px * 0.18 * dpr]);
  const pass = (dy: number, edge: string, width: number, fill?: string) => {
    for (const [str, size, x, up] of parts) {
      g.font = fontOf(size);
      g.strokeStyle = edge;
      g.lineWidth = width * dpr;
      g.strokeText(str, x, cv.height / 2 - up + dy);
      if (!fill) continue;
      g.fillStyle = fill;
      g.fillText(str, x, cv.height / 2 - up + dy);
    }
  };
  if (crit) {
    g.shadowColor = '#000';
    g.shadowBlur = 6 * dpr;
    pass(0, gold, 4 + 2 * RING);
    g.shadowColor = 'transparent';
  }
  pass(deep, '#000', 4, '#000');
  pass(0, '#000', 4, color);
  const shade = g.createLinearGradient(0, pad, 0, cv.height - pad);
  shade.addColorStop(0.35, 'rgba(0, 0, 0, 0)');
  shade.addColorStop(1, 'rgba(0, 0, 0, 0.32)');
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = shade;
  g.fillRect(0, 0, cv.width, cv.height);
  return cv;
}

// the slips of paper: lit by how much each faces the player as it tumbles
const SLIP_VERT = `
varying vec3 vColor;
void main() {
  vec3 n = normalize(mat3(instanceMatrix) * normal);
  vColor = instanceColor * (0.5 + 0.5 * abs(n.z));
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const SLIP_FRAG = `
varying vec3 vColor;
void main() { gl_FragColor = vec4(vColor, 1.0); }`;

interface Shown {
  m: Quad;
  x: number;
  y: number;
  px: number;
  born: number;
}

export class Effects3d implements Ui3dScreen, Effects {
  readonly flat = new Group();
  readonly deep = new Group();
  private readonly css: CSSStyleDeclaration;
  private readonly numbers = new Set<Shown>();
  private readonly world = new Group(); // numbers and the cursor note: hidden with the HTML numbers' layer (the sandbox's `hide`)
  private readonly floats = document.querySelector<HTMLElement>('.floats');
  private readonly notePart = new Part();
  private readonly sword = new Icon(null, 'sword', undefined, 0.035);
  private readonly said = new Part();
  private saidAt = 0;
  private readonly counter = new Part();
  private rain?: { mesh: InstancedMesh<PlaneGeometry, ShaderMaterial>; slips: Slip[]; born: number };
  private readonly dummy = new Object3D();
  private readonly release: () => void;

  constructor(private readonly layer: Ui3dLayer) {
    this.css = getComputedStyle(layer.root);
    this.world.add(this.notePart.group);
    this.flat.add(this.world, this.said.group, this.counter.group);
    this.sword.group.visible = false;
    this.deep.add(this.sword.group);
    layer.root.classList.add('effects3d');
    this.release = fill('effects', this);
    layer.add(this, 'effects');
  }
  private token(name: string) {
    return this.css.getPropertyValue(name).trim();
  }

  number(text: string, cls: string, px: number): NumberMark {
    const { kind, crit } = numberLook(cls),
      dpr = this.layer.dpr,
      color = this.token(kind === 'heal' ? '--heal' : `--float-${kind}`),
      font = this.token('--font-title');
    const m = imageMesh(
      JSON.stringify(['number', text, color, crit, px, dpr]),
      () => drawNumber(text, color, this.token('--float-crit-edge'), kind === 'magic', crit, px, font, dpr),
      dpr,
    ) as Quad;
    m.userData.size = m.scale.clone();
    m.renderOrder = -1; // under every panel of the interface
    m.material.uniforms.uAlpha.value = 0;
    const n: Shown = { m, x: 0, y: 0, px, born: performance.now() };
    this.numbers.add(n);
    this.world.add(m);
    this.layer.wake();
    return {
      w: m.scale.x - 2 * padOf(crit),
      place: (x, y) => Object.assign(n, { x, y }),
      remove: () => {
        // the screen may have gone first (a lost context): its numbers went with it
        if (this.numbers.delete(n)) dropText(m);
        this.layer.wake();
      },
    };
  }

  // Every frame from the scene, so only a change draws: the box hangs up and to the right of the cursor, as in the CSS
  note(text: string | null, x: number, y: number) {
    const part = this.notePart,
      at = part.group.position;
    if (!text) {
      if (part.want) this.layer.wake();
      return void (part.want = 0);
    }
    if (text === part.key && part.want && at.x === x && at.y === -y) return;
    this.layer.wake();
    part.want = 1;
    at.set(x, -y, 0);
    if (text === part.key) return;
    part.clear();
    part.key = text;
    const size = Math.max(16, 20 * this.layer.s);
    const m = textMesh(
      text,
      { size, color: this.token('--strike-dmg'), font: this.layer.theme.font },
      this.layer.dpr,
    ) as Quad;
    const icon = size * 1.25,
      w = 8 + icon + 2 + m.scale.x + 6,
      h = m.scale.y + 4;
    part.box(16, -1.2 * h, w, h, 4, rgba(this.token('--strike')), rgba(this.token('--mark-counter')));
    part.text(m, 16 + 8 + icon + 2 + m.scale.x / 2, -0.7 * h);
    this.sword.group.userData = { x: 16 + 8 + icon / 2, y: -0.7 * h, size: icon };
  }

  announce(text: string) {
    const { layer, said: part } = this,
      size = Math.max(22, 44 * layer.s), // larger than the instruction pill above it (30): it is the stage's goal
      pad = 2.2 * size,
      opts = { size, color: WHITE, font: layer.theme.font, line: size * 1.3 };
    part.clear();
    let m = textMesh(text, opts, layer.dpr) as Quad;
    if (m.scale.x > layer.w * 0.92 - 2 * pad) {
      dropText(m);
      m = textMesh(text, { ...opts, width: layer.w * 0.92 - 2 * pad }, layer.dpr) as Quad;
    }
    const w = m.scale.x + 2 * pad,
      h = m.scale.y + size;
    part.box(-w / 2, -h / 2, w, h, h / 2, PILL, LINE);
    part.text(m, 0, 0);
    part.want = 1;
    this.saidAt = performance.now();
    layer.wake();
  }

  confetti() {
    if (this.layer.still) return;
    this.endRain();
    const mesh = new InstancedMesh(
      new PlaneGeometry(8, 12),
      // transparent only to be sorted with the result's veil, over it and under its text (result3d.ts: 60 and up)
      new ShaderMaterial({
        vertexShader: SLIP_VERT,
        fragmentShader: SLIP_FRAG,
        side: DoubleSide,
        depthTest: false,
        transparent: true,
      }),
      CONFETTI.count,
    );
    const slips = confettiSlips(Math.random);
    const color = new Color();
    slips.forEach((s, i) => mesh.setColorAt(i, color.set(CONFETTI.colors[s.color])));
    mesh.renderOrder = 60.5;
    mesh.frustumCulled = false;
    this.flat.add(mesh);
    this.rain = { mesh, slips, born: performance.now() };
    this.layer.wake();
  }
  private endRain() {
    if (!this.rain) return;
    this.rain.mesh.removeFromParent();
    this.rain.mesh.geometry.dispose();
    this.rain.mesh.material.dispose();
    this.rain.mesh.dispose();
    this.rain = undefined;
  }

  // Twice a second from fps.ts: the node's lines over a dark plate (effects-view.ts fpsBox), each ending on its right edge
  fps(node: HTMLElement) {
    const part = this.counter,
      text = !node.hidden && node.checkVisibility({ visibilityProperty: true }) ? (node.textContent ?? '') : '';
    if (text === part.key) return;
    this.layer.wake();
    part.clear();
    part.key = text;
    part.want = part.alpha = text ? 1 : 0;
    if (!text) return;
    const lines = text
        .split('\n')
        .map((str) => textMesh(str, { ...FPS, color: this.token('--fg') }, this.layer.dpr) as Quad),
      // the text mesh carries 3 px of margin (ui3d/text.ts)
      b = fpsBox(
        this.layer.w,
        safeSides(),
        lines.map((m) => m.scale.x - 6),
      );
    part.box(b.x, b.y, b.w, b.h, 6, PILL);
    lines.forEach((m, i) => part.text(m, b.x + b.w - 8 + 3 - m.scale.x / 2, b.y + 4 + b.line * (i + 0.5)));
    // over every other piece, as the HTML counter is (it shares its corner with the Height)
    for (const m of part.group.children) m.renderOrder += 60;
  }

  resize() {
    this.notePart.clear(); // drawn again at the new scale on the scene's next frame
    this.layer.wake();
  }

  frame(dt: number) {
    const { layer, numbers, said, rain, sword, notePart, counter } = this,
      still = layer.still,
      now = performance.now(),
      e = still ? 10 : dt; // reduced motion: every ease is already there
    if (numbers.size || notePart.want)
      this.world.visible = this.floats?.checkVisibility({ visibilityProperty: true }) ?? true;
    for (const n of numbers) {
      const p = numberPose((now - n.born) / TIMING.float, still),
        size = n.m.userData.size;
      n.m.position.set(layer.snap(n.x), -layer.snap(n.y - p.rise * n.px), 0);
      n.m.scale.set(size.x * p.scale, size.y * p.scale, 1);
      n.m.material.uniforms.uAlpha.value = p.alpha;
    }
    const k = (now - this.saidAt) / ANNOUNCE.ms;
    if (said.want && k >= (still ? 1 : ANNOUNCE.out)) said.want = 0; // standing still, it has no fade to leave room for
    said.group.position.set(layer.w / 2, -layer.h * 0.38, 0);
    said.group.scale.set(announceStretch(k, still), 1, 1);
    if (rain) {
      const t = (now - rain.born) / 1000;
      rain.slips.forEach((s, i) => {
        const at = slipAt(s, t, layer.w, layer.h),
          d = this.dummy;
        d.scale.setScalar(at ? 1 : 0);
        if (at) {
          d.position.set(at.x, -at.y, 0);
          d.rotation.set(at.rx, at.ry, at.rz);
        }
        d.updateMatrix();
        rain.mesh.setMatrixAt(i, d.matrix);
      });
      rain.mesh.instanceMatrix.needsUpdate = true;
      if (t * 1000 > CONFETTI.ms || still) this.endRain();
    }
    const fading = [notePart, said, counter].map((p) => p.fade(e)).some(Boolean);
    const icon = sword.group.userData as { x?: number; y?: number; size?: number };
    sword.group.visible = this.world.visible && notePart.alpha > 0.5;
    sword.group.position.set(notePart.group.position.x + (icon.x ?? 0), notePart.group.position.y - (icon.y ?? 0), 300);
    sword.group.scale.setScalar(icon.size ?? 1);
    return numbers.size > 0 || !!this.rain || said.want > 0 || (!still && fading);
  }

  dispose() {
    this.release();
    this.layer.remove(this);
    for (const n of this.numbers) dropText(n.m);
    this.numbers.clear();
    for (const p of [this.notePart, this.said, this.counter]) p.clear();
    this.sword.dispose();
    this.endRain();
    this.layer.root.classList.remove('effects3d');
  }
}
