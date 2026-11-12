# Referência: Final Fantasy Tactics (PS1, 1997)

Estudo de referência pedido pelo Fernando em 11/11/2026 para começar o balanceamento. Uso interno: não é conteúdo do jogo. Os nomes próprios do FFT aparecem só aqui e no cenário de estudo (`src/shared/battle/fft/`), que não entra no pacote principal do jogo.

**Regra deste documento:** todo número tem fonte. O que não tem fonte está marcado como **não confirmado** ou **suposição do estudo**.

## Fontes

| Sigla | O que é | Link | Como foi lida |
|---|---|---|---|
| BMG | *Battle Mechanics Handbook* v6.1, de Aerostar (2004) | https://www.video-games-museum.com/en/faqs/Playstation/26882-Final-Fantasy-Tactics.pdf | PDF baixado e texto extraído em 11/11; cada número abaixo foi conferido no texto |
| MAPA | Dados do mapa 022 já extraídos em JSON (repositório `fft-map-json`) | https://raw.githubusercontent.com/rainbowbismuth/fft-map-json/master/data/MAP022.json | Arquivo baixado em 11/11 e lido por script |
| NOMES | Lista de nomes de mapa do FFTPatcher (`hex="16"` = Magic City Gariland; 0x16 = 22) | https://github.com/Glain/FFTPatcher | Lido por um subagente de pesquisa; não reabri |
| CoN | Guia da batalha no Caves of Narshe | https://www.cavesofnarshe.com/fft/walkthrough?battle=2 | Lido por um subagente de pesquisa; não reabri |
| FAQ | FAQ/Walkthrough do PS1 (v1.2, 2005) | https://www.video-games-museum.com/en/faqs/Playstation/26872-Final-Fantasy-Tactics.pdf | Lido por um subagente de pesquisa; não reabri |

Não abriram (bloqueio): `ffhacktics.com` (403), `gamefaqs.gamespot.com` (403), `finalfantasy.fandom.com` (402), `web.archive.org`. Por isso quase tudo de mecânica vem de uma fonte só, o BMG, sem segunda conferência.

Notação do BMG: `[x]` descarta o resto da divisão; `(a..b)` é um inteiro sorteado, com os dois extremos; `RU{x/y}` arredonda para cima.

## Ordem de turno (BMG 1.1 e apêndice A.2)

- A cada tique, cada unidade ganha CT igual ao seu Speed. Quem chega a **100 ou mais** tem o turno.
- CT ao fim do turno:

| O que a unidade fez | Novo CT |
|---|---|
| Moveu e agiu | CT − 100 |
| Só moveu | CT − 80 |
| Só agiu | CT − 80 |
| Nem moveu nem agiu | CT − 60 |

- Se o novo CT passar de 60, vira 60.
- Empate (mais de uma unidade com CT ≥ 100): age primeiro quem tem o menor número na lista de personagens. Os inimigos são numerados primeiro; os do jogador, pela casa em que foram postos.
- Habilidade carregada: tem um CTR (tiques até resolver). Escudeiro e Químico não têm nenhuma.
- Haste e Slow: `[Speed × 3/2]` e metade. Lido por subagente (BMG 5.2 e 5.3), não reabri.

## Dano do ataque por arma (BMG 2.1)

| Arma | Dano |
|---|---|
| Punho | `[(PA × Brave) / 100] × PA` |
| Espada, vara, lança, besta | `PA × WP` |
| Faca, arco longo | `[(PA + Speed) / 2] × WP` |
| Espada de cavaleiro, katana | `[(PA × Brave) / 100] × WP` |
| Cajado | `MA × WP` |
| Machado, mangual, saco | `(1..PA) × WP` |
| Arma de fogo | `WP × WP` |

- Só punho, espada de cavaleiro e katana usam Brave. Lido por subagente, não reabri: fórmulas de cloth, instrumento, dicionário e arma de fogo mágica.
- **Crítico:** cerca de 5% dos ataques ("approximately" no guia; o valor exato é não confirmado). O atributo vira `XA + (1..XA) − 1` antes de multiplicar pela arma: o dano fica entre o normal e quase o dobro. Empurra 1 casa em 50% das vezes (lido por subagente, não reabri).
- Alcance vertical do corpo a corpo: 1 casa, até 2 de altura vindo de baixo e 3 vindo de cima (BMG B.1, na tabela das facas).

## Dano mágico (BMG 3.2, 3.4 e 3.5)

Reaberto no guia em 12/11 para o cenário `fft-classes`.

