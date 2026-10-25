# POC descartável: Gariland em pixel art 2D (12/11/2026)

Pedido do Fernando (12/11, "Teste rápido de comparação"): uma tela parada do mapa de Gariland em pixel art 2D, só para comparar estilos com o 3D do estudo. Sem batalha, sem regras, fora do build e fora do PR.

- **Abrir:** `index.html` direto no navegador. Prints: `node spikes/pixel2d/shot.mjs`.
- **Pacote:** Tiny Tactics: Battle Kit I v1.0, de Tio Palada, CC0 (`tiny-tactics/license.html`). Baixado em 12/11/2026 de https://opengameart.org/content/tiny-tactics-battle-kit-i (zip `tinytactics_battlekiti_v1_0.zip`, SHA-256 `b61f94be13898ecf37a81538f308b68f18d8eef4dc5b9bc433c049f454bad577`).
- **Prints:** `desktop-1920x1080.png`, `celular-393x852.png` e, ao lado do estudo 3D (`docs/medicoes/estudo-fft/*-mapa-inteiro.png`), `lado-a-lado-*.png`.

## O que foi difícil (medido nesta POC)

- **Altura:** o pacote só tem cubo inteiro (16 px de lado) e meio cubo; o relevo de 0 a 10 foi feito empilhando o cubo de terra a cada 8 px. Funciona, mas parede alta vira um paredão de terra repetida e esconde as casas de trás (a rua entre os telhados some), e 2D não gira a câmera para ver.
- **Ordem de desenho:** de trás para a frente (x + y crescente) e de baixo para cima em cada casa, com o boneco desenhado junto da casa dele. Para tela parada bastou; boneco andando entre casas de alturas diferentes e efeito de área vão exigir ordenar por casa a cada quadro.
- **Direções:** o pacote só tem 2 das 4 direções (NE e SE); as outras duas saem espelhando, o que serve para bonecos simétricos. São só 3 personagens (guerreiro, mago, clérigo), sem inimigos: os dois lados usam os mesmos bonecos.

## Outros achados

- **Celular:** pixel art pede escala inteira. O mapa tem 400 px de largura e a tela 393: em escala inteira por pixel do aparelho (3x) ele entra a 2x e ocupa 267 dos 393 px de largura. Para ficar grande, precisa de câmera com arrasto.
- **Leitura nossa, sem fonte:** altura 0 como água e altura 5 ou mais como telhado de pedra; o pacote não tem telhado nem casa.
- **Tamanho:** o pacote inteiro tem 110 KB; a página são ~80 linhas de canvas 2D, sem biblioteca.
