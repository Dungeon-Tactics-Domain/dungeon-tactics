# Dungeon Tactics, 1ª fatia — plano de implementação

> Para quem executa: use superpowers:executing-plans. Passos com checkbox.

**Goal:** a primeira batalha jogável (4 heróis contra 4 inimigos, proteger um alvo) no celular, com motor de regras testado e simulado.

**Architecture:** `src/shared/battle/` é lógica pura. `BattleState` é só dado (JSON-friendly, inclui o estado do sorteio); funções puras (`grid`, `pathing`, `combat`, `turn-queue`, `ai`) operam sobre ele; uma única classe, `Battle`, é o agregado com ciclo de vida (estado + desfazer + salvar). O cliente (`src/client/`) tem uma classe por recurso com ciclo de vida (`BattleScene` dona do WebGL, `BattleHud` dona do DOM do HUD, `TouchInput` dona dos ouvintes) e uma máquina de interação pura e testável (`interaction.ts`).

**Tech Stack:** TypeScript estrito, Vite, Three.js 0.186 (câmera ortográfica + `RenderPixelatedPass`), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-25-dungeon-tactics-design.md` · pilares: `docs/game-design/PILARES.md`.

## Global Constraints

- Celular primeiro: tela 393x852, alvo de toque ≥ 44 px, sem hover obrigatório.
- Sorteio só por `rng.ts` com semente; estado da batalha serializável e clonável (`structuredClone`).
- Desfazer NÃO repete o sorteio; limite inicial 3 por batalha (`UNDO_LIMIT`, a medir).
- Todo texto visível em `t('pt','en')`; imports no topo; comentários curtos em português explicando o porquê.
- Efeito de habilidade sai de stats gerais (alcance, dano, empurrão, atraso); nenhuma regra "X faz Y com Z".
- Sem commit, sem push, nada apagado (quarentena em `D:\_PARA-APAGAR\dungeon-tactics-warlock-2026-10-25`).
- Números iniciais (velocidade, atraso, dano, acerto) marcados como "inicial, 25/10": a decidir jogando e simulando.

## Review Focus

- Desfazer depois de um ataque sorteia o PRÓXIMO valor, não o mesmo (teste `undo-keeps-rng`).
- Save corrompido/torto não derruba o jogo: `parseBattleState` devolve `null` (teste com JSON torto).
- Empurrão contra parede, unidade, borda ou degrau alto para sem sair do lugar e causa dano de batida.
- Unidade morta some da fila e não bloqueia casa; morte do alvo protegido encerra a batalha como derrota.
- Batalha IA contra IA sempre termina (teto de turnos) em todas as sementes.

## File structure

| Arquivo | Responsabilidade |
|---|---|
| `src/shared/battle/rng.ts` | `nextRng(s): [valor, s']`, `rollInt`, mulberry32 sem closure (salvável) |
| `src/shared/battle/types.ts` | `Pos`, `Team`, `UnitState`, `BattleState`, `BattleEvent`, `Cmd` |
| `src/shared/battle/grid.ts` | `Grid` (altura, terreno), `parseGrid(ascii)` |
| `src/shared/battle/abilities.ts` | `AbilityDef` e tabela de habilidades (dados) |
| `src/shared/battle/units.ts` | `UnitDef` (estatísticas, habilidades) dos 4 heróis e 4 inimigos |
| `src/shared/battle/pathing.ts` | `reachable`, `pathTo`, `lineOfSight`, `inAbilityRange` |
| `src/shared/battle/combat.ts` | `previewAbility`, `resolveAbility`, empurrão e queda |
| `src/shared/battle/turn-queue.ts` | `advanceToNextActor`, `previewOrder`, `endTurnCost` |
| `src/shared/battle/ai.ts` | `chooseTurn(state, unitId)` |
| `src/shared/battle/battle.ts` | classe `Battle` (agregado), `parseBattleState` |
| `src/shared/battle/scenarios.ts` | mapa e unidades da 1ª batalha |
| `scripts/battle-sim.ts` | simulação IA×IA em várias sementes |
| `src/client/*` | cena, toque, HUD, interação (marco 2) |

## Marco 1 — motor (cada tarefa: teste que falha, código mínimo, teste verde)

### Task 1: rng com estado salvável
- Test `tests/battle-rng.test.ts`: mesma semente → mesma sequência; `nextRng` não muda o argumento; estado salvo continua a sequência.
- Produz: `nextRng(state:number): [number, number]`, `rollInt(state, min, max): [number, number]`.

### Task 2: grade e terreno
- Test `tests/battle-grid.test.ts`: `parseGrid` lê terreno `.`/`T`/`#` e alturas; rejeita linhas de largura diferente e símbolo desconhecido; `neighbors` 4 direções dentro dos limites.
- Produz: `Grid { width, height, tile(p) }`, `parseGrid(terrain: string[], heights: string[]): Grid`.

### Task 3: caminhos e linha de visão
- Test `tests/battle-pathing.test.ts`: salto máximo 1; parede e inimigo bloqueiam; passa por aliado mas não para nele; custo = passos; alcance +1 por nível acima; floresta/parede entre dois bloqueiam visão, altura revela.
- Produz: `reachable(state, unitId): Map<string, number>`, `pathTo`, `lineOfSight(grid, a, b)`, `rangeMax(grid, ability, from, to)`.

### Task 4: combate
- Test `tests/battle-combat.test.ts`: chance cai com a distância, sobe com altura, cai com cobertura (floresta), nunca fora de 5–95; dano varia entre mínimo e máximo; empurrão para em parede/unidade/borda com dano de batida; queda de ≥ 2 níveis causa dano; morte remove a unidade.
- Produz: `previewAbility(state, actorId, abilityId, target): Preview`, `resolveAbility(state, actorId, abilityId, target, rng): BattleEvent[]`.

### Task 5: fila de turnos estilo FFT
- Test `tests/battle-turn-queue.test.ts`: mais veloz age primeiro e mais vezes; habilidade forte atrasa o próximo turno; `previewOrder` não muda o estado; morto sai; alvo protegido (sem velocidade) nunca age.
- Produz: `startNextTurn(state): void`, `previewOrder(state, n): string[]`, `finishTurn(state, usedAbility?)`.

### Task 6: Battle (agregado), desfazer, salvar
- Test `tests/battle-battle.test.ts`: `undo-keeps-rng`; mover é desfeito de graça, ataque custa 1; limite de desfazer; clone independente; `save`/`load` ida e volta igual; `parseBattleState` rejeita JSON torto; hash de uma batalha com semente.
- Produz: `class Battle { state; move(to); act(abilityId, target); endTurn(); undo(); restart(); save(): string; static load(json): Battle | null }`.

### Task 7: IA e simulação
- Test `tests/battle-sim.test.ts`: IA contra IA em ≥ 10 sementes termina abaixo do teto de turnos; relatório com turnos médios e vitórias dos heróis.
- Produz: `chooseTurn`, `scripts/battle-sim.ts`.

## Marco 2 — cliente mobile e quarentena

### Task 8: quarentena do Warlock
- Mover (nunca apagar) código, testes e scripts do Warlock para `D:\_PARA-APAGAR\dungeon-tactics-warlock-2026-10-25`; consertar `package.json`, `vite.config.ts`, `tests/setup.ts`, `index.html`; gates verdes.

### Task 9: máquina de interação
- Test `tests/battle-interaction.test.ts`: toque no herói seleciona; toque numa casa alcançável mostra caminho; Confirmar executa; toque fora cancela; ataque mostra % antes de confirmar.

### Task 10: cena, entrada de toque, HUD
- `battle-scene.ts`, `touch-input.ts`, `battle-hud.ts`, `main.ts`, `style.css`. Verificação no navegador a 393x852.

## Marco 3 — 1ª batalha jogável
- `units.ts`/`scenarios.ts` completos (mapa 20x20, 4 heróis, 4 inimigos, IA que escolhe a melhor jogada), simulação ajustada.
