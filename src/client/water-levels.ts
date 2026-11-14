// Water heights in the drawing (Nov 13), apart from water.ts so it is pure (no Three) and testable, like markers.ts.
import { type Grid, neighbors, posKey, tileAt } from '../shared/battle/grid.ts';
import type { Pos } from '../shared/battle/types.ts';

// how much the deep water surface sits below the shallow one, in levels (visuals only; the rules read depth). 0.8 since Nov 13, Fernando's request
// ("more water depth near the bridge"): with 0.45 the deep river looked flush with the bank and the bridge had almost no gap
export const DEEP_DROP = 0.8;
export const WADE = 0.45; // how much the unit sinks in shallow water, in levels: waist-deep water (Nov 13: with 0.3 the legs barely showed in the transparent water; the rule puts it 1 below the bank)
// how much the unit sinks in deep water, in levels below the surface: swimming, only head and shoulders out (Nov 13, when
// deep water started to allow entry). Its bed sits higher than the feet, but disappears in the dark water (93% opaque)
export const SWIM = 0.75;
const DEEP_BED = 1; // deep bed, in levels below the surface: it vanishes into the dark color, it just must not be in view

// River without ups and downs (Nov 13, Fernando's request: "the water can drop like a waterfall, but not rise and fall like
// on that stone bridge"): the deep water sits DEEP_DROP below the shallow, so a small deep stretch after the ford made the water
// rise at the ford and drop again. Each connected deep stretch (bridges separate them) that touches shallow water and is not the largest on the map
// stays at the shallow height; the largest stays low and the ford drops to it like a waterfall. Visuals only: the rules read depth.
export function raisedDeep(grid: Grid): Set<string> {
  const deep = (p: Pos) => {
    const t = tileAt(grid, p);
    return t.look === 'water' && (t.depth ?? 0) >= 2;
  };
  const seen = new Set<string>(),
    parts: { tiles: string[]; shallow: boolean }[] = [];
  grid.tiles.forEach((_, i) => {
    const start = { x: i % grid.width, y: Math.floor(i / grid.width) };
    if (!deep(start) || seen.has(posKey(start))) return;
    const part = { tiles: [] as string[], shallow: false },
      queue = [start];
    seen.add(posKey(start));
    while (queue.length) {
      const p = queue.pop()!;
      part.tiles.push(posKey(p));
      for (const n of neighbors(grid, p)) {
        const t = tileAt(grid, n);
        if (t.look === 'water' && t.depth === 1) part.shallow = true;
        if (deep(n) && !seen.has(posKey(n))) {
          seen.add(posKey(n));
          queue.push(n);
        }
      }
    }
    parts.push(part);
  });
  const biggest = Math.max(0, ...parts.map((p) => p.tiles.length));
  const big = parts.find((p) => p.tiles.length === biggest);
  return new Set(parts.filter((p) => p !== big && p.shallow).flatMap((p) => p.tiles));
}

export interface WaterLevel {
  surface: number;
  bed: number;
  deep: boolean;
  under?: true;
}

// Surface and bed height of each water tile and each bridge with water underneath. The shallow bed sits where
// stand() puts the feet (WADE), so nobody floats or clips through the ground.
export function waterLevels(grid: Grid, step: number): Map<string, WaterLevel> {
  const out = new Map<string, WaterLevel>();
  const bed = (surface: number, deep: boolean) =>
    deep ? Math.max(0.02, surface - DEEP_BED * step) : surface - WADE * step;
  const at = (i: number): Pos => ({ x: i % grid.width, y: Math.floor(i / grid.width) });
  const raised = raisedDeep(grid);
  grid.tiles.forEach((t, i) => {
    if (t.look !== 'water') return;
    const deep = (t.depth ?? 0) >= 2;
    const surface = (t.h + 1 - (deep && !raised.has(posKey(at(i))) ? DEEP_DROP : 0)) * step;
    out.set(posKey(at(i)), { surface, bed: bed(surface, deep), deep });
  });
  // bridge: water passes underneath at the height of its neighbors. With the plank flush with the water (Flooded Crypt) there is no gap and it is left out
  grid.tiles.forEach((t, i) => {
    if (t.look !== 'bridge') return;
    const near = neighbors(grid, at(i))
      .map((q) => out.get(posKey(q)))
      .filter((l): l is WaterLevel => !!l && !l.under);
    if (!near.length) return;
    const surface = Math.min(...near.map((l) => l.surface));
    if (surface > t.h * step - 0.01) return; // the plank takes up from h to h+1 level
    const deep = near.some((l) => l.deep);
    out.set(posKey(at(i)), { surface, bed: bed(surface, deep), deep, under: true });
  });
  // wide bridge (Nov 13, Ash Wood one became 3 tiles wide): the middle tile only touches land and other bridge tiles, and
  // picks up the neighboring bridge's water; without this the terrain drew a square of ground at plank height
  for (let grew = true; grew; ) {
    grew = false;
    grid.tiles.forEach((t, i) => {
      if (t.look !== 'bridge' || out.has(posKey(at(i)))) return;
      const side = neighbors(grid, at(i))
        .map((q) => out.get(posKey(q)))
        .find((l) => l?.under);
      if (!side) return;
      out.set(posKey(at(i)), { ...side });
      grew = true;
    });
  }
  return out;
}
