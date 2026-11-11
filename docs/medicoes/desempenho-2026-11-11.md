# Desempenho do Dungeon Tactics — medição de 11/11/2026

Pedido do Fernando (11/11): medir o desempenho real antes de pensar em trocar de tecnologia (ele perguntou sobre Rust).

**Conclusão:** o gargalo era o jeito de montar o mapa (um objeto por bloco), não a linguagem nem o Three.js. Com duas mudanças em `src/client/scene.ts` o mapa 20x20 no celular emulado com pixel art 2 px foi de 9 para 61 fps. Sem commit.

## Como foi medido (origem de todos os números: medido agora, 11/11)

- Script: `C:\Users\ferna\AppData\Local\Temp\claude\a047e7e51daf9f5c\661cb270-16d6-4da1-8dbe-bbc667b967a2\scratchpad\bench.mjs` (Playwright, Chrome sem janela, build de produção em `vite preview`). JSON bruto na mesma pasta: `antes-8x8.json`, `antes-20x20.json`, `depois-8x8.json`, `depois-20x20.json`.
- Máquina: RTX 5070 (ANGLE Direct3D11). Vsync desligado, então o FPS é vazão máxima, não o que a tela mostra.
- 6 s por combinação depois de 2 s de aquecimento, câmera parada, bonecos na animação parada.
- Draw calls e triângulos: `renderer.info` somado no quadro inteiro (inclui a passada de sombra e a segunda passada do pixel art).
- GPU: `EXT_disjoint_timer_query_webgl2`.
- "Celular": janela 393x852 com CPU 4x mais lenta, **mas a placa de vídeo continua a RTX 5070**. O número de GPU do celular real não foi medido.
- Mapa 20x20: ainda não existe no jogo. Foi gerado só para a medição (alturas 0 a 3, ~4% de muro, ~9% de floresta, as mesmas 9 unidades) e não ficou no repositório.
- Ruído entre rodadas: da ordem de 10 a 20% (o 8x8 "depois" no celular saiu mais baixo que o 20x20 "depois", o que só o ruído explica). As diferenças de 3x ou mais são sólidas; as de 10% não.

## Antes e depois — FPS (vazão máxima)

| Mapa | Aparelho | Pixel art | Antes | Depois |
|---|---|---|---|---|
| 8x8 | desktop 1920x1080 | desligado | 393 | 561 |
| 8x8 | desktop 1920x1080 | 2 px | 235 | 249 |
| 8x8 | desktop 1920x1080 | 3 px | 273 | 279 |
| 8x8 | desktop 1920x1080 | 4 px | 289 | 281 |
| 8x8 | celular 393x852, CPU 4x | desligado | 48 | 55 |
| 8x8 | celular 393x852, CPU 4x | 2 px | 25 | 43 |
| 8x8 | celular 393x852, CPU 4x | 3 px | 27 | 38 |
| 8x8 | celular 393x852, CPU 4x | 4 px | 27 | 43 |
| 20x20 | desktop 1920x1080 | desligado | 93 | 359 |
| 20x20 | desktop 1920x1080 | 2 px | 52 | 264 |
| 20x20 | desktop 1920x1080 | 3 px | 53 | 306 |
| 20x20 | desktop 1920x1080 | 4 px | 51 | 384 |
| 20x20 | celular 393x852, CPU 4x | desligado | 16 | 63 |
| 20x20 | celular 393x852, CPU 4x | 2 px | 9 | 61 |
| 20x20 | celular 393x852, CPU 4x | 3 px | 8 | 58 |
| 20x20 | celular 393x852, CPU 4x | 4 px | 9 | 55 |

## Antes e depois — custo do quadro (pixel art 2 px, o padrão do celular)

