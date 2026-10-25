# src/client — navegador (mobile primeiro)

Vale junto com o `CLAUDE.md` da raiz. A regra "celular fora de foco" do Warlock NÃO vale aqui: alvo é 393x852 em pé.

- **Quem é dono do quê:** `main.ts` (`Game`) liga tudo e é dono do laço de turno; `interaction.ts` decide o que o toque faz (puro, testado); `scene.ts` (`BattleScene`) só desenha; `hud.ts` (`BattleHud`) só mostra e repassa cliques; `touch-input.ts` (`TouchInput`) só traduz gestos. Classe com recurso (WebGL, ouvintes) tem `dispose()`.
- **Toque em duas etapas:** tocar escolhe, só o botão Confirmar executa. Confirmar nunca troca de lugar com outro botão.
- **Texto que o jogador vê:** `t('pt', 'en')` de `i18n.ts`; nomes por `unitName`/`abilityName`. Resultado de ação também em texto (`eventLog`), não só no número flutuante.
- **DOM pelas peças de `icons.ts`** (`el`, `icon`, `iconButton`) e `dialog.ts`; cores e tamanhos só pelas variáveis do `:root` em `style.css`. Alvo de toque ≥ 44 px (`--tap`). Cor nunca é o único sinal (legenda no menu, texto no cartão).
- **Teclado no estilo do FFT** (pedido do Fernando, 25/10): toda ação do toque tem tecla. `keyboard.ts` traduz tecla em ação e direção da tela em passo na grade (puro, testado); só o `Game.onKey` executa. Tecla nova entra em `keyAction`, na lista `keyHelp` (tela de ajuda) e como `hint()` no botão do HUD. Nada de `if` de teclado na cena ou no HUD.
- **Cara de jogo, não de página** (pedido do Fernando, 25/10): todo botão, cartão, ficha e diálogo usa a moldura do `:root` (`--frame`, `--trim`, bisel, `--glow` no escolhido); fonte pixel (`--font-px`, Tiny5) só em título, Confirmar, fila e número flutuante; texto pequeno na `--font`. No PC (≥ 1100 px) a HUD fica numa janela de comando central (cartão à esquerda, barra e ações à direita), nunca de ponta a ponta.
- **Pixel art configurável** (pedido do Fernando, 25/10): `pixel-settings.ts` (puro) guarda tamanho, contorno, paleta e câmera presa em `dt:pixel`; a `BattleScene.setPixel` aplica na hora. Atalho V e o botão de TV na barra da câmera; opções no menu com `choice()` (`dialog.ts`).
- Preferências e save em `store.ts` com prefixo `dt:`.
