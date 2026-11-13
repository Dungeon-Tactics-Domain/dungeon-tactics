# Referência: tela de batalha do FFT e mecânicas do Tactics Ogre

Estudo pedido pelo Fernando em 13/11/2026 ("pode pegar todas as referências do FFT e Tactics Ogre possível para essa primeira parte do desenvolvimento"). Uso interno: copia-se só mecânica e fluxo, nunca arte, texto, música ou nomes. Complementa `referencia-fft.md` (fórmulas do FFT pelo Battle Mechanics Handbook); o que já está lá não se repete aqui, só se aponta a seção.

**Regra deste documento:** toda afirmação tem fonte e versão do jogo. O que não tem fonte está marcado **não confirmado**; o que é conta ou conclusão nossa está marcado **dedução**.

## Fontes

Como foi lida, em três níveis:
- **Texto extraído aqui:** PDF baixado em 13/11 e lido por script; é o nível mais seguro.
- **Página aberta (resumo):** a página abriu, mas foi lida por um resumo automático; o sentido é confiável, a letra não.
- **Só a busca:** a página não abriu; vale só o trecho que o buscador mostrou. Toda afirmação que depende disso diz "(só a busca)".

| Sigla | O que é | Versão | Link | Como foi lida |
|---|---|---|---|---|
| TUT | Roteiro do tutorial dentro do próprio FFT, transcrito pelo site Corpse Brigadier. As páginas citadas vão como `02_03`, `03_15` etc. | PS1 (dedução: cita os botões L2 e R2 e som "Wide", que o PSP não tem) | https://corpsebrigadier.neocities.org/2022/content/info/tutorialscript.html (página `x_y` em `.../tutorial/tutorial_x_y.html`) | Página aberta (resumo) |
| BMG | *Battle Mechanics Handbook* v6.1, de Aerostar (2004), o mesmo de `referencia-fft.md` | PS1 | https://www.video-games-museum.com/en/faqs/Playstation/26882-Final-Fantasy-Tactics.pdf | Texto extraído aqui (seções 4.1, 4.3 e 6.5) |
| MAPA | Mapa 022 (Gariland) em JSON, o mesmo de `referencia-fft.md` | PS1 | ver `referencia-fft.md` | Não reaberto |
| KAIN | *Tactics Ogre FAQ*, de Kain (Zhou Tai An), 1998; diz que boa parte vem de páginas japonesas (rpgdl.com) | PS1 | https://www.video-games-museum.com/en/faqs/Playstation/29008-Tactics-Ogre-Let-Us-Cling-Together.pdf | Texto extraído aqui |
| ZAHL | *Tactics Ogre: LUCT FAQ/Walkthrough*, de Zahlzeit, v2.23 (2016) | PSP | https://www.video-games-museum.com/en/faqs/PSP/12539-Tactics-Ogre-Let-Us-Cling-Together.pdf | Texto extraído aqui |
| SKILL | *Tactics Ogre: LUCT Skill FAQ*, de coineineagh, v3.3 (2015) | PSP | https://www.video-games-museum.com/en/faqs/PSP/12545-Tactics-Ogre-Let-Us-Cling-Together.pdf | Texto extraído aqui |
| GDEV | Análise "What's old is new again" (Game Developer) | PSP | https://www.gamedeveloper.com/business/what-s-old-is-new-again-a-tactics-ogre-let-us-cling-together-analysis | Página aberta (resumo) |
| RS-N | Notícia do RPG Site sobre os sistemas do Reborn | Reborn | https://www.rpgsite.net/news/13383-tactics-ogre-reborn-details-skills-battiefield-elements-unit-recruitment-the-wheel-of-fortune-the-chariot-tarot-rewind-feature-and-the-world-tarot-route-change-mechanic | Página aberta (resumo) |
| RS-R | Análise do Reborn no RPG Site | Reborn | https://rpgsite.net/review/13468-tactics-ogre-reborn-review | Página aberta (resumo) |
| FW | Final Weapon: novidades do Reborn (12/10/2022) e sistema de batalha (25/08/2022) | Reborn | https://finalweapon.net/2022/10/12/tactics-ogre-reborn-details-new-features-and-enhancements/ e https://finalweapon.net/2022/08/25/tactics-orge-reborn-details/ | Página aberta (resumo) |
| DENG | Dengeki Online, desenho de batalha do Reborn (japonês) | Reborn | https://dengekionline.com/articles/151981/ | Página aberta (resumo) |
| IMP | Game Watch (Impress): análise e notícia dos sistemas básicos do Reborn (japonês) | Reborn | https://game.watch.impress.co.jp/docs/review/rev1/1453661.html e https://game.watch.impress.co.jp/docs/news/1434503.html | Página aberta (resumo) |
| COG | Análise do Reborn no COGconnected | Reborn | https://cogconnected.com/review/tactics-ogre-reborn-review/ | Página aberta (resumo) |
| VOOKS | Análise do Reborn (Switch) no Vooks | Reborn | https://vooks.net/tactics-ogre-reborn-switch-review | Página aberta (resumo) |
| DMG | "How Damage is Calculated in Tactics Ogre: Reborn", v1.01 (20/01/2023), de /u/charlesatan, a partir de dados extraídos do jogo | Reborn | https://docs.google.com/document/d/1Q1nUEH7xD8XE-IdUpVs5qUvJSN9FECzeWQR_aRE-aEE | Página aberta (resumo) |
| TIC-P | Prévia do The Ivalice Chronicles no RPG Site | FFT 2025 | https://www.rpgsite.net/preview/18317-final-fantasy-tactics-the-ivalice-chronicles-new-voice-acting-makes-it-feel-like-a-whole-new-game | Página aberta (resumo) |
| TIC-R | Análise do The Ivalice Chronicles no RPG Site | FFT 2025 | https://www.rpgsite.net/review/18508-final-fantasy-tactics-the-ivalice-chronicles-review | Página aberta (resumo) |
| XBOX | Dicas do The Ivalice Chronicles no Xbox Wire | FFT 2025 | https://news.xbox.com/en-us/2025/09/29/final-fantasy-tactics-the-ivalice-chronicles-tips-for-new-and-returning-players/ | Página aberta (resumo) |
| ENG | Análise do The Ivalice Chronicles no Engadget | FFT 2025 | https://www.engadget.com/gaming/final-fantasy-tactics-ivalice-chronicles-review-140000972.html | Página aberta (resumo) |
| BUSCA | Trechos de busca de páginas que não abriram: Sportskeeda (prévias do Reborn e do Ivalice Chronicles), RPGamer, PC Gamer, Kotaku e DSOGaming (Reborn), Press Start (Ivalice Chronicles), RPGFan e Destructoid (WotL), Square Enix "A closer look at Tactics Ogre: Reborn", Caves of Narshe (batalha 16), wiki do FFHacktics (SEQ) | várias | https://sportskeeda.com/esports/final-fantasy-tactics-ivalice-chronicles-preview · https://www.sportskeeda.com/esports/tactics-ogre-reborn-ps5-preview-more-simple-visual-overhaul · https://rpgamer.com/review/tactics-ogre-reborn-review/ · https://pcgamer.com/tactics-ogre-reborn-review · https://kotaku.com/tactics-ogre-reborn-review-remaster-tactics-jrpg-switch-1849774409 · https://www.dsogaming.com/?p=167341 · https://press-start.com.au/reviews/ps5-reviews/2025/10/13/final-fantasy-tactics-the-ivalice-chronicles-review-well-worth-it/ · https://www.rpgfan.com/review/final-fantasy-tactics-the-war-of-the-lions/ · https://www.square-enix-games.com/news/tactics-ogre-reborn · https://www.cavesofnarshe.com/fft/walkthrough.php?battle=16 · https://ffhacktics.com/wiki/SEQ | Só a busca |

