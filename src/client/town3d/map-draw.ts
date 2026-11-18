// What the 3D expedition map draws with (map3d.ts): the pen that puts text, flat boxes and faces on the town windows'
// reference, and the chart itself (the floors' bands, the ways, the places as seals and the party's flag).
import { type Group, Mesh, ShaderMaterial, type Texture, TextureLoader, Vector4 } from 'three';
import { battleFace } from '../battle-face.ts';
import { type Colors, label, lift, put, rgba } from '../flow3d/draw.ts';
import type { MapView } from '../game/expedition-map.ts';
import type { Part, Quad, Rgba } from '../hints3d/hints3d.ts';
import { t } from '../i18n.ts';
import { modelOf } from '../markers.ts';
import { Icon } from '../menu3d/column.ts';
import type { Ui3dLayer } from '../ui3d/layer.ts';
import { type Box, place, REGIONS } from '../ui3d/layout.ts';
import { QUAD, QUAD_VERT, type Rgb } from '../ui3d/panel.ts';
import { M, type MapLayout } from './map-layout.ts';

const FACE_FRAG = `
precision highp float;
varying vec2 vUv; uniform sampler2D uMap; uniform vec4 uUv; uniform float uAlpha;
void main() { vec4 c = texture2D(uMap, uUv.xy + vUv * uUv.zw); gl_FragColor = vec4(c.rgb, c.a * uAlpha); }`;
const last = (p: Part) => p.group.children.at(-1) as Quad;
export const tint = (c: Rgb, a = 1): Rgba => [c[0], c[1], c[2], a];
// the town tokens the map takes (style.css --ui3d-town-*): the gold of what is open or in focus, the flag, the bars
export type Tones = Record<'gold' | 'flag' | 'track' | 'hp' | 'mp' | 'up', string>;

export class Pen {
  private readonly faces = new Map<string, Texture>();
  constructor(readonly layer: Ui3dLayer) {}

  // the reference's px on the page: the whole screen is the town windows' region, centred and scaled as one
  box(b: Box): Box {
    const o = place(REGIONS.town, this.layer.whole),
      s = this.layer.whole.s;
    return { x: o.x + b.x * s, y: o.y + b.y * s, w: b.w * s, h: b.h * s };
  }
  // text with its middle (or the end `align` names) on a spot of the reference; `room`: shrinks to this width
  say(
    p: Part,
    str: string,
    size: number,
    hex: string,
    x: number,
    y: number,
    align?: 'left' | 'centre' | 'right',
    room = Infinity,
  ) {
    const s = this.layer.whole.s,
      at = this.box({ x, y, w: 0, h: 0 });
    return put(p, label(this.layer, s, str, size, hex), at.x, at.y, align, room * s);
  }
  fill(p: Part, b: Box, color: Rgba, radius = 0, edge?: Rgba) {
    const at = this.box(b);
    p.box(at.x, at.y, at.w, at.h, radius * this.layer.whole.s, color, edge);
    return last(p);
  }

  // a unit's painted face on its neutral frame, else the top of its rendered portrait (as town3d.ts)
  face(def: string, box: Box): Mesh {
    const b = this.box(box),
      f = battleFace(def),
      url = f ? `/chars/${f.sheet}` : `/chars/${modelOf(def)}.webp`,
      uv = new Vector4(0, 0, f ? 1 / f.frames : 1, 1);
    const mat = new ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: FACE_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: { uMap: { value: null }, uUv: { value: uv }, uAlpha: { value: 0 } },
    });
    const crop = (tex: Texture) => {
      const { width: w, height: h } = tex.image as HTMLImageElement;
      if (!f && h > w) uv.set(0, 1 - w / h, 1, w / h);
      this.layer.wake();
    };
    // one texture per picture; a face asked for while its picture still loads is fitted when it lands
    let tex = this.faces.get(url);
    if (!tex) {
      const made = (tex = new TextureLoader().load(url, () => made.dispatchEvent({ type: 'ready' } as never)));
      this.faces.set(url, tex);
    }
    if (tex.image) crop(tex);
    else tex.addEventListener('ready' as never, () => crop(tex));
    mat.uniforms.uMap.value = tex;
    const m = new Mesh(QUAD, mat);
    m.scale.set(b.w, b.h, 1);
    m.position.set(b.x + b.w / 2, -(b.y + b.h / 2), 0);
    m.renderOrder = 64;
    return m;
  }
  dispose() {
    for (const tex of this.faces.values()) tex.dispose();
  }
}

