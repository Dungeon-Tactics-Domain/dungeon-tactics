// The walkable town's rules (Nov 15, Fernando's grill), pure and tested: the halved map from src/content/crawl/town.ts,
// who stands where (the party, the townsfolk), which place a tile belongs to and where its door is, and where the walker
// can go (the battle's own `reachable`). The scene and the input live in game/town.ts.
import { GUILD_SPOTS, type Place, type PlaceId, TOWN, TOWN_PLACES, TOWN_START } from '../content/crawl/town.ts';
import { dist, type Grid, inBounds, posKey, tileAt } from '../shared/battle/grid.ts';
import { halfDef, halve, SUB } from '../shared/battle/half.ts';
import { cellsOf, footprint, gap, jumpOf, reachable, restsOn, squareMoves, unitAt } from '../shared/battle/pathing.ts';
import { SCENARIOS, type Scenario } from '../shared/battle/scenarios.ts';
import type { BattleState, Pos, UnitState } from '../shared/battle/types.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';
import type { Group } from './group.ts';

export const ME = 'me'; // the walker's unit id: the first of the party who goes to battle
export const memberUnit = (memberId: string) => `p-${memberId}`; // the rest of the party, at the Guild
export const REACH = 2; // cells between two squares to talk: side by side or corner to corner
export const STROLL = 4; // cells a townsperson strays from home

// a whole tile of the content's map as its cell on the halved one
export const cell = (p: Pos): Pos => ({ x: p.x * SUB, y: p.y * SUB });

// The town in half tiles like every map; registered whole too, where the scene finds its mood (ambience.ts kindOf)
export function townScenario(): Scenario {
  SCENARIOS[TOWN.id] = TOWN;
  return halve(TOWN);
}

// a state for the scene to draw: the townsfolk of the scenario; castParty adds the party
export function townState(sc: Scenario): BattleState {
  return {
    scenario: sc.id,
    units: sc.spawns.map((s) => ({ id: s.id, def: s.def, team: s.team, pos: { x: s.x, y: s.y }, hp: 1, ct: 0 })),
    rng: 0,
    turn: { actor: ME, moved: false, main: null, bonus: null },
    charges: [],
    outcome: 'ongoing',
    turnsPlayed: 0,
  };
}

// Who stands in town for the party: the first who goes to battle walks (where the walker stood, else the start), the
// rest wait at the Guild on the first free spot. Whoever already stands with the same class stays put, so a refresh after
// a window moves nobody. Returns the ids that left (a class change or a dismissal), for the scene to drop
export function castParty(state: BattleState, g: Group): string[] {
  const lead = g.members.find((m) => m.id === g.deployed[0]) ?? g.members[0];
  const want = new Map([
    [ME, halfDef(lead.cls)],
    ...g.members.filter((m) => m !== lead).map((m) => [memberUnit(m.id), halfDef(m.cls)] as const),
  ]);
  const at = state.units.find((u) => u.id === ME)?.pos ?? cell(TOWN_START);
  const dropped = state.units
    .filter((u) => (u.id === ME || u.id.startsWith('p-')) && want.get(u.id) !== u.def)
    .map((u) => u.id);
  state.units = state.units.filter((u) => !dropped.includes(u.id));
  const free = (p: Pos) => cellsOf(p, SUB).every((c) => !unitAt(state, c));
  for (const [id, def] of want) {
    if (state.units.some((u) => u.id === id)) continue;
    const pos = id === ME ? at : (GUILD_SPOTS.map(cell).find(free) ?? cell(GUILD_SPOTS[0]));
    state.units.push({ id, def, team: 'hero', pos, hp: UNIT_DEFS[def].hp, ct: 0 });
  }
  return dropped;
}

// the place whose lot holds this cell (its centre tile or a `lot` tile around it), if any
export function placeAt(p: Pos): Place | undefined {
  const tile = { x: Math.floor(p.x / SUB), y: Math.floor(p.y / SUB) };
  const look = tileAt(TOWN.grid, tile).look;
  return TOWN_PLACES.find(
    (pl) => Math.abs(tile.x - pl.at.x) <= 1 && Math.abs(tile.y - pl.at.y) <= 1 && (look === 'lot' || look === pl.id),
  );
}

