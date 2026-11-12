# src/client — navegador

Vale junto com o `CLAUDE.md` da raiz. **Web no PC primeiro** (pedido do Fernando, 12/11): a adaptação para celular é uma etapa própria depois; até lá o celular só precisa abrir sem erro (não apague as media queries nem o toque).

- **Quem é dono do quê:** `main.ts` (`Game`) liga tudo e é dono do laço de turno e da tela do turno; `command.ts` diz o que o menu mostra e o que vem depois (puro, testado); `interaction.ts` decide o que a casa escolhida faz (puro, testado); `scene.ts` (`BattleScene`) só desenha; `hud.ts` (`BattleHud`) só mostra e repassa cliques; `touch-input.ts` (`TouchInput`) só traduz gestos e mouse; `gamepad.ts` traduz o controle em ações de teclado (puro, testado). Classe com recurso (WebGL, ouvintes) tem `dispose()`.
- **Interface no jeito da tela de batalha do FFT** (decisão do Fernando, 12/11: "descarte as interfaces atuais e recrie a interface do mesmo jeito da do final fantasy tactics original"; a regra herdada "interface só com as peças que já existem" não prende esta reescrita):
  - **Telas do turno** (`Screen` em `command.ts`): menu de comandos → submenu de habilidades → mapa (escolher a casa) → "Executar?" → menu. Esperar leva à escolha de direção nos mapas com direção.
  - **Peças do `BattleHud`:**
    - canto de cima à esquerda: casa sob o cursor (`tileInfo`) e lista dos próximos turnos com retratos;
    - alto, no meio: linha de ajuda e, abaixo, a faixa do nome da habilidade;
    - direita: menu Mover · Agir · Esperar · Status, submenu e janela "Executar?" com acerto, efeito e vida antes → depois;
    - embaixo: painel da unidade da vez (esquerda) e da unidade sob o cursor (direita), com retrato e barras de vida, MP e CT;
    - canto de cima à direita: ferramentas da câmera, menu e contador de desempenho.
  - **O que não se copia:** arte, fonte, ícones, retratos, molduras, sons e textos do original. Moldura de pergaminho feita em CSS (`--paper*`, `--ink*`, `--focus` no `:root`), retratos dos nossos bonecos KayKit (`public/chars`, `scripts/portraits.mjs`), e seta ▶ nossa no lugar da mão do menu.
  - **Peça nova de HUD:** `.panel` (pergaminho) com `.item` (linha de menu, `.focus` marca o foco), `gauge()` (barra com rótulo e número) e `unitPanel()` em `hud.ts`. Cores e tamanhos só pelas variáveis do `:root`.
- **Entrada:** teclado, mouse e controle andam o mesmo cursor e passam pelo mesmo `Game.runKey`.
  - Teclado: `keyboard.ts` (WASD e setas sobem e descem no menu e andam o cursor no mapa; Enter confirma; Esc volta; P Esperar; C Status; F3 contador; Z desfaz).
  - Mouse: passar por cima escolhe, clique confirma, botão direito volta.
  - Controle (Gamepad API, mapeamento padrão Xbox e PlayStation): direcional e analógico andam; A ou × confirma; B ou ○ volta; X ou □ Status; ombros giram a câmera; gatilhos dão zoom; Back desfaz; Start abre o menu. Com um diálogo aberto, o controle anda entre os botões dele.
  - Tecla ou botão novo entra em `keyAction`, na lista `keyHelp` (tela de ajuda) e como `hint()` no HUD. Nada de `if` de teclado na cena ou no HUD.
- **Texto que o jogador vê:** `t('pt', 'en')` de `i18n.ts`; nomes por `unitName`/`abilityName`. Resultado de ação também em texto (`eventLog`, na linha de ajuda), não só no número flutuante.
- **DOM pelas peças de `icons.ts`** (`el`, `icon`, `iconButton`) e `dialog.ts`. Cor nunca é o único sinal.
- **Contador de desempenho** (pedido do Fernando, 12/11): fps, tempo do quadro e recursos do Three (`BattleScene.stats`), mais a memória do JS quando o navegador mostra. Ligado por padrão, F3 liga e desliga (`dt:fps`), texto atualizado 2 vezes por segundo.
- **Menu de desenvolvedor** (pedido do Fernando, 12/11): menu (H) → Desenvolvedor. Escolhe o mapa (Colina, Escaramuça, Cripta e o relevo de Gariland), monta heróis e inimigos (classe, nome, vida, velocidade, movimento e habilidades), salva em `dt:dev`, exporta e importa JSON e abre a batalha em `?cenario=dev`. Regras puras em `dev-roster.ts` (`buildDevScenario` cria fichas `dev-h0`, `dev-e0`… com o boneco da classe; `parseSetup` é a fronteira do JSON), tela em `dev-menu.ts`. As unidades ocupam as casas de partida do mapa; sem Farol no mapa, vence quem sobrar.
- **Tempos do fluxo** em `timing.ts`; gesto e efeito de cada habilidade em `fx.ts`; som em `sound.ts`.
- **Game feel** (pedido do Fernando, 12/11: "mais responsivos e gostosos de jogar"):
  - Toda espera e animação da batalha usa `BattleScene.wait`/`animate`, que correm no relógio da batalha. Segurar Enter, Espaço ou A acelera 3 vezes; no toque, o botão ⏩ nas ferramentas liga e desliga (`dt:rapido`) (`pace`/`speed()` em `timing.ts`). Nada de `setTimeout` para tempo de batalha.
  - Golpe com pausa no impacto (`hitStop`), alvo piscando branco e tremendo (`shake`). Cada boneco tem cópia própria dos materiais.
  - Confirmar só no aperto (sem repetição de tecla).
  - Câmera abre perto (`PC_START`) e enquadra quem ataca e o alvo.
  - Lista de turnos curta (4) por padrão, L mostra tudo (`dt:turnos`).
  - Menus abrem em 90–120 ms e o ▶ pulsa; com movimento reduzido, nada anima.
- **Pixel art configurável** (pedido do Fernando, 25/10): `pixel-settings.ts` (puro) guarda tamanho, contorno, paleta e câmera presa em `dt:pixel`; a `BattleScene.setPixel` aplica na hora. Atalho V e o botão de TV nas ferramentas; opções no menu com `choice()` (`dialog.ts`).
- Preferências e save em `store.ts` com prefixo `dt:`.