Não abriram nesta pesquisa (bloqueio ou página vazia): `ogrebattlesaga.fandom.com` (402), o espelho `breezewiki.discard.no` do wiki do Final Fantasy (erro de certificado), `strategywiki.org`, `gematsu.com`, `pushsquare.com`, `rpgamer.com`, `dsogaming.com` (403), `sportskeeda.com` (405), `pcgamer.com` (texto cortado), `hardcoregaming101.net` (em mudança de servidor), `square-enix-games.com` (só o menu do site). `gamefaqs.gamespot.com` e `finalfantasy.fandom.com` estão bloqueados segundo `referencia-fft.md` (11/11) e não foram tentados de novo. O *In-Depth FAQ* de mecânica do Tactics Ogre do PSP vive no GameFAQs e ficou de fora.

**Cobertura fraca:** o The War of the Lions (PSP, 2007) só aparece por trechos de busca sobre lentidão; nenhuma fonte lida descreve diferença de tela ou de regra em relação ao PS1. O Tactics Ogre do Reborn não tem fonte sobre direção nem sobre árvores.

### Versões e nomes

| Jogo | Versões citadas | Ordem de turno |
|---|---|---|
| Final Fantasy Tactics | PS1 (1997), The War of the Lions (PSP, 2007), The Ivalice Chronicles (2025, fora do pedido, mas responde perguntas de tela) | CT (`referencia-fft.md`, "Ordem de turno") |
| Tactics Ogre: Let Us Cling Together | PS1 (porte do Super Famicom de 1995), PSP (refeito em 2010), Reborn (2022, refeito do PSP) | PS1: WT. PSP e Reborn em inglês: RT, *Recovery Time* (SKILL, FW). A matéria japonesa do Reborn chama de WT (IMP) |