// the walker's square stands on the tile in front of the place's door (wholly or half over it)
export const atDoor = (p: Pos, pl: Place) => gap(cellsOf(p, SUB), cellsOf(cell(pl.door), SUB)) === 0;

// close enough to talk to someone
export const near = (p: Pos, u: UnitState) => gap(cellsOf(p, SUB), footprint(u)) <= REACH;

// What the action button (Enter, A, a click on the balloon) does, by kind: each kind has its balloon symbol (UI_ICON in
// icons.ts). `enter` is a place with no kind of its own
export type TownAct = 'talk' | 'party' | 'shop' | 'tavern' | 'enter' | 'quest' | 'soon';
const PLACE_ACT: Partial<Record<PlaceId, TownAct>> = { guild: 'party', shop: 'shop', tavern: 'tavern', gate: 'quest' };
export type TownTarget = { act: TownAct } & ({ unit: UnitState } | { place: Place });

const doorTarget = (place: Place): TownTarget => ({
  act: place.soon ? 'soon' : (PLACE_ACT[place.id] ?? 'enter'),
  place,
});

// Fluid movement (Nov 16, Fernando's grill; the only walk since Nov 18, with no option and no key). The walker is a
// circle that slides along walls and people; its unit keeps the square snapped under it (`cellUnder`), so every cell
// rule here (route, clear, near, castParty) goes on reading a whole cell
// The circle's radius, in cells. Above √½ the snapped square never overlaps a wall or anyone (the fuzz walk in
// tests/town.test.ts holds it); below 1 it passes the 2-cell lanes with room to slide
export const BODY = 0.8;
export const TALK = 3; // centre to centre: side by side with a cell between (REACH on the mesh) or corner to corner
const AHEAD = 0.5; // cos 60°: how wide "in front" is to each side
const DOOR = 1.25; // from the doorstep's middle, per axis: over its tile (atDoor on the mesh) and a quarter cell of slack
export const STICK_DEAD = 0.25; // the stick's rest noise; padActions' 0.5 is for a cursor that steps, too deaf for a walk

export const centreOf = (p: Pos): Pos => ({ x: p.x + SUB / 2, y: p.y + SUB / 2 });
export const cellUnder = (c: Pos): Pos => ({ x: Math.round(c.x - SUB / 2), y: Math.round(c.y - SUB / 2) });

// the left stick as a screen vector: nothing inside the dead zone, then growing from 0 to full tilt (length 1)
export function stick(x: number, y: number): Pos {
  const m = Math.hypot(x, y);
  if (!(m > STICK_DEAD)) return { x: 0, y: 0 }; // NaN from a broken pad lands here too
  const k = Math.min(1, (m - STICK_DEAD) / (1 - STICK_DEAD)) / m;
  return { x: x * k, y: y * k };
}

// a screen vector (x right, y down) on the ground under the camera's yaw (the same axes as keyboard.ts gridStep)
export const groundDir = (v: Pos, yaw: number): Pos => ({
  x: v.x * Math.cos(yaw) + v.y * Math.sin(yaw),
  y: v.y * Math.cos(yaw) - v.x * Math.sin(yaw),
});

