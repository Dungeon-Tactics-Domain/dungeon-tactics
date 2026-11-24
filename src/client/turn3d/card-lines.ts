// The lines beside a 3D turn card (queue-view.ts `stats`) as text quads, and on a charge's card the small faces of
// whom it would hit after its second line (Fernando, Nov 22); turn3d.ts makes them and places them each frame.
import type { Group, Mesh, ShaderMaterial } from 'three';
import { type Faces, faceMesh } from '../ui3d/face.ts';
import type { Ui3dLayer } from '../ui3d/layer.ts';
import type { QUAD } from '../ui3d/panel.ts';
import { dropText, textMesh, textWidth } from '../ui3d/text.ts';
import { INK } from './card.ts';
import { fitStats, type QueueCard } from './queue-view.ts';

type Quad = Mesh<typeof QUAD, ShaderMaterial>;
// each line's parts (a unit's pair of numbers, split at ' · ' over its two bars) and the faces after the last line
export interface CardLines {
  key: string;
  lines: Quad[][];
  faces: Quad[];
}
export const TEXT_PAD = 3; // the empty margin a label carries on each side (ui3d/text.ts)
const FACE_GAP = 3; // px between the names and the first face, and between faces, at scale 1

// The card's lines; unchanged lines keep their textures (the CT of every row changes each turn, not each draw). A
// charge's take the form that fits `cap` px at the list's scale `s` (queue-view.ts fitStats), measured as drawn
export function setLines(
  prev: CardLines | null,
  full: QueueCard['stats'],
  size: number,
  layer: Ui3dLayer,
  flat: Group,
  faces: Faces,
  cap = 0,
  s = 1,
): CardLines | null {
  const font = layer.theme.font,
    f = Math.round(size * 1.4); // a face at the text's size read as a dot; this still keeps clear of the line above
  const st = full && fitStats(full, cap, (l) => textWidth(l, size, font) + 2 * TEXT_PAD, f + FACE_GAP * s);
  const key = st ? JSON.stringify([st.lines, st.faces, size, layer.dpr]) : '';
  if (prev?.key === key) return prev;
  dropLines(prev);
  if (!st) return null;
  const add = (m: Quad) => {
    m.renderOrder = 4; // over every card: a hovered neighbour grows a little
    flat.add(m);
    return m;
  };
  const make = (str: string) => add(textMesh(str, { size, color: INK, font }, layer.dpr));
  const face = (def: string) =>
    add(faceMesh(faces, def, 'neutral', { x: 0, y: 0, w: f, h: f }, () => layer.wake()) as Quad);
  // a charge's lines have no bars under them, so they stay whole ("Explosão · 2 alvos")
  const lines = st.lines.map((l) => (st.bars ? l.split(' · ') : [l]).map(make));
  return { key, lines, faces: (st.faces ?? []).map(face) };
}

export function dropLines(l: CardLines | null) {
  if (!l) return;
  for (const m of l.lines.flat()) dropText(m);
  for (const m of l.faces) {
    m.removeFromParent();
    m.material.dispose(); // the picture stays in the list's cache
  }
}

// each line's parts' widths, the faces counted on the last line, for the list's column (queue-view.ts statWidth)
export function lineWidths(l: CardLines | null, s: number): number[][] {
  if (!l) return [];
  return l.lines.map((parts, i) =>
    parts.map(
      (m) => m.scale.x + (i === l.lines.length - 1 ? l.faces.reduce((w, f) => w + f.scale.x + FACE_GAP * s, 0) : 0),
    ),
  );
}

// Places the lines from (x, y), each line's middle at `mids`, a pair's second part on its second bar (`half` past the
// first: card.ts draws the bars so); `alpha(y)` fades a line at the list's ends as the cards fade
export function placeLines(
  l: CardLines,
  layer: Ui3dLayer,
  x: number,
  y: number,
  mids: number[],
  half: number,
  s: number,
  alpha: (y: number) => number,
) {
  const put = (m: Quad, px: number, py: number) => {
    m.position.set(layer.snap(px + m.scale.x / 2), -layer.snap(py), 0);
    m.material.uniforms.uAlpha.value = alpha(py);
  };
  l.lines.forEach((parts, i) => {
    parts.forEach((m, j) => put(m, x + j * half, y + mids[i]));
  });
  const last = l.lines.at(-1)?.at(-1);
  if (!last) return;
  let fx = x + last.scale.x;
  for (const f of l.faces) {
    put(f, fx + FACE_GAP * s - TEXT_PAD, y + mids[l.lines.length - 1]);
    fx += f.scale.x + FACE_GAP * s;
  }
}
