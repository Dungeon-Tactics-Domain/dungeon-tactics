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
  game/             what opens around the battle: boot (URL to scenario), town (the walkable town), crawl (the town menu and
                    gate, the expedition map and its rooms),
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

Product and process decisions by Fernando are in [docs/decisions.md](docs/decisions.md) (date, decision, why), the newest at the bottom. A new decision goes there in the same commit as the change. Read it when you need the reason behind a rule or a number; do not load it for every task.