// The walker's centre after moving by `d`: pushed out of every cell that is not floor (lots, trees, crates, the well,
// the map's edge) and of everyone's square, which leaves the part of `d` along the wall, so it slides
export function slide(grid: Grid, state: BattleState, at: Pos, d: Pos): Pos {
  const solid = (c: Pos) => {
    if (!inBounds(grid, c) || tileAt(grid, c).terrain !== 'floor') return true;
    const u = unitAt(state, c);
    return !!u && u.id !== ME;
  };
  const hops = Math.ceil(Math.hypot(d.x, d.y) / (BODY / 2)) || 1; // short hops: a long frame never jumps a wall
  let { x, y } = at;
  for (let i = 0; i < hops; i++) {
    x += d.x / hops;
    y += d.y / hops;
    // Out of the cell it is deepest in, up to 3 times (a corner takes two). Deepest first: along a wall that is the
    // cell straight ahead, which pushes straight back; its neighbours' corners would push sideways and change the pace
    for (let pass = 0; pass < 3; pass++) {
      const x0 = Math.floor(x - BODY),
        y0 = Math.floor(y - BODY);
      let hit = { dx: 0, dy: 0, len: BODY };
      for (let cy = y0; cy <= y0 + 2; cy++)
        for (let cx = x0; cx <= x0 + 2; cx++) {
          if (!solid({ x: cx, y: cy })) continue;
          const dx = x - Math.min(Math.max(x, cx), cx + 1),
            dy = y - Math.min(Math.max(y, cy), cy + 1);
          const len = Math.hypot(dx, dy);
          // len 0 would be the centre inside a wall: never, the centre stays in its own snapped square
          if (len && len < hit.len) hit = { dx, dy, len };
        }
      if (hit.len === BODY) break;
      const nx = hit.dx / hit.len,
        ny = hit.dy / hit.len;
      x += nx * (BODY - hit.len);
      y += ny * (BODY - hit.len);
      // Dead on a corner (within about 15°) the push only undoes the hop and the walker would stand there pressing (W
      // at the start, with the smith's corner up the screen): the hop goes round it instead, to the side it leans.
      // Leaning to neither, always the same side, not the one rounding noise picks: at the start the other is the
      // dead end between the smith and his forge. Only a corner: head-on into a flat wall stops
      const along = (d.y * nx - d.x * ny) / hops; // the hop's part along the corner's tangent (-ny, nx)
      const hop = Math.hypot(d.x, d.y) / hops;
      if (pass || !hit.dx || !hit.dy || d.x * nx + d.y * ny >= 0 || Math.abs(along) >= 0.25 * hop) continue;
      const slip = (along > 1e-9 * hop ? 1 : -1) * (hop - Math.abs(along));
      x -= ny * slip;
      y += nx * slip;
    }
  }
  return { x, y };
}

// What the action button (Enter, A, a click on the balloon) acts on, measured from the walker's centre: the nearest
// within TALK inside the cone in front, else the door whose step the centre is over, else the nearest within TALK
export function freeTarget(state: BattleState, at: Pos, facing: Pos): TownTarget | null {
  const off = (u: UnitState) => ({ x: centreOf(u.pos).x - at.x, y: centreOf(u.pos).y - at.y });
  const far = (u: UnitState) => Math.hypot(off(u).x, off(u).y);
  const beside = state.units.filter((u) => u.id !== ME && far(u) <= TALK).sort((a, b) => far(a) - far(b));
  const unit = beside.find(
    (u) => off(u).x * facing.x + off(u).y * facing.y >= AHEAD * far(u) * Math.hypot(facing.x, facing.y),
  );
  if (unit) return { act: 'talk', unit };
  const place = TOWN_PLACES.find((p) => {
    const door = centreOf(cell(p.door));
    return Math.max(Math.abs(door.x - at.x), Math.abs(door.y - at.y)) <= DOOR;
  });
  if (place) return doorTarget(place);
  return beside[0] ? { act: 'talk', unit: beside[0] } : null;
}

// The debug grid (Nov 16, Fernando): off unless chosen in Options or the town menu
export const GRID_KEY = 'dt:town-grid';
export const parseTownGrid = (v: unknown) => v === true;
// its dots: every cell of the ground people walk on
export const floorCells = (grid: Grid): Pos[] =>
  grid.tiles.flatMap((t, i) => (t.terrain === 'floor' ? [{ x: i % grid.width, y: Math.floor(i / grid.width) }] : []));
