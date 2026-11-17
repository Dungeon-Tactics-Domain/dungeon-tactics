// Panels of the 3D UI kit (ui3d/): parchment drawn in the shader (rounded rectangle by distance field, four-corner
// gradient, bands, bevel, fibre grain, soft shadow) with the hand detail in one small painted texture (corner flourishes,
// stains, specks), and the flat inset band. The palette comes in as uniforms from the theme tokens (--ui3d-*, read by
// layer.ts); the multipliers here are shape (light, shade, wear), not palette. Colours were measured on the reference
// screenshots (FFT: The Ivalice Chronicles) and are screen colours: no shader here converts colour space.
import {
  CanvasTexture,
  LinearFilter,
  Mesh,
  PlaneGeometry,
  RepeatWrapping,
  ShaderMaterial,
  type Texture,
  Vector2,
  Vector3,
  Vector4,
} from 'three';

export type Rgb = [number, number, number];
// what the panels and the text take from the theme (style.css :root, --ui3d-*)
export interface Theme {
  paper: Rgb; // the sheet, at its lit top left corner
  shade: Rgb; // head, foot and icon column
  lit: Rgb; // the focused row
  band: Rgb; // the inset title band
  edge: Rgb; // outline and shadow
  ink: string;
  inkSoft: string;
  inkOff: string;
  font: string;
}

export const QUAD = new PlaneGeometry(1, 1);
// a quad at x,y (top left) under a group whose origin is a panel's top left: x right, y down
export function quad(mat: ShaderMaterial, x: number, y: number, w: number, h: number, order: number): Mesh {
  const m = new Mesh(QUAD, mat);
  m.scale.set(w, h, 1);
  m.position.set(x + w / 2, -(y + h / 2), 0);
  m.renderOrder = order;
  return m;
}

export const QUAD_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const NOISE = `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.03 + 17.0; a *= 0.5; }
  return s;
}
float sdBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}`;

