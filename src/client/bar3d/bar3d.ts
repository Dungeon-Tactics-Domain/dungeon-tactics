// The combat bar drawn in 3D (localhost ?bar=3d; Fernando's request, Nov 16: the bottom bar of FFT The Ivalice
// Chronicles rebuilt in Three.js), a screen of the shared 3D layer (ui3d/layer.ts): the acting unit's sheet (portrait,
// name, life, pools and CT), the strike preview plate in the middle and the target's sheet, mirrored, each on its own
// region of the reference (ui3d/layout.ts `sheet`, `preview`, `target`), so both layouts reach them.
//   State: nothing here decides anything. The HUD hands it the same units and forecast the HTML panels show;
//   bar-view.ts turns them into what to show, bar-layout.ts says where, plates.ts paints it and this file moves it.
//   The HTML panels stay in place, unseen (style.css, .hud.bar3d): they are the room the bar takes from the map.
//   No input: the bar only shows. Motion: a part fades and slides in, the bars glide to their new values.
import { Group, Mesh, type ShaderMaterial, Texture, TextureLoader } from 'three';
import type { BattleState, UnitState } from '../../shared/battle/types.ts';
import { UNIT_DEFS } from '../../shared/battle/units.ts';
import { battleFace, type Expression, frameOf } from '../battle-face.ts';
import type { Forecast } from '../forecast.ts';
import { modelOf } from '../markers.ts';
import type { Ui3dLayer, Ui3dScreen } from '../ui3d/layer.ts';
import { place, REGIONS, type Region } from '../ui3d/layout.ts';
import { QUAD } from '../ui3d/panel.ts';
import { ease } from '../ui3d/spring.ts';
import { dropText, textMesh } from '../ui3d/text.ts';
import { hang, PLATE, type SheetLayout, type Spot, sheetLayout } from './bar-layout.ts';
import { barView, type Gauge, type PlateView, type SheetView } from './bar-view.ts';
import { hex, PAD, plateMaterial, sheetMaterial } from './plates.ts';

// light ink on the dark bar, measured on the reference's digits; the soft one for labels
const INK = '#f1ebd2';
const SOFT = '#cfc8b0';
const ENEMY = '#f4aaab'; // the "Enemy" tag
const WARN = '#ff8a70'; // a strike on the user's own side
const TEXT_PAD = 3; // the empty margin a label carries on each side (ui3d/text.ts)
const SLIDE = 26; // reference px a part travels as it comes in

