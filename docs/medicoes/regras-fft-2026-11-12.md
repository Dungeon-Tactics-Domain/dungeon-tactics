# Regras de turno do FFT em todos os mapas (12/11/2026)

Pedido do Fernando (12/11, múltipla escolha "Em todos os mapas"): o jogo começa com o mesmo "game feel" do Final Fantasy Tactics para servir de base ao balanceamento. Mudam de propósito os números de todos os mapas. Fonte: Battle Mechanics Handbook v6.1 (BMG), o mesmo guia do estudo; a seção vai em cada regra.

## O que mudou

| Regra | Como ficou | Fonte |
|---|---|---|
| Custo do turno | Mover e agir 100; só um dos dois 80; nenhum 60 ("Esperar" devolve a vez mais cedo); a sobra nunca passa de 60. Antes: agir custava 100 mais o "atraso" da habilidade e não agir, 60 | BMG 1.1 |
| Empate na vez | Com várias unidades em 100 ou mais, joga a primeira da lista de personagens, e os inimigos vêm antes. Antes: a de maior CT | BMG A.2 |
| Ação com carga | Declarada no turno, entra na fila e sai depois de N tiques (fases S+, SR, C+ e CR de cada tique). Aparece na fila do topo com o ícone da habilidade. Se quem carrega morre, não sai | BMG 1.1 e A.2 |
| Mira da carga | A Carga do Arqueiro (e o nosso Tiro mirado) mira a casa e erra se o alvo sair. As outras seguem a unidade que estava na casa | Carga: BMG 2.2. Seguir a unidade: **não confirmado**, o guia não diz |
| Quem está carregando | Leva 50% a mais de ataque físico e fica sem evasão | BMG 6, estado Charging. Nosso dano não sai do PA: o +50% vai no dano inteiro (adaptação) |
| Andar com carga | No turno em que declara, não anda; num turno seguinte, andar desfaz a carga | BMG 2.2 (Carga); para as outras habilidades, suposição |
| Custo de MP e de estoque | Pago uma vez, quando a carga começa | **Suposição** (o guia não diz quando) |
| Mover depois de agir | Já existia: mover e agir, uma vez cada, em qualquer ordem | — |
| Menu | Mover · Agir · Esperar (antes "Passar a vez"). Status vem no próximo bloco | — |

### Tiques de carga de cada habilidade

O FFT não tem "atraso" de habilidade; o que deixa um golpe forte lento é a carga. As habilidades do jogo que tinham atraso passaram a carregar 1 tique por 10 de atraso. **Essa conversão é nossa (suposição)**: é a escolha que mantém a troca "forte, mas lento", agora com risco de errar se o alvo se mexer.

| Habilidade | Atraso antes | Carga agora | Mira |
|---|---|---|---|
| Golpe pesado | 40 | 4 | segue |
| Escudada | 10 | 1 | segue |
| Giro | 20 | 2 | segue (área em volta) |
| Tiro mirado | 40 | 4 | **casa** (como a Carga do Arqueiro) |
| Tiro de recuo | 10 | 1 | segue |
| Explosão | 40 | 4 | segue |
| Rajada | 10 | 1 | segue |
| Cura | 20 | 2 | segue |
| Rasteira | 10 | 1 | segue |
| Golpe mortal | 50 | 5 | segue |
| Machadada | 30 | 3 | segue |
| Pancada | 20 | 2 | segue |
| Estudo: Fogo, Cura | — | 4 | segue (BMG 3.3) |
| Estudo: Carga +1, +2 | — | 4 e 5 | casa (BMG 2.2) |

## Simulador (IA contra IA, 1 000 sementes, medido em 12/11)

| Cenário | Antes do bloco | Só custo de turno e empate | A: sem carga nas habilidades do jogo | B: com carga (está no código) |
|---|---|---|---|---|
| Colina do Farol | 53,3% · 64,3 turnos | 80,7% · 63,2 | 78,9% · 63,1 | **23,0%** · 65,3 |
| Escaramuça | 62,8% · 43,8 | 67,4% · 42,3 | 57,7% · 44,6 | **23,1%** · 47,1 |
| Estudo Gariland | 80,5% · 76,2 | 80,5% (já usava a regra) | 80,5% | 80,5% (nenhuma habilidade com carga) |
| Estudo classes | 78,6% · 40,7 | 78,6% | 97,9% · 41,0 | 97,9% · 41,0 |

A porcentagem é a vitória dos heróis. As duas variantes, A e B, valem como opção; **nenhuma é a base**.

### Cargas por habilidade na variante B (1 000 batalhas)