## O que o tutorial do FFT responde de novo

Pontos que `referencia-fft.md` marca como não confirmados, ou não trata, e que o tutorial do jogo (TUT) responde:

| Assunto | O que o tutorial diz | Página |
|---|---|---|
| Direção no fim do turno | Depois que a vez acaba, o jogador escolhe para onde a unidade olha; a direção muda a evasão contra golpes, e o tutorial manda virar para o inimigo | 02_03 |
| Mover não volta atrás | Depois de escolher Mover, não dá para cancelar | 03_08 |
| Magia com carga: unidade ou casa | Quem carrega fixa o alvo numa unidade (a área anda junto se ela se mover) ou numa casa (a área fica; a magia sai mesmo sem ninguém) | 03_10 e 02_05 |
| Vão horizontal | Além de `[Jump / 2]` casas, a borda de onde se pula tem de ser pelo menos tão alta quanto a de chegada | 03_15 |
| Esperar | Esperar sem mover nem agir recomeça a carga de 40; depois de mover ou agir, de 20 | 02_04 |

- A linha de Esperar bate com o BMG (CT − 60 e CT − 80, `referencia-fft.md`, "Ordem de turno") quando a unidade estava com CT 100 (**dedução**).
- **Divergência sobre água de 2 de profundidade.** O tutorial (03_16) diz: "If you stop when the water depth is 2h, you can't move." O BMG 6.5 diz que a unidade não pode agir nem reagir; a nota do BMG sobre Float fala em não poder se mover. Não resolvido aqui. Nosso jogo hoje trata 2 ou mais como água em que não se entra (`src/shared/CLAUDE.md`, "Água em todos os mapas").

## 1. Tela de batalha e fluxo do turno

### 1.1 Menu de comandos

- **FFT (PS1):** na vez da unidade, o menu tem Mover, Agir, Esperar, Status e Batalha automática (TUT 02_02). Uma unidade faz um Mover e um Agir; Esperar fecha a vez sem fazer um dos dois (02_02). O tutorial avisa para pensar no alcance antes de mover, porque depois de mover não se volta (03_08); dá para agir antes de mover (**dedução** do mesmo aviso). O menu da unidade abre com o botão de confirmar sobre ela (02_01). A batalha automática tem estilos de luta (lutar até o fim, apoiar aliado, fugir) e é desligada pelo próprio menu (02_02).
- **Onde o menu aparece na tela (perto da unidade, num canto): não confirmado**, nem no FFT nem no Tactics Ogre. Nenhuma fonte de texto lida diz; o tutorial só diz quando o menu abre.
- **The Ivalice Chronicles:** a interface foi refeita para comandar mais rápido (XBOX), sem descrição da posição.
- **Tactics Ogre Reborn:** quatro modos de IA para os aliados (atacar, defender, atirar de longe, curar), e todos os aliados trocam entre manual e automático de uma vez, no preparo ou no meio da batalha (FW, DENG).

