# Marco 3 — 1ª batalha no mapa 20x20 (medição de 11/11/2026)

Liberado pelo Fernando em 11/11. Cenário `beacon_hill` (Colina do Farol) em `src/shared/battle/scenarios.ts`: 4 heróis (Guerreiro, Arqueiro, Mago, Ladino) e o Farol contra Soldado, Arqueiro esqueleto, Mago sombrio e Bruto. É a batalha que o jogo abre; a escaramuça 8x8 fica para testes e simulação rápida.

## Simulação IA contra IA (origem: `npm run sim -- <cenário> 1000`, medido em 11/11)

| Cenário | Vitória dos heróis | Turnos (dos heróis) | Duração estimada | Batalhas que travam |
|---|---|---|---|---|
| Colina do Farol 20x20, antes do ajuste da IA (300 sementes) | 93,7% | 98,9 (59,3) | ~16,5 min | 4 em 300 |
| Colina do Farol 20x20, depois | 53,3% | 64,3 (34,8) | ~9,9 min | 0 em 1 000 |
| Escaramuça 8x8, antes (25/10) | 66,5% | ~51 | não estimada | 1 em 1 000 |
| Escaramuça 8x8, depois | 62,8% | 43,8 (26,8) | ~7,4 min | 0 em 1 000 |

Metas: 50 a 70% de vitória e batalha de 8 a 12 min (spec de 25/10).

**A duração é estimativa, não medida com gente:** 15 s por turno de herói e 2,5 s por turno de inimigo (as pausas do cliente somam 1,3 s, mais a animação). Só um teste jogando diz o tempo real.

## O que mudou para chegar aí

- **IA sem alvo ao alcance avança** (`ai.ts`): no 20x20 o inimigo fugia do alcance dos heróis em vez de avançar (28 dos 40 turnos inimigos sem atacar) e os heróis caçavam um por um. Agora, sem ninguém para bater no turno, a ameaça não conta e a distância pesa mais. Teste: `tests/battle-ai.test.ts`.
- **Herói da IA guarda o farol até 10 casas** (`GUARD_RADIUS`). Sensível: com 7 a vitória foi 29%, com 14 foi 37%, sem limite 41% (300 sementes cada). Vale só para a IA do simulador; quem joga decide sozinho.
- **Farol com 50 de vida** (era 35): com o inimigo avançando de verdade, a escaramuça 8x8 caiu a 33,7%; com 50 voltou a 62,8%.
- **Câmera:** no celular em pé a batalha abre com ~9,5 casas de largura e segue o herói da vez (o mapa inteiro deixava a casa com ~20 px); no PC abre com 16 de altura; o zoom agora chega ao mapa inteiro no 20x20.

## FPS do mapa real (origem: `spikes/bevy/web/bench.mjs three`, medido em 11/11)

| Aparelho | Pixel art | FPS | Pior quadro típico (p95) | Draw calls | Triângulos |
|---|---|---|---|---|---|
| desktop 1920x1080 | desligado | 424 | 3,0 ms | 225 | 0,92 mi |
| desktop 1920x1080 | 2 px | 307 | 4,1 ms | 367 | 1,38 mi |
| desktop 1920x1080 | 3 px | 304 | 4,2 ms | 367 | 1,38 mi |
| celular 393x852, CPU 4x | desligado | 62 | 21,1 ms | 198 | 0,91 mi |
| celular 393x852, CPU 4x | 2 px | 42 | 29,4 ms | 313 | 1,35 mi |
| celular 393x852, CPU 4x | 3 px | 47 | 28,7 ms | 313 | 1,35 mi |

Vsync desligado (vazão máxima). O "celular" é emulado com a placa de vídeo do PC (RTX 5070); a GPU de um celular real não foi medida. Tempo até a cena pronta: 0,7 s no desktop e 1,5 s no celular emulado (servidor local).

## Conferido no navegador (build de produção, 11/11)

- Capturas nesta pasta: celular 393x852 (início e mapa inteiro) e desktop 1920x1080 (início, meio e depois de recarregar).
- Passando 10 turnos de herói pelo teclado, os 4 inimigos avançaram na direção do farol.
- Salvar no meio: depois de recarregar a página, as posições salvas eram as mesmas.
- 0 erros no console.

## Sem conferir

- Uma batalha inteira jogada por gente (duração real, se a dificuldade para o jogador bate com os 53% da IA).
- Pinça e arrastar no 20x20 num celular de verdade (o código é o do marco 2; aqui só mudou o zoom inicial e o teto).
