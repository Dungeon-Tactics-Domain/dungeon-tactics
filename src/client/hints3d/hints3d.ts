// The instruction banner, the Height corner and the button hints drawn in 3D (Fernando, Nov 16: the look and the
// places of FFT The Ivalice Chronicles), one screen of the shared 3D layer (ui3d/layer.ts) with three parts, each on
// when its option is (hud-skin.ts turns all three on; a test may leave one off):
//   banner: the dark pill top centre with what to do now (the HUD's help line; an ability's name while it plays),
//   springing in and out; height: "Height", the number of the tile under the cursor and the line under them, top right,
//   with the tile's own line (X, Y, Z, floor, water, spikes, a charge landing) small below, both with no plate, their
//   letters outlined and shadowed (Fernando, Nov 18);
//   hints: what each button does on this screen, at the foot, for the device last touched (hints-view.ts).
// Each sits on its region of ui3d/layout.ts. The HTML it replaces stays in the HUD, unseen (style.css .hud.banner3d,
// .height3d, .hints3d). It takes no input. Colours are the reference's, as constants here, until the look is styled.
import { Group, Mesh, ShaderMaterial, Vector2, Vector4 } from 'three';
import type { HudView } from '../hud.ts';
import { t } from '../i18n.ts';
import { hintsMode, onHelp, tutorialOn } from '../key-hints.ts';
import { pieceHidden } from '../ui-pieces.ts';
import { capMeshes } from '../ui3d/caps.ts';
import type { Ui3dLayer, Ui3dScreen } from '../ui3d/layer.ts';
import { place, REGIONS } from '../ui3d/layout.ts';
import { QUAD, QUAD_VERT } from '../ui3d/panel.ts';
import { ease, land, settled, spring, stepSpring } from '../ui3d/spring.ts';
import { dropText, textMesh } from '../ui3d/text.ts';
import {
  bannerLine,
  type Device,
  type Hint,
  heightBox,
  heightShown,
  hintsDevice,
  hintsFor,
  layRow,
  messageScale,
  ROW,
  tileLine,
} from './hints-view.ts';

export interface Parts {
  banner: boolean;
  height: boolean;
  hints: boolean;
}

// measured on the reference (labs: refs/fft-ivalice, images 17, 19 and 24)
export const WHITE = '#f4f1e6';
const GREEN = '#4daf7c'; // the Height number
export const PILL: Rgba = [0.15, 0.18, 0.23, 0.88]; // #363f48 over the sky: dark slate, a little see-through
export const LINE: Rgba = [0.82, 0.86, 0.92, 0.6];
export const NONE: Rgba = [0, 0, 0, 0];
export type Rgba = [number, number, number, number];

// A rounded box by distance field: fill, an outline `uLine` px wide, and with `uFade` an alpha that runs out to the left
// (the line under Height)
const BOX_FRAG = `
precision highp float;
varying vec2 vUv;
uniform vec2 uSize;
uniform float uRadius;
uniform vec4 uColor;
uniform vec4 uEdge;
uniform float uLine;
uniform float uFade;
uniform float uAlpha;
void main() {
  vec2 q = abs((vUv - 0.5) * uSize) - uSize * 0.5 + uRadius;
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uRadius;
  vec4 col = mix(uColor, uEdge, uEdge.a * smoothstep(-uLine - 0.5, -uLine + 0.5, d));
  float fade = mix(1.0, smoothstep(0.0, 0.8, vUv.x), uFade);
  gl_FragColor = vec4(col.rgb, col.a * (1.0 - smoothstep(-0.5, 0.5, d)) * fade * uAlpha);
}`;

export type Quad = Mesh<typeof QUAD, ShaderMaterial>;
// one of the three parts: its meshes under one group, faded together
export class Part {
  readonly group = new Group();
  private boxes: Quad[] = [];
  private texts: Quad[] = [];
  key = '';
  alpha = 0;
  want = 0;

  // a box with its top left at x,y (y down), in CSS px
  box(x: number, y: number, w: number, h: number, radius: number, color: Rgba, edge: Rgba = NONE, fade = 0) {
    const m = new Mesh(
      QUAD,
      new ShaderMaterial({
        vertexShader: QUAD_VERT,
        fragmentShader: BOX_FRAG,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uSize: { value: new Vector2(w, h) },
          uRadius: { value: Math.min(radius, w / 2, h / 2) },
          uColor: { value: new Vector4(...color) },
          uEdge: { value: new Vector4(...edge) },
          uLine: { value: 1 },
          uFade: { value: fade },
          uAlpha: { value: 0 },
        },
      }),
    );
    m.scale.set(w, h, 1);
    m.position.set(x + w / 2, -(y + h / 2), 0);
    m.renderOrder = 30;
    this.boxes.push(m);
    this.group.add(m);
  }
  // a text already made (textMesh), centred on x,y
  text(m: Quad, x: number, y: number) {
    m.position.set(x, -y, 0);
    m.renderOrder = 31;
    this.texts.push(m);
    this.group.add(m);
    return m;
  }
  fade(dt: number) {
    this.alpha = ease(this.alpha, this.want, dt, 14);
    for (const m of [...this.boxes, ...this.texts]) m.material.uniforms.uAlpha.value = this.alpha;
    return Math.abs(this.alpha - this.want) > 0.004;
  }
  clear() {
    for (const m of this.boxes) m.material.dispose();
    for (const m of this.texts) dropText(m);
    this.group.clear();
    this.boxes = [];
    this.texts = [];
    this.key = '';
  }
}

