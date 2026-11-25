// Units of a battle document (battle.ts), for the future battle builder: place, remove, turn (Q / E) and their own
// life. A big unit stands on the square of its class's size from its anchor, as in the battle (pathing.ts footprint).
import { canStand, faceNearest } from '../battle/grid.ts';
import type { Pos, Team } from '../battle/types.ts';
import { HALF, UNIT_DEFS } from '../battle/units.ts';
import { type BattleDoc, LIFE, type MapUnit, sizeOf } from './battle.ts';
import { index, inside } from './doc.ts';

export const square = (u: { x: number; y: number }, size: number): Pos[] =>
  Array.from({ length: size * size }, (_, k) => ({ x: u.x + (k % size), y: u.y + Math.floor(k / size) }));
const covers = (u: MapUnit, p: Pos) => square(u, sizeOf(u.def)).some((q) => q.x === p.x && q.y === p.y);
// a class the battle knows by its own id (not a half-tile token nor a prototype name)
export const knownClass = (def: string) => Object.hasOwn(UNIT_DEFS, def) && !def.endsWith(HALF);

export const unitOn = (doc: BattleDoc, p: Pos) => doc.units.find((u) => covers(u, p));

// a new unit's id: the side's letter and the first free number, so a battle keeps readable spawn ids
function freeId(units: MapUnit[], team: Team): string {
  for (let n = 0; ; n++) if (!units.some((u) => u.id === `${team[0]}${n}`)) return `${team[0]}${n}`;
}

// Puts a unit of the class on `p`, facing the nearest foe unless told; whoever its square covers leaves. The same
// document when the class is unknown or the square leaves the map or stands on a tile nobody stands on
export function placeUnit(doc: BattleDoc, p: Pos, def: string, team: Team, facing?: number): BattleDoc {
  const { map } = doc;
  if (!knownClass(def)) return doc;
  const cells = square(p, sizeOf(def));
  if (!cells.every((q) => inside(map, q) && canStand(map.tiles[index(map, q)]))) return doc;
  const stay = doc.units.filter((u) => !cells.some((q) => covers(u, q)));
  const foes = stay.filter((u) => u.team !== team);
  const unit: MapUnit = {
    id: freeId(stay, team),
    def,
    team,
    x: p.x,
    y: p.y,
    facing: facing === undefined ? faceNearest(p, foes) : ((facing % 4) + 4) % 4,
  };
  return { ...doc, units: [...stay, unit] };
}

export function removeUnit(doc: BattleDoc, p: Pos): BattleDoc {
  const u = unitOn(doc, p);
  return u ? { ...doc, units: doc.units.filter((o) => o !== u) } : doc;
}

function change(doc: BattleDoc, p: Pos, edit: (u: MapUnit) => MapUnit): BattleDoc {
  const u = unitOn(doc, p);
  return u ? { ...doc, units: doc.units.map((o) => (o === u ? edit(o) : o)) } : doc;
}

// a quarter turn per step (+1 = E, -1 = Q), in FACING order
export const turnUnit = (doc: BattleDoc, p: Pos, step: number) =>
  step % 4 ? change(doc, p, (u) => ({ ...u, facing: (((u.facing + step) % 4) + 4) % 4 })) : doc;

// own life, or undefined for the class's; outside 1..999 changes nothing
export function setLife(doc: BattleDoc, p: Pos, hp: number | undefined): BattleDoc {
  if (hp !== undefined && !(Number.isInteger(hp) && hp >= LIFE[0] && hp <= LIFE[1])) return doc;
  if (unitOn(doc, p)?.hp === hp) return doc;
  return change(doc, p, ({ hp: _, ...u }) => (hp === undefined ? u : { ...u, hp }));
}
