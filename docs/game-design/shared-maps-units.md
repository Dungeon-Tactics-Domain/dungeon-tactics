# Shared: maps, units and half tiles

The map and unit rules of `src/shared/battle`, moved out of `src/shared/CLAUDE.md` (the rules of code stay there): what each one does, the request behind it and its date. The map drawings (`dressBeaconHill`, `CRYPT_KEY`, the `*_H` and `*_RAMPS` drawings) live in `src/content/maps/`. Decisions with their dates are also in [docs/decisions.md](../decisions.md). Battle rules: [shared-battle-rules.md](shared-battle-rules.md); the dungeon crawl: [shared-crawl.md](shared-crawl.md).

## Tile looks

- **Per-tile look on the game maps** (Nov 12): `Tile.look` is only for drawing. Beacon Hill gets its own in `dressBeaconHill` (snow on the enemy side, rock on the hill, gold at the Beacon); the Flooded Crypt (`flooded_crypt`) is written with one letter per tile (`CRYPT_KEY`); since Nov 13 the Hill has a valley, a peak-5 hill and an enemy plateau at 3.
- New map: state the terrain, height and `look` of each tile and register the floor name in `LOOK_NAME` (`src/client/tile-info.ts`) and the pieces in `LOOK` (`src/client/scene/board-looks.ts`).

## Ramps

