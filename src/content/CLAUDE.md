# src/content — game content as data

Applies together with the root `CLAUDE.md`. Decision of Nov 14 (Fernando, cleanup grill): content is kept apart from the rules so the labs change data, not the engine.

## What lives here

| File            | Content                                                            | Type and registry (where the logic lives)                                                                  |
| --------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `units.ts`      | classes and enemies (`UNIT_LIST`)                                  | `UnitDef`, `UNIT_DEFS` in `src/shared/battle/units.ts`                                                     |
| `abilities.ts`  | abilities (`ABILITY_LIST`) and the `A()` builder with the defaults | `AbilityDef`, `ABILITIES` in `src/shared/battle/abilities.ts`                                              |
| `items.ts`      | equipment (`ITEM_LIST`)                                            | `ItemDef`, `ITEMS`, `bonusOf` in `src/shared/battle/equipment.ts`                                          |
| `maps/<map>.ts` | one map per file: terrain, heights, ramps, looks, spawns           | `Scenario`, `MAPS`, `SCENARIOS` in `src/shared/battle/scenarios.ts`; `parseGrid`, `withRamps` in `grid.ts` |
| `campaign.ts`   | speakers, stages (map, music, light, enemies) and their lines      | `Line`, `Chapter`, `CHAPTERS`, `chapterScenario` in `src/client/campaign.ts`                               |
| `world.ts`      | opening lines, world map nodes, towns and bar rumors               | `WorldNode` and the walking rules in `src/client/world.ts`                                                 |
| `quests.ts`     | bar quests (town, map, enemies, gold, item)                        | `Mission`, `missionScenario` in `src/client/missions.ts`                                                   |
| `party.ts`      | the 4 story members and the recruit names in order                 | `Member`, `Group` and the party rules in `src/client/group.ts`                                             |

## Rules

- **Typed TypeScript, not JSON:** the types catch a wrong field at compile time.
- **Imports:** only types (always `import type`, a statement of its own: Node strips types and `scripts/` uses `verbatimModuleSyntax`) and pure helpers from modules that do not import content (`parseGrid`, `withRamps` from `grid.ts`). A helper called while a content module loads must not live in the file that imports that content: the import cycle leaves it undefined. That is why `A()` lives in `abilities.ts` here.
- **Order is data:** the registries keep the list order, the AI and the turn order read it, and the campaign roster tests compare casts. Append; do not reorder without measuring.
- **Ids are references:** maps, stages, quests and speakers point to units, abilities, items and towns by id. Renaming an id breaks saves (`dt:*`) and every reference.
- **A number change is balance:** commit it as `balance(...)` and note what was measured (`npm run sim`, `MEASURE=300 npx vitest run tests/campaign.test.ts --silent=false`) in the comment beside it.

## How to add

- **Class or enemy:** an entry in `units.ts`. Outside this folder: its model in `MODEL` (`src/client/markers.ts`), a portrait (`scripts/portraits.mjs`), and `JOBS` (`src/client/group.ts`) if the party can take it.
- **Ability:** `A({...})` in `abilities.ts` and its id in a unit's `abilities`. Outside: gesture and effect in `LOOKS` (`src/client/fx.ts`).
- **Item:** an entry in `items.ts`; the shop lists every item.
- **Map:** a new file in `maps/`, added to `MAPS` in `scenarios.ts` (the order is the registry order). Outside: a new tile `look` needs its pieces in `LOOK` (`src/client/scene/board.ts`) and its name in `LOOK_NAME` (`src/client/hud.ts`); a mood in `KIND` (`src/client/ambience.ts`); `DEV_MAPS` (`src/client/dev-roster.ts`) to offer it in the developer menu.
- **Stage:** an entry in `STAGES` (`campaign.ts`) with a map that has 4 hero spawns, and a battle node in `WORLD` (`world.ts`) with its index. Music ids come from `TRACKS` (`src/client/music.ts`).
- **Quest:** an entry in `quests.ts` whose `town` is a node with `town`.

## Tests that guard it

- `tests/content.test.ts`: unique ids, every reference exists, every tile has a known terrain and a whole height.
- `tests/scenario-maps.test.ts`: full grid, free spawns, ramps that rise 1 level.
- `tests/campaign.test.ts`, `tests/world.test.ts`, `tests/group.test.ts`: stages build and play, lines have both languages and a speaker, every stage is on the map, the default party gives the measured casts.
