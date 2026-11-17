// The key hints of the 3D screens (Fernando, Nov 17): an action's keys or pad buttons as quads of the kit, each showing
// the same drawing as the HTML hints (glyph-art.ts). What they are comes from glyphs.ts, for the input in use
// (key-hints.ts `shown`). Free each with dropText, as a text.
import type { Mesh, ShaderMaterial } from 'three';
import { capCanvas } from '../glyph-art.ts';
import { type Act, capsOf, type Shown } from '../glyphs.ts';
import type { QUAD } from './panel.ts';
import { imageMesh } from './text.ts';

type Quad = Mesh<typeof QUAD, ShaderMaterial>;

// One quad per cap of `act`, `h` CSS px tall; null when the pad's icons show and the pad has no button for it
export function capMeshes(act: Act, shown: Shown, h: number, dpr: number, font: string): Quad[] | null {
  const px = Math.round(h * dpr);
  return (
    capsOf(act, shown)?.map((cap) =>
      imageMesh(JSON.stringify(['cap', cap, px, font]), () => capCanvas(cap, px, font), px / h),
    ) ?? null
  );
}
// Lays the caps side by side from `x` (their left edge), centred on `mid`; `put` is a Part's `text`. The x after them
export function capRun(
  put: (m: Quad, x: number, y: number) => unknown,
  caps: Quad[],
  x: number,
  mid: number,
  gap: number,
) {
  for (const m of caps) {
    put(m, x + m.scale.x / 2, mid);
    x += m.scale.x + gap;
  }
  return x - gap;
}
export const capsWidth = (caps: Quad[], gap: number) => caps.reduce((w, m) => w + m.scale.x + gap, -gap);