// One quad per panel, `uPad` px larger on every side for the shadow. Everything is in px of the panel, y down, at the
// scale `uUnit` (1 on the 1920x1080 layout the numbers were measured on).
//   uHead / uFoot: height of the darker head and foot bands; uIconW: width of the darker icon column under the head;
//   uRows: top of the first row, row height, row count (lines between rows);
//   uFocus: the lit row band (centre y, height, strength, flash);
//   uLift: how far the panel stands off the screen (the shadow grows and falls further).
const PAPER = `
precision highp float;
varying vec2 vUv;
uniform vec2 uSize;
uniform float uPad;
uniform float uUnit;
uniform float uHead;
uniform float uFoot;
uniform float uIconW;
uniform vec3 uRows;
uniform vec4 uFocus;
uniform float uAlpha;
uniform float uLift;
uniform float uTime;
uniform float uSeed;
uniform sampler2D uPaint;
uniform vec3 uPaper;
uniform vec3 uShade;
uniform vec3 uLit;
uniform vec3 uEdge;
${NOISE}
void main() {
  vec2 p = vec2(vUv.x, 1.0 - vUv.y) * (uSize + 2.0 * uPad) - uPad;
  vec2 c = p - uSize * 0.5;
  float r = 4.0 * uUnit;
  float d = sdBox(c, uSize * 0.5, r);
  float cover = 1.0 - smoothstep(-0.5, 0.5, d);
  // shadow: falls down and to the right, wider and darker the higher the panel stands
  float fall = (3.0 + 10.0 * uLift) * uUnit;
  float ds = sdBox(c - vec2(fall * 0.4, fall), uSize * 0.5, r);
  float shadow = (0.4 + 0.22 * uLift) * (1.0 - smoothstep(-2.0 * uUnit, (9.0 + 22.0 * uLift) * uUnit, ds));

  vec2 g = clamp(p / uSize, 0.0, 1.0);
  vec2 u = p / uUnit; // the same grain and lines at every screen size
  vec2 size = uSize / uUnit;
  // paper: measured #e9e4d1 (top left) to #e1decb (bottom right); the token is a step lighter because the grain and
  // the stains below take it back down
  vec3 col = uPaper * mix(mix(1.0, 0.987, g.x), mix(0.982, 0.97, g.x), g.y);
  // icon column: #d5cfb9, melting into the rows over 5 px
  float column = (1.0 - smoothstep(uIconW - 1.0, uIconW + 4.0, u.x)) * step(0.5, uIconW);
  col = mix(col, uShade, column);
  // lines between the rows: one darker px with a lighter one under it, like a scored fold
  if (uRows.z > 0.5 && u.y > uRows.x + 2.0) {
    float k = (u.y - uRows.x) / uRows.y;
    float at = (k - floor(k + 0.5)) * uRows.y;
    float inside = step(0.5, floor(k + 0.5)) * step(floor(k + 0.5), uRows.z - 0.5);
    col *= 1.0 - 0.045 * inside * (1.0 - smoothstep(0.0, 1.0, abs(at + 0.5)));
    col *= 1.0 + 0.02 * inside * (1.0 - smoothstep(0.0, 1.0, abs(at - 0.8)));
  }
  // the focused row: lit #f4efd9 from the icon column, fading at the right edge, raised (light on top, shade under) with
  // a sheen that crosses it; uFocus.w whitens it when the row is confirmed
  float half_ = uFocus.y * 0.5;
  float dy = u.y - uFocus.x;
  float band = (1.0 - smoothstep(half_ - 1.5, half_, abs(dy))) * smoothstep(uIconW - 1.0, uIconW + 4.0, u.x);
  float lit = uFocus.z * band * (1.0 - 0.85 * smoothstep(size.x - 90.0, size.x - 4.0, u.x));
  col = mix(col, uLit, lit);
  col += 0.03 * uFocus.z * band * (1.0 - smoothstep(0.0, 2.5, dy + half_));
  // max(): far above the band the bare exp() overflowed and 0 * inf painted a tall panel's top rows black
  col *= 1.0 - 0.1 * uFocus.z * step(uIconW, u.x) * step(half_, dy) * exp(-max(dy - half_, 0.0) / 2.5);
  float sweep = mod(uTime * 0.42, 1.9) * size.x - 0.25 * size.x;
  col += 0.07 * lit * exp(-pow((u.x + dy * 0.6 - sweep) / 26.0, 2.0));
  col = mix(col, vec3(1.0, 0.99, 0.94), uFocus.w * band * (0.9 - 0.5 * abs(dy) / max(half_, 1.0)));
  // head band: measured #d0c9b6 on top to #d6d0ba, closed by a light line and a darker one
  if (uHead > 0.5 && u.y < uHead) {
    col = uShade * mix(0.98, 1.005, u.y / uHead);
    col = mix(col, uShade * 1.08, 1.0 - smoothstep(0.0, 1.2, abs(u.y - uHead + 3.2)));
    col = mix(col, uShade * 0.943, 1.0 - smoothstep(0.0, 1.2, abs(u.y - uHead + 1.2)));
  }
  // foot band (the sheet's page counter): #d4ceb8 under a scored line
  if (uFoot > 0.5 && u.y > size.y - uFoot) {
    col = uShade * 0.995;
    col *= 1.0 - 0.07 * (1.0 - smoothstep(0.0, 1.4, u.y - size.y + uFoot));
  }
  // grain: fibres stretched sideways, larger blotches, and the fibres' relief lit from the upper left
  float fibre = fbm(u * vec2(0.22, 1.3) + uSeed);
  float relief = fibre - fbm((u - 1.2) * vec2(0.22, 1.3) + uSeed);
  col *= 1.0 + (fibre - 0.42) * 0.022 + (fbm(u * 0.013 + uSeed * 3.1) - 0.4) * 0.026;
  col += relief * 0.07;
  // painted detail: a flourish mirrored into the four corners (red), stains (green) and specks (blue)
  vec2 corner = min(u, size - u) / 44.0;
  float ink = corner.x < 1.0 && corner.y < 1.0 ? texture2D(uPaint, corner * 0.5).r : 0.0;
  vec3 paint = texture2D(uPaint, u / 230.0 + uSeed).rgb;
  col = mix(col, col * vec3(0.74, 0.7, 0.6), ink * 0.5);
  col *= 1.0 - vec3(0.022, 0.027, 0.04) * paint.g - 0.05 * paint.b;
  // bevel: a light line inside the top and left edges, a shade inside the bottom and right, then the dark outline
  vec2 q = abs(c) - uSize * 0.5;
  vec2 n = q.x > q.y ? vec2(sign(c.x), 0.0) : vec2(0.0, sign(c.y));
  float light = dot(n, vec2(-0.5, -0.86));
  float rim = (1.0 - smoothstep(1.2, 3.4, -d / uUnit));
  col += rim * max(light, 0.0) * 0.07;
  col *= 1.0 - rim * max(-light, 0.0) * 0.2;
  col = mix(col, uEdge, (1.0 - smoothstep(0.3, 1.5, -d / uUnit)) * 0.8);
  gl_FragColor = vec4(mix(uEdge * 0.33, col, cover), mix(shadow, 1.0, cover) * uAlpha);
}`;

export interface PaperOpts {
  w: number;
  h: number;
  pad: number;
  unit: number;
  head?: number; // these four in px of the 1080p layout (the shader divides by `unit`)
  foot?: number;
  iconW?: number;
  rows?: [top: number, height: number, count: number];
  seed: number;
}
export function paperMaterial(paint: Texture, theme: Theme, o: PaperOpts): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: QUAD_VERT,
    fragmentShader: PAPER,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uSize: { value: new Vector2(o.w, o.h) },
      uPad: { value: o.pad },
      uUnit: { value: o.unit },
      uHead: { value: o.head ?? 0 },
      uFoot: { value: o.foot ?? 0 },
      uIconW: { value: o.iconW ?? 0 },
      uRows: { value: new Vector3(...(o.rows ?? [0, 1, 0])) },
      uFocus: { value: new Vector4(0, 1, 0, 0) },
      uAlpha: { value: 1 },
      uLift: { value: 0 },
      uTime: { value: 0 },
      uSeed: { value: o.seed },
      uPaint: { value: paint },
      uPaper: { value: new Vector3(...theme.paper) },
      uShade: { value: new Vector3(...theme.shade) },
      uLit: { value: new Vector3(...theme.lit) },
      uEdge: { value: new Vector3(...theme.edge) },
    },
  });
}

