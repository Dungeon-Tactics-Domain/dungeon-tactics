# Interface no jeito da tela de batalha do FFT, controle, contador e laterais lisas (12/11/2026)

Pedidos do Fernando (12/11):
- "descarte as interfaces atuais e recrie a interface do mesmo jeito da do final fantasy tactics original ... e aceite inputs gamepad";
- "coloque um contador de fps e recursos na borda";
- "os chaos das bordas do mapa ficam sem textura e fica melhor assim".

Feito num worktree (`D:\Projetos\dungeon-tactics-ui`, branch `feat/interface-fft`, sem commit) e trazido para a pasta principal depois dos gates verdes.

## Como ficou

Só a disposição e o fluxo vêm do FFT. Arte, fonte, ícones, retratos, molduras, sons e textos são nossos: pergaminho em CSS, retratos dos bonecos KayKit e seta ▶ no lugar da mão.

| Peça | Onde | Arquivo |
|---|---|---|
| Casa sob o cursor (posição, altura, rampa, piso) | canto de cima à esquerda | `hud.ts` (`tileInfo`) |
| Lista dos próximos turnos, com retratos e as cargas | abaixo da casa | `hud.ts` (`renderQueue`) |
| Linha de ajuda (o que fazer agora e o resultado da última ação) | alto, no meio | `hud.ts` (`helpText`) |
| Faixa com o nome da habilidade | abaixo da ajuda | `hud.ts` (`banner`) |
| Menu Mover · Agir · Esperar · Status (o que já foi feito fica apagado) | direita | `hud.ts` (`renderCommands`), `command.ts` |
| Submenu das habilidades, com custo ou tiques de carga | à esquerda do menu | `hud.ts` (`renderAbilities`) |
| "Executar?": acerto, efeito e vida antes → depois de cada alvo, Sim/Não | direita | `hud.ts` (`renderConfirm`) |
| Unidade da vez: retrato, vida, MP (quando tem) e CT em barras, carga em andamento | embaixo à esquerda | `hud.ts` (`unitPanel`) |
| Unidade sob o cursor (ou o alvo do "Executar?") | embaixo à direita | `hud.ts` (`unitPanel`) |
| Status (janela com a ficha inteira) | diálogo em pergaminho | `main.ts` (`status`) |
| Ferramentas da câmera e menu | canto de cima à direita | `hud.ts` |
| Contador de desempenho | abaixo das ferramentas | `main.ts` (`showFps`), `scene.ts` (`stats`) |

**Fluxo do turno** (`Screen` em `command.ts`, executado em `main.ts`):
1. Menu de comandos, já no próximo comando que vale.
2. Mover leva ao mapa: o cursor mostra o caminho, e confirmar anda na hora.
3. Agir abre o submenu de habilidades; escolher uma leva ao mapa, com o alcance em laranja.
4. Confirmar no alvo abre o "Executar?"; Sim age e volta ao menu.
5. Esperar passa a vez; nos mapas com direção, pergunta antes para onde olhar.
6. Voltar (Esc, B, botão direito) desfaz um passo da tela.

## Controle (Gamepad API)

Mapeamento padrão do navegador, igual no Xbox e no PlayStation:
- direcional e analógico: sobem e descem no menu e andam o cursor no mapa. Segurando, repete depois de 300 ms e a cada 120 ms;
- A ou × confirma; B ou ○ volta; X ou □ Status;
- ombros giram a câmera; gatilhos dão zoom; Back desfaz; Start abre o menu.

Com um diálogo aberto, o controle anda entre os botões dele. Tradução pura em `gamepad.ts`, com testes em `tests/command.test.ts`.

**Não houve controle físico.** O teste usou a API simulada no navegador: `navigator.getGamepads` falso, e o roteiro apertava e soltava os botões. O turno inteiro foi jogado só pelo controle simulado e gravado em `docs/medicoes/interface-fft/turno-so-com-controle-simulado.webm`.

## Contador de desempenho

- Mostra fps e tempo do quadro (média de cada meio segundo), chamadas de desenho, triângulos, geometrias e texturas do Three, e a memória do JS (só no Chrome).
- Ligado por padrão; F3 liga e desliga, e a escolha fica salva (`dt:fps`).
- O texto muda 2 vezes por segundo.

Números lidos no próprio contador em 1920x1080 (Chrome sem janela, GPU do PC, 12/11):

| Mapa | fps | ms por quadro | Desenhos | Triângulos | Geometrias | Texturas | JS |
|---|---|---|---|---|---|---|---|
| Gariland (estudo) | 111 | 9,0 | 426 | 632,7 mil | 92 | 81 | 50 MB |
| Colina do Farol | 138 | 7,3 | 260 | 1 366,9 mil | 111 | 74 | 61 MB |

Os desenhos contam todas as passagens do quadro: sombra, cena e a passagem de normais do pixel art.

## Laterais do mapa

- Na borda, do piso de cada casa para baixo, a lateral é uma cor lisa puxada do piso de cima e escurecida: grama vira verde escuro, pedra cinza escuro, água azul escuro. Ela escurece até sumir no fundo da cena.
- Os topos seguem com a textura das peças, e as encostas dentro do mapa também.
- É uma geometria só para todas as laterais (uma chamada de desenho). Código: `buildWalls` em `scene.ts`.
- Antes e depois em 1920x1080: `docs/medicoes/interface-fft/gariland-laterais-antes-e-depois.png` e `colina-laterais-antes-e-depois.png`.

## Conferido

- Gates no worktree e na pasta principal: typecheck 0 erros, 186 testes passando (6 novos em `tests/command.test.ts`), build ok, nenhum nome do FFT no pacote principal.
- Simulador idêntico à base de antes da interface (a interface não muda regra): Colina 74,1%, escaramuça 48,4%, Gariland 80,5%, classes 97,9%.
- Prints 1920x1080 de cada tela em `docs/medicoes/interface-fft/`:
  - turno do herói: `01-menu`, `02-mover`, `04-submenu`, `05-alvo`, `06-executar`, `07-golpe`;
  - outras telas: `08-status`, `09-direcao`, `10-vez-do-inimigo`;
  - Colina do Farol: `colina-menu`, `colina-status`.
- 0 erro no console em todos.
- Celular 393x852: abre sem erro (`celular-abre.png`); a disposição para celular é etapa própria.
- `src/client/CLAUDE.md` atualizado com as peças novas e a decisão de 12/11.

## Sem conferir

- Controle físico de verdade (só o simulado).
- A disposição no celular (fora desta etapa, por pedido do Fernando).
- Desfazer (Z, ou Back no controle) não tem item no menu: o FFT não tem desfazer, e o nosso jogo tem. Ficou só na tecla e no botão do controle, e aparece na ajuda.