**Para o Dungeon Tactics:** a posição do menu ao lado do boneco é decisão nossa, sem fonte para copiar. O que tem fonte e vale copiar: um mover e um agir por vez, em qualquer ordem, e Esperar como terceira saída. O FFT não deixa desfazer o movimento; o Tactics Ogre deixa voltar jogadas (seção 2.8), e nós já temos o desfazer limitado, então fica como está.

### 1.2 Escolha do alvo, confirmação e prévia do ataque

- **Cores no FFT (PS1):** casas de movimento piscam em azul; casa onde não se pode parar fica vermelha no cursor; o alcance do golpe pisca em vermelho e a área de efeito em verde-amarelado (TUT 02_01 e 02_03). Uma opção faz aliados e inimigos piscarem em cores diferentes durante a mira (02_08).
- **Prévia no FFT (PS1):** aparece na parte de baixo da tela, com o atacante à esquerda e o alvo à direita; mostra o dano (ou cura) esperado e a chance de sucesso; magia de estado mostra o nome do estado e a chance; o nome da reação do alvo (contra-ataque, por exemplo) aparece embaixo do status dele (TUT 02_03 e 03_09). A chance física já desconta as evasões de classe, escudo e acessório (03_09). Confirma-se depois de ver área e efeito (02_03).
- **Barra de vida com o trecho que sai: não confirmado** em qualquer versão.
- **Tactics Ogre (PS1):** ao escolher agir, o canto de baixo à direita da barra de status mostra o total de bônus de ataque e defesa, já com terreno e clima (KAIN).
- **Tactics Ogre Reborn:** a prévia mostra dano, chance de acerto e o efeito do elemento (Sportskeeda, só a busca). Arco, besta e magia de projétil em linha reta mostram a trajetória antes do tiro, para não acertar aliado (FW, DENG, IMP). A barra de vida em cima de cada unidade pode ser ligada e desligada (IMP).

**Para o Dungeon Tactics:** nossa prévia já calcula chance, lado do golpe e dano mínimo e máximo (`TargetPreview` em `src/shared/battle/combat.ts`). Copiar do FFT a comparação lado a lado (atacante à esquerda, alvo à direita) com o nome do contra-ataque do alvo, se houver; copiar do Reborn a linha da trajetória nos ataques à distância e a barra de vida sobre as unidades. O trecho da vida que sai fica decisão nossa, sem fonte.

### 1.3 Lista de turnos e magia com carga

- **FFT (PS1):** a lista de vez abre pelo menu de ambiente, opção Turno ativo; nela a magia aparece pelo nome, junto da unidade, na ordem em que vai sair (TUT 03_04 e 02_05). No menu de magia, a coluna Turno diz em que ponto da lista a magia sai: 2 quer dizer que uma unidade joga antes dela, 3 que duas jogam (03_05). Esquerda e direita sobre a magia abrem a lista detalhada com ela encaixada (03_05). A ficha da unidade mostra a posição dela na fila sobre o total de unidades, e o tutorial avisa que é estimativa, porque Esperar muda a conta (02_04). Sem menu aberto, um botão passa o cursor pelas unidades na ordem da vez (03_04).
- **Durante a carga (FFT PS1):** se a vez da unidade chega antes de a magia sair, agir de novo cancela a magia; esperar deixa a carga continuar (TUT 02_05).
- **The Ivalice Chronicles:** a lista fica fixa na lateral da tela (TIC-P, TIC-R; Press Start diz lateral esquerda, só a busca), mostra as habilidades e magias que vão sair (Sportskeeda, só a busca) e, ao destacar uma ação no menu, mostra onde a unidade vai cair na fila (TIC-P).
- **Tactics Ogre (PS1):** um botão mostra a ordem da vez; precisa ser ligado nas opções (KAIN).
- **Tactics Ogre Reborn:** a ordem fica na parte de baixo da tela (COG; RPGamer, só a busca).

**Para o Dungeon Tactics:** já temos a lista no topo com as cargas no ponto em que saem (`src/shared/battle/turn-queue.ts`). O passo seguinte com fonte é o do Ivalice Chronicles: ao passar o mouse numa ação do menu, mostrar na lista onde a unidade cairia (Esperar, só mover ou só agir, e mover e agir têm custos diferentes) e, numa magia com carga, onde ela sairia, como a coluna Turno do FFT. Diferença registrada: no FFT o jogador escolhe se a carga segue a unidade ou fica na casa; no nosso jogo isso é fixo por habilidade (`panel`, `src/shared/CLAUDE.md`, "IA e carga").

