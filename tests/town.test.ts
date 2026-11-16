import { describe, expect, it } from 'vitest';
import { changeClass, defaultGroup, type Group } from '../src/client/group.ts';
import { faceOf } from '../src/client/talk.ts';
import { PAINT } from '../src/client/terrain.ts';
import {
  atDoor,
  castParty,
  cell,
  ME,
  memberUnit,
  placeAt,
  route,
  townScenario,
  townState,
} from '../src/client/town-map.ts';
import { GUILD_SPOTS, TOWN, TOWN_PLACES, TOWN_START, TOWNSFOLK } from '../src/content/crawl/town.ts';
import { tileAt } from '../src/shared/battle/grid.ts';
import { halfDef, SUB } from '../src/shared/battle/half.ts';
import { footprint } from '../src/shared/battle/pathing.ts';
import type { Pos } from '../src/shared/battle/types.ts';

const sc = townScenario();
const place = (id: string) => TOWN_PLACES.find((p) => p.id === id)!;
// the walker alone at the start: nobody stands in the way of the reachability checks
const alone = () => ({
  ...townState(sc),
  units: [{ id: ME, def: halfDef('warrior'), team: 'hero' as const, pos: cell(TOWN_START), hp: 1, ct: 0 }],
});
const party = (g: Group = defaultGroup()) => {
  const state = townState(sc);
  castParty(state, g);
  return state;
};

describe('the walkable town (src/content/crawl/town.ts, town-map.ts)', () => {
  it('draws every tile on the painted terrain, never as KayKit blocks', () => {
    for (const t of TOWN.grid.tiles) expect(t.look && t.look in PAINT, t.look).toBe(true);
  });

  it('marks each place on its own centre tile, and its door on open ground', () => {
    for (const p of TOWN_PLACES) {
      expect(tileAt(TOWN.grid, p.at).look, p.id).toBe(p.id);
      expect(tileAt(TOWN.grid, p.door).terrain, p.id).toBe('floor');
    }
  });

  it('lets the walker reach every door, every guild spot and every townsperson from the start', () => {
    const state = alone();
    for (const p of TOWN_PLACES)
      expect(
        route(sc.grid, state, ME, (q) => atDoor(q, p)),
        p.id,
      ).not.toBeNull();
    for (const at of [...GUILD_SPOTS, ...TOWNSFOLK.map((f) => f.home)])
      expect(
        route(sc.grid, state, ME, (q) => q.x === cell(at).x && q.y === cell(at).y),
        JSON.stringify(at),
      ).not.toBeNull();
  });

  it('finds the place from any cell of its lot, the gate included, and none on the road', () => {
    const inLot = (p: Pos, dx: number, dy: number) => ({ x: (p.x + dx) * SUB + 1, y: (p.y + dy) * SUB });
    expect(placeAt(inLot(place('guild').at, -1, 1))?.id).toBe('guild');
    expect(placeAt(inLot(place('tavern').at, 0, 0))?.id).toBe('tavern');
    expect(placeAt(inLot(place('gate').at, 1, 0))?.id).toBe('gate');
    expect(placeAt(cell(TOWN_START))).toBeUndefined();
    expect(placeAt(cell(place('shop').door))).toBeUndefined();
  });

  it('counts the walker at a door wholly or half over its tile, not a step away', () => {
    const door = cell(place('shop').door);
    expect(atDoor(door, place('shop'))).toBe(true);
    expect(atDoor({ x: door.x + 1, y: door.y }, place('shop'))).toBe(true);
    expect(atDoor({ x: door.x + 3, y: door.y }, place('shop'))).toBe(false);
    expect(atDoor(door, place('tavern'))).toBe(false);
  });

  it('puts the first deployed member on the walk and the rest at the Guild, nobody overlapping', () => {
    const g = defaultGroup();
    const state = party(g);
    const me = state.units.find((u) => u.id === ME)!;
    expect(me.def).toBe(halfDef(g.members[0].cls));
    expect(me.pos).toEqual(cell(TOWN_START));
    for (const m of g.members.slice(1)) {
      const u = state.units.find((x) => x.id === memberUnit(m.id))!;
      expect(GUILD_SPOTS.map(cell)).toContainEqual(u.pos);
    }
    const cells = state.units.flatMap((u) => footprint(u).map((c) => `${c.x},${c.y}`));
    expect(new Set(cells).size).toBe(cells.length);
  });

  it('a refresh after a class change drops only that member, who comes back in the new class', () => {
    const g = defaultGroup();
    const state = party(g);
    const odo = g.members[2];
    expect(castParty(state, g)).toEqual([]);
    expect(castParty(state, changeClass(g, odo.id, 'lancer'))).toEqual([memberUnit(odo.id)]);
    expect(state.units.find((u) => u.id === memberUnit(odo.id))?.def).toBe(halfDef('lancer'));
  });

  it('a new leader takes the walker over, where the walker stood', () => {
    const g = defaultGroup();
    const state = party(g);
    const walker = state.units.find((u) => u.id === ME)!;
    walker.pos = { x: walker.pos.x, y: walker.pos.y - 4 };
    const next = { ...g, deployed: g.deployed.slice(1) };
    expect(castParty(state, next)).toContain(ME);
    expect(state.units.find((u) => u.id === ME)).toMatchObject({ def: halfDef(g.members[1].cls), pos: walker.pos });
  });

  it('gives every townsperson a painted face and something to say in both languages', () => {
    for (const f of TOWNSFOLK) {
      expect(faceOf(f.def), f.id).toBeDefined();
      expect(f.lines.length, f.id).toBeGreaterThan(0);
      for (const [pt, en] of f.lines) expect(pt && en && pt !== en, f.id).toBeTruthy();
    }
  });
});