// A flat inset band on the paper (the sheet's name and title strips): shaded at its top edge, lit at the bottom, as if
// pressed into the sheet
const BAND = `
precision highp float;
varying vec2 vUv;
uniform vec2 uSize;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uUnit;
${NOISE}
void main() {
  vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uSize;
  float d = sdBox(p - uSize * 0.5, uSize * 0.5, 3.0 * uUnit);
  vec2 u = p / uUnit;
  vec3 col = uColor * (1.0 + (fbm(u * vec2(0.22, 1.3)) - 0.5) * 0.05);
  col *= 1.0 - 0.1 * exp(-u.y / 2.2);
  col *= 1.0 + 0.06 * exp(-(uSize.y / uUnit - u.y) / 1.6);
  gl_FragColor = vec4(col, (1.0 - smoothstep(-0.5, 0.5, d)) * uAlpha);
}`;
export function bandMaterial(w: number, h: number, unit: number, color: Rgb): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: QUAD_VERT,
    fragmentShader: BAND,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uSize: { value: new Vector2(w, h) },
      uColor: { value: new Vector3(...color) },
      uAlpha: { value: 1 },
      uUnit: { value: unit },
    },
  });
}

// The painted detail, 128 px, drawn once with a fixed seed (the same marks on every page): red holds the corner
// flourish in its top left quarter, green the stains and blue the specks and hairlines, both of them tiling
export function paintTexture(): CanvasTexture {
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d')!;
  let seed = 7;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  g.fillStyle = '#000';
  g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'lighter';
  // stains: soft blots, repeated across the edges so the tile has no seam
  for (let i = 0; i < 16; i++) {
    const x = rnd() * S,
      y = rnd() * S,
      r = 7 + rnd() * 20,
      a = 0.18 + rnd() * 0.4;
    for (const ox of [-S, 0, S])
      for (const oy of [-S, 0, S]) {
        const blot = g.createRadialGradient(x + ox, y + oy, r * 0.2, x + ox, y + oy, r);
        blot.addColorStop(0, `rgba(0,255,0,${a})`);
        blot.addColorStop(0.7, `rgba(0,255,0,${a * 0.5})`);
        blot.addColorStop(1, 'rgba(0,255,0,0)');
        g.fillStyle = blot;
        g.fillRect(x + ox - r, y + oy - r, 2 * r, 2 * r);
      }
  }
  // specks and a few hairlines
  g.fillStyle = 'rgba(0,0,255,0.7)';
  for (let i = 0; i < 90; i++) g.fillRect(rnd() * S, rnd() * S, 1, 1);
  g.strokeStyle = 'rgba(0,0,255,0.35)';
  g.lineWidth = 0.6;
  for (let i = 0; i < 7; i++) {
    const x = rnd() * S,
      y = rnd() * S;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rnd() - 0.5) * 26, y + (rnd() - 0.5) * 6);
    g.stroke();
  }
  // corner flourish in the top left 64 px: two strokes along the edges ending in dots, and a curl in the angle. Each
  // stroke goes down three times a little off itself, like a brush
  g.lineCap = 'round';
  const stroke = (draw: () => void) => {
    for (let k = 0; k < 3; k++) {
      g.save();
      g.translate((rnd() - 0.5) * 1.2, (rnd() - 0.5) * 1.2);
      g.strokeStyle = g.fillStyle = 'rgba(255,0,0,0.5)';
      g.lineWidth = 1.6 + rnd() * 0.8;
      g.beginPath();
      draw();
      g.restore();
    }
  };
  stroke(() => {
    g.moveTo(10, 7);
    g.lineTo(36, 7);
    g.stroke();
  });
  stroke(() => {
    g.moveTo(7, 10);
    g.lineTo(7, 36);
    g.stroke();
  });
  stroke(() => {
    g.arc(13.5, 13.5, 4.5, Math.PI * 0.5, Math.PI * 2);
    g.stroke();
  });
  stroke(() => {
    g.arc(41, 7, 1.5, 0, Math.PI * 2);
    g.fill();
  });
  stroke(() => {
    g.arc(7, 41, 1.5, 0, Math.PI * 2);
    g.fill();
  });
  const tex = new CanvasTexture(cv);
  tex.flipY = false; // uv 0,0 is the canvas's top left, where the shader looks for the corner
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.minFilter = tex.magFilter = LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}