| Habilidade | Declaradas | Saíram | Sem alvo | Canceladas (andou ou morreu) |
|---|---|---|---|---|
| Colina: Tiro mirado | 7 911 | 6 978 | 660 | 273 |
| Colina: Golpe pesado | 4 629 | 4 153 | 172 | 304 |
| Colina: Explosão | 3 505 | 3 126 | 145 | 234 |
| Colina: Cura | 3 453 | 3 348 | 88 | 17 |
| Colina: Machadada | 2 960 | 2 690 | 209 | 61 |
| Colina: Golpe mortal | 2 616 | 1 956 | 68 | 592 |
| Escaramuça: Golpe mortal | 2 165 | **49** | 1 415 | 701 |
| Escaramuça: Tiro mirado | 8 191 | 5 821 | 2 127 | 243 |
| Classes: Carga +2 | 6 493 | **1 687** | 3 925 | 881 |
| Classes: Cura | 2 911 | 1 858 | 1 006 | 47 |

## O que os números dizem (dedução)

- **A IA não sabe usar carga.** Ela escolhe pelo dano esperado como se a carga saísse na hora, e não prevê que o alvo vai andar. Na escaramuça, 49 de 2 165 Golpes mortais acertaram. A Carga +2 do estudo sai em só 26% das vezes. **Os 23% da variante B medem essa IA, não o equilíbrio do jogo.** Não mexi na IA para esconder isso.
- No estudo das classes, os heróis vencem 97,9% com as mesmas classes dos dois lados. Hipótese, não medida: a vantagem vem das casas de partida e de quem carrega primeiro.
- O custo de turno do FFT sozinho já mudou a Colina de 53,3% para 80,7%: os golpes fortes ficaram sem custo.

## Testes que mudaram de propósito

- `tests/battle-turn-queue.test.ts`: saíram "habilidade forte atrasa o próximo turno" e a constante de custo; entraram o custo 100/80/60, o "Esperar devolve a vez mais cedo" e o empate pela lista com inimigos antes.
- `tests/battle-rules.test.ts`: saiu o teste do gancho de custo de turno por cenário (a regra agora vale para todos).
- `tests/battle-helpers.ts`: o estado de teste ganhou `charges: []`.
- Novo `tests/battle-charge.test.ts` (8 testes): carga declarada e saindo depois; mira na casa e erro quando o alvo sai; seguir a unidade; não andar no turno da carga e andar num turno seguinte desfazendo; +50% contra quem carrega (e não em magia); eventos das cargas no turno da IA; salvar e carregar com validação; Fogo gastando o MP uma vez só.

## Conferido

- Gates: typecheck 0 erros, 173 testes passando, build ok, nenhum nome do FFT no pacote principal. O salvar mudou para a versão 2: um save antigo começa do zero.
- Navegador, Colina do Farol em 1920x1080, 0 erro no console (prints em `docs/medicoes/regras-fft/`):
  - prévia do Golpe pesado com "Carrega 4 tiques… segue o alvo";
  - a carga declarada aparece na fila com o ícone;
  - o guerreiro fica sem andar;
  - depois dos outros turnos, a carga sai com a faixa "Golpe pesado" e acerta (−11).

## Para decidir

Variante A ou B: com B o jogo fica mais parecido com o FFT (golpe forte lento), mas só tem sentido com uma IA que leve a carga em conta.

## Decisão do Fernando (12/11, "Como no FFT") e a base que ficou

- Golpe físico sai na hora: Golpe pesado, Escudada, Giro, Tiro de recuo, Rasteira, Golpe mortal, Machadada e Pancada ficaram sem carga.
- Carregam só as magias e o Tiro mirado, com os tiques do equivalente no FFT:
  - Explosão e Rajada: 4, como o Fogo (BMG 3.3);
  - Cura: 4, como a Cura (BMG 3.3);
  - Tiro mirado: 4, como a Carga +1 do Arqueiro (BMG 2.2), mirando a casa.
- Palavras dele: "nao precisa verificar balanceamento ... se estiver com os mesmos numeros do fft vamos iniciar o balanceamento a partir disso". O simulador só registra onde a base ficou (1 000 sementes, 12/11):

| Cenário | Vitória dos heróis | Turnos |
|---|---|---|
| Colina do Farol | 74,1% | 61,9 |
| Escaramuça | 48,4% | 42,7 |
| Estudo Gariland | 80,5% | 76,2 |
| Estudo classes | 97,9% | 41,0 |

- **Pendência registrada (não é para agora):** a IA escolhe habilidade com carga como se ela saísse na hora e não prevê que o alvo vai andar.
- O teste `tests/battle-charge.test.ts` passou a usar a Explosão no lugar do Golpe pesado e ganhou "golpe físico sai na hora; carregam só as magias e o Tiro mirado".
- Sumiram o gesto de carga dos golpes (`Melee_2H_Idle`, tirado de `public/models/animacoes.glb`) e a aura laranja de golpe físico.
