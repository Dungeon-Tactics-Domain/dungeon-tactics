# Dungeon Tactics, slice 1 — implementation plan

> For the executor: use superpowers:executing-plans. Steps with checkboxes.

**Goal:** the first playable battle (4 heroes against 4 enemies, protect a target) on a phone, with a tested and simulated rules engine.

**Architecture:** `src/shared/battle/` is pure logic. `BattleState` is just data (JSON-friendly, includes the random-roll state); pure functions (`grid`, `pathing`, `combat`, `turn-queue`, `ai`) operate on it; a single class, `Battle`, is the aggregate with a lifecycle (state + undo + save). The client (`src/client/`) has one class per resource with a lifecycle (`BattleScene` owns WebGL, `BattleHud` owns the HUD DOM, `TouchInput` owns the listeners) and a pure, testable interaction machine (`interaction.ts`).

**Tech Stack:** strict TypeScript, Vite, Three.js 0.186 (orthographic camera + `RenderPixelatedPass`), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-25-dungeon-tactics-design.md` · pillars: `docs/game-design/pillars.md`.

## Global Constraints

- Phone first: 393x852 screen, touch target ≥ 44 px, no mandatory hover.
- Randomness only through `rng.ts` with a seed; battle state serializable and cloneable (`structuredClone`).
- Undo does NOT repeat the roll; initial limit 3 per battle (`UNDO_LIMIT`, to be measured).
- All visible text in `t('pt','en')`; imports at the top; short comments in Portuguese explaining why.
- An ability's effect comes from general stats (range, damage, push, delay); no "X does Y with Z" rule.
- No commit, no push, nothing deleted (quarantine in `D:\_PARA-APAGAR\dungeon-tactics-warlock-2026-10-25`).
- Initial numbers (speed, delay, damage, hit) marked "initial, Oct 25": to be decided by playing and simulating.

## Review Focus

- Undo after an attack rolls the NEXT value, not the same one (test `undo-keeps-rng`).
- A corrupted/crooked save does not crash the game: `parseBattleState` returns `null` (test with crooked JSON).
- A push against a wall, unit, edge or high step stops without moving and causes impact damage.
- A dead unit leaves the queue and does not block a tile; the death of the protected target ends the battle as a defeat.
- AI vs AI battle always ends (turn cap) on every seed.

## File structure

| File | Responsibility |
|---|---|
| `src/shared/battle/rng.ts` | `nextRng(s): [value, s']`, `rollInt`, closure-free mulberry32 (saveable) |
| `src/shared/battle/types.ts` | `Pos`, `Team`, `UnitState`, `BattleState`, `BattleEvent`, `Cmd` |
| `src/shared/battle/grid.ts` | `Grid` (height, terrain), `parseGrid(ascii)` |
| `src/shared/battle/abilities.ts` | `AbilityDef` and ability table (data) |
| `src/shared/battle/units.ts` | `UnitDef` (stats, abilities) of the 4 heroes and 4 enemies |
| `src/shared/battle/pathing.ts` | `reachable`, `pathTo`, `lineOfSight`, `inAbilityRange` |
| `src/shared/battle/combat.ts` | `previewAbility`, `resolveAbility`, push and fall |
| `src/shared/battle/turn-queue.ts` | `advanceToNextActor`, `previewOrder`, `endTurnCost` |
| `src/shared/battle/ai.ts` | `chooseTurn(state, unitId)` |
| `src/shared/battle/battle.ts` | `Battle` class (aggregate), `parseBattleState` |
| `src/shared/battle/scenarios.ts` | map and units of the 1st battle |
| `scripts/battle-sim.ts` | AI vs AI simulation over several seeds |
| `src/client/*` | scene, touch, HUD, interaction (milestone 2) |

## Milestone 1 — engine (each task: failing test, minimal code, green test)

### Task 1: rng with saveable state
- Test `tests/battle-rng.test.ts`: same seed → same sequence; `nextRng` does not change its argument; a saved state continues the sequence.
- Produces: `nextRng(state:number): [number, number]`, `rollInt(state, min, max): [number, number]`.

### Task 2: grid and terrain
- Test `tests/battle-grid.test.ts`: `parseGrid` reads terrain `.`/`T`/`#` and heights; rejects rows of different width and unknown symbols; `neighbors` 4 directions within bounds.
- Produces: `Grid { width, height, tile(p) }`, `parseGrid(terrain: string[], heights: string[]): Grid`.

### Task 3: paths and line of sight
- Test `tests/battle-pathing.test.ts`: max jump 1; wall and enemy block; passes through an ally but does not stop on it; cost = steps; range +1 per level above; forest/wall between two block sight, height reveals.
- Produces: `reachable(state, unitId): Map<string, number>`, `pathTo`, `lineOfSight(grid, a, b)`, `rangeMax(grid, ability, from, to)`.

### Task 4: combat
- Test `tests/battle-combat.test.ts`: chance falls with distance, rises with height, falls with cover (forest), never outside 5–95; damage varies between minimum and maximum; push stops at wall/unit/edge with impact damage; a fall of ≥ 2 levels causes damage; death removes the unit.
- Produces: `previewAbility(state, actorId, abilityId, target): Preview`, `resolveAbility(state, actorId, abilityId, target, rng): BattleEvent[]`.

### Task 5: FFT-style turn queue
- Test `tests/battle-turn-queue.test.ts`: the faster unit acts first and more often; a strong ability delays the next turn; `previewOrder` does not change the state; dead leaves; protected target (no speed) never acts.
- Produces: `startNextTurn(state): void`, `previewOrder(state, n): string[]`, `finishTurn(state, usedAbility?)`.

### Task 6: Battle (aggregate), undo, save
- Test `tests/battle-battle.test.ts`: `undo-keeps-rng`; moving is undone for free, an attack costs 1; undo limit; independent clone; `save`/`load` round trip equal; `parseBattleState` rejects crooked JSON; hash of a seeded battle.
- Produces: `class Battle { state; move(to); act(abilityId, target); endTurn(); undo(); restart(); save(): string; static load(json): Battle | null }`.

### Task 7: AI and simulation
- Test `tests/battle-sim.test.ts`: AI vs AI on ≥ 10 seeds ends below the turn cap; report with average turns and hero wins.
- Produces: `chooseTurn`, `scripts/battle-sim.ts`.

## Milestone 2 — mobile client and quarantine

### Task 8: Warlock quarantine
- Move (never delete) the Warlock code, tests and scripts to `D:\_PARA-APAGAR\dungeon-tactics-warlock-2026-10-25`; fix `package.json`, `vite.config.ts`, `tests/setup.ts`, `index.html`; gates green.

### Task 9: interaction machine
- Test `tests/battle-interaction.test.ts`: tapping the hero selects; tapping a reachable tile shows the path; Confirm executes; tapping outside cancels; an attack shows the % before confirming.

### Task 10: scene, touch input, HUD
- `battle-scene.ts`, `touch-input.ts`, `battle-hud.ts`, `main.ts`, `style.css`. Verification in the browser at 393x852.

## Milestone 3 — 1st playable battle
- `units.ts`/`scenarios.ts` complete (20x20 map, 4 heroes, 4 enemies, AI that picks the best move), tuned simulation.
