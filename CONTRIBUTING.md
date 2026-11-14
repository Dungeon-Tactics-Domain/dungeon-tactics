# Development guide

Dungeon Tactics is developed by one person with AI agents. This guide covers how to run the project, where things live, how commits are written and how a change reaches the live game. Code rules and the decision log are in [CLAUDE.md](CLAUDE.md).

## Getting started

Requirements: Node 24 and npm.

```bash
npm ci
npm run dev         # http://localhost:5173
npm run lint        # biome lint and formatting check
npm run typecheck   # client, tests and scripts
npx vitest run      # tests
npx vite build      # production build in dist/
```

On localhost, `?auto=1` lets the AI play the heroes, `?cenario=<id>` opens a map directly (`ash_wood`, `beacon_hill`, `meia` for half tiles) and `?mundo` opens the world map.

## Architecture

- `src/shared/battle` holds the rules: pure TypeScript without DOM or Three.js. The state is plain JSON-friendly data, so saving, undo and the AI simulator all work on the same object.
- `src/client` is the browser: `main.ts` wires the game loop and screens, `scene.ts` renders with Three.js, `hud.ts` and `world-ui.ts` build the interface from the components in `dialog.ts` and `icons.ts`.
- `tests` covers the rules and the pure client functions with Vitest.
- Each folder's `CLAUDE.md` explains the patterns and the reasoning behind that area.

## Commit convention

This is a portfolio project: the history is part of what people read. Every commit follows [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/), in English.

```
<type>(<scope>): <summary>

<body: why the change, and anything non-obvious about how>
```

- **Atomic.** One logical change per commit: it builds, passes the gates and can be reverted alone. Never mix a refactor, a fix and a feature in one commit.
- **Summary.** Imperative mood, lowercase, no final period, at most 72 characters. Details go in the body.
- **Body.** Optional for trivial changes; otherwise wrapped at 72 columns, says *why* and lists notable behaviour.
- **Types:** `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `style` (visual/CSS only), `balance` (numbers only), `build`, `ci`, `chore`.
- **Scopes:** `battle`, `ai`, `maps`, `units`, `scene`, `terrain`, `water`, `fx`, `hud`, `ui`, `input`, `camera`, `campaign`, `world`, `party`, `audio`, `assets`, `docs`, `ci`, `deps`.
- **Breaking changes** to browser saves (`dt:*`) are marked `!` (`feat(party)!: ...`) and explained in the body.
- History stays linear: no merge commits; bring other branches in with `git rebase` or `git cherry-pick`. No `Co-Authored-By` trailers or tool signatures.

```
feat(units): add lancer class with long thrust and jump
fix(input): move straight on screen when the camera is axis-aligned
refactor(party): build battle rosters from the saved group
test(battle): cover enemies blocking 2x2 movers
```

## From change to live game

1. Commit on `master`. Every commit passes `npm run lint`, `npm run typecheck`, `npx vitest run` and `npx vite build` (`npm run format` fixes lint and formatting).
2. Push. GitHub Actions runs the same checks (`.github/workflows/ci.yml`).
3. Publish with `npx wrangler deploy` and confirm that https://dungeon-tactics.fernandorffdev.com serves the new `index-*.js`. The deploy workflow can also be started by hand from GitHub Actions.

Parallel agent sessions (3D models, design system) commit on their own branch; their commits are brought onto `master` with rebase or cherry-pick.

## Assets

Only assets whose licence allows use and redistribution (KayKit, Kenney, ambientCG, Poly Haven, OpenGameArt), credited in `public/CREDITS.txt` and indexed in [docs/ASSETS.md](docs/ASSETS.md) in the same commit. The free KayKit packs live in `assets/kaykit/` (not shipped); copy what you need into `public/models/`.
