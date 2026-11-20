// Look of a card of the 3D turn list (turn3d.ts): one shader draws the whole row, plus the small painted texture and
// the digit atlas it reads, both generated here. Colours and sizes were measured on the reference screenshots (FFT: The
// Ivalice Chronicles' combat timeline, 1280x720) and go to the canvas as they are: screen colours, no conversion.
import { DataTexture, LinearFilter, RepeatWrapping, ShaderMaterial, Texture, Vector2, Vector3, Vector4 } from 'three';

// room around a row's box inside its quad, in design px: the number and the gold plate on the left, the target band on
// the right, the glow and the shadow above and below
export const INK = '#f1ebd2'; // the light ink of the 3D bar's numbers (bar3d.ts), on the same dark ground
export const LEFT = 46;
export const RIGHT = 176;
export const PAD = 14;
const CARD_W = 44; // the row's width in design px (style.css); the shader scales the card's parts by its real width
export const hex = (h: string) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16) / 255);
const glsl = (h: string) =>
  `vec3(${hex(h)
    .map((v) => v.toFixed(3))
    .join(', ')})`;

// the layer's world has y up from the HUD's bottom; the shader works in px from the top, like the page
const VERT = `
varying vec2 vUv; varying float vTop;
uniform float uH;
void main() {
  vUv = vec2(uv.x, 1.0 - uv.y);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vTop = uH - w.y;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

// One shader draws the whole row, back to front: target band and gold plate, the four pools' bars beside the card,
// shadow, halo, frame, picture, a foe's diamond, charge badge and number. Shapes are rounded-rectangle distances; the small painted texture (uPaint) wears the frame,
// the plate and the picture's ground so the flat gradients read as painted pieces
const FRAG = `
precision highp float;
varying vec2 vUv; varying float vTop;
uniform vec2 uSize; uniform vec2 uOrigin; uniform vec2 uCard; uniform vec2 uClip; uniform vec2 uHp; uniform vec2 uIconGrid;
uniform float uS; uniform float uTime; uniform float uAlpha; uniform float uTeam; uniform float uNow; uniform float uHover;
uniform float uTarget; uniform float uPending; uniform float uGold; uniform float uNum; uniform float uShift;
uniform float uLift; uniform float uHasFace; uniform float uSeed; uniform float uBarH;
uniform vec4 uStat; uniform vec3 uPools;
uniform sampler2D uFace; uniform sampler2D uDigits; uniform sampler2D uPaint; uniform sampler2D uIcons;
uniform vec4 uFaceUv; uniform vec4 uTint; uniform vec3 uIcon;

float box(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
float cov(float d) { return 1.0 - smoothstep(-0.6, 0.6, d); }
vec4 over(vec4 d, vec3 c, float a) {
  float o = a + d.a * (1.0 - a);
  return vec4(o > 0.0 ? (c * a + d.rgb * d.a * (1.0 - a)) / o : c, o);
}
// one bar of a card's lines, w px wide from x, its top at top: a dark groove, what is left (up to sure, 0 to 1) in its
// tone, the part an aimed strike changes (to upTo) blinking, and the empty rest
vec4 meter(vec4 col, vec2 sp, float x, float w, float top, float sure, float upTo, vec3 tone) {
  vec2 bc = sp - vec2(x + w * 0.5, top + uBarH * 0.5);
  float d = box(bc, vec2(w, uBarH) * 0.5, uBarH * 0.5);
  col = over(col, ${glsl('#05080f')}, 0.9 * cov(d - 1.0));
  float fx = bc.x / w + 0.5;
  float shade = 1.12 - 0.3 * (bc.y / uBarH + 0.5);
  vec3 c = ${glsl('#2a2420')};
  if (fx <= sure) c = tone * shade;
  else if (fx <= upTo) c = mix(tone, vec3(1.0), 0.45 + 0.35 * sin(uTime * 9.0));
  return over(col, c, cov(d));
}
vec3 digit(vec2 uv, float n) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec3(0.0);
  return texture2D(uDigits, vec2((n + uv.x) / 10.0, uv.y)).rgb;
}

