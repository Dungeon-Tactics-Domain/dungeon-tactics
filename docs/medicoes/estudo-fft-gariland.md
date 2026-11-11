# Estudo FFT: a batalha de Gariland no nosso motor (11/11/2026)

Pedido do Fernando (11/11): replicar mapa, classes básicas, cálculo de dano e mecânicas do Final Fantasy Tactics original e recriar a 1ª batalha jogável aqui, para iniciar o balanceamento. É estudo, não conteúdo do jogo.

**Conclusão em uma linha:** no FFT de nível 1 um golpe tira cerca de um terço da vida do alvo e uma poção devolve dois terços; no nosso jogo um golpe tira cerca de um sexto e a cura devolve um quinto. A nossa batalha é de desgaste (5 a 6 golpes por morte), a do FFT é de decisão (3 golpes por morte).

Fontes, fórmulas e o que é suposição: [`docs/game-design/referencia-fft.md`](../game-design/referencia-fft.md).

## Como jogar e medir

- No navegador: abrir o jogo com `?cenario=fft-gariland`. O save do estudo fica separado do save do jogo.
- No simulador: `npm run sim -- fft-gariland 1000`.
- O código do estudo fica em `src/shared/battle/fft/` e sai num pedaço separado do build (4,3 KB, carregado só com o parâmetro). Conferido em 11/11: o pacote principal não contém "Ramza", "Delita" nem "Gariland".

## Lado a lado: unidades

Origem: FFT calculado pelas fórmulas do BMG (nível 1, homem, HP bruto no meio da faixa); nossos números lidos de `units.ts` e `abilities.ts` em 11/11.

| Medida | FFT nível 1 | Nosso jogo hoje |
|---|---|---|
| Vida do combatente da frente | Escudeiro 43, Ramza 51 | Guerreiro 42, Soldado 45, Bruto 82 |
| Vida do apoio | Químico 37 | Arqueiro 28, Mago 24, Ladino 26; inimigos 33 e 30 |
| Dano do golpe básico | Escudeiro 16, Ramza 20, Químico 12 (fixo) | Guerreiro e Soldado 6 a 9, Arqueiro 5 a 8, Mago 6 a 9, Ladino 5 a 7, Bruto 10 a 14 |
| Variação do dano básico | Nenhuma; só o crítico (5%) e as habilidades sorteiam | Sempre sorteado numa faixa |
| Golpe básico em % da vida do alvo | 16 em 43: 37% | 7,5 em 45: 17% |
| Golpes básicos para matar um igual | 3 (43 de vida, 16 por golpe) | 6 (Guerreiro contra Soldado: 45 de vida, 7,5 em média) |
| Golpes para matar o apoio | Ramza mata o Químico em 2 | Guerreiro mata o Mago sombrio em 4 |
| Acerto do golpe básico | 95% fixo de frente (90% contra Ramza); 100% de lado e pelas costas | 85 a 95% de base, menos 3 por casa de distância, mais ou menos 5 por nível, menos 20 com cobertura; sempre entre 5 e 95% |
| Ataque à distância | Pedra: 4 casas, dano 4 a 8 (metade do golpe), empurra em 50% | Tiro: 2 a 6 casas, dano 5 a 8 (igual ao corpo a corpo) |
| Cura | Poção: 30 fixos a 4 casas, 70% da vida de um Escudeiro | Cura do Mago: 7 a 10 a 4 casas, 20% da vida do Guerreiro |
| Velocidade | 6 para todos no nível 1 | De 5 (Bruto) a 12 (Ladino) |
| Custo do turno | 100 se moveu e agiu, 80 se fez um dos dois, 60 se passou | 100 mais o atraso da habilidade se agiu, 60 se não agiu |
| Movimento | Escudeiro 4, Químico 3 | 3 a 5 |
| Salto | 3 de altura por passo, num mapa em que o chão comum tem altura 2 e os telhados 6 a 10 | 1 nível por passo, em mapas de 0 a 3 níveis |

Golpes para matar não contam erro nem crítico.

## Lado a lado: a batalha (simulador, IA contra IA, 1 000 sementes, medido em 11/11)

| Medida | FFT Gariland (estudo) | Colina do Farol 20x20 | Escaramuça 8x8 |
|---|---|---|---|
| Lados | 5 contra 5 | 4 e o Farol contra 4 | 4 e o Farol contra 4 |
| Vida somada: heróis / inimigos | 217 / 209 | 120 (mais 50 do Farol) / 190 | 120 (mais 50 do Farol) / 190 |
| Vitória dos heróis | 73,2% | 53,3% | 62,8% |
| Turnos (dos heróis) | 89,7 (50,1) | 64,3 (34,8) | 43,8 (26,8) |
| Dano por golpe que acerta | 13,3 | 8,9 | 9,4 |
| Dano por turno jogado | 6,9 | 4,6 | 6,0 |
| Dano por turno em % da vida inimiga somada | 3,3% | 2,4% | 3,2% |
| Batalhas que não terminam em 400 turnos | 22 em 1 000 | 0 | 0 |
| Duração estimada | ~14,2 min | ~9,9 min | ~7,4 min |