// The chart on its sheet. `ways`: each floor a band with its name, then the ways, told apart by weight and dash as
// well as colour (walked thick gold, open plain ink, to come thin, closed dotted), and the gate's tag. `marks`: a
// place is a round seal for a room (its enemy count on it), square for the chest (a gem), bigger for the boss (a
// sword), each standing off the sheet on its shade; gold while open, sunk once cleared (✓), an empty pale ring when
// no way leads there any more (✕); then the party's flag. Gives back the low-poly icons it stood on `deep`
export function drawChart(
  pen: Pen,
  L: MapLayout,
  places: MapView['places'],
  c: Colors,
  tone: Tones,
  ways: Part,
  marks: Part,
  deep: Group,
) {
  const { theme, stage } = pen.layer,
    s = stage.s,
    ink = (a = 1) => tint(theme.edge, a),
    icons: { icon: Icon; size: number }[] = [];
  L.floors.forEach((f, i) => {
    if (i % 2) pen.fill(ways, f.box, tint(theme.band, 0.3));
    if (i) pen.fill(ways, { ...f.box, h: 2 }, ink(0.25));
    pen.say(ways, t(`Andar ${f.floor}`, `Floor ${f.floor}`), 22, theme.inkSoft, M.chart.x + 18, f.box.y + 22);
  });
  const WAY = {
    walked: [7, rgba(tone.gold)],
    open: [4, rgba(theme.ink)],
    ahead: [2, rgba(theme.inkSoft, 0.8)],
  } as const;
  for (const l of L.links) {
    const a = pen.box({ x: l.x1, y: l.y1, w: 0, h: 0 }),
      b = pen.box({ x: l.x2, y: l.y2, w: 0, h: 0 });
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (l.kind === 'off') {
      const dot = 4 * s;
      for (let d = 0; d < len; d += 14 * s) {
        const x = a.x + ((b.x - a.x) * d) / len,
          y = a.y + ((b.y - a.y) * d) / len;
        ways.box(x - dot / 2, y - dot / 2, dot, dot, dot, rgba(theme.inkOff));
      }
      continue;
    }
    const [w, col] = WAY[l.kind];
    ways.box((a.x + b.x - len) / 2, (a.y + b.y - w * s) / 2, len, w * s, w * s, col);
    last(ways).rotation.z = Math.atan2(a.y - b.y, b.x - a.x); // the page's y runs down
  }
  pen.fill(ways, { x: L.gate.x - 62, y: L.gate.y - 19, w: 124, h: 38 }, rgba(c.plate, 0.94), 5, rgba(c.line));
  pen.say(ways, t('Portão', 'Gate'), 22, c.text, L.gate.x, L.gate.y, 'centre');
  lift(ways, 33);

  L.places.forEach((p, i) => {
    const { state, kind, size } = p,
      { mark } = places[i],
      at = { x: p.x - size / 2, y: p.y - size / 2, w: size, h: size },
      round = kind === 'chest' ? 9 : size;
    const body =
      state === 'open'
        ? rgba(tone.gold)
        : state === 'cleared'
          ? tint(theme.band)
          : tint(theme.shade, state === 'skipped' ? 0 : 1);
    if (state !== 'skipped') pen.fill(marks, { ...at, x: at.x + 2, y: at.y + 5 }, ink(0.3), round);
    const seal = pen.fill(marks, at, body, round, state === 'skipped' ? rgba(theme.inkOff) : ink());
    seal.material.uniforms.uLine.value = (state === 'open' ? 3 : 2) * s;
    const hex =
      state === 'open' ? c.title : state === 'cleared' ? tone.up : state === 'skipped' ? theme.inkSoft : theme.ink;
    if (mark) return void pen.say(marks, mark, kind === 'boss' ? 32 : 26, hex, p.x, p.y, 'centre');
    const icon = new Icon(null, kind === 'boss' ? 'sword' : 'gem');
    icon.tone(state === 'open' ? 0 : 0.55, 0);
    const mid = pen.box({ x: p.x, y: p.y, w: 0, h: 0 });
    icon.group.position.set(mid.x, -mid.y, 200);
    deep.add(icon.group);
    icons.push({ icon, size: size * 0.66 * s });
  });
  pen.fill(marks, { ...L.flag, w: 4, h: 40 }, ink());
  pen.fill(marks, { x: L.flag.x + 4, y: L.flag.y, w: 24, h: 16 }, rgba(tone.flag), 2, ink());
  lift(marks, 35);
  return icons;
}