void main() {
  float s = uS;
  vec2 p = vUv * uSize - uOrigin;   // px from the row's top left corner
  float k = uCard.x / ${CARD_W}.0;  // the card's own scale: a 44 x 46 design px body in the middle of its 52 px row
  float bodyH = uCard.y - 6.0 * k;  // (the 6 px were the life bar under the portrait until Nov 17: it is beside it now)
  float mid = uCard.y * 0.5;
  vec2 c0 = vec2(uShift, 3.0 * k - uLift);   // a target's card steps right, a hovered one rises
  vec3 paint = texture2D(uPaint, p / (64.0 * s) + uSeed).rgb;
  vec4 col = vec4(0.0);

  if (uTarget > 0.01) {
    // the band that runs from the plate over the map, with a lit line on each edge
    float inY = cov(abs(p.y - mid) - mid - s);
    float along = step(-5.0 * s, p.x) * smoothstep(170.0 * s, 24.0 * s, p.x);
    float line = smoothstep(1.4 * s, 0.0, abs(abs(p.y - mid) - mid - 0.3 * s));
    col = over(col, ${glsl('#dfe6a0')}, uTarget * inY * along * (0.2 + 0.3 * line));
    // the gold plate behind the number
    float d = box(p - vec2(-21.0 * s, mid), vec2(16.0 * s, mid + s), 2.0 * s);
    col = over(col, ${glsl('#ffe56e')}, uTarget * 0.7 * exp(-max(d, 0.0) / (3.0 * s)));
    vec3 g = mix(${glsl('#c8a54e')}, ${glsl('#ab8a3b')}, smoothstep(0.0, uCard.y, p.y)) * (0.9 + 0.2 * paint.r);
    g = mix(g, ${glsl('#f0d76c')}, smoothstep(-2.4 * s, -0.5 * s, d));
    col = over(col, g, uTarget * 0.94 * cov(d));
  }

  // The lines beside the card (queue-view.ts statsLayout): a dark ground under them and, on a unit's first card, a bar
  // under each number in the sheet's colours (bar3d/plates.ts; Fernando, Nov 20): life and mana under the second line,
  // stamina and CT under the third, sharing the width; a pool the unit lacks (uPools under 0) has no bar, as its line
  // has no number. Life shows what is left, the part an aimed strike changes (blinking) and the empty rest. uStat: the
  // bars' left and width, then each row's top in px from the card's top left (negative: no bars, a repeat's card); a
  // width of 0 for a row without lines (a charge going off)
  if (uStat.y > 0.5) {
    vec2 sp = p - vec2(uShift, -uLift);
    float gx = uCard.x * 0.5, gw = uStat.x + uStat.y + 6.0 * s - gx;
    float dG = box(sp - vec2(gx + gw * 0.5, mid), vec2(gw * 0.5, mid), 4.0 * s);
    col = over(col, ${glsl('#0d1427')}, 0.8 * cov(dG));
    if (uStat.z >= 0.0) {
      float gap = 4.0 * s, hw = (uStat.y - gap) * 0.5;
      float mpOn = step(0.0, uPools.x), stOn = step(0.0, uPools.y);
      vec3 mana = mix(${glsl('#b34d4b')}, ${glsl('#c99a62')}, 0.5);
      col = meter(col, sp, uStat.x, mix(uStat.y, hw, mpOn), uStat.z, uHp.x, uHp.y, ${glsl('#9cc93a')});
      if (mpOn > 0.5) col = meter(col, sp, uStat.x + hw + gap, hw, uStat.z, uPools.x, uPools.x, mana);
      if (uStat.w >= 0.0) {
        if (stOn > 0.5) col = meter(col, sp, uStat.x, hw, uStat.w, uPools.y, uPools.y, ${glsl('#c2785a')});
        float cx = uStat.x + stOn * (hw + gap);
        col = meter(col, sp, cx, mix(uStat.y, hw, stOn), uStat.w, uPools.z, uPools.z, ${glsl('#b89318')});
      }
    }
  }

  vec2 hb = vec2(uCard.x, bodyH) * 0.5;
  vec2 allHalf = hb;
  vec2 ap = p - c0 - allHalf;       // from the middle of the card with its bar
  vec2 bp = p - c0 - hb;            // from the middle of the framed body
  float raised = uHover + 0.5 * uNow;
  float dS = box(ap - vec2(1.5, 2.5) * s * (1.0 + raised), allHalf, 3.0 * k);
  col = over(col, ${glsl('#050c18')}, 0.5 * (1.0 - smoothstep(-2.0 * s, (4.0 + 4.0 * raised) * s, dS)));

  // the one acting now breathes in gold; the row where an aimed charge would fire blinks faster
  float dA = box(ap, allHalf, 3.0 * k);
  float halo = max(uNow * (0.72 + 0.28 * sin(uTime * 3.4)), uPending * (0.6 + 0.4 * sin(uTime * 7.0)));
  col = over(col, ${glsl('#ffd75e')}, halo * 0.85 * exp(-max(dA, 0.0) / (5.0 * s)));
  col = over(col, ${glsl('#fff2b0')}, halo * cov(dA - 1.6 * k));

  float dB = box(bp, hb, 3.0 * k);
  col = over(col, mix(${glsl('#2d556e')}, ${glsl('#364c63')}, uTeam), 0.85 * cov(dB - k));
  // frame: worn stone, lit from the top left
  vec3 frame = mix(${glsl('#b6aa92')}, ${glsl('#7b7160')}, clamp(bp.y / bodyH + 0.5, 0.0, 1.0));
  frame = frame * (0.84 + 0.32 * paint.r) - 0.1 * paint.g;
  float rim = smoothstep(-1.4 * k, 0.0, dB);
  frame += rim * (bp.x + bp.y < 0.0 ? 0.16 : -0.14);
  col = over(col, frame, cov(dB));

  // the picture, sunk into the frame: thicker on the left and on top, as in the reference
  vec2 ih = hb - vec2(1.9, 1.5) * k;
  vec2 ic = bp - vec2(0.7, 0.3) * k;
  float dI = box(ic, ih, 1.6 * k);
  vec2 uv = clamp(ic / (2.0 * ih) + 0.5, 0.0, 1.0);
  vec3 hero = mix(mix(${glsl('#aab6b6')}, ${glsl('#a6b9c6')}, uv.x), mix(${glsl('#8fa5a4')}, ${glsl('#97afb4')}, uv.x), uv.y);
  vec3 foe = mix(mix(${glsl('#cdb0a4')}, ${glsl('#c8a39a')}, uv.x), mix(${glsl('#bd8176')}, ${glsl('#c4958d')}, uv.x), uv.y);
  vec3 pic = mix(hero, foe, uTeam) * (0.92 + 0.16 * paint.b);
  if (uHasFace > 0.5) {
    vec4 f = texture2D(uFace, uFaceUv.xy + uv * uFaceUv.zw);
    f.rgb = mix(f.rgb, dot(f.rgb, vec3(0.299, 0.587, 0.114)) * uTint.rgb * 1.7, uTint.a);
    pic = mix(pic, f.rgb, f.a);
  }
  pic *= 1.0 - 0.3 * smoothstep(-5.0 * k, 0.5 * k, dI);
  pic += 0.1 * smoothstep(-1.2 * k, 0.0, dI) * step(0.0, ic.x + ic.y);
  // a light sweeps the acting card
  float sweep = fract(uTime * 0.28) * 3.0 - 1.0;
  pic += uNow * 0.16 * exp(-pow((uv.x + uv.y) * 0.5 - sweep, 2.0) / 0.012);
  pic += 0.07 * uHover;
  col = over(col, pic, cov(dI));

  // a foe's card also wears a mark, not only its colour (Nov 18 accessibility review: cyan and pink alone): a pink
  // diamond on a dark rim over the top left corner of the frame
  vec2 dq = p - c0 - vec2(3.5 * k, 3.5 * k);
  float dd = (abs(dq.x) + abs(dq.y)) * 0.7071 - 4.6 * k;
  col = over(col, ${glsl('#050c18')}, uTeam * cov(dd - 1.4 * k));
  col = over(col, ${glsl('#f0608e')}, uTeam * cov(dd));

  // a charge going off: the ability's icon on a dark medal over the caster's face
  if (uIcon.z > 0.5) {
    vec2 q = p - c0 - vec2(uCard.x - 6.0 * k, bodyH - 7.0 * k);
    float dc = length(q) - 9.5 * k;
    col = over(col, ${glsl('#e9c869')}, cov(dc - 1.3 * k));
    col = over(col, mix(${glsl('#22365c')}, ${glsl('#0f1a30')}, q.y / (19.0 * k) + 0.5), cov(dc));
    vec2 iu = q / (15.0 * k) + 0.5;
    if (uIcon.z > 1.5 && iu.x > 0.0 && iu.x < 1.0 && iu.y > 0.0 && iu.y < 1.0) {
      vec4 art = texture2D(uIcons, (uIcon.xy + iu) / uIconGrid);
      col = over(col, art.rgb, art.a);
    }
  }

  // the number: white core, its side's glow (gold for a charge's ticks); two digits shrink to fit
  vec2 np = (p - vec2(-16.0 * s, 13.5 * k)) / vec2(23.2 * s, 30.0 * s);
  float tens = floor(uNum / 10.0);
  float ones = uNum - tens * 10.0;
  vec3 dg = tens < 0.5
    ? digit(np + 0.5, ones)
    : max(digit(np / 0.82 + vec2(0.76, 0.5), tens), digit(np / 0.82 + vec2(0.24, 0.5), ones));
  vec3 tone = mix(mix(${glsl('#3ab4f2')}, ${glsl('#f0608e')}, uTeam), ${glsl('#ffcf4a')}, uGold);
  col = over(col, tone, 0.95 * dg.r);
  col = over(col, tone * 0.3, 0.55 * dg.b);
  col = over(col, mix(vec3(1.0), tone, 0.2), dg.g);

  // rows scrolled past the column's ends fade out
  float clip = smoothstep(uClip.x, uClip.x + 16.0 * s, vTop) * (1.0 - smoothstep(uClip.y - 16.0 * s, uClip.y, vTop));
  gl_FragColor = vec4(col.rgb, col.a * uAlpha * clip);
}`;

// The small painted texture (64 px, tiled): dry-brush strokes along the grain in red, short scratches in green and wide
// blotches in blue, around mid grey. Painted here from a fixed seed instead of shipping a file: nothing to license or load
export function paintTexture() {
  const N = 64;
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const ch = [0.5, 0, 0.5].map((v) => new Float32Array(N * N).fill(v));
  const dab = (c: number, x: number, y: number, v: number) => {
    ch[c][((y + N) % N) * N + ((x + N) % N)] += v;
  };
  for (let i = 0; i < 110; i++) {
    const y = Math.floor(rnd() * N),
      x = Math.floor(rnd() * N),
      len = 8 + rnd() * 36,
      v = (rnd() - 0.5) * 0.5;
    for (let j = 0; j < len; j++) dab(0, x + j, y + (rnd() < 0.12 ? 1 : 0), v * Math.sin((Math.PI * j) / len));
  }
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(rnd() * N),
      y = Math.floor(rnd() * N),
      slope = rnd() - 0.5;
    for (let j = 0; j < 3 + rnd() * 7; j++) dab(1, x + j, y + Math.round(j * slope), 0.5 + rnd() * 0.5);
  }
  for (let i = 0; i < 14; i++) {
    const cx = rnd() * N,
      cy = rnd() * N,
      r = 6 + rnd() * 10,
      v = (rnd() - 0.5) * 0.6;
    for (let y = -r; y <= r; y++)
      for (let x = -r; x <= r; x++) {
        const d = Math.hypot(x, y) / r;
        if (d < 1) dab(2, Math.round(cx + x), Math.round(cy + y), v * (1 - d) ** 2);
      }
  }
  const data = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.max(0, Math.min(255, ch[c][i] * 255));
    data[i * 4 + 3] = 255;
  }
  const tex = new DataTexture(data, N, N);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.magFilter = tex.minFilter = LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

// The ten digits as rounded strokes on a 1 x 2 grid, in the squared hand of the reference's numbers
const DIGITS: number[][][] = [
  [[0, 0, 1, 0, 1, 2, 0, 2, 0, 0, 1, 0]],
  [[0.15, 0.45, 0.6, 0, 0.6, 2]],
  [[0, 0, 1, 0, 1, 1, 0, 1, 0, 2, 1, 2]],
  [
    [0, 0, 1, 0, 1, 2, 0, 2],
    [0.3, 1, 1, 1],
  ],
  [
    [0, 0, 0, 1.2, 1, 1.2],
    [0.75, 0.5, 0.75, 2],
  ],
  [[1, 0, 0, 0, 0, 1, 1, 1, 1, 2, 0, 2]],
  [[1, 0, 0, 0, 0, 2, 1, 2, 1, 1, 0, 1]],
  [[0, 0, 1, 0, 0.35, 2]],
  [
    [0, 0, 1, 0, 1, 2, 0, 2, 0, 0, 1, 0],
    [0, 1, 1, 1],
  ],
  [[1, 1, 0, 1, 0, 0, 1, 0, 1, 2, 0, 2]],
];
// Digit atlas, ten cells in a row with the glyph in the middle half of each: the stroke in green, a blurred halo in red
// and a thicker stroke in blue (the dark edge between them), added over black so each channel is read on its own
export function digitTexture() {
  const W = 96,
    H = 128,
    canvas = document.createElement('canvas');
  canvas.width = W * 10;
  canvas.height = H;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#000';
  c.fillRect(0, 0, canvas.width, H);
  c.globalCompositeOperation = 'lighter';
  c.lineJoin = c.lineCap = 'round';
  const trace = (n: number) => {
    c.beginPath();
    for (const line of DIGITS[n]) {
      const at = (i: number): [number, number] => [n * W + 26 + line[i] * 44, 34 + line[i + 1] * 30];
      c.moveTo(...at(0));
      // corners rounded like the reference's: an arc of 9 px through each inner point
      for (let i = 2; i < line.length - 2; i += 2) c.arcTo(...at(i), ...at(i + 2), 9);
      c.lineTo(...at(line.length - 2));
    }
  };
  for (let n = 0; n < 10; n++) {
    c.save();
    c.beginPath();
    c.rect(n * W, 0, W, H); // a halo stays inside its own cell
    c.clip();
    for (const [color, width, blur] of [
      ['#f00', 11, 14],
      ['#00f', 12.5, 0],
      ['#0f0', 7.5, 0],
    ] as const) {
      c.shadowColor = color;
      c.shadowBlur = blur;
      c.strokeStyle = color;
      c.lineWidth = width;
      trace(n);
      c.stroke();
      if (blur) c.stroke(); // twice: a denser halo
    }
    c.restore();
  }
  const tex = new Texture(canvas);
  tex.flipY = false;
  tex.generateMipmaps = false;
  tex.magFilter = tex.minFilter = LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

// uniforms every card shares (the layer's scale and clock, the list's clip, the textures)
export const sharedUniforms = () => ({
  uS: { value: 1 },
  uH: { value: 1 },
  uTime: { value: 0 },
  uClip: { value: new Vector2(-1e5, 1e5) },
  uIconGrid: { value: new Vector2(1, 1) },
  uPaint: { value: paintTexture() },
  uDigits: { value: digitTexture() },
  uIcons: { value: null as Texture | null },
});
// `seed`: which patch of the paint the card takes, so no two cards wear the same
export const cardMaterial = (shared: ReturnType<typeof sharedUniforms>, seed: number) =>
  new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      ...shared,
      uSize: { value: new Vector2() },
      uOrigin: { value: new Vector2() },
      uCard: { value: new Vector2() },
      uHp: { value: new Vector2(1, 1) },
      uStat: { value: new Vector4() }, // the bars beside the card: left, width, each row's top (px; negative for none)
      uPools: { value: new Vector3(-1, -1, 0) }, // mana, stamina and CT, 0 to 1; under 0 for a pool the unit lacks
      uBarH: { value: 4 }, // its thickness, px
      uAlpha: { value: 0 },
      uTeam: { value: 0 },
      uNow: { value: 0 },
      uHover: { value: 0 },
      uTarget: { value: 0 },
      uPending: { value: 0 },
      uGold: { value: 0 },
      uNum: { value: 0 },
      uShift: { value: 0 },
      uLift: { value: 0 },
      uHasFace: { value: 0 },
      uSeed: { value: seed },
      uFace: { value: null as Texture | null },
      uFaceUv: { value: new Vector4(0, 0, 1, 1) },
      uTint: { value: new Vector4(0, 0, 0, 0) }, // no tint (a bare Vector4 has w = 1)
      uIcon: { value: new Vector3() },
    },
  });
