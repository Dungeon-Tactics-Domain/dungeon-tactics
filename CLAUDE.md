# Dungeon Tactics — guide for AI agents and developers

A turn-based tactics game for the browser, with the pacing and layout of Final Fantasy Tactics and Tactics Ogre, and KayKit characters. Since Nov 15 the game is a Darkest Dungeon-style loop (town, descent, camp, return); the story campaign "Beacon Ashes" and its world map were removed on Nov 15. Nothing is copied from the originals: art, music, text and rules are our own. Live at https://dungeon-tactics.fernandorffdev.com.

One developer (Fernando) works on it with AI agents. `AGENTS.md` points here. Each main folder (`src/shared`, `src/content`, `src/client`, `scripts`, `tests`) has its own `CLAUDE.md` with the patterns of that area: read the one for the folder you touch.

## Code map

```
src/shared/battle/  battle rules, no DOM or Three.js
  grid.ts           tiles with height, terrain, water depth, ramps, corpses; parseGrid and withRamps build the maps
  pathing.ts        movement (per-class jump, leaps, 2x2 movers), line of sight, range with height bonus, shot path
  combat.ts         hit chance by facing, damage, push, wall and fall damage, counters, forecast
  turn-queue.ts     FFT-style CT queue with charged actions
  battle.ts         Battle: owns the state, limited undo (dice never roll back), validated save/load
  ai.ts             greedy one-turn AI; simulate.ts plays AI against AI
  units.ts, abilities.ts, equipment.ts, scenarios.ts   types and registries (UNIT_DEFS, ABILITIES, ITEMS, SCENARIOS)
  half.ts           half tiles: every battle the client opens is split on load (halve), the FFT study included, plus the ?scenario=half test map; fft/ is a reference study, not the game
src/shared/crawl/   dungeon crawl: generate.ts (seeded room from the tables), verify.ts (checks it on the halved map) and
                    expedition.ts (floors of rooms from a seed, the life carried between rooms, the dt:crawl save)
src/content/        game content as typed data: units, abilities, items, maps/ (one file per map), party (story members,
                    recruit names), faces.json (dialogue face sheets), crawl/ (room tables, the town, the expedition)
src/client/         browser: main.ts (Game: turn loop, wiring and boot), scene.ts (Three.js renderer and the scene's public API), hud.ts, town-ui.ts (party, tavern, shop),
                    group.ts (party rules), talk.ts (dialogue box and faces), terrain.ts, trees.ts, water.ts, input in keyboard/gamepad/touch-input
  game/             what opens around the battle: boot (URL to scenario), crawl (the town, the expedition map and its rooms),
                    title (new game, continue, quick battle, how to play, developer, credits), options, end screens
  scene/            the parts BattleScene composes: board, marks (tile marks, cursor), units, camera, space (tile to world), timeline
  dev/              localhost-only sandbox: battles staged from a scene spec, scripted through window.__sandbox (docs/sandbox.md)
scripts/            battle-sim.ts (optional simulator), crawl-sheet.ts (crawl room screenshots), assets/ (texture and model generators)
tests/              Vitest: rules and pure client functions
docs/               game-design/README.md (index and what each lab touches), design spec, pillars, party and towns design, FFT/Tactics Ogre references, design system, assets index
assets/             source packs (KayKit, sounds); not shipped
```

## Commands

```bash
npm ci
npm run dev                       # http://localhost:5173 (the "dungeon-tactics" launch config uses port 5181)
npm run lint                      # biome: lint and formatting check (npm run format fixes)
npm run typecheck                 # client, tests and scripts
npx vitest run                    # tests
npm run coverage                  # tests with a coverage summary; lcov report in coverage/
npx vite build                    # production build in dist/
npm run smoke                     # headless Chrome opens the built title, the town, the expedition map and a room, and battles
npx wrangler deploy               # publish dist/ to https://dungeon-tactics.fernandorffdev.com
npm run sim -- beacon_hill 1000   # optional: AI vs AI win rate per seed
npm run sandbox -- scripts/sandbox --sheet   # screenshots from scene specs: map, units, camera, hidden HUD (docs/sandbox.md)
npm run sandbox -- scripts/sandbox/clips --video --out clips   # gameplay clips (WebM + MP4) of the scripted steps
node scripts/crawl-sheet.ts <out>   # screenshots of 12 crawl rooms with the verifier's verdict; play one at /?crawl=SEED&depth=N
```

## Workflow

