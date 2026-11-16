// Weight of a blow, drawing only (Fernando's grill of Nov 15; the Mechanics lab's peso.json and its impact scene are the
// starting point he tunes by playing). Distances in whole tiles, 1 tile = 1 m as in the lab: scene/units.ts multiplies
// them by the map's `sub`. Timings are in timing.ts
import type { BattleEvent } from '../shared/battle/types.ts';
import { BIG } from './battle-face.ts';

export const WEIGHT = {
  recoil: 0.5, // the struck body steps back half a tile and comes back
  tremble: 0.04, // the struck body's shake, side to side
  quake: 0.08, // camera shake on a strong strike...
  quakeLand: 0.04, // ...and on landing a fall or meeting a wall
  gravity: 9.8, // the fall's arc, tiles/s²
  hop: 1.4, // the fall's upward start off the edge, tiles/s
  bounce: 0.14, // the short bounce where it lands
  wall: 0.2, // gap the body crosses before it meets the wall: half a tile minus the body's radius
  chest: 0.7, // where the number pops from, as a share of the unit's height (the lab: 0.6 m of 0.85)
  slow: 0.3, // death slow motion: the battle clock's rate...
  zoom: 2.2, // ...and how much closer the camera comes
};

export const isBig = (amount: number, max: number) => amount >= max * BIG;

// Number size by the share of life it takes, since life and damage went x5: 26 px at 10% and 38 at 25% (the old normal
// and big sizes), up to 56; a strong strike (the lab's crit) 1.4x on top
export const numberPx = (amount: number, max: number, strong = isBig(amount, max)) =>
  Math.round(Math.min(56, 18 + (80 * amount) / max) * (strong ? 1.4 : 1));

// colour by kind: white physical, violet magic, green heal, grey miss; push, wall, fall and spikes are physical
export type NumberKind = 'phys' | 'magic' | 'heal' | 'miss';
export const numberKind = (e: BattleEvent, magic: boolean): NumberKind =>
  e.k === 'heal' ? 'heal' : e.k === 'miss' ? 'miss' : e.k === 'hit' && magic ? 'magic' : 'phys';

// A floating number on screen: its middle and size in px, and how far it was lifted
export interface NumberBox {
  x: number;
  y: number;
  w: number;
  h: number;
  lift: number;
}
// How far up a new number goes so it covers none still on screen (an area strike's targets stand side by side, and
// their numbers came out on top of each other): it climbs over each one it meets, in px
export function liftOver(others: NumberBox[], me: Omit<NumberBox, 'lift'>): number {
  let lift = 0;
  for (let moved = true; moved; ) {
    moved = false;
    for (const o of others) {
      const gapY = (o.h + me.h) / 2,
        dy = me.y - lift - (o.y - o.lift);
      if (Math.abs(o.x - me.x) < (o.w + me.w) / 2 && Math.abs(dy) < gapY) {
        lift += gapY + dy;
        moved = true;
      }
    }
  }
  return lift;
}

// the damage that downs its unit: the unit's next damage or death after it is its death (a push, fall or spike may come
// between a strike and the death)
export function fatal(events: BattleEvent[], i: number): boolean {
  const u = events[i].unit;
  return events.slice(i + 1).find((e) => e.unit === u && (e.k === 'die' || 'dmg' in e))?.k === 'die';
}

// the strike also pushes its unit (a push or a bump before the next attack): the push moves the body, so no recoil
export function shoved(events: BattleEvent[], i: number): boolean {
  const u = events[i].unit;
  const next = events
    .slice(i + 1)
    .find((e) => e.k === 'attack' || (e.unit === u && (e.k === 'push' || e.k === 'bump')));
  return !!next && next.k !== 'attack';
}

// Options → Video and effects: slow motion on deaths, on by default; a global setting, not part of a save slot
export const SLOWMO_KEY = 'dt:death-slowmo';
export const parseSlowmo = (v: unknown) => v !== false;
