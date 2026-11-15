# Dungeon Tactics — guide for AI agents and developers

A turn-based tactics game for the browser, with the pacing and layout of Final Fantasy Tactics and Tactics Ogre, KayKit characters and a story campaign. Nothing is copied from the originals: art, music, text and rules are our own. Live at https://dungeon-tactics.fernandorffdev.com.

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
src/content/        game content as typed data: units, abilities, items, maps/ (one file per map), campaign (stages and
                    lines), world (nodes, towns, rumors), quests, party (story members, recruit names)
src/client/         browser: main.ts (Game: turn loop, wiring and boot), scene.ts (Three.js renderer and the scene's public API), hud.ts, world-ui.ts (map, towns, party),
                    group.ts (party rules), campaign.ts (stage rules), terrain.ts, trees.ts, water.ts, input in keyboard/gamepad/touch-input
  game/             what opens around the battle: boot (URL to scenario), title, options, end screens, world map flow
  scene/            the parts BattleScene composes: board, marks (tile marks, cursor), units, camera, space (tile to world), timeline
  dev/              localhost-only sandbox: battles staged from a scene spec, scripted through window.__sandbox (docs/sandbox.md)
scripts/            battle-sim.ts (optional simulator), assets/ (texture and model generators)
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
npm run smoke                     # headless Chrome opens the built title, a battle and the world map
npx wrangler deploy               # publish dist/ to https://dungeon-tactics.fernandorffdev.com
npm run sim -- beacon_hill 1000   # optional: AI vs AI win rate per seed
npm run sandbox -- scripts/sandbox --sheet   # screenshots from scene specs: map, units, camera, hidden HUD (docs/sandbox.md)
npm run sandbox -- scripts/sandbox/clips --video --out clips   # gameplay clips (WebM + MP4) of the scripted steps
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
| 15/11 | Ability icons: the 32 px pixel-art set from the design lab (`public/ui/fft/atlas-32.png`), shown at 1:1 and crisp; game-icons symbol as the fallback; AI-generated, licence to be confirmed before launch | Fernando approved the set in the lab (FFT theme plan, block 2) |