| Mapa | Aparelho | Medida | Antes | Depois |
|---|---|---|---|---|
| 20x20 | celular | draw calls | 3 562 | 277 |
| 20x20 | celular | triângulos | 3,35 mi | 1,83 mi |
| 20x20 | celular | CPU por quadro (média) | 109,6 ms | 15,2 ms |
| 20x20 | celular | GPU por quadro (média) | 93,5 ms | 9,6 ms |
| 20x20 | celular | pior quadro típico (p95) | 148,8 ms | 22,2 ms |
| 20x20 | desktop | draw calls | 4 642 | 379 |
| 20x20 | desktop | CPU por quadro (média) | 19,0 ms | 3,6 ms |
| 20x20 | desktop | GPU por quadro (média) | 16,6 ms | 2,7 ms |
| 20x20 | desktop | pior quadro típico (p95) | 22,8 ms | 5,1 ms |
| 8x8 | celular | draw calls | 676 | 298 |
| 8x8 | celular | CPU por quadro (média) | 37,7 ms | 21,9 ms |
| 8x8 | celular | pior quadro típico (p95) | 51,6 ms | 29,5 ms |
| 8x8 | desktop | draw calls | 774 | 376 |

## Opções do shader (20x20, depois)

| Opção | Desktop fps | Celular fps |
|---|---|---|
| 2 px com contorno (padrão) | 264 | 61 |
| 2 px sem contorno | 400 | 56 |
| 2 px com paleta | 420 | 54 |
| 2 px sem câmera presa | 399 | 52 |

Nenhuma opção do shader pesa de forma mensurável: as diferenças estão dentro do ruído. O tamanho do pixel (2, 3 ou 4) também não muda o custo.

## Carga e peso

| Medida | Valor | Origem |
|---|---|---|
| Tempo até o primeiro quadro, desktop | 0,6 a 0,8 s | medido (servidor local, sem rede) |
| Tempo até o primeiro quadro, celular CPU 4x | 1,5 a 1,8 s | medido (servidor local, sem rede) |
| Bundle JS | 682 KB, 176 KB com gzip | medido no `dist` |
| 8 bonecos `.glb` | 7,99 MB, 3,16 MB com gzip | medido em `public/models` |
| Blocos, árvore e texturas | 0,22 MB | medido |
| Total baixado para a batalha | 8,9 MB, 3,4 MB com gzip | medido |
| Compressão dos `.glb` no ambiente do PR 1 | não tem (`Content-Encoding` ausente) | medido com `curl -I` |
| Dentro de um boneco (knight) | 393 KB de animação (21 clipes), 227 KB de malha, 13 KB de textura | medido com gltf-transform |

Memória (heap JS) ficou no JSON bruto; não entrou na tabela porque o valor do CDP inclui o próprio medidor.

## O que foi aplicado (só `src/client/scene.ts`, +52 −18 linhas)

1. **Blocos do mapa em `InstancedMesh`** (um por tipo de peça) em vez de um objeto por bloco, e **blocos de terra cercados pelos quatro lados ficam fora da cena**. O toque em casa passou a ler a casa pelo índice da instância.
2. **Sombra calculada uma vez por quadro.** Com pixel art ligado a cena é desenhada duas vezes (cor e normais) e a sombra era recalculada nas duas.

Conferido depois: typecheck limpo, 92 testes passando, build ok, prints do 8x8 e do 20x20 iguais ao esperado, toque em casa azul habilita o Confirmar e o herói anda até ela.

## O que NÃO foi aplicado, e por quê

- **Pixel art em resolução menor:** já desenha em 1x; o tamanho do pixel não mudou o custo.
- **Limite de FPS e desenho sob demanda:** os bonecos têm animação parada o tempo todo, então sempre há algo se movendo. Limitar a 30 fps economizaria bateria, mas bateria não foi medida. Fica como decisão do Fernando.
- **Evitar alocação por quadro:** os piores quadros (p95) ficaram perto da média; não apareceu pausa de coleta de lixo.
- **WebGPURenderer:** depois da correção sobram 2,7 ms de GPU no desktop; não há ganho a buscar.

## O que sobra de custo (dedução a partir dos números, não medido separado)

- Dos ~277 draw calls restantes, a maior parte vem dos 8 bonecos: cada um tem 10 malhas e é desenhado na cor, na sombra e nas normais.
- Os triângulos restantes são dos blocos: cada bloco tem de 922 a 1 248 triângulos (medido). Numa RTX isso não pesa; num celular real pode pesar, e só um teste no aparelho diz.

## Pendências para decidir

- Peso da carga: 8 MB de bonecos sem compressão no servidor é o maior custo real para quem abre no celular pela rede móvel.
- Teste num celular de verdade: a GPU do celular não foi medida.
