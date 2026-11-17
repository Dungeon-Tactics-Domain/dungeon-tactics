// The one WebGL layer every 3D screen of the HUD draws on (Fernando, Nov 16: one shared layer, no glass blur): a
// transparent canvas over the HUD with a single context and an orthographic camera in CSS px. A screen (menu3d/, turn3d/)
// registers two groups whose origin is the HUD's top left, x right and y down as -y: `flat` for panels and text, drawn
// back to front, and `deep` for low-poly icons with a depth buffer, drawn over them. With `pixel`, the icons go to a
// small target read block by block (pixel.ts); without it they go straight to the canvas, with no full-screen target.
//   Clock: the HUD ticks the layer on the battle clock (BattleHud.showFaces), so the bench's pause and the speed-up
//   reach it. It draws only while a screen moves or after `wake()`; a still layer costs no draw call.
//   The canvas takes no input and is hidden from the screen reader: each screen brings its own controls.
import {
  Group,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { el } from '../icons.ts';
import { getLayout } from '../layout-mode.ts';
import { reducedMotion } from '../motion.ts';
import { type Stage, stage } from './layout.ts';
import { QUAD, QUAD_VERT, type Rgb, type Theme } from './panel.ts';
import { PIXEL_FRAG, pixelBlock } from './pixel.ts';

export interface Ui3dScreen {
  readonly flat: Group; // panels and text, depth test off, ordered by renderOrder
  readonly deep?: Group; // icons with depth (through the pixel filter when it is on)
  readonly host?: HTMLElement; // hiding it by CSS (the sandbox's `hide`) hides the screen
  resize(): void; // the layer's size, density or scale changed
  frame(dt: number, t: number): boolean; // one step; true while it still moves
  dispose(): void;
}

const rgb = (hex: string): Rgb => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255) as Rgb;

export class Ui3dLayer {
  w = 0; // CSS px
  h = 0;
  dpr = 1;
  s = 1; // one reference px (the 1920x1080 layout the pieces were measured on) in CSS px: the stage's scale
  stage: Stage = { x: 0, y: 0, w: 0, h: 0, s: 1 }; // where the pieces are laid out (layout.ts), as the player picked
  private mode = getLayout();
  block = 1; // CSS px of a pixel filter block
  still = reducedMotion(); // reduced motion (Options, motion.ts), read once a frame: everything lands at once, nothing sways
  readonly theme: Theme;
  private readonly canvas = el('canvas', { class: 'ui3d-layer', 'aria-hidden': 'true' });
  private readonly renderer: WebGLRenderer;
  private readonly camera = new OrthographicCamera(0, 1, 1, 0, -1000, 1000);
  private readonly flat = new Scene();
  private readonly deep = new Scene();
  private readonly flatRoot = new Group();
  private readonly deepRoot = new Group();
  private readonly screens: Ui3dScreen[] = [];
  // pixel filter only: the icons' target and the quad that lays it over the panels
  private target?: WebGLRenderTarget;
  private readonly texel = new Vector2(1, 1);
  private readonly over?: Mesh<typeof QUAD, ShaderMaterial>;
  private readonly sized: ResizeObserver;
  private last = 0;
  private t = 0;
  private dirty = true;
  private moved = false;