- **Straight to `master`.** No feature branches or pull requests while the project is solo. Every commit passes the gates (`npm run lint`, `npm run typecheck`, `npx vitest run`, `npx vite build`; `npm run format` fixes lint and formatting); new tests and browser checks are the agent's call.
- **Commits** follow [Conventional Commits in English](CONTRIBUTING.md#commit-convention): `type(scope): summary` (≤ 72 chars, imperative), atomic, the *why* in the body, no merge commits, no `Co-Authored-By` or tool signatures.
- **Publish after each block** with `npx wrangler deploy` and check that the served `index-*.js` matches `dist/assets`. There is one environment only; the deploy workflow runs manually.
- **Parallel agent sessions** (3D models, design system) work on their own branch; the main session brings their commits onto `master` with rebase or cherry-pick.
- **Process skills:** `superpowers:systematic-debugging` before fixing a bug and `superpowers:verification-before-completion` before calling work done. Brainstorming, written plans and TDD only for large tasks.
- **Balance is decided by playing.** The simulator is an optional tool, not a gate.
- **PC first.** Mobile comes later; keep the existing media queries and touch input working.
- **Browser automation** launches Chrome with `--mute-audio`; on localhost the game starts with music at 0 and never plays it under automation unless the URL has `?music=1`.

## Code rules

- **Everything in English:** comments, docs, `CLAUDE.md` files and commits. Player-facing text stays bilingual through `t('português', 'English')` from `src/client/i18n.ts`; names come from `unitName` and `abilityName`.
- **Comments explain why**, in one short line, wherever the code alone does not: chosen numbers and timings, call order that matters, browser workarounds, the request behind a behaviour. Do not narrate what the line does. When a decision changes, change its comment.
- **Imports at the top of the file.** No inline type imports.
- **Content is data in `src/content`** (Nov 14): classes, abilities, items, maps, stages, lines, towns and quests. Labs change content first; the engine changes only when a new mechanic needs it. The engine (`src/shared`) never imports `src/client`.
- **Abilities and items are data with general stats** (range, damage, area, push, charge, bonuses) that apply the same against everything. No rule of the kind "ability X does Y against Z".
- **Determinism:** the rules never call `Math.random`; randomness goes through `rng.ts` with its state inside `BattleState`, in a fixed order (hit, then damage, per target).
- **Trust boundaries:** anything read from the browser (`dt:*` saves) is rebuilt field by field by its `parse*` function, which returns a safe default on any doubt.
- **Interface:** the [design system](docs/game-design/design-system.md) is the source of truth. Use its components (`dialog()`, `choice()`, `slider()`, `el()`, `iconButton()`, the HUD panels) and the `:root` tokens for colour and size. A new component goes next to the others and into the design system document.
- **Less code wins:** reuse what exists, no abstraction for a single use, no configuration nobody asked for, surgical changes without reformatting neighbours.
- **Assets** need a licence that allows use and redistribution, a line in `public/CREDITS.txt` and an entry in [`docs/ASSETS.md`](docs/ASSETS.md) in the same commit. Check `assets/kaykit/` before looking elsewhere.

## Decision log

Product and process decisions by Fernando. A new decision goes here (date, decision, why) in the same commit as the change.

| Date | Decision | Why |
|---|---|---|
| 25/10 | New game on the Warlock Wars engine and tooling: turn-based tactics in the browser, rules in `src/shared` without DOM | reuse a proven Vite + Three.js + TypeScript setup |
| 11/11 | Final Fantasy Tactics as the reference for rules and interface, studied with sources; nothing copied | the target feel is "the next FFT" |
| 12/11 | FFT turn rules on every map: CT queue, turn cost 100/80/60, charged actions | readable turn order and slow strong actions |
| 12/11 | Water on every map: shallow and deep; deep is enterable but you cannot act inside (13/11) | terrain that changes routes |
| 12/11 | Campaign "Beacon Ashes": 7 stages in 2 acts, a created protagonist, world map with towns | a story-driven single-player game |
| 12/11 | Interface rebuilt in the FFT style: command menu beside the unit, parchment panels, turn list | familiar to tactics players |
| 13/11 | Per-class jump and FFT leaps; facing matters for hit chance; counters at half damage | positioning decides fights |
| 13/11 | Move, act, then keep moving with what is left; undo the move unless it took damage | fewer movement constraints, more strategy |
| 13/11 | Water costs 1 movement like ground; allies can be passed through; no zone of control | fewer movement constraints |
| 13/11 | Shots stop at the first unit or obstacle in their path; attacking an empty tile is allowed; the forecast marks the hit with an X | Tactics Ogre-style trajectory |
| 13/11 | End-of-stage stars removed; every victory gives 150 gold | no puzzle-style scoring |
| 13/11 | Smooth painted terrain, procedural trees and props, wave-field water, action camera, 8 camera angles, plain 3D by default (pixel art optional) | a painted look closer to FFT than to blocks |
| 13/11 | Party with recruits (tavern, 200 gold, up to 8) and class changes; the lancer is the first new class | FFT-style party management |
| 13/11 | One environment only (dungeon-tactics.fernandorffdev.com), updated after every block | test on a single link |
| 13/11 | Portfolio project: Conventional Commits in English, atomic, history rewritten into feature series; everything in English | the history and code are read by recruiters |
| 13/11 | Single developer: straight to `master`; only the CI and manual deploy workflows remain; no PR bots or templates | no contributors, nothing for them to run on |
| 13/11 | Balance by playing; the simulator is optional | focus on implementing mechanics |
| 13/11 | Gates are the only mandatory check before `master`; the design system rules the interface | lean process for one developer |
| 14/11 | Code under the MIT licence (assets keep theirs); README, architecture overview and media for the portfolio; repository public at the end of the cleanup | the project is a portfolio piece |
| 14/11 | Game content lives in `src/content` as typed data; labs change content first, the engine only for a new mechanic | the narrative and mechanics labs tune data without touching the rules |
| 14/11 | A half-tile token stops only on even ground (same height, water, spikes and terrain; on a ramp only over its own tile); it still walks over steps | a hero was left hovering on a ledge corner in stage 0 |
| 14/11 | Every game battle in half tiles: units are 2x2 tokens that step 1 half-tile at a time; abilities keep their whole-tile numbers | Fernando's request ("the half-tile movement mechanic still doesn't exist"); the maps stay written in whole tiles and are split on load |
| 15/11 | A push never ends on uneven ground: a token left half over a drop falls onto the lower tile; a level token kept from resting only by a ramp, spikes or other terrain goes 1 more cell when that one rests; otherwise it goes back to where it last rested and takes the bump. The sandbox refuses a token placed where it would not rest | Fernando: "it tie-breaks by making the guy fall, or hit a wall"; after the review (633 of 24,840 pushes went back with a bump on flat ground) he chose the extra cell |
| 15/11 | Jump counts in half tiles like the move: a token with jump J flies a gap of up to J cells, 1 movement point per cell; climbing and dropping stay in height levels. Our own reading on top, kept by Fernando the same day: the gap lands level, wholly past it | Fernando: "the move and jump values double; 1 per half tile". The level landing: a 1-cell hop landed half inside a trench (Flooded Crypt) |
| 15/11 | No whole-tile battle left in the game: the client halves every battle, the developer battle on the Gariland map and the FFT study included (the study's rules read each sheet through `baseDef`; jump 3 flies 3 cells). Whole-map rules stay for tests and the simulator | Fernando: remove the whole-tile mode; the half-tile mode is the real game, the study included |
| 15/11 | Every screen shows Move and Jump in half tiles (sheet value x `SUB`): the battle Status, party list and sheet, item stats, hero creation, developer menu and How to play (Lancer Jump 6, Rogue and Minion 4, the rest 2; Jump 4 or more clears 1 tile). The sheets keep whole-tile values | Fernando: "everything in half tiles"; every screen must show the number the game spends |
| 15/11 | Swappable interface themes: a theme is a block of `:root[data-theme]` tokens chosen in Options (`dt:theme`). FFT Classic (blue panels, light text, Alegreya Sans hosted in `public/fonts`) is the default and only theme; the parchment look was removed | Fernando's request: FFT Classic as the first theme, more themes later; "pode retirar" about the parchment |
| 15/11 | New dungeon loop mode, separate from Beacon Ashes, with procedural rooms: `?crawl=SEED&depth=N&boss=1&theme=NAME` opens a room made from the seed (8x8, a 10x10 boss room with the Colossus; the dungeon, forest or mountain look), checked on the halved map before play; the numbers are the Mechanics lab's descent proposal | Fernando, in the dungeon loop grill of Nov 15: a short-fight mode that does not touch the campaign; Beacon Ashes stays frozen |
| 15/11 | Crawl rooms: an enemy may hit a hero on its first turn (a ranged one that sees and reaches someone at the start); the room checks keep only the 5 to 7 tile contact distance | Fernando, after the review of the first crawl rooms: enemies may act on turn 1 |
| 15/11 | Ability icons: the 32 px pixel-art set from the design lab (`public/ui/fft/atlas-32.png`), shown at 1:1 and crisp; game-icons symbol as the fallback; AI-generated, licence to be confirmed before launch | Fernando approved the set in the lab (FFT theme plan, block 2) |
| 15/11 | Dialogue box with the painted faces from the design lab (`public/chars/px`, AI-generated, licence to confirm before launch): 128 px lossless WebP resampled from the 256 px masters, the mouth goes talk1, talk2, talk1, neutral every 180 ms while the text types; the other expressions wait for later | FFT theme plan, block 3: talking faces like FFT's dialogue; Fernando chose the final 8-expression set |
| 15/11 | Charge rules: (A) a unit may start a charge and still walk; starting it costs half the movement left, rounded up (5 half tiles left keeps 2), melee charges too; move, act, keep moving stays. (B) after aiming at a unit the player locks the charge on the character (it follows) or on the tile (whoever stands there), saved with the battle. (C) the shot is traced when it fires, from where the caster stands then, and stops at the first unit or obstacle. (D) friendly fire with no exceptions: any hit on the caster's own side deals half, aimed or collateral; heals land on enemies at half; a heal on an undead (skeleton archer, minion, colossus) deals half its amount as damage; the same for enemies. (E) every charge keeps a line on screen, and while the charging unit picks where to walk the line from there shows where it stops and whom it hits, orange on an ally. (F) the AI uses the same rules, scores own-side hits at half and walks out of queued charges' line of fire | Fernando's decisions of Nov 15: charges that read like FFT and Tactics Ogre, where positioning around a slow shot matters |
| 15/11 | Counters owed into the attacker's next turn: a unit struck by a direct attack it can answer the same way (melee vs melee, ranged vs ranged) strikes back at half on every move of its attacker during that turn and the attacker's next one, once per move; melee when the attacker leaves its reach, hit before it leaves; ranged at the tile the attacker stops on (before: the tile it left), so cover or a unit in the way takes the shot; the AI prices it. Aiming shows who would counter (a ranged line or a melee arrow), and the move preview shows what each destination draws | Fernando's request of Nov 15: an opportunity-style counter, readable before acting and before walking |
| 15/11 | Only a single-target strike counters for now: a unit whose basic attack hits an area (radius above 0, the Colossus' Shadow Wave) never strikes back, nor gets the counter mark; read from the ability's area stat, not a list of units. A unit struck by an area attack still counters if its own basic attack is single-target | Fernando's decision of Nov 15: area strikes and area bosses do not counter-attack for now |
| 15/11 | New loop, no campaign: town (fixed; only the party grows) → descent in floors of short rooms (5 to 8 hero turns) plus a boss → camp → return, Darkest Dungeon style; pure FFT combat; a fallen hero returns wounded at 25% health, no permadeath for now. Current focus is the dungeon only (room generator, then the expedition). The Beacon Ashes campaign is frozen as the old mode, still in the code. Source of the 43 decisions: `_notas/LOOP-DUNGEON-CRAWLER-AUDIO.md` | Fernando's grill of Nov 15 (audio describing a Darkest Dungeon-style dungeon crawler with a town hub): descents in the current combat engine, with the bag, camp and party choices between fights |
| 15/11 | The aim mark of skills and attacks is one half-tile cell; on a unit it becomes that unit's whole body (a token's 2x2, the Colossus' 4x4), and the cursor frames the same; areas keep their marks. Display only: the rules still aim at the whole tile | Fernando: the preview covered a full 2x2 on empty ground; in half tiles the aimed cell is one cell, and selecting a target selects the whole body under it |
| 15/11 | Painted faces in battle: the unit panels and turn list show the dialogue sheets at 64/48 px with expressions (shout on a strike, hurt on damage, angry on a counter or a big hit, smile after a kill and on victory, wounded under 30% of life); the Warrior shows the barbarian's face; the small skeletons stay still | Fernando's request: the FFT-style faces of the dialogue box in the battle interface |
| 15/11 | The game opens in the town, no world map: Shop, Tavern (rumors and recruits, without the campaign's quests) and Party are the existing windows, "Go on the quest" starts the expedition, and the expedition's end returns there. Beacon Ashes stays in the code, reached through "Other modes" (the old title) | Fernando's decision of Nov 15, sent to the F2 work: the town is the hub of the dungeon loop |
| 15/11 | The expedition (F2): 3 floors, each 2 rows of 2 to 3 rooms with their enemies shown, and one boss room after the last floor (the Colossus and one minion); the town's deployed party goes in with its classes and equipment and carries its life: +25% after a won room for whoever stood, a fallen hero back at 25% without it, +50% to everyone on going down a floor, never above the max, rounded up; a defeat ends it. Saved as `dt:crawl` (seed, rooms cleared, life) | decisions 21, 27, 34, 41 and 43 of `_notas/LOOP-DUNGEON-CRAWLER-AUDIO.md`; one boss at the end, not one per floor, and the Colossus with one minion: Fernando's answer of Nov 15 to the F2 review (the boss room bumps `CRAWL_VERSION` to `crawl2`) |
| 15/11 | In an expedition room, Restart is a free retry with the life the party entered with; leaving the room before it ends (Options → Leave the room, another room, the bare address) loses the expedition like a defeat. A result from a room that is no longer open (another tab) is ignored | Fernando's answer of Nov 15 to the F2 review |
| 15/11 | Map sizes are counted in half tiles. Crawl rooms grow to the size of Ash Wood: 24x24 half tiles, 28x28 for the boss. Each enemy still starts 10 to 14 half tiles from the nearest hero (the Colossus 16 to 20). The heroes start in a band of 4 half tiles with room behind them, there are 0 to 6 spikes, and the boss has 1 minion instead of 2 | Fernando: rooms "about the size of Ash Wood"; the Mechanics lab (descida.json) keeps the contact distance so a room stays at 5 to 8 hero turns, and the extra room is for flanking |
| 15/11 | Crawl rooms drawn like Ash Wood: every theme on the smooth painted terrain with painted trees and props. The border is closed in places (trees, rock walls), a road crosses the room, and lone rocks are painted boulders. The dungeon theme is a cave (stone floor, stone-hill walls, the dark of the crypt without its block walls) | Fernando: the rooms looked crude, drawn as KayKit blocks, next to Ash Wood |
| 15/11 | World map and Beacon Ashes campaign removed from the code; the game opens in the town: the title's New game (erases the party, chest, equipment and expedition saves) and Continue lead there, and every way home (`?home`) returns to it or to the expedition map. The town's Tavern only recruits; the protagonist creation went with the campaign, so a new game starts with the 4 story members | Fernando, Nov 15: "retire o lance do mapa mundial do código, não quero mais ver isso" |
| 15/11 | Closing the tab in the middle of a room is not leaving it: the title's Continue reopens the room in play ("Dungeon room"); leaving through Options (Leave the room) or the address (`?home`, another `?room=`) still loses the expedition. Only valid saves show Continue, and the campaign's saves are dropped on load | review of the world map removal: Continue named the expedition map and then lost the expedition |
| 15/11 | The turn list shows every unit of the battle in compact rows (36 px face), from the one acting now until each unit and each queued charge has shown once; a charge row has the caster's face, the ability icon and "resolves in N" ticks; the column scrolls (wheel, PgUp/PgDn, right stick; the bumpers already turn the camera) and a new turn scrolls back to NOW; the short list of 4 and its L key are gone | Fernando: the window showed only 4 rows; it must show all units, scrolling, with rows packed tighter |
| 15/11 | Home (`?home`) is always the town, even with an expedition in progress: the town shows "Continue the expedition" (floor N of 3), which opens its map, and a new quest over it asks a 2nd tap because it abandons it. The title's Continue keeps its meaning: the room in play when one is saved, else the town. A room's result window goes back to the map by `?home=expedition`; the way home is labelled Town | Fernando's decision on the expedition flow: the town is the hub the player always returns to; one meaning for Continue per screen
| 15/11 | The turn list shows two rounds, the current one and the next, each row with a small round mark (1 or 2). While aiming (Act map and "Execute?") it is a copy of the queue where the one acting pays the turn cost of acting (100 after moving, 80 without) and a charged ability's row sits where it fires; cancelling brings back the usual list. Effects on the target (death, push) are not simulated yet | Fernando: see where the chosen action puts the unit and who plays in the next round |
| 15/11 | Save slots: New game starts a new saved game and never erases another; Continue lists every saved game (leader's face, who goes, town or expedition floor, gold, last played), the latest first, to load one or delete it (2nd tap). A slot holds the progress keys (`dt:party`, `dt:chest`, `dt:equip`, `dt:crawl`, `dt:battle:expedition`, `dt:played`); settings and the standalone battles' saves stay global. The single save from before becomes slot 1 | Fernando: "coloque save games para o new game não apagar o progresso" |
