# Client: town, expedition, crawl rooms and saves

How the dungeon loop is wired in the browser, moved out of `src/client/CLAUDE.md` (the rules of code stay there). Rules of the crawl itself live in `src/shared/crawl`; decisions with their dates are also in [docs/decisions.md](../decisions.md).

## Town and expedition

Nov 15, Fernando: the game opens in the town, no world map; the expedition is the F2 of the dungeon loop. Code in `game/crawl.ts`.

- **Ways in:** the title's New game (a new save slot, see Save slots) and Continue (only with a saved game: the list of them; a loaded game with a room in play reopens it, see below) lead to the town (Fernando, Nov 15). Every way home goes through `?home` (`goHome`), which boots the walkable town and then `homeScreen` over it.
- **Quest rows:** the gate (`questGate`) and the town menu (`townMenu`) share them (`questRows`). With an expedition in progress (`liveExpedition`: `dt:crawl` saved and its boss still up) "Continue the expedition" (floor N of 3) comes first and opens its map, and "Go on the quest" asks a 2nd tap, since it abandons that one.
- **Town menu rows:** Shop (`openShop`), Tavern (`openBar`, recruits only), Party (`openParty`, every ability) and Title screen (the bare address); the windows are in `town-ui.ts`.
- **Into the expedition:** the quest takes the town's deployed party (class, name, equipment; max life = the battle sheet's) into `startExpedition`.
- **Expedition map** (`expeditionScreen`): the floor in play as rows of rooms with each group's enemies (`roomGroup`), the floor's chest on a line of its own after the first row (the one room that leads to it says so on its button: two rooms of a row often share a group), the party's life and the gold found on this descent, and Back to town (2nd tap: the descent ends and its gold goes to town).
- **Gold** (Fernando's gold grill, Nov 15 and 16): it comes only from the drops of a won room's enemies (`CRAWL_GOLD`) and the chests, rolled from the node's seed (`nodeGold`), so a Restart cannot roll it again; the gold found is read back from the path (`descentGold`). A chest opens by walking to it, with no battle (`takeChest`, a window with its gold). When the descent ends `endExpedition` adds it to the town's (`dt:chest`) and clears the save in one step: all of it with the boss down, on Back to town or a new quest over it; half, rounded down, when the party falls or leaves a room (`goldHome`). A map drawn in another tab acts on the save as it is now (`retreat`, `takeChest`): the same expedition (seed) still live, else nothing, so a stale window never pays twice, brings back an ended expedition or undoes a step taken elsewhere. The town menu shows the town's gold on its head band; a new game starts with 0.
- **A room** opens by `?room=<node>`. `selectBattle` refuses a room that is not open (cleared, off the path, typed) and goes home; otherwise it builds the room from the node's seed, depth and boss through `generateRoom`, and `castRoom` puts the party on its hero spawns as dev-roster sheets (`buildDevScenario` under the room's id, so the mood still reads the theme). `newBattle(scenario, room)` sets each hero's carried life, Restart included. Save key `dt:battle:expedition`; the room is saved from its first frame (`main.ts` boot).
- **End of a room:** `settleRoom` writes the expedition before any window (`winRoom`, or the save cleared and its gold banked on a defeat or the last boss; a room that is no longer open, ended in another tab, is ignored) and `finishRoom` shows the result (the room's gold, the descent's and, when it ended, what went to town; the victory's yellow title on a win; "Floor N cleared!" when the room leads down): back to the map through `?home=expedition` (the only address that opens the map), or to the town.
- **Restart and leaving** (Fernando, Nov 15): Restart is a free retry with the life the party entered with. Leaving the room before it ends loses the expedition: Options → Leave the room (2nd tap) or `?home` goes home, where `leftRoom` finds the room still saved, clears both saves and says so; `?room=` of another room while one is saved goes home the same way. It takes half the gold found home, like a fall. `?room=` of a chest node goes home too: a chest has no battle.
- **Closing the tab is not leaving:** loading the game from the title's Continue finds the room still saved (`savedRoom`, by `roomId`) and reopens it at `?room=<node>`; a room in play travels with its save slot.
- **One meaning for Continue per screen:** the title's lists the saved games and the one loaded resumes (the room in play, else the town); the town's opens the expedition map. Options and the end-of-battle window name the way home with `homeLabel` (always Town).

## Walkable town

Nov 15, Fernando's grill: a 3D town in Ash Wood's painted style instead of a menu over the backdrop battle. Code in `game/town.ts`, rules in `town-map.ts`, map and people in `src/content/crawl/town.ts`.

- `?home` (`main.ts` boot) opens `bootTown`, which draws the halved town map with `BattleScene` (the `forest` mood; the houses are `house` looks in `scene/board-looks.ts`, KayKit Medieval Hexagon models over a 3x3 lot, picked as their centre tile) and no unit markers (`hideMarkers`).
- **Walking:** the first deployed member walks it (`ME`), one half tile per step at the battle's walking pace (`Units.glide`, `rest`): W A S D and arrows held (`keyAction`, `gridStep`), the gamepad's d-pad and stick (`padActions`; with a window open, `padDialog` in `dialog.ts`, shared with `Game.pollPad`), or a click (`TouchInput`: on the ground it walks there, on a house to its door, on someone beside them, and turns to what was clicked). `route` takes the nearest stop by the same single steps as the keys (`steps`), never through anyone, and is worked out again at every cell.
- **Acting** (Nov 16, Fernando: nothing opens by walking or clicking): only the action button acts, Enter, A or a click on the action balloon, on the target `townTarget` picks (`town-map.ts`, pure and tested: whoever stands in front, else the door the walker is at, else whoever is beside), worked out again at every step of the walker or a townsperson.
- **Action balloon** (`.town-act`, a `.panel` button in the town's `.hud`): shows the target's kind (`TownAct`: talk, party, shop, tavern, enter, quest, soon) as its `UI_ICON` symbol with the Enter hint, over the person's head (`screenOf`) or on the building's middle (`BattleScene.screenAt`). `poll` only moves it every frame; its content changes with the target; it hides with nothing in reach or a window open.
- **Debug grid** (Nov 16, Fernando; off by default, `dt:town-grid`, `parseTownGrid`): Town grid in Options → Video and effects and at the foot of the town menu (`townGridChoice` in `game/options.ts`, passed into `townMenu`, since the town has no Options). A faint dot on every floor cell (`floorCells`) and a 2x2 `frame` mark under everyone and every doorstep (`townSquares`), drawn by `Marks.setDebugGrid` and refreshed every frame.
- **Places** (`TOWN_PLACES`): the Guild opens Party, the Shop, the Tavern, the dungeon gate (`questGate`), and the Blacksmith and Enchanter a coming-soon window (equipment and gold are another session's work, Nov 15).
- **The party** stands by the Guild (`castParty` on `GUILD_SPOTS`, off the street to its door, refreshed when a window closes, so a recruit, a class change or a new leader shows at once); talking to one greets and opens their sheet (`openSheet`).
- **Townsfolk:** four (`TOWNSFOLK`) stroll near home and tell their rumours in turn through `talk()` with their painted faces (cosmetic, so `Math.random` there, outside the battle rules). They stand still while the walker is beside them, and every cell they step on must be `clear` (review of Nov 15: on nobody, off every doorstep, and leaving every door and everyone within the walker's single steps), checked when the stroll is chosen (`strollPath`) and again before each step.
- Esc, H, Start, the right button or the corner button open the town menu. Nothing new is saved: everyone starts at the same place on every visit.

## Town menu as the lab kit's command menu

Nov 15, the Design lab's approved mockups.

- The town menu (Esc over the walkable town) is a 440 px command menu in the top right corner (`commandRow`, an orb per row). Shop, Tavern and Party (and the Sheet) open beside it while it stays on screen with the open row picked; another row swaps the window. So only the topmost window takes Esc (`dialog.ts`) and the gamepad (`padDialog`), and a `close` event closes a window from outside without its `onBack`.
- The title (`titleScreen`) takes the same command menu look under the 96 px name, its key hint alone at the foot of the screen.
- Shop and Tavern use the kit's list rows (`priceRow`) with the gold counter on the head band; the Shop shows one tab at a time (`choice`): Gear (only the common pieces, Nov 16), Consumables (listed, Buy off until a battle can use them) and Sell (half the price); Gear scrolls a little at 1280x720 (design system, Debts).

## Party, recruiting and class change

Nov 13, delivery 5 of [towns-party-equipment.md](towns-party-equipment.md).

- Pure rules in `group.ts` (`dt:party`): the 4 from the story never leave; recruits join through the town's Tavern (`RECRUIT_COST`, cap `GROUP_MAX` 8) and are dismissed on the sheet; anyone switches among the classes of `JOBS` (the 4 starting ones and the Lancer since Nov 13, with the barbarian's character until it gets its own); up to 4 go to battle (`deployed`).
- `heroesFor` builds who fights, with the whole kit of the class and the equipment kept by member id. Screens in `town-ui.ts` (`openParty`, `openSheet`, `openGear`, `openBar`).

## Equipment in 7 slots

Nov 16, slice 3 of the Nov 15 grill; the rule is `withGear` in `src/shared/battle/equipment.ts` ([shared-battle-rules.md](shared-battle-rules.md)).

- `dt:equip` keeps each member's loadout and `dt:chest` the gold and the loose pieces (`chest.ts`); `parseEquip` rebuilds both field by field and puts each known piece in a slot of its kind, its saved slot first, so a save from the 3-slot days (weapon, armor, accessory) keeps every piece; a member called `__proto__` is dropped. New game (`newGame` in `saves.ts`) writes the story members' weapons (`STARTING_WEAPON` in `src/content/party.ts`) with the chest at 0 gold; a game without the key (one from before, a broken save) gets none, so no load hands them out again (review of Nov 16). The chest keeps `CHEST_MAX` (99) loose pieces, as `parseChest` reads them: buying, taking a piece off and dismissing a recruit stop there, each with the reason on screen.
- The Sheet shows the totals the battle counts with their origin (`sheetRows`), what each slot holds and the abilities, one tab at a time; Change equipment opens the Equipment window (`openGear`: the 7 slots, the chest's pieces of the open slot's kind with what each changes, `compare`). Both read the sheet as the battle does (`withGear`, the caps of `resistOf` and `dodgeOf`); past a cap they also say the raw sum and, for physical and magic resistance, what a charging unit keeps, since the charging drop comes off the raw sum (combat.ts; whether the cap should come before the drop is Fernando's call, the rule is unchanged).

## Standalone crawl rooms

Nov 15, Fernando: a new mode; rules in `src/shared/crawl`.

- `?crawl=SEED` (plus `depth=N`, `boss=1`, `theme=dungeon|forest|mountain`) makes `selectBattle` build the room from the seed, register it whole and halve it like any battle.
- The mood reads the theme at the end of the room's id (`ROOM_KIND` in `ambience-moods.ts`). The dungeon theme is the `cave` mood, the crypt's dark and embers without its walls, so every room draws on the smooth painted terrain like Ash Wood (Fernando's request of Nov 15); a lone blocking rock is the `boulder` look, the painted rock of `props.ts`.
- The save key is `dt:battle:crawl`; a save of another room id (another seed or `CRAWL_VERSION`) starts the room over.
- A seed whose 200 layouts all fail (none of the 500 tested) gives way to the next one; if that fails too, an alert says so and the page goes back home (`tests/crawl-boot.test.ts`; expedition rooms share this fallback).
- The survival goal banner follows the battle in play (`isSurvival(scenario.id)`), so `?crawl` with `?scenario=survival` opens the room without it.
- A standalone `?crawl=` room has no party: the 4 base classes (`CRAWL_PARTY`) with their whole kit. Expedition rooms take the town's party instead (`castRoom`, above).

## Save slots

Nov 15, Fernando: "save games so New game does not erase the progress".

- The game reads and writes its progress keys as before; a slot is a copy of them (`PROGRESS_KEYS` plus `dt:played`) in the `dt:saves` manifest (`saves.ts`, pure and tested; `parseManifest` is the trust boundary).
- The active slot's truth is the live keys: `readSaves` writes them into it, and live progress with no slot (the single save from before, a town reached by `?home`) becomes a new slot.
- New game, load and delete check every write in the browser itself (`store.saved`, not the tab's memory) and stop at a refused one (full storage): the manifest goes first, with no slot in play while the live keys change, so a refused key puts the game in play back and never leaves a slot holding a mix of two games; deleting the slot in play clears the live keys.
- Slot ids are safe integers, a new slot takes the first free one, and a stored manifest the parse cannot give back whole is copied to `dt:saves:bad` before it is replaced. `store.set` stamps `dt:played` on every progress write.
- The window is `game/saves-ui.ts` (Continue's list, the latest played first; Delete asks a 2nd tap).
