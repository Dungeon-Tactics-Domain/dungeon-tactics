// Play on a builder map (spec: Play opens a battle on the map): the document as a whole-tile scenario the client
// halves like every battle (half.ts halve). The map builder's Play passes one default hero in a corner (Fernando,
// Nov 25; placing it is the client's job) and the debug panel creates the rest.
import { lastStanding, surviveFor } from '../battle/outcome.ts';
import type { Rules } from '../battle/rules.ts';
import { SCENARIOS, type Scenario, type Spawn } from '../battle/scenarios.ts';
import { isObjective, UNIT_DEFS } from '../battle/units.ts';
import { type BattleDoc, type Objective, spawnsOf } from './battle.ts';
import { type MapDoc, PLAY_PREFIX } from './doc.ts';
import { ownSheet, sheetOf } from './sheet.ts';

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

// what wins, as the scenario's rule; the Beacon and the default need none (outcome.ts checkOutcome)
export function objectiveRules(o: Objective | undefined): Rules | undefined {
  if (o?.kind === 'defeat_all') return { outcome: lastStanding };
  if (o?.kind === 'survive') return { outcome: surviveFor(o.turns) };
  return undefined;
}

// A battle document as a scenario: a unit with its own sheet stands as a sheet of its own (`<scenario>-<unit>`,
// registered like the Developer menu's), its starting CT, each side's bag and who plays it, and the objective's rule.
// `classes` names each own sheet's class, for what only the client knows (the model, the face, the HUD's class)
export function battleToScenario(doc: BattleDoc): { scenario: Scenario; classes: Record<string, string> } {
  const id = PLAY_PREFIX + doc.map.id;
  const classes: Record<string, string> = {};
  const spawns = spawnsOf(doc).map((s, i) => {
    const u = doc.units[i];
    if (!ownSheet(u) || isObjective(u.def)) return s; // a Beacon sheet would lose its objective id
    const sheet = `${id}-${u.id}`;
    UNIT_DEFS[sheet] = sheetOf(u, sheet);
    classes[sheet] = u.def;
    return { ...s, def: sheet };
  });
  const scenario = docToScenario(doc.map, spawns);
  const rules = objectiveRules(doc.objective);
  if (rules) scenario.rules = rules;
  if (doc.bags) scenario.bags = structuredClone(doc.bags);
  if (doc.control) scenario.control = { ...doc.control };
  return { scenario, classes };
}
