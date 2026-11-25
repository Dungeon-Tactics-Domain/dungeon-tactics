// What each tile mark looks like: its colour, opacity and drawing (MARK, the charge danger's purple) and the canvas
// texture of each drawing.
import * as THREE from 'three';
import type { TileKind } from '../interaction.ts';

// marker colors; the meaning also goes in HUD text (never color alone)
// Veil purple: the area of a spell being charged stays lit until it goes off (the text goes on the tile under the cursor, hud.ts)
export const DANGER: [string, number] = ['#9b4dff', 0.4];
// Stylized marker (Nov 13, Fernando's request: "this preview is too white... something more stylized and less washed-out"; the
// flat white square became a carpet in Ash Wood): thin frame in the type's color with a dark thread outside (reads on
// grass, dirt and water: the Nov 12 blue vanished in water for being a full square), faint core and a drawing per
// type, because color is never the only signal: smooth (walk), full (chosen tile, whoever acts, strike area), stripes
// (strike range, threat) and cross (blocked shot)
export type MarkPattern = 'frame' | 'solid' | 'hatch' | 'cross';
export const MARK: Record<TileKind | 'path', [color: string, opacity: number, pattern?: MarkPattern]> = {
  actor: ['#ffd479', 0.95, 'solid'],
  move: ['#6fc0ff', 0.95, 'frame'],
  range: ['#ff7a3c', 0.45, 'hatch'], // 0.95 until Nov 24: "mta poluicao visual" (Fernando)
  blocked: ['#b07ae0', 0.95, 'cross'],
  far: ['#9aa0a6', 0.5, 'frame'], // a tile the unit can walk to that the action does not reach from (Nov 25)
  threat: ['#ff2d55', 0.6, 'hatch'],
  area: ['#ffb020', 0.6, 'solid'], // 1 until Nov 24, with the range mark
  target: ['#fff2a0', 1, 'solid'],
  nogo: ['#ff4040', 1, 'cross'], // the unit's square does not fit where the cursor is (Move)
  counter: ['#ff3b3b', 1, 'frame'], // a stop that draws the counter of a unit struck this turn (Move)
  path: ['#1e6fff', 0.95],
};
const markTextures = new Map<MarkPattern, THREE.CanvasTexture>();
// white texture (the color comes from the material) with the marker drawing; one per drawing, made the first time
export function markTexture(p: MarkPattern): THREE.CanvasTexture {
  let t = markTextures.get(p);
  if (t) return t;
  const S = 64,
    c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = `rgba(255,255,255,${p === 'solid' ? 0.42 : 0.08})`; // core
  g.fillRect(4, 4, S - 8, S - 8);
  if (p === 'hatch' || p === 'cross') {
    g.save();
    g.beginPath();
    g.rect(7, 7, S - 14, S - 14);
    g.clip();
    g.strokeStyle = 'rgba(255,255,255,0.6)';
    g.lineWidth = 4;
    g.beginPath();
    if (p === 'hatch')
      for (let k = -S; k < S; k += 16) {
        g.moveTo(k, S);
        g.lineTo(k + S, 0);
      }
    else {
      g.moveTo(10, 10);
      g.lineTo(S - 10, S - 10);
      g.moveTo(S - 10, 10);
      g.lineTo(10, S - 10);
    }
    g.stroke();
    g.restore();
  }
  g.strokeStyle = 'rgba(0,0,0,0.6)'; // dark thread outside
  g.lineWidth = 2;
  g.strokeRect(1, 1, S - 2, S - 2);
  g.strokeStyle = '#ffffff'; // frame
  g.lineWidth = 5;
  g.strokeRect(4.5, 4.5, S - 9, S - 9);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  // no mipmap: the tile shows up flat (half the height) and the mipmap blurred the frame inward, leaving the core milky
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  markTextures.set(p, t);
  return t;
}
