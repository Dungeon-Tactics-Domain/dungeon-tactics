import { describe, expect, it } from 'vitest';
import { changeClass, defaultGroup, GROUP_MAX, type Group } from '../src/client/group.ts';
import { UI_ICON } from '../src/client/icons.ts';
import { faceOf } from '../src/client/talk.ts';
import { PAINT } from '../src/client/terrain.ts';
import {
  atDoor,
  castParty,
  cell,
  floorCells,
  ME,
  memberUnit,
  near,
  parseTownGrid,
  placeAt,
  route,
  steps,
  strollPath,
  type TownAct,
  townScenario,
  townSquares,
  townState,
  townTarget,
} from '../src/client/town-map.ts';
import { GUILD_SPOTS, TOWN, TOWN_PLACES, TOWN_START, TOWNSFOLK } from '../src/content/crawl/town.ts';
import { posKey, tileAt } from '../src/shared/battle/grid.ts';
import { halfDef, SUB } from '../src/shared/battle/half.ts';
import { cellsOf, footprint, reachable } from '../src/shared/battle/pathing.ts';
import type { BattleState, Pos } from '../src/shared/battle/types.ts';

const sc = townScenario();
const place = (id: string) => TOWN_PLACES.find((p) => p.id === id)!;
// the party at its cap: the story members and recruits, so every Guild spot is taken
const full: Group = {
  ...defaultGroup(),
  members: [
    ...defaultGroup().members,
    ...['a', 'b', 'c', 'd'].map((id) => ({ id, name: id, cls: 'rogue' as const, recruit: true })),
  ],
};
// seeded, so a failing stroll replays
const seeded = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
// where the keyboard takes the walker: one cell at a time by the battle's own rule (reachable, budget 1)
const keyStops = (state: BattleState) => {
  const me = state.units.find((u) => u.id === ME)!;
  const from = me.pos;
  const seen = new Map([[posKey(from), from]]);
  for (const p of seen.values()) {
    me.pos = p;
    for (const s of reachable(sc.grid, state, ME, 1).values()) seen.set(posKey(s.pos), s.pos);
  }
  me.pos = from;
  return [...seen.values()];
};
// what the keyboard misses: a door, someone to talk to, or someone standing on someone (steps: the fast keyStops, the
// next test holds them equal)
const missed = (state: BattleState) => {
  const stops = steps(sc.grid, state).map((s) => s.pos);
  const cells = state.units.flatMap((u) => footprint(u).map(posKey));
  return [
    ...TOWN_PLACES.filter((pl) => !stops.some((p) => atDoor(p, pl))).map((pl) => pl.id),
    ...state.units.filter((u) => u.id !== ME && !stops.some((p) => near(p, u))).map((u) => u.id),
    ...(new Set(cells).size === cells.length ? [] : ['overlap']),
  ];
};
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

  it('keeps every door and everyone within single keyboard steps, whole party in and townsfolk strolling', () => {
    expect(full.members.length).toBe(GROUP_MAX);
    const moved = new Set<string>();
    for (let seed = 1; seed <= 4; seed++) {
      const state = party();
      const me = state.units.find((u) => u.id === ME)!;
      const rnd = seeded(seed);
      for (let round = 0; round < 12; round++) {
        // halfway, recruits hired at the Tavern join the Guild's spots, wherever the townsfolk stand by then
        if (round === 6) castParty(state, full);
        expect(missed(state), `seed ${seed}, round ${round}`).toEqual([]);
        // the walker goes somewhere, then each townsperson strolls; every cell of the way must hold, since in the game
        // a stroll stops halfway when a window opens or the walker comes along
        const ways = steps(sc.grid, state);
        me.pos = ways[Math.floor(rnd() * ways.length)].pos;
        for (const f of TOWNSFOLK) {
          const u = state.units.find((x) => x.id === `f-${f.id}`)!;
          for (const p of strollPath(sc.grid, state, u.id, cell(f.home), rnd)) {
            moved.add(f.id);
            u.pos = p;
            expect(missed(state), `seed ${seed}, round ${round}, ${f.id} at ${posKey(p)}`).toEqual([]);
          }
        }
      }
    }
    expect(moved.size).toBe(TOWNSFOLK.length); // nobody stood still all along: the checks are not too strict
  }, 20_000); // about 200 walks over the whole town

  it('walks a click the way of the keyboard: the same stops, nobody walked through', () => {
    const state = party(full);
    const ways = steps(sc.grid, state);
    expect(ways.map((s) => posKey(s.pos)).sort()).toEqual(keyStops(state).map(posKey).sort());
    const taken = new Set(state.units.filter((u) => u.id !== ME).flatMap((u) => footprint(u).map(posKey)));
    for (const s of ways) for (const p of s.path) expect(cellsOf(p, SUB).some((c) => taken.has(posKey(c)))).toBe(false);
    expect(route(sc.grid, state, (q) => atDoor(q, place('tavern')))?.length).toBeGreaterThan(0);
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

  it('acts on whoever stands in front, else the door, else whoever is beside, each kind with its balloon symbol', () => {
    const state = party();
    const me = state.units.find((u) => u.id === ME)!;
    const hugo = state.units.find((u) => u.id === 'f-smith')!;
    me.pos = cell(place('tavern').door);
    expect(townTarget(state, { x: 0, y: -1 })).toMatchObject({ act: 'tavern', place: place('tavern') });
    // someone in front wins over the door
    hugo.pos = { x: me.pos.x, y: me.pos.y - SUB };
    expect(townTarget(state, { x: 0, y: -1 })).toMatchObject({ act: 'talk', unit: hugo });
    // behind the walker: the door first, someone beside only off it
    expect(townTarget(state, { x: 0, y: 1 })).toMatchObject({ act: 'tavern' });
    me.pos = { x: me.pos.x + 2 * SUB, y: me.pos.y };
    hugo.pos = { x: me.pos.x, y: me.pos.y - SUB };
    expect(townTarget(state, { x: 0, y: 1 })).toMatchObject({ act: 'talk', unit: hugo });
    hugo.pos = { x: 0, y: 0 };
    expect(townTarget(state, { x: 0, y: 1 })).toBeNull();
    state.units = [me]; // nobody by the doors
    const actAt = (id: string) => {
      me.pos = cell(place(id).door);
      return townTarget(state, { x: 0, y: 1 })?.act;
    };
    expect(TOWN_PLACES.map((p) => actAt(p.id))).toEqual(['quest', 'party', 'soon', 'shop', 'tavern', 'soon']);
    for (const act of ['talk', 'party', 'shop', 'tavern', 'enter', 'quest', 'soon'] as TownAct[])
      expect(UI_ICON[act], act).toBeTruthy();
  });

  it('frames everyone and every doorstep on the debug grid, dotted on the walkable ground, off by default', () => {
    const state = party();
    expect(townSquares(state)).toEqual([...state.units.map((u) => u.pos), ...TOWN_PLACES.map((p) => cell(p.door))]);
    const dots = floorCells(sc.grid);
    expect(dots).toContainEqual(cell(TOWN_START));
    expect(dots.every((p) => tileAt(sc.grid, p).terrain === 'floor')).toBe(true);
    expect([null, 'true', 1, {}].map(parseTownGrid)).toEqual([false, false, false, false]);
    expect(parseTownGrid(true)).toBe(true);
  });

  it('gives every townsperson a painted face and something to say in both languages', () => {
    for (const f of TOWNSFOLK) {
      expect(faceOf(f.def), f.id).toBeDefined();
      expect(f.lines.length, f.id).toBeGreaterThan(0);
      for (const [pt, en] of f.lines) expect(pt && en && pt !== en, f.id).toBeTruthy();
    }
  });
});
