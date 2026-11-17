// A unit's face as a quad of the 3D kit (the end of battle, the saved games; result3d/, flow3d/): the painted sheet on
// one expression, else the top of its rendered portrait, as the HTML stillFace (hud-pieces.ts). One texture per
// picture, shared by every face a screen draws; the screen owns the cache and disposes it.
// (town3d.ts draws its faces with its own copy of this, on the neutral frame only.)
import { Mesh, ShaderMaterial, type Texture, TextureLoader, Vector4 } from 'three';
import { battleFace, type Expression, frameOf } from '../battle-face.ts';
import { modelOf } from '../markers.ts';
import type { Box } from './layout.ts';
import { QUAD, QUAD_VERT } from './panel.ts';

const FRAG = `
precision highp float;
varying vec2 vUv; uniform sampler2D uMap; uniform vec4 uUv; uniform float uAlpha; uniform float uGrey;
void main() {
  vec4 c = texture2D(uMap, uUv.xy + vUv * uUv.zw);
  c.rgb = mix(c.rgb, vec3(dot(c.rgb, vec3(0.3, 0.59, 0.11))) * 0.8, uGrey);
  gl_FragColor = vec4(c.rgb, c.a * uAlpha);
}`;

export type Faces = Map<string, Texture>;

// `grey`: a fallen hero's face; `ready`: the picture landed, draw again
export function faceMesh(faces: Faces, def: string, expr: Expression, b: Box, ready: () => void, grey = false) {
  const f = battleFace(def),
    url = f ? `/chars/${f.sheet}` : `/chars/${modelOf(def)}.webp`,
    uv = new Vector4(f ? frameOf(f, expr) / f.frames : 0, 0, f ? 1 / f.frames : 1, 1);
  const crop = (tex: Texture) => {
    const { width: w, height: h } = tex.image as HTMLImageElement;
    if (!f && h > w) uv.set(0, 1 - w / h, 1, w / h); // a tall portrait: its top square
    ready();
  };
  let tex = faces.get(url);
  if (!tex) {
    const made = (tex = new TextureLoader().load(url, () => made.dispatchEvent({ type: 'ready' } as never)));
    faces.set(url, tex);
  }
  if (tex.image) crop(tex);
  else tex.addEventListener('ready' as never, () => crop(tex));
  const m = new Mesh(
    QUAD,
    new ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: { uMap: { value: tex }, uUv: { value: uv }, uAlpha: { value: 1 }, uGrey: { value: grey ? 1 : 0 } },
    }),
  );
  m.scale.set(b.w, b.h, 1);
  m.position.set(b.x + b.w / 2, -(b.y + b.h / 2), 0);
  return m;
}
