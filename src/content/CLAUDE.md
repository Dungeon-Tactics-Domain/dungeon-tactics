# src/content — game content as data

Applies together with the root `CLAUDE.md`. Decision of Nov 14 (Fernando, cleanup grill): content is kept apart from the rules so the labs change data, not the engine.

## What lives here

| File             | Content                                                                                                                                                                      | Type and registry (where the logic lives)                                                                                                   |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `units.ts`       | classes and enemies (`UNIT_LIST`)                                                                                                                                            | `UnitDef`, `UNIT_DEFS` in `src/shared/battle/units.ts`                                                                                      |
| `abilities.ts`   | abilities (`ABILITY_LIST`) and the `A()` builder with the defaults                                                                                                           | `AbilityDef`, `ABILITIES` in `src/shared/battle/abilities.ts`                                                                               |
| `items.ts`       | equipment (`ITEM_LIST`)                                                                                                                                                      | `ItemDef`, `ITEMS`, `bonusOf` in `src/shared/battle/equipment.ts`                                                                           |
| `maps/<map>.ts`  | one map per file: terrain, heights, ramps, looks, spawns                                                                                                                     | `Scenario`, `MAPS`, `SCENARIOS` in `src/shared/battle/scenarios.ts`; `parseGrid`, `withRamps` in `grid.ts`                                  |
| `party.ts`       | the 4 story members and the recruit names in order                                                                                                                           | `Member`, `Group` and the party rules in `src/client/group.ts`                                                                              |
| `crawl/rooms.ts` | dungeon crawl: party, enemy groups by depth, the boss group, room themes and the expedition's floors and heals (`CRAWL_RUN`)                                                 | `RoomGroup`, `CrawlTheme`, `generateRoom` in `src/shared/crawl/generate.ts`; `expeditionMap`, `winRoom` in `src/shared/crawl/expedition.ts` |
| `crawl/town.ts`  | the walkable town (`TOWN`, its name and 14x14 map), its places with their doors (`TOWN_PLACES`), the start, the Guild's spots for the party, the townsfolk and their rumours | `Scenario` in `src/shared/battle/scenarios.ts`; the rules in `src/client/town-map.ts`, the walking in `src/client/game/town.ts`             |

## Rules

- **Typed TypeScript, not JSON:** the types catch a wrong field at compile time.
- **Imports:** only types (always `import type`, a statement of its own: Node strips types and `scripts/` uses `verbatimModuleSyntax`) and pure helpers from modules that do not import content (`parseGrid`, `withRamps` from `grid.ts`). A helper called while a content module loads must not live in the file that imports that content: the import cycle leaves it undefined. That is why `A()` lives in `abilities.ts` here.
- **Order is data:** the registries keep the list order, and the AI and the turn order read it. Append; do not reorder without measuring.
- **Ids are references:** maps, crawl groups and the party point to units, abilities, items and towns by id. Renaming an id breaks saves (`dt:*`) and every reference.
- **A number change is balance:** commit it as `balance(...)` and note what was measured (`npm run sim`) in the comment beside it.

## How to add

- **Class or enemy:** an entry in `units.ts`. Outside this folder: its model in `MODEL` (`src/client/markers.ts`), a portrait (`scripts/portraits.mjs`), and `JOBS` (`src/client/group.ts`) if the party can take it.
- **Ability:** `A({...})` in `abilities.ts` and its id in a unit's `abilities`. Outside: gesture and effect in `LOOKS` (`src/client/fx.ts`).
- **Item:** an entry in `items.ts`; the shop lists every item.
- **Map:** a new file in `maps/`, added to `MAPS` in `scenarios.ts` (the order is the registry order). Outside: a new tile `look` needs its pieces in `LOOK` (`src/client/scene/board.ts`) and its name in `LOOK_NAME` (`src/client/hud.ts`); a mood in `KIND` (`src/client/ambience.ts`); `DEV_MAPS` (`src/client/dev-roster.ts`) to offer it in the developer menu.
- **Expedition numbers:** `CRAWL_RUN` (floors, rows, rooms per row, heals in %); a change gives other maps for the same seed, so an expedition in progress may break: bump `CRAWL_VERSION`, which drops the saved one.
- **Town place or townsperson:** an entry in `TOWN_PLACES` (its letter on the map, a 3x3 lot of `#` around it, a `door` tile of open ground) or `TOWNSFOLK` (a class with a painted face, rumours in both languages). Outside: a new place look in `LOOK` (`src/client/scene/board.ts`) and `PAINT` (`src/client/terrain.ts`), and what it opens in `enter` (`src/client/game/town.ts`). Guild spots and homes stay off the streets to the doors: `tests/town.test.ts` walks the whole party and strolling townsfolk and checks that every door and everyone stays within the keyboard's single steps.
- **Crawl group or theme:** an entry in `CRAWL_GROUPS` (1 to 3 existing enemies, 320 to 510 life in all, the Mechanics lab's range of 64 to 102 times the x5 of Nov 15) or `CRAWL_THEMES` (floor looks by height, obstacle tiles, the tiles that close the border, an optional road look and optional spikes; every look must be in `PAINT` (`src/client/terrain.ts`) so the room draws on the smooth painted terrain, `tests/crawl-room.test.ts` checks it) in `crawl/rooms.ts`. A change that gives other rooms for the same seed bumps `CRAWL_VERSION` and the pinned hash and tries in `tests/crawl-room.test.ts`; a theme's mood goes in `ROOM_KIND` (`src/client/ambience.ts`).

## Tests that guard it

- `tests/content.test.ts`: unique ids, every reference exists, every tile has a known terrain and a whole height.
- `tests/scenario-maps.test.ts`: full grid, free spawns, ramps that rise 1 level.
- `tests/crawl-expedition.test.ts`: the map's shape and seed, the heals, the guard and `parseExpedition`.
- `tests/crawl-room.test.ts`: 500 seeds pass the room checks and the first 25 are pinned to `CRAWL_VERSION`; `tests/content.test.ts` checks the crawl tables (life range, known enemies and terrains).
- `tests/town.test.ts`: the town draws on the painted terrain, every door and everyone stays within the keyboard's single steps with the whole party in and the townsfolk strolling, and every townsperson has a painted face.
- `tests/group.test.ts`: the default party is the 4 story members with the whole kit of their class and their equipment.
