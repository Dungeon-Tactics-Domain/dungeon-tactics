// The speaker's face in the 3D speech box (talk3d.ts; Fernando, Nov 18: the whole interface 3D, the face too): the
// painted sheet on the frame the box's mouth is on, else the rendered portrait, else the Beacon's gem, in the box's
// corner where the HTML face stood. talk.ts says who and which frame on the unseen face (`data-def`, `data-frame`);
// the hop on a new speaker is drawn here, still under Reduce motion. One texture per picture, kept until the box goes.
import { Group, LinearFilter, Mesh, NearestFilter, ShaderMaterial, type Texture, TextureLoader, Vector4 } from 'three';
import { UNIT_DEFS } from '../../shared/battle/units.ts';
import { modelOf } from '../markers.ts';
import { faceOf, faceSize } from '../talk.ts';
import type { Box } from '../ui3d/layout.ts';
import { QUAD, QUAD_VERT } from '../ui3d/panel.ts';

const FRAG = `
precision highp float;
varying vec2 vUv; uniform sampler2D uMap; uniform vec4 uUv; uniform vec4 uTint; uniform float uAlpha;
void main() {
  vec4 c = texture2D(uMap, uUv.xy + vUv * uUv.zw);
  c.rgb = mix(c.rgb, dot(c.rgb, vec3(0.299, 0.587, 0.114)) * uTint.rgb * 1.7, uTint.a);
  gl_FragColor = vec4(c.rgb, c.a * uAlpha);
}`;
const HOP_MS = 220; // the HTML face's hop (style.css face-pop)

// The hop of a new speaker `ms` after it began: from 6 px low, 92 % and 40 % seen, easing out to rest
export function hop(ms: number) {
  const k = Math.min(1, Math.max(0, ms / HOP_MS)),
    left = (1 - k) ** 2;
  return { dy: 6 * left, scale: 1 - 0.08 * left, alpha: 1 - 0.6 * left };
}

// What the face shows inside its frame (`box`, the frame's outside, 132 px or a phone's 66): the sheet's frame fills it
// less the 2 px border; the portrait, 3:4, stands in its left
export function faceFit(box: Box, sheet: boolean) {
  const k = box.w / 132,
    in2 = 2 * k;
  return sheet
    ? { x: box.x + in2, y: box.y + in2, w: box.w - 2 * in2, h: box.h - 2 * in2 }
    : { x: box.x, y: box.y, w: box.h * 0.75, h: box.h };
}

const hex = (s: string) => [1, 3, 5].map((i) => Number.parseInt(s.slice(i, i + 2), 16) / 255);

export class TalkFace {
  readonly group = new Group();
  private readonly textures = new Map<string, Texture>();
  private readonly uv = new Vector4(0, 0, 1, 1);
  private readonly mat = new ShaderMaterial({
    vertexShader: QUAD_VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: { uMap: { value: null }, uUv: { value: this.uv }, uTint: { value: new Vector4() }, uAlpha: { value: 1 } },
  });
  private readonly mesh = new Mesh(QUAD, this.mat);
  private def = '';
  private who = '';
  private frames = 1;
  private born = 0; // when the speaker came, for the hop
  private at: Box = { x: 0, y: 0, w: 0, h: 0 };

  constructor(
    private readonly wake: () => void,
    order: number,
  ) {
    this.mesh.renderOrder = order;
    this.mesh.visible = false;
    this.group.add(this.mesh);
  }

  // `def`: the speaker's figure ('' for none), `who` its name; `box`: the frame's outside on the page. A new speaker
  // hops, as the HTML face did (talk.ts: a new name, even on the same figure)
  set(def: string, who: string, box: Box | undefined, now: number) {
    if (!def || !box) {
      this.mesh.visible = false;
      this.def = this.who = '';
      return;
    }
    const f = faceOf(def),
      model = modelOf(def);
    if (who !== this.who) {
      this.who = who;
      this.born = now;
    }
    if (def !== this.def) {
      this.def = def;
      const url = f ? `/chars/${f.sheet}` : model ? `/chars/${model}.webp` : '';
      this.frames = f?.frames ?? 1;
      const tint = UNIT_DEFS[def]?.tint;
      const [r, g, b] = tint ? hex(tint) : [0, 0, 0];
      this.mat.uniforms.uTint.value.set(r, g, b, tint ? 0.55 : 0);
      this.mat.uniforms.uMap.value = url ? this.texture(url, !!f && faceSize(f.frameSize) > f.frameSize) : null;
      this.uv.set(0, 0, 1 / this.frames, 1);
    }
    this.at = faceFit(box, !!f);
    this.mesh.visible = !!this.mat.uniforms.uMap.value?.image;
  }

  // the mouth's frame (talk.ts mouthFrame) and the hop; true while it hops
  frame(n: number, now: number, still: boolean) {
    if (!this.def) return false;
    this.uv.x = (n % this.frames) / this.frames;
    const h = still ? hop(HOP_MS) : hop(now - this.born),
      { x, y, w, h: ht } = this.at;
    this.mesh.scale.set(w * h.scale, ht * h.scale, 1);
    this.mesh.position.set(x + w / 2, -(y + ht / 2 + h.dy), 0);
    this.mat.uniforms.uAlpha.value = h.alpha;
    this.mesh.visible = !!this.mat.uniforms.uMap.value?.image;
    return !still && now - this.born < HOP_MS;
  }

  // the 64 px sheets enlarged by a whole ratio stay crisp (style.css .face-strip.enlarged); the painted ones smooth
  private texture(url: string, crisp: boolean) {
    let tex = this.textures.get(url);
    if (!tex) {
      tex = new TextureLoader().load(url, () => this.wake());
      tex.magFilter = crisp ? NearestFilter : LinearFilter;
      this.textures.set(url, tex);
    }
    return tex;
  }

  dispose() {
    this.mat.dispose();
    for (const tex of this.textures.values()) tex.dispose();
    this.textures.clear();
    this.group.removeFromParent();
  }
}
