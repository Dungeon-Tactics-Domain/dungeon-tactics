// The battle camera's frame and aim math with no Three or DOM, so it is tested (tests/camera-aim.test.ts): how far to zoom out so
// the actor and its target both fit (Fernando, Nov 25) and whether taller ground hides a unit from an angle, so the
// camera turns to the nearest angle that shows it. scene/camera.ts applies both.
import { type Grid, inBounds, tileAt } from '../shared/battle/grid.ts';
import type { Pos } from '../shared/battle/types.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';
import { unitHeight } from './markers.ts';

export interface Insets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

// Orthographic frame of `viewH` world units on a w x h px page, shifted so the focus sits in the middle of the free space
// the HUD leaves (top and bottom panels; the turn list on the left, Nov 22: it covered the Mage at the map's edge on the tablet)
export function frameBounds(w: number, h: number, viewH: number, insets: Insets) {
  const px = viewH / h; // world units per pixel, the same both ways
  const x = ((insets.left - insets.right) / 2) * px,
    y = ((insets.bottom - insets.top) / 2) * px;
  const halfW = (viewH * w) / h / 2;
  return { left: -halfW - x, right: halfW - x, top: viewH / 2 - y, bottom: -viewH / 2 - y };
}

// a unit as the camera frames it: its corner cell, its square's side in cells and its height in world units; a tile
// with no unit (an area's aim) is one cell with no height
export interface Body {
  p: Pos;
  size: number;
  h: number;
}
export const bodyOf = (p: Pos, def?: string): Body =>
  def ? { p, size: UNIT_DEFS[def].size ?? 1, h: unitHeight(def) } : { p, size: 1, h: 0 };

export interface Point {
  x: number;
  y: number;
  z: number;
}

// the screen's right and up in the world for a camera at `yaw` and `pitch` (CameraRig.placeCamera's frame)
function axes(yaw: number, pitch: number) {
  const s = Math.sin(yaw),
    c = Math.cos(yaw),
    sp = Math.sin(pitch),
    cp = Math.cos(pitch);
  return { right: { x: c, y: 0, z: -s }, up: { x: -s * sp, y: cp, z: -c * sp } };
}
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y + a.z * b.z;

// The view height (CameraRig.viewH) that frames `a` and `b` around their middle inside the space the HUD leaves on a
// pageW x pageH page, with `margin` world units around them and `body` more above (the units stand up from their
// ground point). A portrait page is widened by frameView, so it is undone here, as topFit does
export function fitBoth(
  a: Point,
  b: Point,
  yaw: number,
  pitch: number,
  page: { w: number; h: number },
  i: Insets,
  margin: number,
  body: number,
): number {
  const { right, up } = axes(yaw, pitch);
  const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const freeW = Math.max(1, page.w - i.left - i.right),
    freeH = Math.max(1, page.h - i.top - i.bottom);
  const need = Math.max(
    ((Math.abs(dot(d, right)) + 2 * margin) * page.h) / freeW,
    ((Math.abs(dot(d, up)) + 2 * margin + body) * page.h) / freeH,
  );
  const ratio = page.w / page.h;
  return ratio < 1 ? (need * ratio) / 1.15 : need;
}

// How tall a cell is drawn, in world units: its column of levels and two more on a wall (the stacked stone of
// scene/board.ts columnTop), so a crawl room's walls hide what stands behind them
export function drawnTop(grid: Grid, step: number, cell: { x: number; y: number }): number {
  const t = tileAt(grid, cell);
  return (t.h + (t.terrain === 'wall' ? 2 : 0) + 1) * step;
}

// Whether the ground or a wall stands between the world point `at` (a unit's body) and a camera at `yaw` and `pitch`:
// walks the line from the point toward the camera a quarter of a cell at a time and asks each cell under it whether it
// is drawn higher than the line there. Trees do not count: the scene already cuts the ones in front of a unit
export function hiddenAt(grid: Grid, step: number, at: Point, yaw: number, pitch: number): boolean {
  const dx = Math.sin(yaw),
    dz = Math.cos(yaw),
    rise = Math.tan(pitch);
  // world (map centred on the origin) to the cell under it, as TileSpace.world places them
  const cell = (x: number, z: number) => ({ x: Math.floor(x + grid.width / 2), y: Math.floor(z + grid.height / 2) });
  for (let t = 0.25; t < grid.width + grid.height; t += 0.25) {
    const c = cell(at.x + dx * t, at.z + dz * t);
    if (!inBounds(grid, c)) return false;
    if (drawnTop(grid, step, c) > at.y + rise * t) return true;
  }
  return false;
}

// The angle to look from: `yaw` itself when nothing is hidden there, else the nearest of the steps around it that
// hides nothing (one step either way, then two...), else `yaw` (no angle helps: the camera does not turn for nothing)
export function revealYaw(yaw: number, step: number, hidden: (yaw: number) => boolean): number {
  if (!hidden(yaw)) return yaw;
  const turns = Math.round((2 * Math.PI) / step / 2);
  for (let n = 1; n <= turns; n++) for (const y of [yaw + n * step, yaw - n * step]) if (!hidden(y)) return y;
  return yaw;
}
