// What a 3D form draws, field by field (ui3d/field.ts), on the parchment: a value sits in a well pressed into the
// sheet (the kit's inset band), an arrow and a button are plates standing off it (lit from the top left, shaded
// under, a shadow behind: nothing flat), text is ink. A field being typed in shows the real control's own text, its
// selection and its caret, so what is seen is what the unseen `<input>` holds (ui3d/field-dom.ts).
import { type Mesh, ShaderMaterial, Vector2, Vector3 } from 'three';
import { Part } from '../hints3d/hints3d.ts';
import { alpha } from '../menu3d/column.ts';
import { caretOf, type Field, fieldParts, type Metrics, REF } from '../ui3d/field.ts';
import type { Ui3dLayer } from '../ui3d/layer.ts';
import type { Box } from '../ui3d/layout.ts';
import { bandMaterial, QUAD_VERT, quad, type Rgb } from '../ui3d/panel.ts';
import { label, lift, put, rgba } from './draw.ts';

// A plate standing off the sheet: `uPad` px larger on every side for its shadow, like the paper panel
const PLATE = `
precision highp float;
varying vec2 vUv;
uniform vec2 uSize;
uniform float uPad;
uniform float uUnit;
uniform float uAlpha;
uniform vec3 uColor;
uniform vec3 uEdge;
float sdBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
void main() {
  vec2 p = vec2(vUv.x, 1.0 - vUv.y) * (uSize + 2.0 * uPad) - uPad;
  vec2 c = p - uSize * 0.5;
  float r = 5.0 * uUnit;
  float d = sdBox(c, uSize * 0.5, r);
  float cover = 1.0 - smoothstep(-0.5, 0.5, d);
  float shadow = 0.42 * (1.0 - smoothstep(-1.0 * uUnit, 5.0 * uUnit, sdBox(c - vec2(1.0, 2.6) * uUnit, uSize * 0.5, r)));
  // lit from the top left: lighter above, a bright line inside the top and left edges, a shade inside the others
  vec3 col = uColor * mix(1.05, 0.93, clamp(p.y / uSize.y, 0.0, 1.0));
  vec2 q = abs(c) - uSize * 0.5;
  vec2 n = q.x > q.y ? vec2(sign(c.x), 0.0) : vec2(0.0, sign(c.y));
  float light = dot(n, vec2(-0.5, -0.86));
  float rim = 1.0 - smoothstep(1.0 * uUnit, 3.2 * uUnit, -d);
  col += rim * max(light, 0.0) * 0.14;
  col *= 1.0 - rim * max(-light, 0.0) * 0.3;
  col = mix(col, uEdge, (1.0 - smoothstep(0.3, 1.5, -d / uUnit)) * 0.8);
  gl_FragColor = vec4(mix(uEdge * 0.33, col, cover), mix(shadow, 1.0, cover) * uAlpha);
}`;
const plateMaterial = (w: number, h: number, pad: number, unit: number, color: Rgb, edge: Rgb) =>
  new ShaderMaterial({
    vertexShader: QUAD_VERT,
    fragmentShader: PLATE,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uSize: { value: new Vector2(w, h) },
      uPad: { value: pad },
      uUnit: { value: unit },
      uAlpha: { value: 0 },
      uColor: { value: new Vector3(...color) },
      uEdge: { value: new Vector3(...edge) },
    },
  });

// the real control's text while it holds the focus: its value, its selection, and an area's first line in view
export interface Live {
  value: string;
  start: number;
  end: number;
  top: number;
}
export interface Pens {
  warn: string; // the ink of what stops the form (--ui3d-town-down)
  measure(str: string, px: number): number; // a text's width in the theme's font
}

const ORDER = 66; // wells and plates: over the paper and the focus band, under the fields' own text

// One field's drawing, from its own top left; `tip` is its caret, apart so it can blink
export class FieldArt {
  readonly part = new Part();
  readonly tip = new Part();
  key = '';
  private more: Mesh[] = [];

  constructor() {
    this.part.group.add(this.tip.group);
  }

  // `a`: how much of it shows; `caret`: 0 to 1, the caret's own share of that
  fade(a: number, caret: number) {
    this.part.want = a;
    this.part.fade(10);
    this.tip.want = a * caret;
    this.tip.fade(10);
    for (const m of this.more) alpha(m, this.part.alpha);
    this.part.group.visible = this.part.alpha > 0.004;
  }

  clear() {
    for (const m of this.more) {
      m.removeFromParent();
      (m.material as ShaderMaterial).dispose();
    }
    this.more = [];
    this.tip.clear();
    this.part.clear();
    this.part.group.add(this.tip.group); // the part's clear empties its group
  }

