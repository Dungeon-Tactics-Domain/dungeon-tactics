# tests — Vitest

Applies together with the root `CLAUDE.md`.

- One file per subject (`battle-combat.test.ts`, `interaction.test.ts`); `describe` and `it` in English.
- Content checks (ids unique, every reference exists) go in `tests/content.test.ts`.
- Battle shortcuts in `tests/battle-helpers.ts` (`flat`, `gridOf`, `stateOf`, `HIT_SEED`, `MISS_SEED`).
- `tests/setup.ts` pins the language to Portuguese. Do not import `scene.ts`, `scene/`, `main.ts`, `entry.ts` or `game/` (Three and DOM); test the pure function.
- Logic bug: the new test must fail without the fix.
