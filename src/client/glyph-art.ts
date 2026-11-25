// The drawing of a key hint (Fernando, Nov 17: in the game's own style, by code): a key as a parchment cap with a raised
// edge, a pad button in gold and leather like the pieces of the town and the menu, its letter or symbol in the family's
// colour with a still glow. Canvas 2D only, so the HTML hints and the 3D ones (ui3d/caps.ts) show the same drawing. The
// proportions and colours are glyph-art.json, in units of the cap's height; what a cap is comes from glyphs.ts. Nothing
// here moves, so Reduce motion needs nothing.
import ART from './glyph-art.json';
import { type Cap, type Family, type PadGlyph, padName } from './glyphs.ts';

type G = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const FACE = ['south', 'east', 'west', 'north'] as const;
const isFace = (g: PadGlyph): g is (typeof FACE)[number] => (FACE as readonly string[]).includes(g);
const pill = (family: Family) => family === 'playstation';

// a cap's width over its height; a key's grows with its letters
function ratio(cap: Cap, textWidth: (s: string) => number): number {
  if ('key' in cap) return Math.max(1, textWidth(cap.key) + 2 * ART.key.pad);
  const g = cap.pad;
  if (g === 'lb' || g === 'rb') return ART.width.bumper;
  if (g === 'lt' || g === 'rt') return ART.width.trigger;
  if (g === 'select' || g === 'start') return pill(cap.family) ? ART.width.menuPill : ART.width.menu;
  return 1;
}

const grad = (g: G, y0: number, y1: number, stops: string[]) => {
  const l = g.createLinearGradient(0, y0, 0, y1);
  stops.forEach((c, i) => l.addColorStop(i / (stops.length - 1), c));
  return l;
};

// A raised piece: its shadow, the gold rim, the leather inside and a shine along the top. `shape(inset)` traces it
// shrunk by `inset` px on every side
function piece(g: G, h: number, top: number, bottom: number, shape: (inset: number) => void) {
  g.save();
  g.shadowColor = ART.shadow.color;
  g.shadowBlur = ART.shadow.blur * h;
  g.shadowOffsetY = ART.shadow.y * h;
  g.fillStyle = grad(g, top, bottom, ART.gold);
  shape(0);
  g.fill();
  g.restore();
  const rim = ART.rim * h;
  g.fillStyle = grad(g, top + rim, bottom - rim, ART.leather);
  shape(rim);
  g.fill();
  g.save();
  shape(rim);
  g.clip();
  g.strokeStyle = ART.shine;
  g.lineWidth = rim;
  g.translate(0, rim * 0.9);
  shape(rim);
  g.stroke();
  g.restore();
}

