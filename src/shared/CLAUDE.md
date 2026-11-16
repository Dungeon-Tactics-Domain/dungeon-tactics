# src/shared — battle rules (no DOM, no Three)

Applies together with the root `CLAUDE.md`.

## Rules

- **Content lives in `src/content`** (Nov 14): classes, abilities, items and maps are data there (see its `CLAUDE.md`); `units.ts`, `abilities.ts`, `equipment.ts` and `scenarios.ts` here keep the types and build the registries. Nothing here imports `src/client`.
- **State is plain data** (`BattleState`, JSON-friendly): saving, cloning, undo and simulation depend on it. The map and the definitions live outside the state (the state keeps only the scenario id).
- **A single class, `Battle`**, because it has a lifecycle (state, undo history, save). Everything else is pure functions and data; composition, never inheritance (Arthur's rule).
- **Randomness only through `rng.ts`** (`nextRng`, `rollInt`), with the RNG state inside `BattleState`. Never `Math.random` here. Order of rolls per target: hit, then damage. Undo restores everything except the RNG.
- **An ability is data with general stats** (range, damage, area, push, charge); no "ability X against Y" rules.
- **Trust boundary:** every save comes from the browser; `Battle.load`/`parseBattleState` and `parseExpedition` rebuild only known fields and return `null` on any doubt. A new state field gets its check there.
- **Scripts run with Node stripping types:** no syntax that generates code (constructor parameter properties, `enum`).
- **One reading per question**, so the rule, the preview, the forecast and the AI never disagree:
  - who is on a tile: `unitAt`/`footprint`; distances from a large unit: `nearestTile`/`closest`;
  - movement, push, save and AI over water and height: `canStand`/`stepCost`/`standH`/`isDeep` (`grid.ts`);
  - every jump: `jumpOf`; a half-tile stop: `restsOn`; a shot's path: `traceShot`;
  - counters: `pendingCounters`; the side's share of a hit or heal: `sideShare`; hit and damage: `afterDodge`/`landed`.
- **Half tiles:** abilities stay written in whole tiles; convert with `farCells`/`nearCells`/`aimTile`/`wholeTiles`, never by hand. Whole-tile maps (tests, simulator) must keep giving the same answers.
- **A rule only one scenario needs** (the survival night, crawl rooms, the developer battle) is an optional field in `rules.ts`; a game map does not use `rules`.
- **Crawl rooms:** draw only through `rollInt`; any change that gives another room for the same seed bumps `CRAWL_VERSION` and re-pins the hash in `tests/crawl-room.test.ts`.
- **A unit or ability number** is best changed after measuring with `npm run sim` (record before/after in the comment or the commit). The simulator is optional: balance is decided by playing.

## Where the detail lives

What each rule does, the request behind it and its date:

- [shared-battle-rules.md](../../docs/game-design/shared-battle-rules.md): FFT turns, water, spikes, shots, charge, attributes in the hit and the damage, equipment in 7 slots, friendly fire, counters, jump by class, AI.
- [shared-maps-units.md](../../docs/game-design/shared-maps-units.md): tile looks, ramps, the old campaign's maps and units, the large unit, half tiles.
- [shared-crawl.md](../../docs/game-design/shared-crawl.md): crawl rooms, `CRAWL_VERSION` history, expedition.
- Decisions: [docs/decisions.md](../../docs/decisions.md).