- Dano: `[(MA × Faith do conjurador × Faith do alvo × Q) / 10000]`, com Q fixo por magia (BMG 3.4: Fire, Ice e Bolt 14; Fire 2 18; Fire 3 24; Cure 14, Cure 2 20, Cure 3 30).
- **Fire** (BMG 3.3): dano com Q 14, alcance 4, área 2 (o alvo e as casas vizinhas), 6 de MP, carga de 4 tiques, pode ser evitada pela evasão mágica. **Cure:** a mesma conta para curar, mesmo alcance, área, MP e carga; não é evitada.
- Acerto de magia (BMG 1.4): `[base × (100 − escudo mágico) × (100 − acessório mágico) / 10000]`, de qualquer lado. Exemplo do guia: Flare contra escudo mágico de 15% e manto de 30% acerta 59%.
- Acerto de magia de status: `[Faith/100 × Faith/100 × (MA + Y)]`, com Y fixo por magia (lido por subagente, não reabri).
- **Ação lenta** (BMG 1.1 e A.1): magia e Carga só resolvem depois de N tiques ("CTR"); quem é alvo pode sair da casa nesse meio-tempo, e quem carrega leva mais dano (`XA × 3/2`, BMG 3.2).

## Carga do Arqueiro (BMG 2.2)

- Charge +K soma K ao PA e ao Speed na conta da arma. Arco longo: `[((PA + K) + (Speed + K)) / 2] × WP`.
- Tiques de carga: +1 em 4, +2 em 5, +3 em 6, +4 em 8, +5 em 10, +7 em 14, +10 em 20, +20 em 35. A carga mira a casa, não a unidade.

## Battle Skill do Cavaleiro (BMG 3.6)

- Quebra de atributo: acerto `(PA + 50)%` antes da evasão física (frente, lado, costas). Speed Break tira 2 de Speed; Power Break, 3 de PA; Mind Break, 3 de MA; Magic Break, metade do MP.
- Quebra de equipamento: acerto `(PA + WP + K)%`, com K 45 (elmo), 40 (armadura), 55 (escudo) e 30 (arma). Se o alvo não tem a peça, vira um ATTACK.

## Acerto e evasão (BMG 1.4)

Acerto base do ataque físico: 100%. A posição do atacante decide quais evasões do alvo contam:

| Posição | Acerto em % |
|---|---|
| De frente | `[base × (100 − classe) × (100 − escudo) × (100 − acessório) × (100 − arma) / 10^8]` |
| De lado | `[base × (100 − escudo) × (100 − acessório) × (100 − arma) / 10^6]` |
| Pelas costas | `[base × (100 − acessório) / 100]` |

- A evasão da arma só conta com a reação Weapon Guard.
- Frente, lado ou costas: vale a maior entre a distância à frente, de lado e atrás do alvo; no empate, frente vence lado e lado vence costas; a altura das casas não conta. Reaberto em 12/11 e fixado no teste com o diagrama 5x5 do guia (`tests/fft-complementos.test.ts`).
- Escudeiro e Químico: evasão de classe 5%. Ramza: 10%. Sem escudo nem acessório no começo, o acerto é 95% de frente e 100% de lado ou pelas costas: **em Gariland a direção quase não muda o acerto**; ela pesa com escudo (o Cavaleiro: 81% de frente, 90% de lado, 100% pelas costas, contas deste estudo).
- Exemplo do guia: de lado, escudo de 40% e manto de 40% deixam 36% de acerto.
- **Para onde a unidade vira ao andar e ao atacar, e como a IA escolhe a direção ao fim do turno: não confirmado** (o guia não trata).

## Altura e movimento (BMG 6.5, 6.9 e 7.4)

- Move é quantas casas a unidade anda; Jump é quanto de altura ela sobe num passo. O guia dá um exemplo de subida (Jump 3 sobe 3). **Regra de descida voluntária: não confirmado.**
- Vão horizontal que a unidade salta: `[Jump / 2]` casas.
- Dano de queda (empurrão): `RU{((queda − Jump) × HP máximo) / 10}`, só quando a queda passa do Jump.
- Arco longo: alcance de 3 a `5 + [(altura do atirador − altura do alvo) / 2]`. Besta e arma de fogo não têm esse bônus.

## Zodíaco (BMG 1.3)

Lido por subagente, não reabri; o estudo não usa.

- Multiplicadores sobre o atributo: bom ×1,25, ruim ×0,75, melhor ×1,5, pior ×0,5. Não afeta evasão.
- **Tabela por signo: não confirmado** (saiu desalinhada na extração do PDF).

