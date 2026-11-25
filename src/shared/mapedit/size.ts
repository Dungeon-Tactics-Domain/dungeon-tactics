// Map size in the builder: width and height, or a row or column added or cut on any edge. What a cut takes away
// comes back through Undo (the history keeps whole documents).
import { index, inside, type MapDoc, plainTile, SIZE } from './doc.ts';
import { fixRamps } from './edit.ts';

export type Edge = 'left' | 'right' | 'top' | 'bottom';

// The window of `width` x `height` tiles whose top-left is the old (left, top); tiles outside the old map are plain
// grass, and ramps that lost their neighbour drop
function crop(doc: MapDoc, left: number, top: number, width: number, height: number): MapDoc {
  if (width < SIZE[0] || width > SIZE[1] || height < SIZE[0] || height > SIZE[1]) return doc;
  if (left === 0 && top === 0 && width === doc.width && height === doc.height) return doc;
  const tiles = Array.from({ length: width * height }, (_, i) => {
    const p = { x: (i % width) + left, y: Math.floor(i / width) + top };
    return inside(doc, p) ? doc.tiles[index(doc, p)] : plainTile();
  });
  return fixRamps({ ...doc, width, height, tiles });
}

export const resize = (doc: MapDoc, width: number, height: number) => crop(doc, 0, 0, width, height);

// +1 adds a row or column of grass on that edge, -1 cuts one
export function growEdge(doc: MapDoc, edge: Edge, delta: 1 | -1): MapDoc {
  const { width: w, height: h } = doc;
  if (edge === 'left') return crop(doc, -delta, 0, w + delta, h);
  if (edge === 'right') return crop(doc, 0, 0, w + delta, h);
  if (edge === 'top') return crop(doc, 0, -delta, w, h + delta);
  return crop(doc, 0, 0, w, h + delta);
}
