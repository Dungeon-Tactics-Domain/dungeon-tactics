// The readiness gate (Fernando, Nov 18: "no interface swapping out of nowhere"): nothing of the game's interface (title,
// HUD, town) is built before everything it draws with has arrived: the scene's models, the chunks of the 3D pieces and
// the fonts. The loading cover (loading.ts) stays over the page until what was built has drawn. Pure and tested.
import type { Box } from './ui3d/layout.ts';

export interface Cover {
  fail(): void; // something did not arrive: the cover says so and stays
  open(): Promise<void>; // what was built has drawn: the cover leaves
}

// `parts` download together; `build` makes the interface from them, under the cover, and only once all of them landed.
// A part that fails leaves the cover saying so, with nothing built under it
export async function whenReady<T extends readonly unknown[], R>(
  cover: Cover,
  parts: { [K in keyof T]: Promise<T[K]> },
  build: (loaded: T) => R,
): Promise<R> {
  let built: R;
  try {
    built = build((await Promise.all(parts)) as unknown as T);
  } catch (err) {
    cover.fail();
    throw err;
  }
  await cover.open();
  return built;
}

// How full the bar is, from the files landed alone: the total is not known ahead (it grows as the models name their
// parts, and reached 49/49 with half still to come), so done/total would fill the bar early and leave it full. Each
// file takes a share of what is left (half way at 28 files, 92% at 100); the cover fills the rest as it leaves
export const loadShare = (was: number, done: number) => Math.max(was, 1 - Math.exp(-done / 40));

// ponytail: a texture or a font that never answers stops holding the cover after this long with no file landing; no retry
export const IDLE_MS = 5000;
// the cover waits while files are in flight and one landed in the last IDLE_MS (a slow phone keeps it up as long as
// files keep coming; a fixed 5 s from the build let the cover go with the models still landing, review of Nov 18)
export const stillLoading = (busy: boolean, lastFile: number, now: number) => busy && now - lastFile < IDLE_MS;

// where the 3D loading screen draws (flow3d/loading3d.ts): the line over the bar, both in the middle of the page, and
// under them the Reload button of a failed load (44 px at least: a finger, design system section 8);
// `s`: one px of the 1080p reference
export function loadingLayout(
  w: number,
  h: number,
  s: number,
): { line: { x: number; y: number }; bar: Box; button: Box } {
  const bw = Math.min(560 * s, w - 64),
    bh = Math.max(8, 14 * s),
    bar = { x: (w - bw) / 2, y: h / 2 + 8 * s, w: bw, h: bh },
    kw = Math.min(Math.max(160, 260 * s), w - 64),
    kh = Math.max(44, 64 * s);
  return {
    line: { x: w / 2, y: h / 2 - 28 * s },
    bar,
    button: { x: (w - kw) / 2, y: bar.y + bh + Math.max(16, 32 * s), w: kw, h: kh },
  };
}