## Como os stats nascem (BMG 7.1)

- `stat = [valor bruto × multiplicador da classe / 1 638 400]`, mínimo 1. Vale para HP, MP, Speed, PA e MA.
- Valores brutos no nível 1:

| Gênero | Speed | PA | MA | HP | MP |
|---|---|---|---|---|---|
| Masculino | 98 304 | 81 920 | 65 536 | 491 520 a 524 287 | 229 376 a 245 759 |
| Feminino | 98 304 | 65 536 | 81 920 | 458 752 a 491 519 | 245 760 a 262 143 |

- Exemplo do próprio guia: Escudeira nível 1 tem 28 ou 29 de HP e 11 de MP.
- Todo recruta vem com Clothes (HP +5) e Leather Hat (HP +8): +13 de HP.
- Crescimento por nível: `bônus bruto = [bruto / (C + nível)]`, com C da classe (lido por subagente, não reabri).
- Brave e Faith de unidade gerada no começo do jogo: 45 a 74 (BMG 6.10). **Brave e Faith do Ramza: não confirmado.**

## Classes (BMG 7.4)

| Classe | Move | Jump | Evasão | HP | MP | Speed | PA | MA |
|---|---|---|---|---|---|---|---|---|
| Escudeiro genérico | 4 | 3 | 5% | 100 | 75 | 100 | 90 | 80 |
| Químico | 3 | 3 | 5% | 80 | 75 | 100 | 75 | 80 |
| Escudeiro do Ramza (capítulo 1) | 4 | 3 | 10% | 125 | 105 | 107 | 111 | 102 |
| Cavaleiro | 3 | 3 | 10% | 120 | 80 | 100 | 120 | 80 |
| Arqueiro | 3 | 3 | 10% | 100 | 65 | 100 | 110 | 80 |
| Mago Branco (Priest) | 3 | 3 | 5% | 80 | 120 | 110 | 90 | 110 |
| Mago Negro (Wizard) | 3 | 3 | 5% | 75 | 120 | 100 | 60 | 150 |

As cinco últimas colunas são os multiplicadores da classe. Equipamento: o Escudeiro usa faca, espada, machado e mangual; o Químico, faca e arma de fogo; os dois usam chapéu, roupa e acessório, sem escudo. O Cavaleiro usa espada, escudo, elmo e armadura; o Arqueiro, besta, arco e escudo; o Mago Branco, cajado; o Mago Negro, vara.

### Nível 1 calculado (homem, HP bruto no meio da faixa)

Cálculo deste estudo com a fórmula acima; o guia só mostra o da Escudeira.

| Unidade | HP (com os +13) | PA | Speed | Arma | Dano do ataque |
|---|---|---|---|---|---|
| Escudeiro | 43 | 4 | 6 | Broad Sword (WP 4) | 16 |
| Químico | 37 | 3 | 6 | Dagger (WP 3) | 12 |
| Ramza | 51 | 5 | 6 | Broad Sword (WP 4) | 20 |
| Cavaleiro | 57 (37 + elmo e armadura de couro, 10 cada) | 6 | 6 | Broad Sword (WP 4) e Escutcheon | 24 |
| Arqueiro | 43 | 5 | 6 | Long Bow (WP 4), alcance 3 a 5 | 20; Carga +1 24, +2 28 |
| Mago Branco | 37 | 4 | 6 | Oak Staff (WP 3), MA 4 | 12; Cura 20 (Faith 60) |
| Mago Negro | 36 | 3 | 6 | Rod (WP 3), MA 6 | 9; Fogo 30 (Faith 60) |

Nas quatro classes novas, o equipamento (a arma e a armadura mais baratas que cada uma usa) e a Faith 60 são **suposição do estudo**. MP no nível 1: 17 nos dois magos (dá 2 magias de 6).

## Armas do começo (BMG B.1 e B.2)

| Arma | Poder (WP) | Evasão | Preço |
|---|---|---|---|
| Dagger | 3 | 0 | 100 |
| Mythril Knife | 4 | 5 | 500 |
| Broad Sword | 4 | 5 | 200 |
| Long Sword | 5 | 10 | 500 |
| Escutcheon (escudo) | evasão 10 | mágica 3 | 400 |
| Long Bow | 4 | 0 | 800 |
| Oak Staff | 3 | 15 | 120 |
| Rod | 3 | 20 | 200 |
| Leather Helmet, Leather Armor | HP +10 cada | | 200 cada |