  draw(layer: Ui3dLayer, f: Field, b: Box, m: Metrics, pens: Pens, live?: Live) {
    this.clear();
    const { part } = this,
      { theme } = layer,
      { s } = m,
      unit = Math.max(0.6, s),
      mid = b.h / 2,
      p = fieldParts(f, { ...b, x: 0, y: 0 }, m);
    const add = (mesh: Mesh) => {
      this.more.push(mesh);
      part.group.add(mesh);
    };
    const text = (str: string, size: number, hex: string, wrap?: number) => label(layer, s, str, size, hex, wrap);
    // a well's own colour is too near the paper's to tell alone (1.7:1): an ink line closes it (3:1 for a control's edge)
    const well = (r: Box, v = 5 * unit) => {
      add(quad(bandMaterial(r.w, r.h - 2 * v, unit, theme.band), r.x, r.y + v, r.w, r.h - 2 * v, ORDER));
      part.box(r.x, r.y + v, r.w, r.h - 2 * v, 3 * unit, [0, 0, 0, 0], rgba(theme.ink, 0.85));
    };
    const plate = (r: Box, color: Rgb, v = 5 * unit) => {
      const pad = 8 * unit,
        h = r.h - 2 * v;
      add(
        quad(
          plateMaterial(r.w, h, pad, unit, color, theme.edge),
          r.x - pad,
          r.y + v - pad,
          r.w + 2 * pad,
          h + 2 * pad,
          ORDER,
        ),
      );
    };
    const name = (hex = theme.ink) =>
      put(part, text(f.label, REF.size.label, hex), p.label.x + m.inset, mid, 'left', p.label.w - 2 * m.inset);
    // a line of the control's text from `x`, its selection behind it and the caret at its end; `centre`: about x
    const typed = (raw: string, x: number, y: number, room: number, centre: boolean, from = -1, to = -1) => {
      const str = raw.replaceAll(' ', '\u00a0'); // the label's wrap drops a line's leading spaces (JSON's indent)
      const mesh = text(str || ' ', REF.size.value, theme.ink),
        px = Math.max(16, REF.size.value * s),
        w0 = mesh.scale.x;
      put(part, mesh, x, y, centre ? 'centre' : 'left', room);
      if (from < 0) return;
      const k = mesh.scale.x / w0, // shrunk to fit
        left = (centre ? x - mesh.scale.x / 2 : x) + 3 * k, // the label's own margin (ui3d/text.ts)
        at = (i: number) => left + pens.measure(str.slice(0, i), px) * k;
      if (to > from) part.box(at(from), y - px * 0.6, at(to) - at(from), px * 1.2, 2, rgba(theme.ink, 0.22));
      this.tip.box(at(to) - 1, y - px * 0.6, Math.max(1.5, 2 * s), px * 1.2, 0, rgba(theme.ink));
    };

    if (f.kind === 'head') {
      put(part, text(f.label, REF.size.head, theme.ink), 0, mid * 0.9);
      part.box(0, b.h - Math.max(2, 4 * s), b.w, Math.max(1, 2 * s), 0, rgba(theme.ink, 0.45));
    } else if (f.kind === 'note') {
      // a warning says so in a word too: colour is never the only signal
      const str = f.warn ? `! ${f.label}` : f.label;
      put(part, text(str, REF.size.note, f.warn ? pens.warn : theme.inkSoft, b.w), 0, mid);
    } else if (f.kind === 'button') {
      // one that is off lies pressed into the sheet instead of standing off it, its reason still in readable ink:
      // the shape says it, not a paler colour
      if (f.off) well({ x: 0, y: 0, w: b.w, h: b.h }, 3 * unit);
      else plate({ x: 0, y: 0, w: b.w, h: b.h }, f.main ? theme.lit : theme.shade, 3 * unit);
      const hex = f.off ? theme.inkSoft : theme.ink;
      if (f.fold === undefined)
        put(part, text(f.label, REF.size.label, hex), b.w / 2, mid, 'centre', b.w - 2 * m.inset);
      else {
        // a group's row: what it holds at the left, and whether it is open at the right
        name(hex);
        put(part, text(f.fold ? '▾' : '▸', REF.size.label * 1.3, theme.ink), b.w - m.inset - 8 * s, mid, 'right');
      }
    } else if (f.kind === 'check') {
      well(p.value!, 0);
      if (f.on) put(part, text('✓', REF.size.label, theme.ink), p.value!.x + p.value!.w / 2, mid, 'centre');
      name(f.on ? theme.ink : theme.inkSoft);
    } else if (f.kind === 'area') {
      well(b, 0);
      const lines = (live?.value ?? f.value).split('\n'),
        top = live?.top ?? 0,
        caret = live && caretOf(live.value, live.end);
      for (let i = 0; i < f.rows && top + i < lines.length; i++) {
        const on = caret?.line === top + i;
        typed(
          lines[top + i],
          m.inset,
          m.inset + (i + 0.5) * m.line,
          b.w - 2 * m.inset,
          false,
          on ? caret.col : -1,
          on ? caret.col : -1,
        );
      }
    } else {
      name();
      const v = p.value!,
        str = live?.value ?? String(f.kind === 'pick' ? f.text : f.value);
      if (f.kind === 'text') {
        well(v);
        typed(str, v.x + m.inset, mid, v.w - 2 * m.inset, false, live?.start, live?.end);
      } else {
        well(v);
        typed(str, v.x + v.w / 2, mid, v.w - m.inset, true, live?.start, live?.end);
        for (const [r, glyph] of [
          [p.less!, f.kind === 'pick' ? '‹' : '−'],
          [p.more!, f.kind === 'pick' ? '›' : '+'],
        ] as const) {
          const inner = { x: r.x + 4 * unit, y: 0, w: r.w - 8 * unit, h: b.h };
          plate(inner, theme.shade);
          put(part, text(glyph, REF.size.label * 1.3, theme.ink), r.x + r.w / 2, mid, 'centre');
        }
      }
    }
    // over the paper and the focus band; the wells, the plates and the caret's group keep their own order
    for (const c of part.group.children)
      if (c !== this.tip.group && !this.more.includes(c as Mesh)) c.renderOrder += 40;
    lift(this.tip, 42);
  }
}
