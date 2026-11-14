# Dungeon Tactics — guide for AI agents and developers

A turn-based tactics game for the browser, with the pacing and layout of Final Fantasy Tactics and Tactics Ogre, KayKit characters and a story campaign. Nothing is copied from the originals: art, music, text and rules are our own. Live at https://dungeon-tactics.fernandorffdev.com.

One developer (Fernando) works on it with AI agents. `AGENTS.md` points here. Each main folder (`src/shared`, `src/client`, `scripts`, `tests`) has its own `CLAUDE.md` with the patterns of that area: read the one for the folder you touch.

## Code map

```
src/shared/battle/  battle rules, no DOM or Three.js
  grid.ts           ASCII map with height, terrain, water depth, ramps, corpses
  pathing.ts        movement (per-class jump, leaps, 2x2 movers), line of sight, range with height bonus, shot path
  combat.ts         hit chance by facing, damage, push, wall and fall damage, counters, forecast
  turn-queue.ts     FFT-style CT queue with charged actions
  battle.ts         Battle: owns the state, limited undo (dice never roll back), validated save/load
  ai.ts             greedy one-turn AI; simulate.ts plays AI against AI
  units.ts, abilities.ts, equipment.ts, scenarios.ts   data
  half.ts           half-tile test mode (?cenario=meia); fft/ is a reference study, not the game
src/client/         browser: main.ts (game loop and screens), scene.ts (Three.js), hud.ts, world-ui.ts (map, towns, party),
                    group.ts (party), campaign.ts, terrain.ts, trees.ts, water.ts, input in keyboard/gamepad/touch-input
scripts/            battle-sim.ts (optional simulator), assets/ (texture and model generators)
tests/              Vitest: rules and pure client functions
docs/               design spec, pillars, party and towns design, FFT/Tactics Ogre references, design system, assets index
assets/             source packs (KayKit, sounds); not shipped
```

## Commands

```bash
npm ci
npm run dev                       # http://localhost:5173 (the "dungeon-tactics" launch config uses port 5181)
npm run typecheck                 # client, tests and scripts
npx vitest run                    # tests
npx vite build                    # production build in dist/
npx wrangler deploy               # publish dist/ to https://dungeon-tactics.fernandorffdev.com
npm run sim -- beacon_hill 1000   # optional: AI vs AI win rate per seed
```

## Workflow

- **Straight to `master`.** No feature branches or pull requests while the project is solo. Every commit passes the gates (`npm run typecheck`, `npx vitest run`, `npx vite build`); new tests and browser checks are the agent's call.
- **Commits** follow [Conventional Commits in English](CONTRIBUTING.md#commit-convention): `type(scope): summary` (≤ 72 chars, imperative), atomic, the *why* in the body, no merge commits, no `Co-Authored-By` or tool signatures.
- **Publish after each block** with `npx wrangler deploy` and check that the served `index-*.js` matches `dist/assets`. There is one environment only; the deploy workflow runs manually.
- **Parallel agent sessions** (3D models, design system) work on their own branch; the main session brings their commits onto `master` with rebase or cherry-pick.
- **Process skills:** `superpowers:systematic-debugging` before fixing a bug and `superpowers:verification-before-completion` before calling work done. Brainstorming, written plans and TDD only for large tasks.
- **Balance is decided by playing.** The simulator is an optional tool, not a gate.
- **PC first.** Mobile comes later; keep the existing media queries and touch input working.
- **Browser automation** launches Chrome with `--mute-audio`; on localhost the game starts with music at 0 and never plays it under automation unless the URL has `?musica=1`.

## Code rules

- **Everything in English:** comments, docs, `CLAUDE.md` files and commits. Player-facing text stays bilingual through `t('português', 'English')` from `src/client/i18n.ts`; names come from `unitName` and `abilityName`.
- **Comments explain why**, in one short line, wherever the code alone does not: chosen numbers and timings, call order that matters, browser workarounds, the request behind a behaviour. Do not narrate what the line does. When a decision changes, change its comment.
- **Imports at the top of the file.** No inline type imports.
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