export class Hints3d implements Ui3dScreen {
  readonly flat = new Group();
  private readonly banner = new Part();
  private readonly height = new Part();
  private readonly hints = new Part();
  private readonly tile = new Part(); // the tile line under the Height, part of `height`
  private readonly open = spring(0); // the banner: 0 away, 1 in place
  private readonly pop = spring(1); // the Height number's size as it changes
  private num?: Quad;
  private last?: { v: HudView; open: boolean; help: string };
  private said: string | null = null;
  private readonly unhelp = onHelp(() => this.draw()); // Options › Tutorial or Key and button hints changed

  constructor(
    private readonly layer: Ui3dLayer,
    private readonly parts: Parts,
  ) {
    this.flat.add(this.banner.group, this.height.group, this.tile.group, this.hints.group);
    for (const [part, on] of Object.entries(parts)) layer.root.classList.toggle(`${part}3d`, on);
    // what the hints are drawn as is key-hints.ts' (the Options, the input last used); a finger hides them (the
    // layer's `finger`, which redraws every screen when it changes)
    layer.add(this, null);
  }

  private get device(): Device {
    return hintsDevice(hintsMode(), this.layer.finger, this.layer.keys);
  }

  // Called by the HUD with each turn screen; `open`: a hero's turn with nothing playing; `help`: the help line's text
  update(v: HudView, open: boolean, help: string) {
    this.last = { v, open, help };
    this.draw();
  }
  // the ability name the HUD announces while it plays (BattleHud.banner) takes the pill; null gives it back
  announce(text: string | null) {
    this.said = text;
    this.draw();
  }
  resize() {
    this.draw();
  }

  // Text in the theme's serif. `size` in px of the reference; on the page never under 16 px, the game's minimum.
  // `shadow`: outlined and shadowed, for a text with no plate; `k`: a scale under that floor (a phone's banner)
  private label(str: string, size: number, color: string, width?: number, shadow = false, k = 1) {
    const px = this.layer.px(size) * k;
    return textMesh(
      str,
      { size: px, color, font: this.layer.theme.font, width, line: px * 1.3, shadow },
      this.layer.dpr,
    ) as Quad;
  }

  // Rebuilds only the part whose text or place changed
  private draw() {
    const { layer, last, parts } = this;
    if (!last) return;
    const { v } = last,
      b = v.battle,
      st = layer.stage,
      s = layer.s,
      at = JSON.stringify([st, layer.dpr]);
    layer.wake();

    if (parts.banner) {
      // the battle over: the pill leaves like the Height and the hints, the end screen says who won (result3d/ draws
      // on this same layer, and the pill showed through its veil)
      const text = this.said ?? (b.over ? '' : bannerLine(last.help, v.log, last.open, tutorialOn()));
      const part = this.banner,
        k = messageScale(layer.w, layer.h),
        key = text + at;
      part.want = this.open.to = text ? 1 : 0; // without text it keeps what it showed and leaves
      if (text && key !== part.key) {
        if (part.key && !layer.still) this.open.x = 0.5; // a new line on an open pill drops in again from half way
        part.clear();
        part.key = key;
        // the pill takes its text's width, up to the region's; a longer line wraps and the pill grows down
        const r = place(REGIONS.banner, st),
          pad = 50 * s * k;
        let m = this.label(text, 30, WHITE, undefined, false, k);
        if (m.scale.x > r.w - 2 * pad) {
          dropText(m);
          m = this.label(text, 30, WHITE, r.w - 2 * pad, false, k);
        }
        const w = Math.min(r.w, m.scale.x + 2 * pad),
          h = Math.max(r.h * k, m.scale.y + 36 * s * k);
        // the group's origin is the pill's middle, so it grows from there
        part.group.userData = { x: r.x + r.w / 2, y: r.y + h / 2 };
        part.box(-w / 2, -h / 2, w, h, 39 * s * k, PILL);
        part.text(m, 0, 0);
      }
    }

    if (parts.height) {
      const n = heightShown(b, v.cursor);
      const part = this.height,
        key = n === null ? '' : n + at;
      part.want = n === null ? 0 : 1;
      if (n !== null && key !== part.key) {
        if (part.key && !layer.still) this.pop.x = 1.18; // a new number lands with a small bounce
        part.clear();
        part.key = key;
        // layout-fft-ic.json altura.*: the label from x 1582, the number ending on x 1832, the line under both
        const r = heightBox(st, layer.inset.top);
        part.box(r.x, r.y + 82 * s, r.w, Math.max(1, 2 * s), 0, LINE, NONE, 1);
        // "Height" and its number with no plate (Fernando, Nov 18: no blue box, the text with a drop shadow), each
        // outlined so it reads over a light floor and a dark one
        const name = this.label(t('Altura', 'Height'), 24, WHITE, undefined, true);
        part.text(name, r.x + 82 * s + name.scale.x / 2, r.y + 55 * s);
        this.num = this.label(String(n), 96, GREEN, undefined, true);
        part.text(this.num, r.x + 332 * s - this.num.scale.x / 2, r.y + 46 * s);
        this.num.userData.size = this.num.scale.clone();
      }
      // the tile line under the Height's line, from the label's x, wrapping at the region's right edge, with no plate
      const line = tileLine(b, v.cursor, v.hl?.size),
        tile = this.tile,
        tkey = line + at;
      tile.want = line ? 1 : 0;
      if (line && tkey !== tile.key) {
        tile.clear();
        tile.key = tkey;
        const r = heightBox(st, layer.inset.top),
          x = r.x + 82 * s;
        const m = this.label(line, 18, WHITE, r.x + r.w - x - 16 * s, true);
        tile.text(m, x + m.scale.x / 2, r.y + 92 * s + m.scale.y / 2);
      }
    }

    if (parts.hints) {
      const lists = hintsFor(b, v.screen, last.open, this.device);
      const part = this.hints,
        key = JSON.stringify([lists, this.device]) + at;
      part.want = lists.left.length + lists.right.length ? 1 : 0;
      if (part.want && key !== part.key) {
        part.clear();
        part.key = key;
        this.row(lists.right, 'right');
        this.row(lists.left, 'left');
      }
    }
  }