type TextMesh = Mesh<typeof QUAD, ShaderMaterial>;
// one texture per image for the whole bar (Bar3d.texture); `loaded` runs once the image is there
type Load = (url: string, loaded: (img: HTMLImageElement) => void) => Texture;
// One of the bar's three parts: a quad on its region and the texts over it. It keeps what it last showed while it fades out
class Part {
  readonly group = new Group();
  readonly mesh: Mesh<typeof QUAD, ShaderMaterial>;
  private readonly texts = new Map<string, { key: string; mesh: TextMesh }>();
  alpha = 0;
  want = 0;
  constructor(
    mat: ShaderMaterial,
    readonly region: Region,
    readonly from: number, // the side it slides in from: -1 left, 1 right, 0 none
  ) {
    this.mesh = new Mesh(QUAD, mat);
    this.group.add(this.mesh);
    this.group.visible = false;
  }
  // a text on its spot; an unchanged one keeps its texture
  text(layer: Ui3dLayer, id: string, str: string, sp: Spot, color: string) {
    const px = layer.px(sp.size); // never under the game's smallest text (design system, section 8)
    const key = JSON.stringify([str, px, color, layer.dpr]);
    const old = this.texts.get(id);
    if (old?.key !== key) {
      if (old) dropText(old.mesh);
      this.texts.delete(id);
      if (!str) return;
      const mesh = textMesh(str, { size: px, color, font: layer.theme.font }, layer.dpr);
      mesh.renderOrder = 6;
      mesh.userData.w = mesh.scale.x;
      mesh.userData.h = mesh.scale.y;
      this.group.add(mesh);
      this.texts.set(id, { key, mesh });
    }
    const m = this.texts.get(id)?.mesh;
    if (!m) return;
    const { x, k } = hang(sp, m.userData.w, layer.s, TEXT_PAD);
    m.scale.set(m.userData.w * k, m.userData.h * k, 1);
    m.position.set(layer.snap(x), -layer.snap(sp.y * layer.s), 0);
  }
  // the quad over its region, `PAD` reference px larger on every side
  fit(layer: Ui3dLayer) {
    const b = place(this.region, layer.stage),
      s = layer.s,
      w = b.w + 2 * PAD * s,
      h = b.h + 2 * PAD * s;
    this.mesh.scale.set(w, h, 1);
    this.mesh.position.set(b.w / 2, -b.h / 2, 0);
    this.mesh.material.uniforms.uUnit.value = s;
    this.at = b;
  }
  private at = { x: 0, y: 0 };
  // one step: fades toward `want`, slid aside while it is not all there. True while it moves
  step(layer: Ui3dLayer, e: number) {
    this.alpha = ease(this.alpha, this.want, e, 14);
    if (Math.abs(this.alpha - this.want) < 0.004) this.alpha = this.want;
    this.group.visible = this.alpha > 0;
    this.mesh.material.uniforms.uAlpha.value = this.alpha;
    for (const { mesh } of this.texts.values()) mesh.material.uniforms.uAlpha.value = this.alpha;
    const off = this.from * SLIDE * layer.s * (1 - this.alpha);
    this.group.position.set(layer.snap(this.at.x + off), -layer.snap(this.at.y), 0);
    return this.alpha !== this.want;
  }
  dispose() {
    for (const { mesh } of this.texts.values()) dropText(mesh);
    this.mesh.material.dispose();
  }
}

const value = (g: Gauge) => `${g.value}/${g.max}`;
const frac = (g: Gauge | undefined | null) => (g ? Math.max(0, Math.min(1, g.value / g.max)) : -1);

// A unit sheet: the part, its layout, the unit it shows and the face on its portrait
class Sheet {
  readonly part: Part;
  private readonly l: SheetLayout;
  view: SheetView | null = null;
  face: ReturnType<typeof battleFace>;
  private faceOf = ''; // the def whose face is loaded
  private hp = [1, 1]; // the life bar's two ends, gliding
  private fill = [0, 0, 0]; // first pool, second pool, CT
  constructor(mirror: boolean, region: Region) {
    this.l = sheetLayout(mirror);
    this.part = new Part(sheetMaterial(this.l), region, mirror ? 1 : 0);
  }
  private get un() {
    return this.part.mesh.material.uniforms;
  }