- **Ramps on the game maps** (Nov 13, Fernando's request: "it's not Minecraft"): `Tile.ramp` is still drawing only (the rules don't read it; jump, range and sight follow `standH`), except where a half-tile token may stop (`restsOn`, below).
- Each game map carries an ASCII ramp drawing (`BEACON_RAMPS`, `WOOD_RAMPS`, `PASS_RAMPS`, `CRYPT_RAMPS`, `HEART_RAMPS`, applied by `withRamps` in `grid.ts`, which fails on a drawing of the wrong size), hand-picked on the passages and slopes with a step of 1; in the crypts the drawing is a staircase.
- `tests/scenario-maps.test.ts` guarantees every ramp is ground without water and rises exactly 1 level to a neighboring ground tile.

## Maps and units of the old campaign

The Beacon Ashes campaign that used these maps and units was removed on Nov 15; the maps stay in the developer menu (`DEV_MAPS` in `src/client/dev-roster.ts`: beacon_hill, skirmish, flooded_crypt, crypt_heart, ash_wood, frost_pass) and the tests.

- **Crypt Heart** (`crypt_heart`, night of Nov 12, stage 4): 12x14 with the `CRYPT_KEY` letters (plus `W`, deep water) and per-tile height in `HEART_H` since Nov 13, the boss on an altar behind a deep moat that can only be crossed by 2 bridges; it has a Beacon.
- **Ash Wood** (`ash_wood`, night of Nov 12): deep river with a bridge and a ford in a valley; since Nov 13 the height of each tile comes from `WOOD_H`, 5 levels, enemy plateau with drops of 2 on the descents. No Beacon (last one standing wins).
- **Frost Pass** (`frost_pass`, night of Nov 12): climb in steps of 1 up to the summit; since Nov 13 zigzagging, with the height of each tile in `PASS_H`. No Beacon.
- **Skeleton Minion** (`minion`, night of Nov 12): fragile and fast. **Shadow Wave** (`shadow_wave`): radius 2, charge 6, the boss spell.
- **Veil Acolyte** (`acolyte`, night of Nov 12): an enemy that heals (Fireball + Heal), so a fight asks for target priority; it uses the mage model with `UnitDef.tint` (violet emissive glow, drawing only, copied into the `dev-roster` sheets; the material color multiplied the texture and did not show on the dark model). Measured then in Frost Pass in place of the Shadow Mage: 51% → 39% (in place of the Minion it dropped to 8%). Frost Pass spawns the Dark Mage again today; the Acolyte now appears in the crawl's depth-3 groups (`src/content/crawl/rooms.ts`).

## Large unit

- **Large unit** (night of Nov 12): `UnitDef.size` (2 = 2x2, `pos` is the top-left tile). Every "who is on the tile" question goes through `unitAt`/`footprint` (`pathing.ts`); range, sight, area and hit chance measure from the nearest tile (`nearestTile`, `closest`).
- **A unit smaller than a tile** (Nov 20, Fernando: "um monstro 1x1"): `UnitDef.halfSize` is its square on the split map in half tiles, in place of `size` doubled (`halfDef` in `half.ts`). The mini skeleton (`mini_skeleton`, the minion's model) has `halfSize: 1`: one half tile, its model as tall as a whole-tile unit's (`unitHeight` follows the square), the cursor framing its one cell.
- **A long body** (Nov 20, Fernando: "um 1x2 q seria uma cobra"): `UnitDef.halfLength` is how many squares the body runs behind its head, opposite its facing; `pos` is the head. `bodyOf` in `pathing.ts` returns the cells, `footprint` and `unitAt` count them all, so blocking, areas, aim and shots meet the tail. A stop (`reachable`) or a turn (`Battle.face`) that puts a cell off the map, on ground nobody stands on, on a body or on another unit is not allowed (`bodyFits`); the tail on the way is not checked yet. The snake (`snake`, 100 life) is the first: one half tile wide, one tile long. It is not in any crawl room yet, and its model comes from the client's model map.
- A large unit does not walk (move 0) and is not pushed. For units that occupy 1 tile nothing changes (measured: Hill identical).
- Today only the Bone Colossus (`colossus`): outside the developer menu, it is the crawl's boss (with one minion).

## Half tiles

- **Every game battle in half tiles** (Nov 14, Fernando: "the half-tile movement mechanic still doesn't exist", looking at stage 0): the client opens every battle through `halve` (`half.ts`; Nov 15, Fernando: no whole-tile battle left, the developer battle included).
- The map is split into cells (each tile becomes 2x2, `Grid.sub` = 2, the object drawn once by `Tile.span`), each unit a 2x2 token `<def>½` (size and move doubled, `baseDef`/`isObjective` read the original) that walks 1 cell at a time (`reachableBig`: deep water, a straddle across a step up to the jump, the gap).
- **A token stops only on even ground** (`restsOn`, Nov 14, Fernando: "it must not let the character stand still on a corner like that"): the square's 4 cells share height, water depth, spikes and terrain, and a ramp cell is under it only on its own whole tile; it still walks over steps, ledges and ramps on the way. Every whole-tile stop stays a stop.
- **Abilities stay written in whole tiles:** `farCells`/`nearCells` turn range and radius into cells between the two squares, `aimEnds` measures range from the closest cells of the shooter's square and the aimed tile's (one of the Colossus' four, not its whole square), a shot runs between the middles of the shooter's and the aimed whole tiles (`sightEnds`, `traceShot`, see [shared-battle-rules.md](shared-battle-rules.md#shots)), any cell aims at its whole tile (`aimTile`: the map's tile on empty ground, Nov 14 review), `areaOf` centers an area on the whole square of whoever stands there, `wholeTiles` gives the hit chance its distance, and the push moves `push x sub` cells checking the whole square.
- **A push also ends only on even ground** (`restsOn`, Nov 15, Fernando: "it tie-breaks by making the guy fall, or hit a wall"): a square left half over a drop goes 1 more cell and falls onto the lower tile (the usual fall damage); a level square kept from resting only by a ramp, spikes or other terrain goes 1 more cell when that one rests, with no bump (Fernando, after the Nov 15 review: 633 of 24,840 pushes went back with a bump); otherwise (a step up, a unit or wall in the way) it goes back to where it last rested and takes the bump (`tests/half-tiles.test.ts` pushes 1 to 3 tiles in 4 directions from every stop of every spawn on every map).
- The sandbox refuses to place a token where it would not rest (`placementProblems` in `src/client/dev/sandbox-spec.ts`).
- On whole-tile positions every answer equals the whole map's (`tests/half-tiles.test.ts`: ranges, targets, hit chance and side for every ability, the shots of every sighted ability on every game map, walking from every spawn of every map, push). The AI counts its per-tile weights back in tiles. Whole maps (tests, simulator) are unchanged.
- Jump on half tiles: [shared-battle-rules.md](shared-battle-rules.md#jump-by-class).

## FFT study (removed)

- `battle/fft/` held a Final Fantasy Tactics reference study (Nov 11 to Nov 16): the Gariland battle and a basic-classes bench on the same map, with FFT formulas sourced in [fft-reference.md](fft-reference.md). Removed on Nov 16 with the map (`docs/decisions.md`). Its `rules.ts` hooks with no other user went with it (see the decision row); `outcome` and `jump` stay in use.
