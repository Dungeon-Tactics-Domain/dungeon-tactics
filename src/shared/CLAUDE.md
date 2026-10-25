# src/shared — regras da batalha (sem DOM nem Three)

Vale junto com o `CLAUDE.md` da raiz.

- **Estado é dado puro** (`BattleState`, JSON-friendly): salvar, clonar, desfazer e simulação dependem disso. Mapa e definições ficam fora do estado (o estado guarda só o id do cenário).
- **Uma classe só, `Battle`**, porque tem ciclo de vida (estado, histórico de desfazer, salvar). O resto são funções puras e dados; composição, nunca herança (regra do Arthur).
- **Sorteio só por `rng.ts`** (`nextRng`, `rollInt`), com o estado do sorteio dentro do `BattleState`. Nunca `Math.random` aqui. Ordem dos sorteios por alvo: acerto, depois dano. O desfazer devolve tudo menos o sorteio.
- **Habilidade é dado com stats gerais** (alcance, dano, área, empurrão, atraso); nada de regra "a habilidade X contra a Y".
- **Número de unidade ou habilidade só muda depois de medido** com `npm run sim` (registre antes/depois no comentário ou no PR).
- **Fronteira de confiança:** o save vem do navegador; `Battle.load`/`parseBattleState` reconstroem só campos conhecidos e devolvem `null` em qualquer dúvida.
- Scripts rodam com o Node removendo tipos: nada de sintaxe que gera código (propriedade de parâmetro no construtor, `enum`).