// its 2x2 frames, corner cells: everyone's token and every place's doorstep
export const townSquares = (state: BattleState): Pos[] => [
  ...state.units.map((u) => u.pos),
  ...TOWN_PLACES.map((pl) => cell(pl.door)),
];

// Every stop the walker reaches one cell at a time without passing anyone (the keyboard's and the pad's step), nearest
// first, each with its way there. Clicks take these ways too, so the walker never walks through anyone (review of Nov 15).
// The battle's `reachable` with budget 1 is the same step, here without its per-call cost: this runs on every stroll
export function steps(grid: Grid, state: BattleState): { pos: Pos; path: Pos[] }[] {
  const me = state.units.find((u) => u.id === ME)!;
  const jump = jumpOf(state, me.def);
  const taken = new Set(state.units.filter((u) => u !== me).flatMap((u) => footprint(u).map(posKey)));
  const out = [{ pos: me.pos, path: [] as Pos[] }];
  const seen = new Set([posKey(me.pos)]);
  for (let i = 0; i < out.length; i++)
    for (const { to, cost } of squareMoves(grid, out[i].pos, SUB, jump, (c) => taken.has(posKey(c)))) {
      const k = posKey(to);
      if (cost > 1 || seen.has(k) || !restsOn(grid, to, SUB) || cellsOf(to, SUB).some((c) => tileAt(grid, c).noStop))
        continue;
      seen.add(k);
      out.push({ pos: to, path: [...out[i].path, to] });
    }
  return out;
}

// the walker's way to the nearest stop where `ok` holds (empty when it stands on one already); null when none
export const route = (grid: Grid, state: BattleState, ok: (p: Pos) => boolean) =>
  steps(grid, state).find((s) => ok(s.pos))?.path ?? null;

// The walker reaches every door and gets close enough to talk to everyone, one cell at a time
export function open(grid: Grid, state: BattleState): boolean {
  const stops = steps(grid, state).map((s) => cellsOf(s.pos, SUB));
  const reaches = (cells: Pos[], within: number) => stops.some((c) => gap(c, cells) <= within);
  return (
    TOWN_PLACES.every((pl) => reaches(cellsOf(cell(pl.door), SUB), 0)) &&
    state.units.every((u) => u.id === ME || reaches(footprint(u), REACH))
  );
}

// Where a townsperson may stand: on nobody, off every doorstep, and leaving every door and everyone open to the walker
// (review of Nov 15: a townsperson stopped in a doorway, or waited for the walker in the one corridor east, and locked the
// Tavern away from the keyboard)
export function clear(grid: Grid, state: BattleState, id: string, p: Pos): boolean {
  const u = state.units.find((x) => x.id === id)!;
  const cells = cellsOf(p, SUB);
  const other = (c: Pos) => {
    const o = unitAt(state, c);
    return !!o && o !== u;
  };
  if (cells.some(other)) return false;
  if (TOWN_PLACES.some((pl) => gap(cells, cellsOf(cell(pl.door), SUB)) <= 1)) return false;
  const at = u.pos;
  u.pos = p;
  const ok = open(grid, state);
  u.pos = at;
  return ok;
}

// A townsperson's way to a random spot within STROLL cells of home and out of the walker's reach (beside the walker they
// wait to be talked to), every cell of it clear; empty to stay. `rnd`: Math.random in the game, seeded in the tests
export function strollPath(grid: Grid, state: BattleState, id: string, home: Pos, rnd: () => number): Pos[] {
  const me = state.units.find((u) => u.id === ME)!;
  const stops = [...reachable(grid, state, id, STROLL).values()].filter(
    (s) => dist(s.pos, home) <= STROLL && !near(s.pos, me),
  );
  // ponytail: 5 tries bound the cost (each cell checked walks the whole town); a townsperson boxed in stays home
  for (let i = 0; i < 5 && stops.length; i++) {
    const [s] = stops.splice(Math.floor(rnd() * stops.length), 1);
    if (s.path!.every((p) => clear(grid, state, id, p))) return s.path!;
  }
  return [];
}
