# Dungeon Tactics — desenho da 1ª fatia (25/10/2026)

Origem: grill de pilares com o Fernando em 25/10/2026 (decisões também na memória `visao-do-jogo.md`). Pilares e metas: [`docs/game-design/PILARES.md`](../../game-design/PILARES.md).

## O que é

Tactics por turnos em grade quadrada com altura, mobile primeiro, pixel art SNES (shader sobre 3D Three.js). Referências: Final Fantasy Tactics (turno, altura), Into the Breach (planejar contra o que o inimigo alcança), D&D (classes, dado) e Darkest Dungeon (sensação; as peças dele ficam para depois).

## Decisões da 1ª fatia

| Tema | Decisão |
|---|---|
| Puzzle | Fila de turnos e alcance de cada inimigo sempre visíveis; o jogador planeja contra isso |
| Objetivo da 1ª batalha | Proteger um alvo (NPC/torre) e matar todos os inimigos. Derrota: o alvo cai ou todos os heróis morrem. Chefe final muda para "derrotar o chefe" |
| Grade | Quadrada |
| Altura | +1 de alcance por nível acima; salto máximo de 1 nível; dano de queda (empurrão); linha de visão e cobertura (floresta/muros bloqueiam, altura revela; poucos tipos de cobertura na 1ª fatia) |
| Heróis | 4: Guerreiro, Arqueiro, Mago, Ladino. Habilidades: 4 ou mais por herói; barra fixa de até 6 ícones (básico + especiais + mover); segurar o ícone mostra os detalhes |
| Inimigos | Soldado, Arqueiro, Mago, Bruto (um por papel). IA avalia e escolhe a melhor jogada; o alcance fica visível, a intenção só na vez dela |
| Acerto | Chance de acerto por distância, altura e cobertura, mostrada em % antes de confirmar; dano também varia. Dado sempre novo (o sorteio NÃO é refeito igual ao desfazer) |
| Desfazer | Limitado por batalha (valor inicial 3, a medir); reiniciar a batalha em um toque |
| Ordem de turno | Fila estilo FFT: velocidade da unidade; habilidade forte atrasa o próximo turno da unidade; fila visível no topo |
| Batalha | 8 a 12 min, mapa ~20x20. Exige: salvar a batalha no meio, câmera com pinça e arrastar, desempenho no celular |
| Toque | 1º toque escolhe o herói, 2º toque escolhe a casa (mostra caminho ou alcance), botão grande Confirmar executa; arrastar move a câmera, pinça dá zoom, girar câmera por botões |
| Campanha | ~5 cenários (batalhas e conversas) em sequência, UMA bifurcação no meio que muda o próximo mapa e o final; termina com batalha de chefe |
| Progressão | Nível (XP) e equipamento dos heróis, cartas de decisão entre batalhas; batalha vencível com o grupo da hora (sem grind obrigatório) |
| Tom | Sombrio mas jogável: fantasia dark em cores vivas o bastante para o pixel art, texto curto, narrador |
| Fora por ora | Morte permanente, estresse/aflições, expedição com recursos, vila (Darkest Dungeon). O estado do herói já nasce persistente entre batalhas para essas camadas poderem entrar sem refazer |

## Regras de projeto (valem para o código)

- Efeito de habilidade sai de stats gerais e documentados (alcance, dano, empurrão, recarga); nada de "habilidade X faz Y com habilidade Z".
- Número de balanceamento só muda depois de medido por simulação de batalhas (IA contra IA, várias sementes), meta: batalha vencível, sem solução única óbvia.
- Determinismo: toda aleatoriedade passa por `rng.ts` com semente guardada no estado; o estado da batalha é serializável e clonável (base de salvar, desfazer, simulação e testes).
- Mobile primeiro (a regra "celular fora de foco" do Warlock NÃO vale aqui): alvo de toque ≥ 44 px, tela de 393x852, sem hover obrigatório.
- Todo texto visível em português e inglês (`t()`), imports no topo, comentários curtos em português explicando o porquê.

## Arquitetura pretendida

- `src/shared/battle/` (lógica pura, sem DOM nem Three): `Grid` (casas, altura, cobertura), `Unit`, `TurnQueue`, `Abilities` (dados), `Pathing` (movimento, alcance, linha de visão), `Combat` (acerto, dano, queda), `Ai`, `BattleState` (serializável, clonável), `History` (desfazer limitado). Regra do Arthur: estado com dono claro, classe só quando há ciclo de vida real (ex.: `Battle` como agregado), composição no lugar de herança, dados para o resto.
- `src/client/`: cena Three.js ortográfica com `RenderPixelatedPass`, entrada por toque, HUD (fila, barra de habilidades, % de acerto, Confirmar), i18n, som.
- `src/shared/campaign/`: cenários em dados (batalha ou conversa), bifurcação, final.
- Herdado do Warlock e a manter: i18n, store, helpers de UI (`dialog()`, `iconButton()`, `tabs()`, `choice()`, `searchFilter()`, `withTip`), `rng.ts`, CI/PR/docs. O que é do Warlock (sim, match, bots, magias, lava, worker de sala) sai para a quarentena `D:\_PARA-APAGAR`, nunca apagado.

## A decidir (não bloqueia o começo)

- Lista exata de habilidades e números dos 4 heróis e 4 inimigos (decidir jogando a 1ª batalha).
- Crítico (existe? quanto?).
- Fórmula de velocidade e atraso por habilidade.
- Cartas de decisão e itens da progressão.
- Monetização (formato e preço das campanhas) e medição do pixel art no celular real.