### 1.4 Informação da casa

- **FFT (PS1):** a altura da casa sob o cursor fica no canto de cima à direita; logo abaixo, a ficha da unidade que está nela (TUT 02_01). Em ponte e outros terrenos em camadas, o cursor alterna entre as camadas (02_01).
- **Tactics Ogre (PS1):** o botão de consulta mostra tudo sobre o terreno escolhido, inclusive o efeito geográfico, com o valor de ataque e de defesa da casa (KAIN).

**Para o Dungeon Tactics:** um canto fixo com a altura e o tipo da casa sob o cursor; ao pôr o efeito de terreno na regra (seção 2.4), mostrar ali o número, como o Tactics Ogre.

### 1.5 Câmera

- **FFT (PS1):** dois botões giram o campo, um aproxima e afasta, outro troca para um ângulo mais alto; segurar um botão e usar as setas rola a tela (TUT 02_01). **Quantos graus cada giro dá: não confirmado** (o texto não diz).
- **The Ivalice Chronicles:** a câmera gira e inclina (ENG) e há uma vista de cima, reta, para ler o mapa sem obstáculo, mas sem dar ordens nela (TIC-P, TIC-R); na demonstração era segurando um botão (TIC-P).
- **Tactics Ogre Reborn:** mais opções de perspectiva (COG) e uma vista do mapa em 2D que ajuda a ler as alturas (IMP).

**Para o Dungeon Tactics:** giro, dois ângulos e zoom, como o FFT. A vista de cima é útil para ler alturas, mas as duas versões que a têm não deixam comandar nela; se fizermos, decidir se ela comanda.

## 2. Mecânicas

### 2.1 Direção (frente, lado, costas)

- **FFT (PS1):** a direção é escolhida pelo jogador no fim da vez (TUT 02_03) e muda só o acerto, pelas evasões que contam de cada lado (`referencia-fft.md`, "Acerto e evasão"). As fórmulas de dano do BMG não têm termo de direção (**dedução**: o golpe pelas costas acerta mais, não bate mais forte).
- **Tactics Ogre (PS1):** o acerto sobe 25% pelo lado e 50% pelas costas (KAIN). Fonte única, de 1998, tirada de páginas japonesas; se a soma é em pontos ou em proporção: **não confirmado**.
- **Tactics Ogre (PSP):** atacar pelas costas melhora o acerto, sem número (ZAHL).
- **Tactics Ogre Reborn:** **não confirmado**. O documento de dano (DMG) não trata direção.

**Para o Dungeon Tactics:** já temos +15 de acerto pelo lado e +30 pelas costas, como números iniciais (`SIDE_BONUS` e `BACK_BONUS` em `combat.ts`, 13/11). O Tactics Ogre do PS1 dá +25 e +50: é a referência se a direção precisar pesar mais, depois de medir no simulador. No FFT a direção não soma dano (dedução acima); no Tactics Ogre nenhuma fonte lida fala de dano pela direção. Com o que temos, manter a direção só no acerto.

### 2.2 Salto e vão

- **FFT (PS1):** salto e vão de `[Jump / 2]` casas e a regra da borda nas rampas estão em `referencia-fft.md` ("Altura e movimento") e no BMG 6.5. Novo: o vão exige a borda de saída pelo menos tão alta quanto a de chegada (TUT 03_15); o bônus de salto aumenta o vão, mas a habilidade que ignora altura não (BMG 6.5).
- **Tactics Ogre (PSP):** subir e descer são limites separados. A maioria das classes de luta sobe 2 e desce 3; magos e clérigos sobem 1 e descem 2; o Ninja anda 5, sobe 3 e desce 4; quem voa ignora altura (SKILL, ficha de cada classe). No PS1 o Ninja já subia 3 e descia 4 (KAIN).
- **Alcance vertical do golpe:** no Tactics Ogre do PSP, o corpo a corpo comum pega 2 de altura para cima e 3 para baixo (SKILL); no PS1, lança e chicote alcançam 1 casa a mais e 2 de altura a mais (KAIN). No FFT, o limite vertical aparece na ajuda da habilidade (por exemplo, "Vertical 2") (TUT 03_06; números em `referencia-fft.md`, "Dano do ataque por arma").

