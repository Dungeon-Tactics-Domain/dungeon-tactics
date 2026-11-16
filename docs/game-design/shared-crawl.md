# Shared: dungeon crawl rooms and expedition

The rules of `src/shared/crawl`, moved out of `src/shared/CLAUDE.md` (the rules of code stay there): what each one does, the request behind it and its date. How the browser wires them: [client-town-expedition.md](client-town-expedition.md). Decisions with their dates are also in [docs/decisions.md](../decisions.md).

## Rooms

Nov 15, Fernando: the dungeon loop, with procedural rooms. Code in `crawl/generate.ts` and `crawl/verify.ts`.

- `generateRoom(seed, { depth, boss, theme })` draws a plain `Scenario` in whole tiles through `rollInt` only (24x24 half tiles like Ash Wood, 28x28 for the boss, Fernando's decision of Nov 15; written as 12x12 and 14x14 whole tiles; groups, party and themes from `src/content/crawl/rooms.ts`).
- It closes the border in places with the theme's trees or rock walls (always in the corners, so no corner is cut off), lays a look-only road, and keeps the first layout that `verifyRoom` passes (200 tries, then it throws; the 500 test seeds needed at most 11, about 75 ms a room, measured Nov 15 on `crawl3`; the test accepts up to 15).
- `verifyRoom` returns the problems in words and checks the room the way the client plays it: `halve` under a scratch id, every unit walking with jump 1 (`rules.jump`), the real `reachable`, `restsOn` and `traceShot` (each shooter's own path, curved for a bow).
- Its numbers are the Mechanics lab's descent proposal (`dungeon-tactics-labs`, `mecanicas/descida.json`): each enemy 10 to 14 half tiles from the nearest hero and the Colossus 16 to 20 (`startRange`; the extra room is for flanking), heroes in a band of 4 half tiles, water up to 15%, up to 6 spikes (the theme's `hazard`), heights 0 to 3, a high point both sides reach, 2 tiles stopping shots, no shooter seeing every hero, no spawn on the border, a ledge or beside spikes.

## Room version

- `CRAWL_VERSION` starts every room id: bump it whenever the same seed would give another room (`tests/crawl-room.test.ts` pins the first 25 test rooms and their tries by hash, so a change in pathing, half tiles, the checks or a unit's move or size breaks it too).
- History: `crawl2` when the boss group became the Colossus and one minion (Nov 15, Fernando; the pinned hash moved, the tries did not); `crawl3` when the rooms were drawn on the painted terrain like Ash Wood (Nov 15); `crawl4` with life and damage x5 (Nov 15), so an expedition saved at the old scale is dropped, not carried; `crawl5` with a chest node on every floor (Nov 16), so the same seed gives another map (the pinned tries did not move); `crawl6` with the realistic shot path (Nov 16, the trajectory grill of Nov 15), so some seeds keep another layout. Today: `crawl6` (`generate.ts`).

## Expedition

Nov 15, F2. Code in `crawl/expedition.ts`, tested in `tests/crawl-expedition.test.ts`.

- `expeditionMap(seed)` rebuilds the floors from the seed through `rollInt` (`CRAWL_RUN` in `src/content/crawl/rooms.ts`: floors of rows of 2 to 3 rooms, each linked to every room of the next row, a floor's last row to the next floor's first; one boss room after the last floor, Fernando's choice of Nov 15: one boss at the end, not one per floor).
- `openNodes` says which rooms the party may enter, `cleared` when the boss is down.
- The save (`Expedition`: `CRAWL_VERSION`, seed, rooms cleared, the party's id, max and life) is rebuilt by `parseExpedition`, `null` on any doubt (a path that is not a walk of the map included).
- `winRoom` carries the life (Fernando, decision 43, provisional until the camp): +25% of max for whoever stood, 25% for a fallen hero without the room heal, +50% to everyone after a floor's last row (going down), rounded up, never above the max; a room that is not open changes nothing.
- `roomGroup(seed, opts)` is the room's first draw (its enemy group), split out of `buildRoom` so the map shows each room's enemies before the fight.

- **Mana and stamina in the expedition** (Nov 16): stamina fills on entering each room; mana follows the life rule in `winRoom` (+25% of max for whoever stood, 25% for a fallen hero, +50% to all on going down a floor); `classMana` re-derives the mana max from the hero's current class and pieces on every read of `dt:crawl`. Details: [shared-battle-rules.md](shared-battle-rules.md).

## Gold

Nov 16, Fernando's gold grill of Nov 15 and 16; the numbers are the Mechanics lab's `equipamento.json` (gold and drops). No items yet: the chest's piece chance waits for the 7-slot equipment.

- One chest node per floor (`CrawlNode.chest`), off one drawn room of the floor's first row and leading on to the second, so taking it is one step longer; never after a floor's last row (that would trip the floor heal). `openChest` opens it: no battle, no heal; `winRoom` and the client's `?room=` refuse it.
- `nodeGold` rolls a chest's gold (`CRAWL_RUN.chest`, 80 to 150) or the drops of every enemy of a won room (`CRAWL_GOLD`; simple undead none, the Colossus 300) from the node's seed on a salted stream, so the room's layout and a free Restart never touch it.
- `descentGold` reads the descent's gold back from the path (nothing new is saved); `goldHome` is what the town gets when the descent ends: all of it alive, half rounded down after a fall.