  show(layer: Ui3dLayer, v: SheetView | null, load: Load) {
    this.part.want = v ? 1 : 0;
    if (!v) return;
    // another unit: its numbers are there at once, only the same unit's bars glide
    const swap = this.view?.unit.id !== v.unit.id;
    this.view = v;
    const { l, part, un } = this;
    un.uTeam.value = v.enemy ? 1 : 0;
    un.uLine.value = v.line ? 1 : 0;
    un.uTag.value = v.tag ? 1 : 0;
    un.uHp.value.z = v.change.gain ? 1 : 0;
    if (swap || layer.still) this.land();
    if (this.faceOf !== v.unit.def) this.setFace(v.unit, load);
    part.text(layer, 'name', v.name, l.name, INK);
    part.text(layer, 'tag', v.tag, l.tag, ENEMY);
    part.text(layer, 'hpLabel', v.hp.label, l.hpLabel, SOFT);
    part.text(layer, 'hpRegen', v.hpRegen, l.hpRegen, SOFT);
    part.text(layer, 'hpValue', value(v.hp), l.hpValue, INK);
    const [first, second] = v.pools;
    part.text(layer, 'poolLabel', first?.label ?? '', l.poolLabel, SOFT);
    part.text(layer, 'poolValue', first ? value(first) : '', l.poolValue, INK);
    part.text(layer, 'boxLabel', second?.label ?? '', l.boxLabel, SOFT);
    part.text(layer, 'boxValue', second ? value(second) : '', l.boxValue, INK);
    part.text(layer, 'ctLabel', v.ct?.label ?? '', l.ctLabel, SOFT);
    part.text(layer, 'ctGain', v.ctGain, l.ctGain, SOFT);
    part.text(layer, 'ctValue', v.ct ? String(v.ct.value) : '', l.ctValue, INK);
    part.text(layer, 'line', v.line, l.line, INK);
  }
  private targets(v: SheetView) {
    return { hp: [v.change.left, v.change.upTo], fill: [frac(v.pools[0]), frac(v.pools[1]), frac(v.ct)] };
  }
  private land() {
    if (!this.view) return;
    const to = this.targets(this.view);
    this.hp = to.hp;
    this.fill = to.fill;
  }

  // the face of a unit on its portrait: the painted sheet's frame, else the rendered portrait's top, cut to the picture
  private setFace(u: UnitState, load: Load) {
    const { un } = this;
    const ratio = (this.l.portrait.w - 9) / (this.l.portrait.h - 9); // the picture inside the frame
    const uv = un.uFaceUv.value;
    const tint = UNIT_DEFS[u.def].tint;
    // the HUD's .tinted filter, approximated: the face's light in the unit's glow colour
    const [r, g, b] = tint ? hex(tint) : [0, 0, 0];
    un.uTint.value.set(r, g, b, tint ? 0.55 : 0);
    un.uHasFace.value = 0;
    this.faceOf = u.def;
    this.face = battleFace(u.def);
    this.frame = -1;
    const model = modelOf(u.def);
    const mine = () => this.faceOf === u.def; // a slow image must not land on the next unit's portrait
    if (this.face) {
      const n = this.face.frames;
      this.crop = (frame) => uv.set((frame + (1 - ratio) / 2) / n, 0, ratio / n, 1);
      un.uFace.value = load(`/chars/${this.face.sheet}`, () => mine() && (un.uHasFace.value = 1));
    } else if (model) {
      this.crop = () => {};
      un.uFace.value = load(`/chars/${model}.webp`, (img) => {
        if (!mine()) return;
        uv.set(0, 0, 1, Math.min(1, img.width / ratio / img.height));
        un.uHasFace.value = 1;
      });
    }
  }
  private crop: (frame: number) => void = () => {};
  private frame = -1;

  // one step; true while something of it still moves
  step(layer: Ui3dLayer, dt: number, t: number, face: (u: UnitState) => Expression) {
    const { un, view } = this;
    let moving = this.part.step(layer, layer.still ? 10 : dt);
    if (!view) return moving;
    const to = this.targets(view);
    const glide = (x: number, goal: number) => {
      if (goal < 0 || x < 0 || layer.still) return goal;
      const next = ease(x, goal, dt, 9);
      if (Math.abs(next - goal) < 0.002) return goal;
      moving = true;
      return next;
    };
    this.hp = this.hp.map((x, i) => glide(x, to.hp[i]));
    this.fill = this.fill.map((x, i) => glide(x, to.fill[i]));
    un.uHp.value.x = this.hp[0];
    un.uHp.value.y = this.hp[1];
    un.uFill.value.set(this.fill[0], this.fill[1], this.fill[2]);
    un.uTime.value = t;
    if (this.face) {
      const n = frameOf(this.face, face(view.unit));
      if (n !== this.frame) {
        this.crop((this.frame = n));
        layer.wake();
      }
    }
    // the part an aimed strike changes blinks for as long as it shows
    return moving || (!layer.still && this.part.want > 0 && view.change.upTo > view.change.left);
  }
}