**Para o Dungeon Tactics:** já temos salto por classe (subir e descer iguais) e o vão do FFT (`leaps` em `pathing.ts`). Falta a regra da borda do tutorial: hoje o vão pousa até `jump` níveis acima de onde saiu, e no FFT a casa de chegada não pode ser mais alta que a de saída. O Tactics Ogre sugere ainda descer 1 a mais do que se sobe e classes de magia com salto menor; e um limite de altura no golpe corpo a corpo (subir 2, descer 3), que hoje não temos (`inAbilityRange` só olha distância e o alcance extra pela altura). Tudo isso mexe na vitória dos mapas: medir antes.

### 2.3 Altura

- **FFT (PS1):** a altura dá alcance ao arco longo (`referencia-fft.md`, "Altura e movimento"); nas fórmulas do BMG, a altura não soma dano nem acerto (**dedução**). Quem está na água conta a altura da casa menos a profundidade (BMG 6.5).
- **Tactics Ogre (PSP):** o arco atira em curva, passa por cima de obstáculos e vai além do alcance marcado quando dispara do alto; de baixo, perde alcance (SKILL). O arqueiro ganha ataque e acerto quanto mais alto está (GDEV).
- **Tactics Ogre (PS1):** a flecha quase sempre vai 1 casa além do marcado, às vezes 2, muito mais de cima para baixo, e quase nunca sobe mais que 2 de altura (KAIN).
- **Tactics Ogre Reborn:** altura e linha de visão contam na ação (RS-R); algumas magias proibidas mudam o dano pela altura do defensor (DMG).

**Para o Dungeon Tactics:** já temos o alcance extra pela altura (`pathing.ts`) e +5 de acerto por nível acima do alvo, para todos (`HEIGHT_BONUS` em `combat.ts`), mais perto do Tactics Ogre que do FFT. Se o alto precisar valer mais, o Tactics Ogre dá o caminho (mais dano para o arqueiro no alto), medindo no simulador.

### 2.4 Terreno

- **Água (FFT PS1):** está em `referencia-fft.md` e no nosso jogo. A divergência sobre profundidade 2 está no topo deste documento. Alguns pântanos têm profundidade 2 (Caves of Narshe, só a busca). Com chuva forte, pântano e lago parado também custam 2 para andar (BMG 6.5).
- **Lava (FFT PS1):** a habilidade de flutuar deixa parar em cima da lava; o estado de flutuar deixa passar, mas não parar (BMG 4.3); o BMG cita ainda, de passagem, uma habilidade de andar na lava. Logo, sem uma delas, não se para na lava (**dedução**). **Se a lava fere: não confirmado.**
- **Árvores (FFT PS1):** no mapa de Gariland, as duas únicas casas onde não se pode ficar são árvores (MAPA). É o dado de um mapa só; **como regra geral, não confirmado**.
- **Tiro com obstáculo (FFT PS1):** parede ou unidade no caminho leva a flecha ou a bala no lugar do alvo; prévia com efeito 0 é sinal disso (TUT 03_14). À noite, arco e besta acertam menos (BMG 6.5).
- **Efeito geográfico (Tactics Ogre PS1):** cada terreno dá um valor de ataque e de defesa a quem está nele, e 5 pontos de diferença podem mudar acerto e dano em 20% ou mais (KAIN). Exemplos do guia: estrada ataque 40 e defesa 20; água ataque 10 e defesa 5, mesmo para quem nada; lava defesa 30 (KAIN).
- **Tactics Ogre (PSP):** algumas classes têm "+Swim" e um dragão anda na lava, sinal de que os demais não andam (SKILL, **dedução**). Unidade caída vira obstáculo até ser revivida ou exorcizada (ZAHL). O clima muda o acerto de algumas armas à distância (ZAHL).
- **Tactics Ogre Reborn:** o terreno da casa em que a unidade está muda o acerto corpo a corpo e à distância; clima ruim reduz acerto e pode mudar o custo de andar em alguns terrenos (RS-N).
- **Árvores no Tactics Ogre: não confirmado.**