  // `lost`: the WebGL context went away; the owner drops the screens and the layer, and the HTML HUD shows again
  constructor(
    readonly root: HTMLElement,
    readonly pixel: boolean,
    lost: () => void,
  ) {
    // smooth icons need their edges softened: the canvas's own multisampling, only where a pixel is big enough to show
    // a stair (density under 2), so a dense screen does not pay 4 samples of its whole size
    this.renderer = new WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: !pixel && devicePixelRatio < 2,
    });
    this.renderer.setClearColor(0, 0);
    this.renderer.autoClear = false;
    this.renderer.info.autoReset = false; // zeroed each tick: the F3 counter reads one frame's cost
    this.canvas.addEventListener('webglcontextlost', lost);
    const css = getComputedStyle(root);
    const token = (name: string) => css.getPropertyValue(`--ui3d-${name}`).trim();
    this.theme = {
      paper: rgb(token('paper')),
      shade: rgb(token('paper-shade')),
      lit: rgb(token('paper-lit')),
      band: rgb(token('paper-band')),
      edge: rgb(token('edge')),
      ink: token('ink'),
      inkSoft: token('ink-soft'),
      inkOff: token('ink-off'),
      font: css.getPropertyValue('--font-ui3d').trim(),
    };
    this.flat.add(this.flatRoot);
    this.deep.add(this.deepRoot);
    if (pixel) {
      this.over = new Mesh(
        QUAD,
        new ShaderMaterial({
          vertexShader: QUAD_VERT,
          fragmentShader: PIXEL_FRAG,
          transparent: true,
          premultipliedAlpha: true, // the target holds colour already multiplied by its coverage
          depthTest: false,
          depthWrite: false,
          uniforms: { uMap: { value: null }, uTexel: { value: this.texel } },
        }),
      );
      this.over.renderOrder = 100;
      this.flat.add(this.over);
    }
    root.classList.add('ui3d');
    root.append(this.canvas);
    this.sized = new ResizeObserver(() => this.fit());
    this.sized.observe(root);
    this.fit();
  }

  // pixel filter on: positions onto the block grid, so a sprite does not shimmer as it moves, and rotation in steps,
  // like the frames of a sprite
  snap(v: number) {
    return this.pixel ? Math.round(v / this.block) * this.block : v;
  }
  turn(a: number) {
    return this.pixel ? Math.round(a / (Math.PI / 8)) * (Math.PI / 8) : a;
  }

  add(s: Ui3dScreen) {
    this.screens.push(s);
    this.flatRoot.add(s.flat);
    if (s.deep) this.deepRoot.add(s.deep);
    s.resize();
    this.wake();
  }
  remove(s: Ui3dScreen) {
    this.screens.splice(this.screens.indexOf(s), 1);
    s.flat.removeFromParent();
    s.deep?.removeFromParent();
    this.wake();
  }
  // a screen's data changed: draw again, and until every screen settles
  wake() {
    this.dirty = true;
  }

  // the size changed, or the layout picked in Options (the HUD calls it then)
  fit() {
    const w = this.root.clientWidth,
      h = this.root.clientHeight,
      dpr = Math.min(devicePixelRatio, 2),
      mode = getLayout();
    if (w === this.w && h === this.h && dpr === this.dpr && mode === this.mode) return;
    const st = stage(w, h, mode);
    Object.assign(this, { w, h, dpr, mode, stage: st, s: st.s });
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    Object.assign(this.camera, { right: w, top: h });
    this.camera.updateProjectionMatrix();
    this.flatRoot.position.y = this.deepRoot.position.y = h;
    if (this.over) {
      // one texel per block, read unfiltered
      const cut = pixelBlock(this.s, dpr);
      this.block = cut / dpr;
      this.target?.dispose();
      this.target = new WebGLRenderTarget(Math.ceil((w * dpr) / cut), Math.ceil((h * dpr) / cut), {
        minFilter: NearestFilter,
        magFilter: NearestFilter,
      });
      this.texel.set(1 / this.target.width, 1 / this.target.height);
      this.over.material.uniforms.uMap.value = this.target.texture;
      this.over.scale.set(w, h, 1);
      this.over.position.set(w / 2, h / 2, 0);
    }
    for (const s of this.screens) s.resize();
    this.wake();
  }

  // Every frame, with the battle clock in ms
  frame(now: number) {
    const dt = Math.min(Math.max((now - this.last) / 1000, 0), 0.1);
    this.last = now;
    this.still = reducedMotion();
    if (!this.still) this.t += dt;
    const r = this.renderer;
    r.info.reset();
    let moving = false;
    for (const s of this.screens) {
      const shown = s.host?.checkVisibility({ visibilityProperty: true }) ?? true;
      if (shown !== s.flat.visible) this.dirty = true;
      s.flat.visible = shown;
      if (s.deep) s.deep.visible = shown;
      if (s.frame(dt, this.t)) moving = true;
    }
    // the frame after the last move is drawn too: it holds where everything came to rest (an empty one, once closed)
    if (!moving && !this.moved && !this.dirty) return;
    this.moved = moving;
    this.dirty = false;
    if (this.target) {
      r.setRenderTarget(this.target);
      r.clear();
      r.render(this.deep, this.camera);
      r.setRenderTarget(null);
      r.clear();
      r.render(this.flat, this.camera);
    } else {
      r.clear();
      r.render(this.flat, this.camera);
      r.clearDepth();
      r.render(this.deep, this.camera);
    }
  }

  // cost of the last frame for the F3 counter (fps.ts): 0 draw calls while nothing moves
  stats() {
    const { render, memory } = this.renderer.info;
    return { calls: render.calls, triangles: render.triangles, textures: memory.textures };
  }

  dispose() {
    this.sized.disconnect();
    for (const s of [...this.screens]) s.dispose();
    this.over?.material.dispose();
    this.target?.dispose();
    this.renderer.dispose();
    this.canvas.remove();
    this.root.classList.remove('ui3d');
  }
}
