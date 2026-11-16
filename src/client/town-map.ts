// The walkable town's rules (Nov 15, Fernando's grill), pure and tested: the halved map from src/content/crawl/town.ts,
// who stands where (the party, the townsfolk), which place a tile belongs to and where its door is, and where the walker
// can go (the battle's own `reachable`). The scene and the input live in game/town.ts.
import { GUILD_SPOTS, type Place, TOWN, TOWN_PLACES, TOWN_START } from '../content/crawl/town.ts';
import { dist, type Grid, posKey, tileAt } from '../shared/battle/grid.ts';
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
    turn: { actor: ME, moved: false, usedAbility: null },
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