**Para o Dungeon Tactics:** a floresta já não é pisável e tapa a visão de quem está no mesmo nível (`grid.ts`), o que bate com o único dado do FFT; e já existe um efeito de terreno no estilo do Tactics Ogre: −20 de acerto à distância contra quem está em terreno com cobertura (`COVER_PENALTY` em `combat.ts`). Se a floresta travar caminho demais, o Tactics Ogre sugere o outro jeito: casa pisável com bônus de defesa (o "efeito geográfico"), mostrado na informação da casa. Para lava, o FFT só dá "não se para"; dano de lava seria regra nossa.

### 2.5 Contra-ataque

- **FFT (PS1):** não é automático. É uma habilidade de reação: dispara na porcentagem de Brave da unidade, mesmo se o golpe errar, e só se o atacante estiver ao alcance da arma de quem reage; o contra-ataque não gera outra reação (BMG 4.1). A reação é imediata quando a unidade vira alvo (TUT 03_32), e o nome dela aparece na prévia (03_09).
- **Tactics Ogre (PS1):** o guia conta que um lanceiro contra-ataca e pode acertar o próprio aliado que estava no meio (KAIN); isso sugere contra-ataque sem habilidade comprada (**dedução**; a regra exata não foi confirmada).
- **Tactics Ogre (PSP e Reborn):** contra-ataque vira habilidade de apoio, em 4 níveis no PSP (SKILL; RS-N). O Reborn tem ainda o ataque em pinça: o aliado do outro lado do inimigo dá um golpe a mais (Square Enix, só a busca).

**Para o Dungeon Tactics:** hoje não temos contra-ataque (busca em `src/` sem resultado, 13/11). Se entrar, o modelo com fonte é o do FFT: habilidade de quem defende, com chance, só no alcance da arma, e com o nome na prévia do atacante.

### 2.6 Carga e ordem de turno

- **FFT (PS1):** em `referencia-fft.md` ("Ordem de turno", "Ação lenta") e na seção 1.3.
- **Tactics Ogre (PS1):** a espera de cada unidade é 550 menos a agilidade, mais o que o equipamento soma ou tira, mais ou menos o valor da classe (KAIN). Mover e agir alongam a espera até a próxima vez (GDEV, sobre o PSP).
- **Tactics Ogre (PSP):** cada classe tem um tempo de recuperação; quanto menor, mais cedo joga (**dedução** pelo uso no guia). Exemplos: Ninja 22, Clérigo 24, Mago 25, Arqueiro 26, Guerreiro 32, Cavaleiro 36 (SKILL). Algumas habilidades somam tempo extra (o guia lista uma com +20) (SKILL). Aqui a ação forte atrasa a próxima vez de quem a usa, em vez de demorar para sair.
- **Tactics Ogre Reborn:** amigos e inimigos na mesma fila; a espera vem de peso do equipamento, classe e ações (IMP, FW).

**Para o Dungeon Tactics:** a regra já decidida é a do FFT ("Habilidade forte é lenta pela carga, não por atraso", `src/shared/CLAUDE.md`). O Tactics Ogre fica registrado como alternativa, sem sugestão de troca.

### 2.7 Dano e golpes para derrubar

- **FFT (PS1):** dano multiplicativo (força vezes poder da arma; `referencia-fft.md`, "Dano do ataque por arma"). Com a tabela de nível 1 de `referencia-fft.md`: um Escudeiro (43 de vida) cai com 3 golpes de outro Escudeiro (16), 3 do Ramza (20), 2 do Cavaleiro (24), 4 do Químico (12) e 2 Fogos do Mago Negro (30) (**dedução**). Acerto de 95% a 100% sem escudo, crítico de cerca de 5% (`referencia-fft.md`).
- **Tactics Ogre Reborn:** dano por subtração: atributos do atacante menos os do defensor, mais o ataque da arma menos a defesa do equipamento, com pesos por tipo de arma (DMG). Os atributos inflados fazem os inimigos demorarem a cair até as cartas de bônus entrarem (RS-R).
- **Golpes para derrubar no Tactics Ogre: não confirmado.**

**Para o Dungeon Tactics:** a referência do FFT é de 2 a 4 golpes, 3 no caso comum, para uma unidade do começo cair. Serve de alvo para medir o dano depois do ajuste de 13/11 (danos ×1,75 por "batalha lenta").

