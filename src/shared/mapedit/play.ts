// Play on a builder map (spec: Play opens a battle on the map): the document as a whole-tile scenario the client
// halves like every battle (half.ts halve). The map builder's Play passes one default hero in a corner (Fernando,
// Nov 25; placing it is the client's job) and the debug panel creates the rest.
import { SCENARIOS, type Scenario, type Spawn } from '../battle/scenarios.ts';
import { type BattleDoc, spawnsOf } from './battle.ts';
import { type MapDoc, PLAY_PREFIX } from './doc.ts';

export { PLAY_PREFIX } from './doc.ts';

// The map as a scenario with the given spawns, registered like the crawl rooms under its own id
export function docToScenario(doc: MapDoc, spawns: Spawn[] = []): Scenario {
  const scenario: Scenario = {
    id: PLAY_PREFIX + doc.id,
    name: doc.name,
    en: doc.en,
    grid: { width: doc.width, height: doc.height, tiles: doc.tiles.map((t) => ({ ...t })) },
    spawns: spawns.map((s) => ({ ...s })),
  };
  SCENARIOS[scenario.id] = scenario;
  return scenario;
}

// A battle document as a scenario, and each unit's own life by spawn id. The life stays data for the client: a sheet
// with it is made where the class's model and face are known (dev-roster.ts buildDevScenario)
export function battleToScenario(doc: BattleDoc): { scenario: Scenario; life: Record<string, number> } {
  const life = Object.fromEntries(doc.units.flatMap((u) => (u.hp === undefined ? [] : [[u.id, u.hp]])));
  return { scenario: docToScenario(doc.map, spawnsOf(doc)), life };
}
