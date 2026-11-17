// The lit mark styles' textures (mark-kit.ts), drawn by code on a canvas and made once a page: the grain of glass and
// metal and the chisel of stone as normal maps, the small sky the glass and the metal reflect, and the drawing inside a
// marked tile as colour and as relief. The stone's colour is the terrain's own cliff photo.
import * as THREE from 'three';
import { hash, noise } from '../three-util.ts';
import type { MarkPattern } from './mark-looks.ts';

const canvas = (S: number, draw: (g: CanvasRenderingContext2D) => void) => {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  draw(c.getContext('2d', { willReadFrequently: true })!);
  return c;
};
// a height drawing (white = high) as a tangent-space normal map
function normalFrom(height: HTMLCanvasElement, strength: number): THREE.CanvasTexture {
  const S = height.width,
    src = height.getContext('2d')!.getImageData(0, 0, S, S).data;
  const h = (x: number, y: number) => src[(((y + S) % S) * S + ((x + S) % S)) * 4] / 255;
  const out = canvas(S, (g) => {
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const dx = (h(x - 1, y) - h(x + 1, y)) * strength,
          dy = (h(x, y - 1) - h(x, y + 1)) * strength,
          l = Math.hypot(dx, dy, 1);
        img.data.set([(dx / l) * 127 + 128, (-dy / l) * 127 + 128, (1 / l) * 127 + 128, 255], (y * S + x) * 4);
      }
    g.putImageData(img, 0, 0);
  });
  const t = new THREE.CanvasTexture(out);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const once = <T>(make: () => T) => {
  let v: T | undefined;
  return () => (v ??= make());
};
// fine grain: the hammered face of metal and the ripple of glass
export const grain = once(() =>
  normalFrom(
    canvas(64, (g) => {
      const img = g.createImageData(64, 64);
      for (let i = 0; i < 64 * 64; i++) {
        const v = 255 * (0.6 * noise((i % 64) / 5, Math.floor(i / 64) / 5) + 0.4 * hash(i % 64, Math.floor(i / 64), 3));
        img.data.set([v, v, v, 255], i * 4);
      }
      g.putImageData(img, 0, 0);
    }),
    1.6,
  ),
);
// chiselled stone: broad lumps, pits and a few cracks
export const stone = once(() =>
  normalFrom(
    canvas(128, (g) => {
      const img = g.createImageData(128, 128);
      for (let i = 0; i < 128 * 128; i++) {
        const x = i % 128,
          y = Math.floor(i / 128);
        const v = 255 * (0.55 * noise(x / 14, y / 14) + 0.3 * noise(x / 4, y / 4) + 0.15 * hash(x, y, 5));
        img.data.set([v, v, v, 255], i * 4);
      }
      g.putImageData(img, 0, 0);
      g.strokeStyle = 'rgba(0,0,0,0.7)';
      g.lineWidth = 1.5;
      for (let k = 0; k < 7; k++) {
        g.beginPath();
        let x = hash(k, 1, 9) * 128,
          y = hash(k, 2, 9) * 128;
        g.moveTo(x, y);
        for (let s = 0; s < 6; s++) g.lineTo((x += (hash(k, s, 11) - 0.5) * 30), (y += (hash(k, s, 13) - 0.5) * 30));
        g.stroke();
      }
    }),
    3,
  ),
);
// the stone's own colour: the cliff photo the terrain already uses (public/tex/cliff.jpg, CC0, see CREDITS.txt)
export const cliff = once(() => {
  const t = new THREE.TextureLoader().load('/tex/cliff.jpg');
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
});
// what the glass and the metal reflect: a warm sky over a dark ground with the sun's glare, as a tiny panorama (the
// scene has no environment map, and setting one would relight the units)
export const sky = once(() => {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d')!;
  const up = g.createLinearGradient(0, 0, 0, 64);
  up.addColorStop(0, '#e6e2d2');
  up.addColorStop(0.45, '#a9c4e8');
  up.addColorStop(0.55, '#4a3f5e');
  up.addColorStop(1, '#17131f');
  g.fillStyle = up;
  g.fillRect(0, 0, 128, 64);
  const sun = g.createRadialGradient(40, 14, 0, 40, 14, 16);
  sun.addColorStop(0, '#ffffff');
  sun.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = sun;
  g.fillRect(0, 0, 128, 64);
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
});

// The drawing inside a marked tile (mark-looks.ts MARK: colour is never the only signal): how strong the glass is
// (`core`), stripes or a cross. Returns it as the plate's colour-and-alpha map and as its relief
const plates = new Map<MarkPattern, { map: THREE.CanvasTexture; relief: THREE.CanvasTexture }>();
export function plate(p: MarkPattern) {
  let t = plates.get(p);
  if (t) return t;
  const S = 64;
  const ink = (g: CanvasRenderingContext2D, core: string, line: string) => {
    g.fillStyle = core;
    g.fillRect(0, 0, S, S);
    g.strokeStyle = line;
    g.lineWidth = 6;
    g.lineCap = 'round';
    g.beginPath();
    if (p === 'hatch')
      for (let k = -S; k < S; k += 16) {
        g.moveTo(k, S);
        g.lineTo(k + S, 0);
      }
    else if (p === 'cross') {
      g.moveTo(10, 10);
      g.lineTo(S - 10, S - 10);
      g.moveTo(S - 10, 10);
      g.lineTo(10, S - 10);
    }
    g.stroke();
  };
  const map = new THREE.CanvasTexture(
    canvas(S, (g) => {
      ink(g, `rgba(255,255,255,${p === 'solid' ? 0.85 : p === 'frame' ? 0.5 : 0.28})`, 'rgba(255,255,255,0.95)');
      // brighter toward the rim, like light caught in the glass
      const rim = g.createRadialGradient(S / 2, S / 2, S * 0.2, S / 2, S / 2, S * 0.72);
      rim.addColorStop(0, 'rgba(255,255,255,0)');
      rim.addColorStop(1, 'rgba(255,255,255,0.35)');
      g.fillStyle = rim;
      g.fillRect(0, 0, S, S);
    }),
  );
  map.colorSpace = THREE.SRGBColorSpace;
  const relief = normalFrom(
    canvas(S, (g) => {
      ink(g, '#404040', '#ffffff');
      g.filter = 'blur(1px)';
      g.drawImage(g.canvas, 0, 0);
    }),
    2.5,
  );
  relief.wrapS = relief.wrapT = THREE.ClampToEdgeWrapping;
  t = { map, relief };
  plates.set(p, t);
  return t;
}