### 2.8 Duração da batalha e voltar jogadas

- **FFT:** **turnos por batalha: não confirmado.** Gariland tem 5 inimigos; o tamanho do lado do jogador é suposição do estudo (`referencia-fft.md`, "A batalha de Gariland").
- **Tactics Ogre Reborn:** um mapa levou 40 minutos e batalhas chegam perto de 1 hora com controle fino de cada unidade (VOOKS); mesmo em 2x, fica lento com uma dúzia de unidades de cada lado (DSOGaming, só a busca).
- **Voltar jogadas:** no PSP, o recurso de voltar no tempo (Chariot Tarot) guarda as últimas 50 jogadas e qualquer uma pode ser retomada (ZAHL, GDEV); repetir a mesma ação dá o mesmo sorteio, mudar qualquer coisa sorteia de novo (GDEV, IMP). No Reborn, o começo do jogo deixa voltar até 10 jogadas e o limite cresce depois (RS-N); a análise japonesa fala em até cerca de 50, conforme a cena (IMP). Divergência PSP × Reborn registrada, não resolvida.

**Para o Dungeon Tactics:** medir turnos e minutos por batalha no simulador, porque nenhuma fonte dá o número do FFT. O nosso desfazer faz o contrário do Tactics Ogre no sorteio: lá a mesma ação repete o mesmo resultado; aqui o sorteio não volta e atacar de novo pode dar outro, por isso o desfazer de ataque é limitado (`battle.ts`).

## 3. Ritmo e animação

As fontes de texto não dão quadros por casa no andar, duração do pulo nem quanto tempo o número de dano fica na tela; **tudo isso: não confirmado**. O que existe:

- **FFT (PS1):** tem base de tempo de cerca de 59 Hz e as animações esperam um número de quadros por comando; há animações de andar separadas para velocidade normal e acelerada (FFHacktics, só a busca).
- **FFT (opções do PS1):** velocidade das mensagens, mostrar ou não o nome da habilidade, a mensagem de efeito e o ganho de experiência (TUT 02_08). São os cortes de tempo que o jogo oferece.
- **The War of the Lions:** fica mais lento que o PS1 nas animações de magia (RPGFan 2007 e 2008, Destructoid, só a busca).
- **The Ivalice Chronicles:** acelerar segurando um botão (TIC-R) e uma opção de velocidade (ENG, XBOX).
- **Tactics Ogre Reborn:** botão de velocidade dobrada para todas as animações (RS-R, IMP; PC Gamer e Kotaku, só a busca).
- **Câmera seguindo a ação: não confirmado.**

**Para o Dungeon Tactics:** pôr a velocidade 2x desde já e as opções de esconder nome e mensagens; os tempos de andar, pular e mostrar dano saem da nossa própria medição. Para ter os números do FFT, contar quadros num vídeo de jogo a 60 quadros por segundo.

## 4. Resumo por frente em andamento

| Frente | O que as fontes dizem | Fonte |
|---|---|---|
| Menu ao lado do boneco | Posição do menu: não confirmado. Fluxo: um mover e um agir, em qualquer ordem, mais Esperar | TUT |
| Prévia de ataque | Atacante à esquerda, alvo à direita, dano esperado, chance e nome da reação do alvo (FFT); trajetória de tiro e barra de vida sobre as unidades (Reborn). Trecho da vida que sai: não confirmado | TUT, FW, DENG, IMP |
| Lista de turnos com carga | Já temos; o próximo passo é mostrar onde a ação escolhida põe a unidade na fila | TUT, TIC-P |
| Direção e acerto pelas costas | FFT: só acerto, pelas evasões. Tactics Ogre PS1: +25 lado, +50 costas. Nós: +15 e +30 | BMG, KAIN |
| Árvores bloqueando passagem | FFT: árvore não pisável em 1 mapa. Tactics Ogre: não confirmado; alternativa de terreno com defesa | MAPA, KAIN |
| Dano por golpe e ritmo | FFT: 2 a 4 golpes, 3 no comum (dedução). Turnos por batalha: não confirmado. Aceleração nos dois remakes (2x confirmado só no Reborn) | `referencia-fft.md`, RS-R, TIC-R |
