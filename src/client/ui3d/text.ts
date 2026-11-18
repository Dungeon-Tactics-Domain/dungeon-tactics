// Text of the 3D UI kit (ui3d/): a label drawn once on a canvas and used as a texture, with a faint dark halo like ink
// soaked into the paper. One texture per distinct text, size and colour, shared by every mesh that shows it and counted,
// so a screen that leaves frees only what nobody else uses; a move of the focus redraws nothing.
import { CanvasTexture, LinearFilter, Mesh, ShaderMaterial, type Texture } from 'three';
import { QUAD, QUAD_VERT } from './panel.ts';

export interface TextOpts {
  size: number; // CSS px
  color: string;
  font: string; // a CSS font family list (the theme's --font-ui3d)
  width?: number; // wraps at this many CSS px; one line without it
  line?: number; // line height in CSS px
  centre?: boolean; // each line in the middle of the widest one (the opening narration); from the left without it
}

// Lines of `str` no wider than `max` by `measure`, broken at spaces; "\n" starts a new paragraph. A word wider than
// `max` stays whole on its own line. Pure, so the wrap is tested without a canvas
export function wrapLines(str: string, max: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  for (const para of str.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (line && measure(next) > max) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
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
  const pad = 3 * dpr;
  cv.width = Math.ceil(Math.max(1, ...lines.map((l) => g.measureText(l).width)) + 2 * pad);
  cv.height = Math.ceil(lines.length * lh + 2 * pad);
  g.font = font; // sizing the canvas reset it
  g.textBaseline = 'middle';
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
