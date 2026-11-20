// Look of the 3D combat bar (bar3d.ts): one shader draws a whole unit sheet (the side's band, the dark strip, the
// bars and the framed portrait) and another the strike preview plate. Colours were measured on the reference capture
// (FFT: The Ivalice Chronicles, 1920x1080) and go to the canvas as they are: screen colours, no conversion. The boxes
// come from bar-layout.ts as uniforms, so the text and the drawing never disagree.
import { ShaderMaterial, type Texture, Vector2, Vector3, Vector4 } from 'three';
import type { Box } from '../ui3d/layout.ts';
import { PLATE, type SheetLayout } from './bar-layout.ts';

export const PAD = 14; // room around a region inside its quad, in reference px: the portrait's shadow and the soft edges
export const hex = (h: string) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16) / 255);
const glsl = (h: string) =>
  `vec3(${hex(h)
    .map((v) => v.toFixed(3))
    .join(', ')})`;
const v4 = (b: Box) => new Vector4(b.x, b.y, b.w, b.h);

// uv with y down, like the page
const VERT = `
varying vec2 vUv;
void main() {
  vUv = vec2(uv.x, 1.0 - uv.y);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const LIB = `
float box(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
float cov(float d) { return 1.0 - smoothstep(-0.6, 0.6, d); }
vec4 over(vec4 d, vec3 c, float a) {
  float o = a + d.a * (1.0 - a);
  return vec4(o > 0.0 ? (c * a + d.rgb * d.a * (1.0 - a)) / o : c, o);
}
// distance to a box given as x, y, w, h; lean > 0 slants it into the reference's parallelogram
float rect(vec2 u, vec4 b, float r, float lean) {
  vec2 c = u - b.xy - b.zw * 0.5;
  c.x -= c.y * lean;
  return box(c, b.zw * 0.5, r);
}
float along(vec2 u, vec4 b, float lean) { return (u.x - (u.y - b.y - b.w * 0.5) * lean - b.x) / b.z; }`;

// Back to front: the band in the side's colour, the dark strip, the bars, the portrait. Everything in reference px
// from the region's top left (`u`); uUnit turns a distance into screen px for the edges
const SHEET = `
precision highp float;
varying vec2 vUv;
uniform vec2 uSize; uniform float uUnit; uniform float uAlpha; uniform float uTime; uniform float uTeam; uniform float uMirror;
uniform vec4 uBand; uniform vec4 uStrip; uniform vec4 uPortrait; uniform vec4 uHpBar; uniform vec4 uPoolBar; uniform vec4 uCtBar;
uniform vec4 uBox; uniform vec4 uBoxBar;
uniform vec3 uHp; uniform float uSure; uniform vec3 uFill; uniform float uLine; uniform float uTag;
uniform sampler2D uFace; uniform vec4 uFaceUv; uniform vec4 uTint; uniform float uHasFace;
${LIB}
// a thin round bar: dark groove, fill up to f
vec4 groove(vec4 col, vec2 u, vec4 b, float f, vec3 tone) {
  float d = rect(u, b, b.w * 0.5, 0.0) * uUnit;
  col = over(col, ${glsl('#0a0e16')}, 0.85 * cov(d - 1.5));
  float y = (u.y - b.y) / b.w;
  return over(col, tone * (1.15 - 0.4 * y), cov(d) * step(along(u, b, 0.0), f));
}
void main() {
  vec2 u = vUv * uSize - ${PAD}.0;
  vec4 col = vec4(0.0);

  // band: the side's colour beside the portrait, thinning away from it and darker toward its foot
  float t = (u.x - uBand.x) / uBand.z;
  t = mix(t, 1.0 - t, uMirror);
  float v = (u.y - uBand.y) / uBand.w;
  vec3 side = mix(${glsl('#172958')}, ${glsl('#5a3330')}, uTeam);
  side = mix(side * 1.12, mix(${glsl('#101a33')}, ${glsl('#322827')}, uTeam), smoothstep(0.35, 1.0, v));
  float dBand = rect(u, uBand, 6.0, 0.0) * uUnit;
  float thin = mix(0.95, 0.42, smoothstep(0.3, 0.72, t)) * (1.0 - smoothstep(0.9, 1.0, t));
  col = over(col, side, thin * cov(dBand));
  // bevel: a lit line inside the top edge, a shade inside the bottom
  float rim = (1.0 - smoothstep(0.0, 2.2, -dBand)) * cov(dBand) * thin;
  col.rgb += rim * (v < 0.5 ? 0.16 : -0.1);

  // the strip under the bars, where the class or the aimed strike's line goes
  float st = (u.x - uStrip.x) / uStrip.z;
  st = mix(st, 1.0 - st, uMirror);
  col = over(col, ${glsl('#0d1427')}, uLine * 0.78 * cov(rect(u, uStrip, 5.0, 0.0) * uUnit) * (1.0 - smoothstep(0.82, 1.0, st)));

  // life: what stays, the part an aimed strike takes (red) or a heal adds (pale), blinking, and the empty rest
  float dH = rect(u, uHpBar, 3.0, 0.5) * uUnit;
  float changing = step(uHp.x + 0.001, uHp.y);
  col = over(col, mix(${glsl('#0a0e16')}, ${glsl('#8fd02c')}, 0.75 * changing), 0.9 * cov(dH - 2.0));
  col = over(col, ${glsl('#141a12')}, cov(dH));
  float fx = along(u, uHpBar, 0.5);
  float fy = (u.y - uHpBar.y) / uHpBar.w;
  vec3 green = mix(${glsl('#9cc93a')}, ${glsl('#5c8213')}, fy);
  // the part it changes for certain (the least damage or heal) is solid; only the part it may change blinks (Nov 19)
  float maybe = uHp.z > 0.5 ? step(uSure, fx) : step(fx, uSure);
  vec3 part = mix(${glsl('#fc563e')}, ${glsl('#d9f29a')}, uHp.z) * (1.0 - maybe * (0.18 - 0.18 * sin(uTime * 6.0)));
  if (fx <= uHp.x) col = over(col, green, cov(dH));
  else if (fx <= uHp.y) col = over(col, part, cov(dH));

  // the first pool beside it (uFill.x < 0: the sheet has none)
  if (uFill.x >= 0.0) {
    float dP = rect(u, uPoolBar, 3.0, 0.5) * uUnit;
    col = over(col, ${glsl('#0a0e16')}, 0.9 * cov(dP - 2.0));
    col = over(col, ${glsl('#1a1414')}, cov(dP));
    float px = along(u, uPoolBar, 0.5);
    vec3 pool = mix(${glsl('#b34d4b')}, ${glsl('#c99a62')}, px) * (1.12 - 0.3 * (u.y - uPoolBar.y) / uPoolBar.w);
    col = over(col, pool, cov(dP) * step(px, uFill.x));
  }
  // the second pool in its dark box
  if (uFill.y >= 0.0) {
    float dX = rect(u, uBox, 4.0, 0.0) * uUnit;
    col = over(col, ${glsl('#3a4460')}, 0.6 * cov(dX));
    col = over(col, ${glsl('#0d1427')}, 0.9 * cov(dX + 1.2));
    col = groove(col, u, uBoxBar, uFill.y, ${glsl('#c2785a')});
  }
  if (uFill.z >= 0.0) col = groove(col, u, uCtBar, uFill.z, ${glsl('#b89318')});

  // portrait: shadow, dark outer line, light frame, then the picture on its side's ground
  vec2 pc = u - uPortrait.xy - uPortrait.zw * 0.5;
  vec2 ph = uPortrait.zw * 0.5;
  float dS = box(pc - vec2(2.0, 4.0), ph, 10.0);
  col = over(col, ${glsl('#05080f')}, 0.55 * (1.0 - smoothstep(-3.0, 9.0, dS)));
  float dF = box(pc, ph, 10.0) * uUnit;
  col = over(col, ${glsl('#684630')}, cov(dF));
  col = over(col, mix(${glsl('#efe5c8')}, ${glsl('#b9a983')}, pc.y / uPortrait.w + 0.5), cov(dF + 1.5));
  vec2 ih = ph - 4.5;
  float dI = box(pc, ih, 7.0) * uUnit;
  vec2 uv = clamp(pc / (2.0 * ih) + 0.5, 0.0, 1.0);
  vec3 hero = mix(mix(${glsl('#aab6b6')}, ${glsl('#a6b9c6')}, uv.x), mix(${glsl('#8fa5a4')}, ${glsl('#97afb4')}, uv.x), uv.y);
  vec3 foe = mix(mix(${glsl('#cdb0a4')}, ${glsl('#c8a39a')}, uv.x), mix(${glsl('#bd8176')}, ${glsl('#c4958d')}, uv.x), uv.y);
  vec3 pic = mix(hero, foe, uTeam);
  if (uHasFace > 0.5) {
    vec4 f = texture2D(uFace, uFaceUv.xy + uv * uFaceUv.zw);
    f.rgb = mix(f.rgb, dot(f.rgb, vec3(0.299, 0.587, 0.114)) * uTint.rgb * 1.7, uTint.a);
    pic = mix(pic, f.rgb, f.a);
  }
  pic *= 1.0 - 0.25 * smoothstep(-8.0, 0.5, dI / uUnit);
  // a shade at the foot, under the side's tag
  pic = mix(pic, ${glsl('#3a1216')}, uTag * 0.72 * smoothstep(0.72, 0.9, uv.y));
  col = over(col, pic, cov(dI));

  gl_FragColor = vec4(col.rgb, col.a * uAlpha);
}`;

export function sheetMaterial(l: SheetLayout): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: SHEET,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uSize: { value: new Vector2(l.w + 2 * PAD, l.h + 2 * PAD) },
      uUnit: { value: 1 },
      uAlpha: { value: 0 },
      uTime: { value: 0 },
      uTeam: { value: 0 },
      uMirror: { value: l.mirror ? 1 : 0 },
      uBand: { value: v4(l.band) },
      uStrip: { value: v4(l.strip) },
      uPortrait: { value: v4(l.portrait) },
      uHpBar: { value: v4(l.hpBar) },
      uPoolBar: { value: v4(l.poolBar) },
      uCtBar: { value: v4(l.ctBar) },
      uBox: { value: v4(l.box) },
      uBoxBar: { value: v4(l.boxBar) },
      uHp: { value: new Vector3(1, 1, 0) }, // what stays, up to where it changes, 1 for a heal
      uSure: { value: 1 }, // where the part it changes for certain meets the part it may change
      uFill: { value: new Vector3(-1, -1, -1) }, // first pool, second pool and CT, each 0 to 1 or under 0 for none
      uLine: { value: 0 }, // 1 when the strip has a text
      uTag: { value: 0 }, // 1 when the portrait carries the side's tag
      uFace: { value: null as Texture | null },
      uFaceUv: { value: new Vector4(0, 0, 1, 1) },
      uTint: { value: new Vector4(0, 0, 0, 0) }, // no tint (a bare Vector4 has w = 1)
      uHasFace: { value: 0 },
    },
  });
}

// The plate: a dark arrow whose point reaches the target's sheet, clear on the left where it meets the acting sheet,
// closed by a thin light line. uWarn reddens the line when the strike reaches the user's own side
const PLATE_FRAG = `
precision highp float;
varying vec2 vUv;
uniform vec2 uSize; uniform float uUnit; uniform float uAlpha; uniform float uWarn;
${LIB}
void main() {
  vec2 u = vUv * uSize - ${PAD}.0;
  vec2 size = vec2(${PLATE.w}.0, ${PLATE.h}.0);
  vec2 c = u - size * 0.5;
  // the two cuts that make the point: lines from the straight edges' ends to the tip, at mid height
  vec2 n = normalize(vec2(size.y * 0.5, ${PLATE.tip}.0));
  float cut = dot(vec2(c.x - size.x * 0.5, abs(c.y)), n);
  float d = max(box(c, size * 0.5, 3.0), cut) * uUnit;
  float left = smoothstep(0.0, 110.0, u.x);
  vec3 ground = mix(${glsl('#222220')}, ${glsl('#181715')}, u.y / size.y);
  vec4 col = vec4(ground, 0.93 * left * cov(d));
  vec3 line = mix(${glsl('#b9b3a0')}, ${glsl('#ff7a5c')}, uWarn);
  col = over(col, line, 0.9 * left * cov(d) * (1.0 - smoothstep(0.6, 2.4, -d)));
  gl_FragColor = vec4(col.rgb, col.a * uAlpha);
}`;

export function plateMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: PLATE_FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uSize: { value: new Vector2(PLATE.w + 2 * PAD, PLATE.h + 2 * PAD) },
      uUnit: { value: 1 },
      uAlpha: { value: 0 },
      uWarn: { value: 0 },
    },
  });
}
