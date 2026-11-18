import { describe, expect, it } from 'vitest';
import { changeClass, defaultGroup, GROUP_MAX, type Group } from '../src/client/group.ts';
import { UI_ICON } from '../src/client/icons.ts';
import { gridStep } from '../src/client/keyboard.ts';
import { faceOf } from '../src/client/talk.ts';
import { PAINT } from '../src/client/terrain.ts';
import {
  atDoor,
  BODY,
  castParty,
  cell,
  cellUnder,
  centreOf,
  floorCells,
  freeTarget,
  groundDir,
  ME,
  memberUnit,
  near,
  parseTownFree,
  parseTownGrid,
  placeAt,
  route,
  STICK_DEAD,
  slide,
  steps,
  stick,
  strollPath,
  TALK,
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
    // two people beside: one target, the one in front (a single balloon, never one per person)
    const other = state.units.find((u) => u.id !== ME && u !== hugo)!;
    other.pos = { x: me.pos.x - SUB, y: me.pos.y };
    expect(townTarget(state, { x: -1, y: 0 })).toMatchObject({ unit: other });
    expect(townTarget(state, { x: 0, y: -1 })).toMatchObject({ unit: hugo });
    other.pos = { x: 0, y: 2 * SUB };
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

describe('fluid movement in the walkable town (town-map.ts)', () => {
  const alone = () => {
    const state = party();
    const me = state.units.find((u) => u.id === ME)!;
    state.units = [me];
    return { state, me };
  };
  // how far the circle's rim is from the nearest thing it may not enter (negative: inside it)
  const clearance = (state: BattleState, at: Pos) => {
    const boxes = [
      ...sc.grid.tiles.flatMap((t, i) =>
        t.terrain === 'floor' ? [] : [{ x: i % sc.grid.width, y: Math.floor(i / sc.grid.width) }],
      ),
      ...state.units.filter((u) => u.id !== ME).flatMap(footprint),
    ];
    const far = (c: Pos) =>
      Math.hypot(at.x - Math.min(Math.max(at.x, c.x), c.x + 1), at.y - Math.min(Math.max(at.y, c.y), c.y + 1));
    return Math.min(...boxes.map(far)) - BODY;
  };

  it('is off unless the saved value is exactly true', () => {
    expect([null, 'true', 1, {}, []].map(parseTownFree)).toEqual([false, false, false, false, false]);
    expect(parseTownFree(true)).toBe(true);
  });

  it('stops at a wall, slides along it and never jumps it on a long frame', () => {
    const { state } = alone();
    const door = centreOf(cell(place('shop').door)); // the Shop's wall is one cell north of the doorstep's middle
    const wall = door.y - 1 + BODY;
    expect(slide(sc.grid, state, door, { x: 0, y: -9 })).toEqual({ x: door.x, y: wall });
    let at = door;
    for (let i = 0; i < 4; i++) at = slide(sc.grid, state, at, { x: 0.3, y: -0.3 });
    expect(at.y).toBeCloseTo(wall);
    expect(at.x).toBeCloseTo(door.x + 1.2); // every bit of the sideways part
  });

  it('passes the 2-cell lane beside the Shop without touching either side', () => {
    const { state } = alone();
    const lane = cell({ x: 1, y: 8 }); // the grass column between the woods and the Shop's lot
    let at = centreOf(lane);
    for (let i = 0; i < 16; i++) at = slide(sc.grid, state, at, { x: 0, y: -0.5 });
    expect(at).toEqual({ x: lane.x + 1, y: lane.y + 1 - 8 });
  });

  it('is pushed out of someone whose square lands on the circle', () => {
    const state = party();
    const me = state.units.find((u) => u.id === ME)!;
    const hugo = state.units.find((u) => u.id === 'f-smith')!;
    const mid = centreOf(me.pos);
    hugo.pos = { x: me.pos.x + SUB, y: me.pos.y }; // the next square over: the walker's own stays free
    const at = slide(sc.grid, state, { x: mid.x + 0.5, y: mid.y }, { x: 0, y: 0 });
    expect(at.x).toBeCloseTo(mid.x + 1 - BODY);
    expect(at.y).toBe(mid.y);
    expect(cellUnder(at)).toEqual(me.pos);
  });

  it('goes round a corner met dead on: W at the start, the smith’s corner straight up the screen', () => {
    const state = party();
    const me = state.units.find((u) => u.id === ME)!;
    const hugo = state.units.find((u) => u.id === 'f-smith')!;
    expect(hugo.pos).toEqual({ x: me.pos.x - SUB, y: me.pos.y - SUB }); // corner to corner, up the screen
    const up = groundDir({ x: 0, y: -1 }, Math.PI / 4); // the camera's starting turn
    // 3 cells of walking at several frame rates: the side taken must not hang on rounding noise (the other one is the
    // dead end between him and the forge)
    for (const hop of [0.01, 0.02, 0.0227, 0.05, 0.15]) {
      let at = centreOf(me.pos);
      for (let i = 0; i < 3 / hop; i++) at = slide(sc.grid, state, at, { x: up.x * hop, y: up.y * hop });
      // of the 2.1 a free walk gives; 0.4 when it pressed on his corner
      expect(centreOf(me.pos).y - at.y, `hop ${hop}`).toBeGreaterThan(1.5);
    }
  });

  it('keeps the square under the walker on a stop of the mesh, clear of walls and people, on a long random walk', () => {
    const state = party(full);
    const me = state.units.find((u) => u.id === ME)!;
    const stops = new Set(steps(sc.grid, state).map((s) => posKey(s.pos)));
    const rnd = seeded(7);
    const seen = new Set<string>();
    let at = centreOf(me.pos);
    let d = { x: 0, y: 0 };
    for (let i = 0; i < 6000; i++) {
      // a new way every 20 frames, some of them a long frame's jump
      if (i % 20 === 0) {
        const a = rnd() * Math.PI * 2;
        const len = rnd() < 0.1 ? 3 : 0.25;
        d = { x: Math.cos(a) * len, y: Math.sin(a) * len };
      }
      at = slide(sc.grid, state, at, d);
      me.pos = cellUnder(at);
      seen.add(posKey(me.pos));
      if (!stops.has(posKey(me.pos)) || clearance(state, at) < -0.05)
        throw new Error(`frame ${i}: at ${at.x},${at.y}, clearance ${clearance(state, at)}`);
    }
    expect(seen.size).toBeGreaterThan(60); // it went places: the walk is not stuck in a corner
  });

  it('reads the stick past its dead zone, from nothing up to full tilt', () => {
    expect(stick(STICK_DEAD, 0)).toEqual({ x: 0, y: 0 });
    expect(stick(0.1, -0.1)).toEqual({ x: 0, y: 0 });
    expect(stick(Number.NaN, 1)).toEqual({ x: 0, y: 0 });
    expect(stick(1, 0)).toEqual({ x: 1, y: 0 });
    const corner = stick(1, 1); // a square gate's corner is not faster
    expect(Math.hypot(corner.x, corner.y)).toBeCloseTo(1);
    const half = stick(0, -(STICK_DEAD + 1) / 2);
    expect(half.x).toBe(0);
    expect(half.y).toBeCloseTo(-0.5);
  });

  it('turns a screen direction with the camera, the way the cell walk does at straight angles', () => {
    const screen = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
    for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2])
      for (const dir of ['up', 'down', 'left', 'right'] as const) {
        const g = groundDir(screen[dir], yaw);
        expect({ x: Math.round(g.x) || 0, y: Math.round(g.y) || 0 }, `${dir} at ${yaw}`).toEqual(gridStep(dir, yaw));
      }
  });

  it('acts by distance and angle: in front first, else the door, else whoever is beside', () => {
    const state = party();
    const me = state.units.find((u) => u.id === ME)!;
    const hugo = state.units.find((u) => u.id === 'f-smith')!;
    state.units = [me, hugo];
    hugo.pos = { x: 0, y: 0 };
    const north = { x: 0, y: -1 };
    me.pos = cell(place('tavern').door);
    const at = centreOf(me.pos);
    expect(freeTarget(state, at, north)).toMatchObject({ act: 'tavern', place: place('tavern') });
    // a little off the doorstep's tile is still at the door, a whole cell off is not
    expect(freeTarget(state, { x: at.x + 1.2, y: at.y }, north)).toMatchObject({ act: 'tavern' });
    expect(freeTarget(state, { x: at.x + 2, y: at.y }, north)).toBeNull();
    // someone in front wins over the door, anywhere inside the cone
    hugo.pos = { x: me.pos.x, y: me.pos.y - SUB };
    expect(freeTarget(state, at, north)).toMatchObject({ act: 'talk', unit: hugo });
    expect(freeTarget(state, at, { x: 0.8, y: -0.6 })).toMatchObject({ act: 'talk', unit: hugo });
    // to the side or behind: the door first, someone beside only off it
    expect(freeTarget(state, at, { x: 1, y: 0 })).toMatchObject({ act: 'tavern' });
    expect(freeTarget(state, at, { x: 0, y: 1 })).toMatchObject({ act: 'tavern' });
    const off = { x: at.x + 2 * SUB, y: at.y };
    hugo.pos = { x: me.pos.x + 2 * SUB, y: me.pos.y - SUB };
    expect(freeTarget(state, off, { x: 0, y: 1 })).toMatchObject({ act: 'talk', unit: hugo });
    // reach is the distance between the two middles
    expect(freeTarget(state, { x: off.x, y: off.y + TALK - SUB }, north)).toMatchObject({ act: 'talk', unit: hugo });
    expect(freeTarget(state, { x: off.x, y: off.y + TALK - SUB + 0.1 }, north)).toBeNull();
  });
});