export class Bar3d implements Ui3dScreen {
  readonly flat = new Group();
  private readonly sheet = new Sheet(false, REGIONS.sheet);
  private readonly target = new Sheet(true, REGIONS.target);
  private readonly plate = new Part(plateMaterial(), REGIONS.preview, -1);
  private readonly loader = new TextureLoader();
  // one load per image; `waiting` holds what to run when it arrives (null once it has)
  private readonly textures = new Map<string, { tex: Texture; waiting: ((img: HTMLImageElement) => void)[] | null }>();
  private shown: PlateView | null = null;
  private last?: () => void; // the last update, run again when the layer's scale changes the texts' size
  private expression: (u: UnitState) => Expression = () => 'neutral';

  // `host`: the HUD's own acting panel; hidden by CSS (the sandbox's `hide`), the layer hides the bar with it
  constructor(
    private readonly layer: Ui3dLayer,
    readonly host: HTMLElement,
  ) {
    layer.root.classList.add('bar3d');
    this.flat.add(this.sheet.part.group, this.plate.group, this.target.part.group);
    layer.add(this);
  }

  private readonly texture: Load = (url, loaded) => {
    let entry = this.textures.get(url);
    if (!entry) {
      const made = { tex: new Texture(), waiting: [] as ((img: HTMLImageElement) => void)[] | null };
      made.tex = this.loader.load(url, (tex) => {
        for (const run of made.waiting ?? []) run(tex.image as HTMLImageElement);
        made.waiting = null;
        this.layer.wake();
      });
      made.tex.flipY = false;
      this.textures.set(url, (entry = made));
    }
    if (entry.waiting) entry.waiting.push(loaded);
    else loaded(entry.tex.image as HTMLImageElement);
    return entry.tex;
  };

  // Called by the HUD on each redraw (BattleHud.render) with what its own panels show: the acting unit, the unit under
  // the cursor and, while aiming, the strike on each target (the one under the cursor first)
  update(
    state: BattleState,
    me: UnitState | undefined,
    other: UnitState | undefined,
    fs: Forecast[],
    ability: string | null,
    face: (u: UnitState) => Expression,
  ) {
    this.expression = face;
    this.last = () => {
      const { layer } = this;
      const v = barView(state, me, other, fs, ability);
      this.sheet.show(layer, v.sheet, this.texture);
      this.target.show(layer, v.target, this.texture);
      this.plate.want = v.plate ? 1 : 0;
      const p = v.plate ?? this.shown;
      this.shown = p;
      if (p) {
        this.plate.mesh.material.uniforms.uWarn.value = p.warn ? 1 : 0;
        this.plate.text(layer, 'chance', p.chance, PLATE.chance, INK);
        this.plate.text(layer, 'amount', p.amount, p.big ? PLATE.amount : PLATE.amountText, p.warn ? WARN : INK);
        this.plate.text(layer, 'label', p.label, PLATE.label, p.warn ? WARN : INK);
        this.plate.text(layer, 'name', p.name, PLATE.name, SOFT);
      }
      layer.wake();
    };
    this.last();
  }

  resize() {
    for (const part of [this.sheet.part, this.plate, this.target.part]) part.fit(this.layer);
    this.last?.();
  }

  frame(dt: number, t: number) {
    const { layer } = this;
    const a = this.sheet.step(layer, dt, t, this.expression);
    const b = this.target.step(layer, dt, t, this.expression);
    const c = this.plate.step(layer, layer.still ? 10 : dt);
    return a || b || c;
  }

  dispose() {
    this.layer.remove(this);
    for (const part of [this.sheet.part, this.plate, this.target.part]) part.dispose();
    for (const { tex } of this.textures.values()) tex.dispose();
    this.layer.root.classList.remove('bar3d');
  }
}
