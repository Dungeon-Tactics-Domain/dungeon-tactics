// The walkable town's rules (Nov 15, Fernando's grill), pure and tested: the halved map from src/content/crawl/town.ts,
// who stands where (the party, the townsfolk), which place a tile belongs to and where its door is, and where the walker
// can go (the battle's own `reachable`). The scene and the input live in game/town.ts.
import { GUILD_SPOTS, type Place, TOWN, TOWN_PLACES, TOWN_START } from '../content/crawl/town.ts';
import { tileAt } from '../shared/battle/grid.ts';
import { halfDef, halve, SUB } from '../shared/battle/half.ts';
import { cellsOf, gap, reachable, type Step, unitAt } from '../shared/battle/pathing.ts';
import { SCENARIOS, type Scenario } from '../shared/battle/scenarios.ts';
import type { BattleState, Pos } from '../shared/battle/types.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';
import type { Group } from './group.ts';

export const ME = 'me'; // the walker's unit id: the first of the party who goes to battle
export const memberUnit = (memberId: string) => `p-${memberId}`; // the rest of the party, at the Guild
export const REACH = 2; // cells between two squares to talk: side by side or corner to corner

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

// the cheapest stop of `unitId` where `ok` holds and its path (empty when it stands there already); null when none
export function route(grid: Scenario['grid'], state: BattleState, unitId: string, ok: (p: Pos) => boolean) {
  const me = state.units.find((u) => u.id === unitId)!;
  if (ok(me.pos)) return [];
  let best: Step | null = null;
  for (const s of reachable(grid, state, unitId, grid.width * grid.height).values())
    if (ok(s.pos) && (!best || s.cost < best.cost)) best = s;
  return best?.path ?? null;
}