- A duração é estimativa (15 s por turno de herói, 2,5 s por turno de inimigo), não medida com gente. **A duração real da batalha no FFT não tem fonte.**
- A IA é a nossa, não a do FFT: os 73,2% dizem como o nosso motor se comporta com os números do FFT, não a dificuldade do jogo original.
- As 22 batalhas travadas são dos dois Químicos: com poção sem limite (suposição do estudo; no FFT cada uso gasta um item do estoque), 30 de cura por turno superam o dano de quem sobrou.

## O que isso sugere para o nosso balanceamento

Tudo abaixo é leitura dos números acima (dedução), para decidir jogando e medindo; nada foi mudado no jogo.

- **Letalidade.** No FFT cada golpe pesa: três golpes matam. No nosso, seis. Se a meta é "planejar, não reagir", dano maior por golpe faz cada posição errada custar mais e encurta a batalha sem tirar turnos. Para testar: dobrar o dano básico (ou cortar a vida pela metade) e medir vitória e duração.
- **Cura.** A poção do FFT desfaz dois golpes; a nossa cura desfaz meio golpe. Cura forte cria o alvo prioritário (o Químico inimigo, que todos os guias mandam matar primeiro), mas sem limite de uso trava a batalha, como a simulação mostrou. Se a cura subir, ela precisa de custo: estoque, recarga ou atraso de turno.
- **Dano fixo contra dano sorteado.** No FFT o golpe básico não varia; a sorte fica no acerto (95%) e no crítico (5%). No nosso, acerto e dano são sorteados. Dano fixo deixa a prévia antes de confirmar mais confiável, o que combina com o pilar de planejamento.
- **Acerto.** O FFT quase não erra de frente e premia a posição (lado e costas ignoram a evasão de classe). O nosso tira acerto por distância e cobertura e não tem direção. A direção da unidade é a mecânica do FFT que mais falta aqui para o posicionamento valer.
- **Distância custa dano.** No FFT a pedra alcança 4 casas mas tira metade do golpe. No nosso, o tiro alcança 6 e tira o mesmo que o corpo a corpo, com vida menor do atirador como único preço.
- **Velocidade.** No nível 1 do FFT todos têm a mesma velocidade e a ordem sai de quem esperou (passar a vez custa 60 em vez de 100). No nosso, a velocidade já diferencia as classes (5 a 12): o Ladino age 2,4 vezes para cada vez do Bruto. Vale medir se essa diferença não pesa mais que as habilidades.
- **Altura.** Gariland tem telhados 4 a 8 acima da rua e Jump 3: subir exige achar o caminho, e cair empurrado tira 10% da vida máxima por nível de queda além do salto. Os nossos mapas vão de 0 a 3 com salto 1; a altura dá alcance e acerto, mas pouco risco.
- **Tamanho.** A 1ª batalha do FFT cabe em 10x15 casas com 5 de cada lado, e os lados começam a 11 casas um do outro. A nossa Colina do Farol tem 20x20 com 4 de cada lado: mais caminhada por turno de combate.

## O que mudou no código

- **Estudo isolado:** `src/shared/battle/fft/` (`formulas.ts`, `data.ts`, `gariland.ts`). O jogo só enxerga o cenário quando alguém chama `registerFftStudy()`: o cliente com o parâmetro, o simulador e os testes.
- **Regras por cenário:** `src/shared/battle/rules.ts`. Um cenário pode trocar acerto, sorteio do dano, CT depois do turno, salto, dano de queda e fim da batalha. Cenário sem `rules` (todos os do jogo) segue igual: a Colina do Farol e a escaramuça deram os mesmos 53,3% e 62,8% de antes.
- **Campos novos e opcionais:** `pushChance` na habilidade (empurrão com chance), `model` na ficha da unidade e `levelHeight` no mapa (altura de um nível no desenho). Nenhum é usado pelo jogo.
- **Simulador:** agora mostra dano por golpe e dano por turno.
- **Testes novos:** `fft-formulas.test.ts` (18 exemplos calculados do guia), `fft-gariland.test.ts` (mapa, unidades e regras no motor), `battle-rules.test.ts` (as trocas de regra) e um caso de empurrão com chance. Total: 138 testes passando.

## Conferido no navegador (build de produção, 11/11)

- Abre com `?cenario=fft-gariland` em 393x852 e 1920x1080, sem erro no console; capturas em `docs/medicoes/estudo-fft/`.
- Passando 12 turnos de herói, os inimigos jogam sozinhos e avançam.
- O save do estudo é gravado à parte e o save do jogo fica intacto.

## Sem conferir

- Uma batalha inteira do estudo jogada por gente.
- O estudo num celular de verdade.
- Tudo o que está como "não confirmado" ou "suposição" na referência: elenco e equipamento exatos, casas de partida da história, estoque de itens, regra de derrota, duração real.
