# scripts

Vale junto com o `CLAUDE.md` da raiz.

- `battle-sim.ts`: IA contra IA em N sementes (`npm run sim -- <cenário> <sementes>`). Base de toda mudança de número.
- `smoke.mjs`: teste de fumaça do site estático (página, bundle, ícones, um modelo); roda no deploy e no ambiente do PR.
- `assets/`, `portraits.mjs`, `slim-character.mjs`, `lib/browser.mjs`: ferramentas de asset herdadas do Warlock (sprite de ícones, índice KayKit, retratos, corte de animações, Chrome sem janela).
- Rodam direto no Node, que só remove tipos: nada de `enum` nem propriedade de parâmetro no construtor.
