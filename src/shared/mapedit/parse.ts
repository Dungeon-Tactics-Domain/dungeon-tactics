// Trust boundary of the builders: a map or battle document read from a browser save or pasted JSON is rebuilt field
// by field; any doubt gives null (root CLAUDE.md, like parseExpedition).
import { TERRAIN, type TerrainKind, type Tile } from '../battle/grid.ts';
import type { Team } from '../battle/types.ts';
import { type BattleDoc, LIFE, type MapUnit, sizeOf } from './battle.ts';
import { MAX_H, type MapDoc, SIZE } from './doc.ts';
import { knownClass, square } from './units.ts';

const MAX_UNITS = 64;
const ID = /^[A-Za-z0-9_-]{1,40}$/;
const LOOK = /^[a-z0-9_]{1,24}$/;

const isInt = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
// a control character (a line break) would break the name's quotes in the .ts export
const isName = (v: unknown): v is string => typeof v === 'string' && !!v.trim() && v.length <= 40 && !/\p{Cc}/u.test(v);

function parseTile(v: unknown): Tile | null {
  if (!isObj(v) || typeof v.terrain !== 'string' || !Object.hasOwn(TERRAIN, v.terrain) || !isInt(v.h, 0, MAX_H))
    return null;
  if (v.look !== undefined && !(typeof v.look === 'string' && LOOK.test(v.look))) return null;
  if (v.depth !== undefined && !isInt(v.depth, 1, MAX_H)) return null;
  if (v.spikes !== undefined && v.spikes !== true) return null;
  if (v.noStop !== undefined && v.noStop !== true) return null;
  const r = v.ramp;
  if (r !== undefined && !(Array.isArray(r) && r.length === 2 && isInt(r[0], 0, 3) && isInt(r[1], 1, MAX_H)))
    return null;
  return {
    terrain: v.terrain as TerrainKind,
    ...(v.look !== undefined && { look: v.look as string }),
    ...(v.depth !== undefined && { depth: v.depth }),
    ...(v.spikes && { spikes: true as const }),
    ...(v.noStop && { noStop: true as const }),
    h: v.h,
    ...(Array.isArray(r) && { ramp: [r[0], r[1]] as [number, number] }),
  };
}

export function parseMapDoc(v: unknown): MapDoc | null {
  if (!isObj(v) || typeof v.id !== 'string' || !ID.test(v.id) || !isName(v.name) || !isName(v.en)) return null;
  const { width, height } = v;
  if (!isInt(width, ...SIZE) || !isInt(height, ...SIZE)) return null;
  if (!Array.isArray(v.tiles) || v.tiles.length !== width * height) return null;
  const tiles = v.tiles.map(parseTile);
  if (tiles.some((t) => !t)) return null;
  return { id: v.id, name: v.name.trim(), en: v.en.trim(), width, height, tiles: tiles as Tile[] };
}

function parseUnit(v: unknown, width: number, height: number): MapUnit | null {
  if (!isObj(v) || typeof v.id !== 'string' || !ID.test(v.id)) return null;
  if (typeof v.def !== 'string' || !knownClass(v.def) || (v.team !== 'hero' && v.team !== 'enemy')) return null;
  const s = sizeOf(v.def);
  if (!isInt(v.x, 0, width - s) || !isInt(v.y, 0, height - s) || !isInt(v.facing, 0, 3)) return null;
  if (v.hp !== undefined && !isInt(v.hp, ...LIFE)) return null;
  return {
    id: v.id,
    def: v.def,
    team: v.team as Team,
    x: v.x,
    y: v.y,
    facing: v.facing,
    ...(v.hp !== undefined && { hp: v.hp }),
  };
}

export function parseBattleDoc(v: unknown): BattleDoc | null {
  if (!isObj(v)) return null;
  const map = parseMapDoc(v.map);
  if (!map || !Array.isArray(v.units) || v.units.length > MAX_UNITS) return null;
  const units = v.units.map((u) => parseUnit(u, map.width, map.height));
  if (units.some((u) => !u)) return null;
  const ok = units as MapUnit[];
  if (new Set(ok.map((u) => u.id)).size !== ok.length) return null;
  // two squares on one tile: placeUnit never leaves that, so the save was not the builder's
  const taken = ok.flatMap((u) => square(u, sizeOf(u.def)).map((p) => `${p.x},${p.y}`));
  if (new Set(taken).size !== taken.length) return null;
  return { map, units: ok };
}
