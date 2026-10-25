# tests — Vitest

Vale junto com o `CLAUDE.md` da raiz.

- Um arquivo por assunto (`battle-combat.test.ts`, `interaction.test.ts`); `describe` e `it` em português.
- Atalhos de batalha em `tests/battle-helpers.ts` (`flat`, `gridOf`, `stateOf`, `HIT_SEED`, `MISS_SEED`).
- `tests/setup.ts` fixa o idioma em português. Não importe `scene.ts` nem `main.ts` (Three e DOM); teste a função pura.
- Bug de lógica: o teste novo tem que falhar sem a correção.