// a letter or a symbol lit in its colour: once under a glow, once sharp
function lit(g: G, h: number, color: string, paint: () => void) {
  g.save();
  g.fillStyle = g.strokeStyle = color;
  g.shadowColor = color;
  g.shadowBlur = ART.neon * h;
  paint();
  g.shadowBlur = 0;
  paint();
  g.restore();
}
function word(g: G, str: string, x: number, y: number, px: number, font: string) {
  g.font = `700 ${px}px ${font}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(str, x, y + px * 0.04);
}

function drawKey(g: G, cap: { key: string }, w: number, h: number, font: string) {
  const i = ART.inset * h,
    r = ART.key.radius * h,
    edge = ART.key.edge * h;
  g.save();
  g.shadowColor = ART.shadow.color;
  g.shadowBlur = ART.shadow.blur * h;
  g.shadowOffsetY = ART.shadow.y * h;
  g.fillStyle = ART.keyEdge;
  g.beginPath();
  g.roundRect(i, i, w - 2 * i, h - 2 * i, r);
  g.fill();
  g.restore();
  // the face sits above its edge, like a key seen a little from the front
  g.fillStyle = grad(g, i, h - i - edge, ART.parchment);
  g.beginPath();
  g.roundRect(i + 1, i + 1, w - 2 * i - 2, h - 2 * i - edge - 1, r * 0.8);
  g.fill();
  g.fillStyle = ART.ink;
  word(g, cap.key, w / 2, (h - edge) / 2, ART.key.text * h, font);
}

// the four symbols of a PlayStation pad, drawn (a font may not have them)
function psShape(g: G, at: PadGlyph, c: number, r: number) {
  g.beginPath();
  if (at === 'south') {
    g.moveTo(c - r, c - r);
    g.lineTo(c + r, c + r);
    g.moveTo(c + r, c - r);
    g.lineTo(c - r, c + r);
  } else if (at === 'east') g.arc(c, c, r * 1.1, 0, TAU);
  else if (at === 'west') g.rect(c - r, c - r, 2 * r, 2 * r);
  else {
    g.moveTo(c, c - r * 1.15);
    g.lineTo(c + r * 1.2, c + r * 0.9);
    g.lineTo(c - r * 1.2, c + r * 0.9);
    g.closePath();
  }
  g.stroke();
}

// the letters of a pad are a plain bold sans, like the ones printed on it
function drawPad(g: G, cap: { pad: PadGlyph; family: Family }, w: number, h: number) {
  const font = 'system-ui, sans-serif';
  const { pad: at, family } = cap,
    i = ART.inset * h,
    cx = w / 2,
    cy = h / 2,
    name = padName(at, family);
  const circle = (r: number) => (inset: number) => {
    g.beginPath();
    g.arc(cx, cy, r - inset, 0, TAU);
  };
  if (isFace(at)) {
    piece(g, h, i, h - i, circle(h / 2 - i));
    lit(g, h, ART.colors[family][at], () => {
      if (family !== 'playstation') return word(g, name, cx, cy, ART.face.letter * h, font);
      g.lineWidth = ART.face.stroke * h;
      g.lineCap = g.lineJoin = 'round';
      psShape(g, at, cx, ART.face.shape * h);
    });
  } else if (at === 'lb' || at === 'rb') {
    // a bumper: a low bar, its outer top corner rounder
    const bh = ART.bumper.h * h,
      y = (h - bh) / 2,
      big = ART.bumper.radius * h,
      small = ART.bumper.corner * h;
    piece(g, h, y, y + bh, (n) => {
      g.beginPath();
      const out = Math.max(1, big - n),
        inn = Math.max(1, small - n);
      g.roundRect(
        i + n,
        y + n,
        w - 2 * i - 2 * n,
        bh - 2 * n,
        at === 'lb' ? [out, inn, inn, inn] : [inn, out, inn, inn],
      );
    });
    lit(g, h, ART.pale, () => word(g, name, cx, cy, ART.bumper.text * h, font));
  } else if (at === 'lt' || at === 'rt') {
    // a trigger: tall, round on top
    const top = ART.trigger.top * h,
      foot = ART.trigger.foot * h;
    piece(g, h, i, h - i, (n) => {
      g.beginPath();
      g.roundRect(i + n, i + n, w - 2 * i - 2 * n, h - 2 * i - 2 * n, [
        Math.max(1, top - n),
        Math.max(1, top - n),
        Math.max(1, foot - n),
        Math.max(1, foot - n),
      ]);
    });
    lit(g, h, ART.pale, () => word(g, name, cx, cy + ART.trigger.drop * h, ART.trigger.text * h, font));
  } else if (at === 'select' || at === 'start') {
    const r = ART.menu.r * h,
      ph = ART.menu.pillH * h;
    piece(
      g,
      h,
      cy - r,
      cy + r,
      pill(family)
        ? (n) => {
            g.beginPath();
            g.roundRect(i + n, cy - ph / 2 + n, w - 2 * i - 2 * n, ph - 2 * n, ph / 2);
          }
        : circle(r),
    );
    const m = ART.menu.mark * h;
    lit(g, h, ART.pale, () => {
      g.lineWidth = ART.menu.stroke * h;
      g.lineCap = 'round';
      g.beginPath();
      const line = (x0: number, y0: number, x1: number, y1: number) => {
        g.moveTo(cx + x0 * m, cy + y0 * m);
        g.lineTo(cx + x1 * m, cy + y1 * m);
      };
      if (family === 'switch') {
        line(-1, 0, 1, 0); // − and +
        if (at === 'start') line(0, -1, 0, 1);
      } else if (at === 'start')
        for (const y of [-0.7, 0, 0.7]) line(-1, y, 1, y); // Menu, Options: three bars
      else if (family === 'xbox') {
        g.rect(cx - m, cy - m * 0.4, m * 1.3, m * 1.3); // View: two windows
        g.rect(cx - m * 0.3, cy - m * 0.9, m * 1.3, m * 1.3);
      } else for (const x of [-0.9, 0, 0.9]) line(x * 0.4, 0.6, x, -0.7); // Share: three rays
      g.stroke();
    });
  } else if (at === 'lstick' || at === 'rstick' || at === 'r3' || at === 'l3') {
    piece(g, h, i, h - i, circle(h / 2 - i));
    const r = ART.stick.cap * h;
    g.fillStyle = grad(g, cy - r, cy + r, ART.gold);
    circle(r)(0);
    g.fill();
    g.fillStyle = grad(g, cy - r, cy + r, [...ART.leather].reverse());
    circle(r)(ART.rim * h * 0.6);
    g.fill();
    lit(g, h, ART.pale, () =>
      word(g, at === 'lstick' ? 'L' : at === 'r3' ? 'R3' : at === 'l3' ? 'L3' : 'R', cx, cy, ART.stick.text * h, font),
    );
  } else {
    // the d-pad: a cross, with a lit tip on each arm the hint is about
    const arm = (ART.dpad.arm * h) / 2,
      rad = ART.dpad.radius * h;
    piece(g, h, i, h - i, (n) => {
      const a = arm - n,
        e = h / 2 - i - n;
      g.beginPath();
      g.roundRect(cx - a, cy - e, 2 * a, 2 * e, rad);
      g.roundRect(cx - e, cy - a, 2 * e, 2 * a, rad);
    });
    const tip = ART.dpad.tip * h,
      far = h / 2 - i - ART.rim * h - tip * 1.5;
    const arms: [number, number, boolean][] = [
      [0, -1, at !== 'dpadH'],
      [0, 1, at !== 'dpadH'],
      [-1, 0, at !== 'dpadV'],
      [1, 0, at !== 'dpadV'],
    ];
    lit(g, h, ART.gold[0], () => {
      g.beginPath();
      for (const [dx, dy, on] of arms) {
        if (!on) continue;
        const x = cx + dx * far,
          y = cy + dy * far;
        g.moveTo(x + dx * tip, y + dy * tip);
        g.lineTo(x - dy * tip * 0.8, y - dx * tip * 0.8);
        g.lineTo(x + dy * tip * 0.8, y + dx * tip * 0.8);
        g.closePath();
      }
      g.fill();
    });
  }
}

const made = new Map<string, HTMLCanvasElement>();
// The cap drawn `h` px tall (device px); its width follows its kind. `font`: a CSS family list for the letters. One
// canvas per distinct cap, height and font, kept: there are a few dozen at most
export function capCanvas(cap: Cap, h: number, font: string): HTMLCanvasElement {
  const key = JSON.stringify([cap, h, font]);
  let cv = made.get(key);
  if (cv) return cv;
  cv = document.createElement('canvas');
  const g = cv.getContext('2d')!;
  const fonts = `${font}, system-ui, sans-serif`;
  g.font = `700 ${ART.key.text * h}px ${fonts}`;
  const w = Math.ceil(ratio(cap, (s) => g.measureText(s).width / h) * h);
  cv.width = w;
  cv.height = Math.ceil(h);
  if ('key' in cap) drawKey(g, cap, w, h, fonts);
  else drawPad(g, cap, w, h);
  made.set(key, cv);
  return cv;
}
