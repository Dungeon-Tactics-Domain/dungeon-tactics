// Where the 3D speech box puts its parts (talk3d.ts), with no DOM: the box at the page's foot with Skip under it, the
// speaker's name on a plaque over its top left corner and the place's strip above; the opening narration (`dark`) has
// no box, its words stand in the page's middle. The box grows with the lines typed so far. The unseen HTML box under
// the drawing is seated from these same numbers. Pure and tested (tests/talk-layout.test.ts) against what the browser
// measured on the HTML box before the numbers moved here.
import { type Box, lu } from '../ui3d/layout.ts';

const TAP = 44; // a finger's target (design system, section 8)
const EDGE = 16; // the page's margin
const KEYS_H = lu(17.6); // the hint's line

export interface TalkSpec {
  pageW: number;
  pageH: number;
  safe: { top: number; right: number; bottom: number; left: number }; // the notch (ui3d/safe-area.ts)
  dark: boolean; // the opening narration
  face: boolean; // someone speaks: the painted face stands at the box's left, the name over it
  name: number; // the widths of the words in the drawing's own letter, 0 without them: the speaker's name (24 px),
  title: number; // the place's strip (24 px)
  skip: number; // and Skip (16 px)
  lines: (width: number, size: number) => number; // how many lines the words typed so far take
}

export function talkLayout(q: TalkSpec) {
  const edge = (side: 'top' | 'right' | 'left') => Math.max(EDGE, q.safe[side]),
    left = edge('left'),
    right = q.pageW - edge('right'),
    foot = q.pageH - 24 - q.safe.bottom,
    w = Math.min(1100, right - left),
    x = left + (right - left - w) / 2,
    skipW = Math.max(TAP, q.skip + 16);
  if (q.dark) {
    const size = 28,
      line = size * 1.5,
      tw = Math.min(34 * size, w - 48),
      h = Math.max(lu(3.6 * size), q.lines(tw, size) * line),
      y = edge('top') + (foot - edge('top') - h) / 2;
    return {
      box: { x, y, w, h },
      text: { x: x + (w - tw) / 2, y, w: tw },
      size,
      line,
      face: 0,
      faceAt: undefined,
      name: undefined,
      title: undefined,
      skip: { x: q.pageW - 24 - skipW, y: foot - TAP, w: skipW, h: TAP }, // on the page's corner
      keys: { x: x + w / 2, y: y + h + 28 - KEYS_H / 2 }, // the hint's middle, under the words
    };
  }
  const size = 24,
    line = lu(size * 1.35),
    small = q.pageW <= 560, // a phone: the face at half size and a line of its own for the hint
    face = q.face ? (small ? 66 : 132) : 0,
    tx = x + 16 + (face ? face + 16 : 0),
    tw = x + w - 42 - tx,
    h = Math.max(132, 22 + (small ? 36 : 14) + Math.max(face, lu(3.6 * size), q.lines(tw, size) * line)),
    y = foot - TAP - 12 - h;
  const title: Box | undefined = q.title
    ? { x: (left + right - q.title - 60) / 2, y: y - 96, w: q.title + 60, h: TAP }
    : undefined;
  const name: Box | undefined = q.face ? { x: x + 12, y: y - 36, w: q.name + 40, h: 40 } : undefined;
  return {
    box: { x, y, w, h },
    text: { x: tx, y: y + 20, w: tw },
    size,
    line,
    face, // its side
    faceAt: face ? { x: x + 16, y: y + 20, w: face, h: face } : undefined, // the face's frame, in the box's corner
    name,
    title,
    skip: { x: right - skipW, y: foot - TAP, w: skipW, h: TAP },
    keys: { x: x + w - 42, y: y + h - 10 - KEYS_H / 2 }, // the hint's right end and middle
  };
}
export type TalkLayout = ReturnType<typeof talkLayout>;