Outra fonte (FAQ do Overated, lida por subagente) dá 5% de evasão para a Dagger; fica como divergência.

## Habilidades do Escudeiro (BMG 3.3)

| Habilidade | Alcance | Efeito | Custo |
|---|---|---|---|
| Accumulate | o próprio | PA +1, sempre acerta | 300 JP |
| Dash | 1 casa, 1 de altura | Dano `PA × (1..4)`, empurra em ~50%, não pode ser evitada | 75 JP |
| Throw Stone | 4 casas | Dano `PA × (1..2)`, empurra em ~50%, pode ser evitada | 90 JP |
| Heal | 1 casa, 2 de altura | Cura Darkness, Silence e Poison | 150 JP |

As do Ramza (Guts, BMG 3.3, reabertas em 12/11):

| Habilidade | Alcance | Efeito | Custo |
|---|---|---|---|
| Yell | 3 casas | Speed +1 no alvo, sempre acerta | 200 JP |
| Cheer Up | 3 casas | Brave +5 no alvo | 200 JP |
| Wish | 1 casa, 3 de altura | Cura `RU{HP máximo de quem usa × 2/5}` no alvo e tira `RU{HP máximo × 1/5}` de quem usa | 0 JP |
| Scream | | Brave +10, PA +1, MA +1, Speed +1 | 500 JP |

**Quais habilidades cada unidade já tem aprendidas na 1ª batalha: não confirmado.** **O que o Wish faz quando o custo passa da vida de quem usa: não confirmado.**

## Itens do Químico (BMG 2.5)

- Alcance 4 com linha de visão para quem tem Throw Item (todo Químico tem); 1 para os outros. Cada uso gasta 1 item do estoque.

| Item | Efeito | Custo |
|---|---|---|
| Potion | Cura 30 HP | 30 JP |
| Hi-Potion | Cura 70 HP | 200 JP |
| X-Potion | Cura 150 HP | 300 JP |
| Phoenix Down | Tira o estado Dead e devolve (1..20) HP | 90 JP |
| Antidote, Eye Drop, Echo Grass | Curam Poison, Darkness e Silence | 70, 80 e 120 JP |

**Estoque inicial de itens do jogador e do Químico inimigo: não confirmado.**

## A batalha de Gariland

| Dado | Valor | Fonte |
|---|---|---|
| Vitória | Derrotar todos os inimigos | CoN |
| Derrota | **Não confirmado** (nenhuma fonte aberta diz "Ramza caído = fim") | |
| Inimigos | 4 Escudeiros e 1 Químico | CoN e FAQ |
| Nível, gênero, equipamento e habilidades dos inimigos | **Não confirmado** | |
| Lado do jogador | Ramza, Delita como convidado (Escudeiro, controlado pelo jogo) e cadetes; "Party Slots: 4" | CoN |
| Quantos cadetes e de quais classes | **Não confirmado** (o FAQ fala em dois Químicos entre os cadetes) | FAQ |
| Recompensa | Mythril Knife, Phoenix Down, Potion e 2 000 Gil | CoN |
| Dica dos guias | O Químico inimigo cura os Escudeiros: é o alvo prioritário; um rio divide o campo | CoN e FAQ |
| Duração típica em turnos | **Não confirmado** | |

### O mapa (MAPA)

- Mapa 022, 10 de largura por 15 de profundidade. Altura de cada casa (linha = y de 0 a 14, coluna = x de 0 a 9):

```
 2  2  5  2  0  0  0  0  2  3
 2  2  2  2  4  2  0  2  2  3
 0  0  2  8  6  2  0  2  2  2
 2  0  2  8  8  2  0  2  5  2
 2  0  0  6  6  2  2  2  2  0
 2  0  2  2  2  2  2  2  2  0
 2  0  8  6  2  0  0  2  4  5
 2  2  8  8  2  0  0  2  6  6
 0  2  6  6  2  0  2  2  8  8
 0  2  3  5  4  0  2  2  6  8
 0  0  0  0  2  0  2  2  2  1
 0  2  2  2  2  0  0  0  2  2
 7  8  7  2  2  2  2  2  2  2
 8 10  8  6  4  0  0  2  2  3
 8  9  8  7  4  0  0  0  2  3
```

