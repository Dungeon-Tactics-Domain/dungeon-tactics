# Colina do Farol com peças KayKit e a Cripta Alagada (12/11/2026)

Pedidos do Fernando de 12/11: vestir a Colina do Farol com as peças KayKit, com neve no lado dos inimigos, e fazer um mapa de masmorra. Feito pelo orquestrador, sem commit.

## Colina do Farol (`beacon_hill`)

- `dressBeaconHill` em `src/shared/battle/scenarios.ts` dá a aparência (`Tile.look`) de cada casa a partir do terreno, da altura e da posição. Só desenho: o simulador não mudou (72,8% de vitória dos heróis, 0 travadas, igual a antes).
- Lado dos inimigos (`x - y >= 7`): neve no chão (`dirt_with_snow`), rocha com neve (`snow`) e árvores secas (`Tree_Bare_1`, `Tree_Bare_2`).
- Colina do meio: rocha (`stone`) no nível 2 e topo escuro (`stone_dark`) no nível 3.
- Farol: ouro embaixo (`stone_with_gold`) e areia com grama (`sand_with_grass`) até 2 casas dele.
- Muros: tijolo (`bricks_B` em cima, `bricks_A` na coluna). Floresta: 4 árvores (`Tree_1` a `Tree_4`) sorteadas pela posição (sempre o mesmo desenho).
- Prints: `docs/medicoes/colina-pecas/colina-depois-turno.png` e `colina-depois-mapa-inteiro.png` (1920x1080, 0 erro no console).

## Cripta Alagada (`flooded_crypt`, novo, abre com `?cenario=flooded_crypt`)

- 14x14, uma letra por casa (`CRYPT_MAP` e `CRYPT_KEY` em `scenarios.ts`): altar dos inimigos no nível 2, canal de água rasa (profundidade 1, regra do FFT) com duas pontes, colunas, caixotes, barris e baú que bloqueiam, entulho como cobertura pisável e muros de tijolo.
- Mesmos 4 heróis, o Farol e os mesmos 4 inimigos da Colina.
- Simulador, só para registrar (o Fernando pediu para não medir balanceamento agora): 1 000 batalhas, vitória dos heróis 44,4%, 56,9 turnos, 2 travadas.
- Prints: `docs/medicoes/colina-pecas/cripta-turno.png` e `cripta-mapa-inteiro.png` (1920x1080, 0 erro).

## Mudanças no desenho (`src/client/scene.ts`)

- `LOOK` ganhou as aparências da Colina e da Cripta; `propH` dá a altura da peça em cima da casa (coluna 2 casas, caixotes 1, barril 0,8, baú 0,6, entulho 0,4); `canopy` marca a árvore de Gariland, cuja altura no arquivo é a da copa.
- Muro com peça em cima (coluna, caixote) fica no nível do chão; muro sem peça continua 2 níveis acima.
- Nomes dos pisos novos na caixa da casa (`LOOK_NAME` em `hud.ts`), nas duas línguas.
- Peças copiadas de `assets/kaykit` para `public/models/blocos`, `floresta` e `masmorra`, com crédito em `public/CREDITS.txt` e `docs/ASSETS.md`.

## Gates

typecheck 0 erros; 195 testes passando (4 novos em `tests/scenario-maps.test.ts`); build ok, sem nomes do FFT no pacote principal. Simulador: Colina 72,8%, escaramuça 45,2%, Gariland 95,8%, classes 49,8% (iguais a antes), Cripta 44,4%.

## Fora desta entrega

- Tochas e estandartes da masmorra (precisam de parede para pendurar).
- Trilha de cascalho na Colina (estava na proposta; ficou de fora para não poluir o mapa).
