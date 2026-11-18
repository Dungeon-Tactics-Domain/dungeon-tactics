// Text of the 3D UI kit (ui3d/): a label drawn once on a canvas and used as a texture, with a faint dark halo like ink
// soaked into the paper. One texture per distinct text, size and colour, shared by every mesh that shows it and counted,
// so a screen that leaves frees only what nobody else uses; a move of the focus redraws nothing.
import { CanvasTexture, LinearFilter, Mesh, ShaderMaterial, type Texture } from 'three';
import { wrapLines } from '../wrap-lines.ts';
import { QUAD, QUAD_VERT } from './panel.ts';

export interface TextOpts {
  size: number; // CSS px
  color: string;
  font: string; // a CSS font family list (the theme's --font-ui3d)
  width?: number; // wraps at this many CSS px; one line without it
  line?: number; // line height in CSS px
  centre?: boolean; // each line in the middle of the widest one (the opening narration); from the left without it
  shadow?: boolean; // a hard dark outline and a drop shadow, for a text with no plate over the map (the Height corner)
}

export { wrapLines };

let pen: CanvasRenderingContext2D | undefined;
// How many lines `str` takes drawn with `o`, by the same wrap as the label itself: for a layout that sizes a box by
// the words it holds, with no HTML to measure
export function lineCount(str: string, o: Pick<TextOpts, 'size' | 'font' | 'width'>, dpr: number): number {
  pen ??= document.createElement('canvas').getContext('2d')!;
  const g = pen;
  g.font = `500 ${o.size * dpr}px ${o.font}`;
  return wrapLines(str, o.width ? o.width * dpr : Infinity, (s) => g.measureText(s).width).length;
}

// A line's width in CSS px as the labels write it, for a layout that sizes a plate by its words
export function textWidth(str: string, size: number, font: string): number {
  pen ??= document.createElement('canvas').getContext('2d')!;
  pen.font = `500 ${size}px ${font}`;
  return pen.measureText(str).width;
}

interface Label {
  tex: CanvasTexture;
  w: number; // CSS px
  h: number;
  uses: number;
}
const labels = new Map<string, Label>();

function draw(str: string, o: TextOpts, dpr: number): Label {
  const cv = document.createElement('canvas');
  const g = cv.getContext('2d')!;
  const font = `500 ${o.size * dpr}px ${o.font}`;
  g.font = font;
  const lines = wrapLines(str, o.width ? o.width * dpr : Infinity, (s) => g.measureText(s).width);
  const lh = (o.line ?? o.size * 1.3) * dpr;
  // the shadow's room: its outline, blur and drop must not be cut at the canvas's edge
  const pad = (o.shadow ? 3 + Math.max(2, o.size * 0.16) : 3) * dpr;
  cv.width = Math.ceil(Math.max(1, ...lines.map((l) => g.measureText(l).width)) + 2 * pad);
  cv.height = Math.ceil(lines.length * lh + 2 * pad);
  g.font = font; // sizing the canvas reset it
  g.textBaseline = 'middle';
  if (o.shadow) {
    // Fernando, Nov 18: the Height and the tile line lost their plate. A blur alone vanished on snow and sand, so a
    // near-black outline holds the letters' edge on a light floor and a soft drop below it on a dark one
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(10, 8, 6, 0.92)';
    g.lineWidth = Math.max(2, o.size * 0.16) * dpr;
    g.shadowColor = 'rgba(0, 0, 0, 0.85)';
    g.shadowBlur = 3 * dpr;
    g.shadowOffsetY = 1.5 * dpr;
    lines.forEach((l, i) => {
      g.strokeText(l, o.centre ? (cv.width - g.measureText(l).width) / 2 : pad, pad + lh * (i + 0.5));
    });
  }
  g.fillStyle = o.color;
  g.shadowColor = 'rgba(60, 50, 30, 0.55)';
  g.shadowBlur = 2 * dpr;
  g.shadowOffsetY = 0.5 * dpr;
  // a hair of stroke in the same ink: the system serif has no weight between regular and bold
  g.strokeStyle = o.color;
  g.lineWidth = o.size * 0.02 * dpr;
  lines.forEach((l, i) => {
    const x = o.centre ? (cv.width - g.measureText(l).width) / 2 : pad;
    g.strokeText(l, x, pad + lh * (i + 0.5));
    g.fillText(l, x, pad + lh * (i + 0.5));
  });
  const tex = new CanvasTexture(cv);
  tex.minFilter = tex.magFilter = LinearFilter;
  tex.generateMipmaps = false;
  return { tex, w: cv.width / dpr, h: cv.height / dpr, uses: 0 };
}

const TEXT_FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uMap;
uniform float uAlpha;
void main() {
  vec4 c = texture2D(uMap, vUv);
  gl_FragColor = vec4(c.rgb, c.a * uAlpha);
}`;
const textMaterial = (map: Texture) =>
  new ShaderMaterial({
    vertexShader: QUAD_VERT,
    fragmentShader: TEXT_FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: { uMap: { value: map }, uAlpha: { value: 1 } },
  });

function mesh(key: string, make: () => Label): Mesh<typeof QUAD, ShaderMaterial> {
  let l = labels.get(key);
  if (!l) labels.set(key, (l = make()));
  l.uses++;
  const m = new Mesh(QUAD, textMaterial(l.tex));
  m.scale.set(l.w, l.h, 1);
  m.userData.label = key;
  return m;
}
// A quad showing `str` at its drawn size in CSS px (scale.x, scale.y), with `uAlpha` to fade it. Free it with dropText
export const textMesh = (str: string, o: TextOpts, dpr: number) =>
  mesh(JSON.stringify([str, o, dpr]), () => draw(str, o, dpr));
// The same for a drawing made elsewhere (a key cap, a pad button: caps.ts): `make` draws it in device px, once per `key`
export const imageMesh = (key: string, make: () => HTMLCanvasElement, dpr: number) =>
  mesh(key, () => {
    const cv = make();
    const tex = new CanvasTexture(cv);
    tex.minFilter = tex.magFilter = LinearFilter;
    tex.generateMipmaps = false;
    return { tex, w: cv.width / dpr, h: cv.height / dpr, uses: 0 };
  });
export function dropText(m: Mesh) {
  m.removeFromParent();
  (m.material as ShaderMaterial).dispose();
  const l = labels.get(m.userData.label);
  if (!l || --l.uses > 0) return;
  l.tex.dispose();
  labels.delete(m.userData.label);
}