- Não pisáveis: só duas casas, as árvores em (2,0) e (8,3).
- Água (profundidade 1) nas casas de altura 0 do canal; o arquivo as marca como pisáveis. A regra de movimento vem do BMG 6.5 (ver a linha Água em "Fidelidade do cenário de estudo").
- Casas de partida no arquivo, 4 por lado: (7,1), (8,1), (5,1), (3,1) de um lado e (8,12), (7,12), (4,12), (3,12) do outro. O arquivo chama os lados de "Player 1" e "Player 2" e não diz quem ocupa cada casa; **se são as casas da batalha da história: não confirmado.**

## Fidelidade do cenário de estudo

O que os cenários `fft-gariland` e `fft-classes` reproduzem e o que simplificam (atualizado em 12/11).

| Item | No estudo | Fidelidade |
|---|---|---|
| Alturas e casas não pisáveis | Iguais ao arquivo | Alta |
| Rampas | Na regra viram degraus (vale a borda de baixo); no desenho, desde 12/11, o topo inclina pelo slope_type e slope_height do arquivo (as 2 rampas de canto ficam planas) | Média |
| Água | Desde 12/11, água corrente rasa (`depth: 1`) pela regra do BMG 6.5: andar custa 2, quem está nela fica 1 nível mais baixo; água de 2 ou mais bloqueia (não há no mapa). Empurrão para na água funda: suposição nossa. Relatório em `docs/medicoes/agua-2026-11-12.md` | Média: a regra é a do guia, o empurrão não tem fonte |
| Telhados, pontes, chaminés, caixas, piso de pedra e de madeira | Desde 12/11, peça KayKit por casa pelo surface_type do arquivo (contagens iguais às do arquivo, fixadas em teste) | Média: o tipo de cada casa é fiel, as peças são as nossas |
| Altura de um nível no desenho | 0,25 de casa, escolha visual | Sem fonte |
| Stats, vida, dano, Move, Jump, CT | Pelas fórmulas e tabelas do BMG | Alta |
| Acerto | Frente, lado e costas pelo diagrama do BMG, com evasão de classe e de escudo | Alta |
| Direção | Nasce olhando para o outro lado; vira ao andar (para onde foi) e ao agir (para o alvo); o jogador escolhe ao fim do turno (botão ↻ ou tecla T); a IA termina olhando para o inimigo mais próximo | Regra de virar sem fonte |
| Crítico | 5%, dano pela fórmula; sem o empurrão do crítico | Média |
| Empurrão de Dash e Throw Stone | 50%, 1 casa | Alta |
| Queda | Fórmula do BMG | Alta |
| Batida ao ser empurrado contra obstáculo | 3 de dano, regra do nosso motor | Sem fonte no FFT |
| Unidade caída | Sai da batalha (no FFT fica caída e pode ser revivida) | Baixa |
| Accumulate, Yell, Wish | Pelas fórmulas do BMG; bônus de PA e Speed duram a batalha | Alta |
| Wish com pouca vida | Quem usa fica com 1 de vida | Suposição |
| Phoenix Down, Heal, Cheer Up, Scream, estados | Fora | Não reproduzido |
| Poções | 4 por Químico | Suposição |
| Magia e Carga | Desde 12/11, ação com carga de verdade: Fogo e Cura 4 tiques, Carga +1 e +2 4 e 5 (BMG 3.3, 2.2 e A.2); quem carrega fica sem evasão e leva +50% (BMG 6). Fogo e Cura seguem a unidade (não confirmado); a Carga mira a casa | Alta |
| Quebras do Cavaleiro | Só Speed Break e Power Break (as de equipamento pedem equipamento no motor) | Média |
| Arco longo | Alcance 3 a 5, sem o ganho por altura do BMG 6.9 | Média |
| Faith e Brave | 60 para todos | Suposição |
| Linha de visão de pedra e poção | Não exigida | Suposição |
| Alcance vertical do corpo a corpo | Sem limite | Não reproduzido |
| Elenco do jogador | Ramza, Delita, 2 Escudeiros e 1 Químico, todos controlados por quem joga | Suposição |
| Ficha do Delita | Escudeiro genérico | Suposição |
| Inimigos | Nível 1, homens, Escudeiros com Broad Sword e Químico com Dagger | Suposição |
| Habilidades | Todo Escudeiro tem Throw Stone, Dash e Accumulate; o Ramza também Wish e Yell; Químico tem Potion | Suposição |
| `fft-classes` | Uma unidade de cada classe por lado, no mapa de Gariland e nas casas de partida do arquivo | Bancada, não é batalha do FFT |
| Casas de partida | As 4 do arquivo por lado; a 5ª de cada lado foi escolhida por perto | Suposição |
| Derrota | Todos os heróis caídos | Suposição |