  // one row of hints on its region: each key or pad button drawn (ui3d/caps.ts) and its text
  private row(all: Hint[], align: 'left' | 'right') {
    const { layer, hints: part } = this;
    // a phone draws the combat bar at PHONE_SHRINK (layer.small); the foot's hints follow it with smaller caps, or they
    // rise into the target sheet's forecast line (Nov 19 captures at 844x390)
    const phone = layer.small.s < layer.stage.s;
    const st = phone ? layer.small : layer.stage,
      s = st.s;
    const r = place(REGIONS[align === 'right' ? 'hints' : 'hintsLeft'], st);
    const h = Math.max(phone ? 16 : 22, ROW.cap * s),
      mid = r.y + r.h / 2;
    const device = this.device;
    if (device === 'touch') return;
    // a hint the pad has no button for is left out
    const made = all.flatMap((hint) => {
      const caps = capMeshes(hint.act, device, h, layer.dpr, layer.theme.font);
      return caps ? [{ caps, text: this.label(hint.text, ROW.text, WHITE) }] : [];
    });
    const capW = (m: Quad) => m.scale.x;
    const xs = layRow(
      made.map((m) => ({ caps: m.caps.map(capW), text: m.text.scale.x })),
      r,
      align,
      s,
    );
    made.forEach((m, i) => {
      m.caps.forEach((cap, k) => {
        const w = capW(cap),
          x = layer.snap(xs[i].caps[k]);
        part.text(cap, x + w / 2, layer.snap(mid));
      });
      part.text(m.text, layer.snap(xs[i].text) + m.text.scale.x / 2, layer.snap(mid));
    });
  }

  frame(dt: number) {
    const { layer, banner, height, tile, hints } = this,
      still = layer.still,
      e = still ? 10 : dt; // reduced motion: every ease is already there
    this.pop.to = 1;
    for (const sp of [this.open, this.pop]) {
      if (still) land(sp);
      else stepSpring(sp, dt, 210, 19); // a little under critical: it passes its place and settles
    }
    // the banner drops in from a little above, growing; it leaves the same way backwards
    const o = this.open.x,
      at = banner.group.userData as { x?: number; y?: number };
    banner.group.position.set(layer.snap(at.x ?? 0), -layer.snap((at.y ?? 0) - (1 - o) * 16 * layer.s), 0);
    banner.group.scale.setScalar(0.9 + 0.1 * o);
    const size = this.num?.userData.size as Vector2 | undefined;
    if (this.num && size) this.num.scale.set(size.x * this.pop.x, size.y * this.pop.x, 1);
    // three pieces on one screen: each hidden by its own name (ui-pieces.ts; the sandbox's `hide`)
    banner.group.visible = !pieceHidden('banner');
    height.group.visible = tile.group.visible = !pieceHidden('height');
    hints.group.visible = !pieceHidden('hints');
    const fading = [banner, height, tile, hints].map((p) => p.fade(e)).some(Boolean);
    return !still && (fading || !settled(this.open) || !settled(this.pop));
  }

  dispose() {
    this.unhelp();
    this.layer.remove(this);
    for (const p of [this.banner, this.height, this.tile, this.hints]) p.clear();
    for (const part of Object.keys(this.parts)) this.layer.root.classList.remove(`${part}3d`);
  }
}
