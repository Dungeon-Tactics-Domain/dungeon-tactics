# Microcopy proposal: help, errors, buttons, empty states, confirmations (Nov 16, 2026)

Text only, no code. Every "Today" cell was read from the code in this worktree (master at `a5b33d8`, Nov 16); nothing was observed on screen, and the 360 px fit is a length estimate (buttons up to ~40 characters, hints up to ~80). Source of the findings: the "Interface", "Toque e tablet" and "Game feel no toque" items of `PENDENCIAS-GRILL.md` (Nov 16). Not repeated here, only referenced: `onboarding-proposal.md` (town goal, node-map hint, heal rule, room objective, "camp" wording, "wounded") and `text-review.md` (what was already fixed).

**Tone.** Warm with a shadow underneath, short sentences, "you" instead of "the player", no exclamation marks. Verbs on buttons. A disabled control says why. An empty state says the next step. A number comes with its unit (`design-system.md` section 4).

**Marker in the Why column.** No marker = text only: replace the string in `t('pt', 'en')`, nothing else changes. **CODE** = the text is only half of it: a new element, a condition, a device check or a flow change is needed (the code is not proposed here). `(paragraph)` = a long text inside a scrolling window, exempt from the 40/80 limit.

**Vocabulary.** expedição (never "quest" or "descida"), andar, sala, chefe, cidade (the code says `Cidade` in `homeLabel`, `crawl.ts:66`; the onboarding draft says "vila": use "cidade"), grupo, baú. English: expedition, floor, room, boss, town, party, chest.

## 1. Battle: help line, disabled commands, confirmation

| Where | Today (pt / en) | Proposed pt | Proposed en | Why |
|---|---|---|---|---|
| `hud.ts:1005` Move row disabled (`commandEnabled`, `command.ts:41`: no reach and nothing to undo) | no text, the row only goes grey | Sem casa livre ao alcance | No free tile in reach | Design system "Disabled": the row says why (finding: Mover/Agir desabilitados não dizem o porquê). **CODE:** the row has no small-type slot (a `small` like `continue-where`, or `title`). |
| `hud.ts:1005` Act row disabled after acting (`command.ts:42`: `usedAbility`) | no text | Já agiu neste turno | Already acted this turn | Same. **CODE**, same slot. In deep water the existing `REASON.water` (`hud.ts:325`) is reused as is. |
| `hud.ts:900-901` Move preview on a stop that cannot hold the unit | pt `Mover: não dá para parar aqui; a unidade inteira precisa caber em chão livre e uniforme ao alcance.` / en `Move: cannot stop here; the whole unit must fit on free, even ground in reach.` (about 100 characters, over the help line) | Não dá para parar aqui: a unidade inteira precisa caber em chão livre e plano. | Can’t stop here: the whole unit needs free, level ground. | Text-review left this one long. Drops "ao alcance" (the tile is already marked) and "Mover:" (the line is under the Move screen). Same rule, 77 and 57 characters. |
| `hud.ts:911-912` target map, no preview yet | pt `Escolha o alvo na área laranja (roxo: o tiro bate no caminho).` / en `Pick the target in the orange area (purple: the shot hits something on the way).` | Escolha o alvo na área laranja. Roxo: algo bloqueia o tiro. | Pick a target in the orange area. Purple: something blocks the shot. | "Bate no caminho" reads as hitting a road. Matches the legend (`options.ts:81`, purple = in range but no sight). |
| `hud.ts:922-924` facing step | pt `Para onde olhar? Setas ou clique escolhem; Enter, ou clicar de novo na mesma direção, passa a vez.` / en `Which way to face? Arrows or click choose; Enter, or clicking the same direction again, ends the turn.` (about 100) | Para onde olhar? Escolha a direção e confirme para passar a vez. | Which way to face? Pick a direction, then confirm to end the turn. | Device neutral and about 65 characters; the keys are in Options (Controls). |
| `hud.ts:922-924`, touch variant | same line | Para onde olhar? Toque na direção; toque de novo para passar a vez. | Which way to face? Tap a direction; tap again to end the turn. | Today's line says Enter and arrows on a tablet. **CODE:** pick by `KEYS` (`hud.ts:71`). |
| `hud.ts:903`, touch variant | pt `Mover: escolha uma casa marcada.` / en `Move: pick a highlighted tile.` | Toque numa casa marcada. | Tap a highlighted tile. | "Pick" is fine with a mouse; on touch the verb is the gesture. **CODE:** `KEYS`. The target line keeps its text. |
| `hud.ts:1070-1071` Yes / No under "Ability: execute?" (not the lock choice) | `Sim` / `Não`; en `Yes` / `No` | Confirmar · Voltar | Confirm · Back | Design system "A button says what happens, with a verb". "Back" matches the Back button proposed in section 2. The Enter and Esc hints stay. |
| `hud.ts:723` ☰ item for the 3x speed | `Batalha rápida` / `Fast battle` | Batalha rápida (3×) | Fast battle (3×) | Finding "Ritmo de um golpe no toque": the 3x shortcut is hidden in the ☰ and the label does not say what it does. 19/17 characters. |

## 2. Touch and phone: controls that do not exist yet, and hints that change on touch

All **CODE** (a new control or a device check, `KEYS` at `hud.ts:71`). The proposed words are ready so the implementer does not write them again.

| Where | Today (pt / en) | Proposed pt | Proposed en | Why |
|---|---|---|---|---|
| Battle: new Back button beside the ☰ (finding "Onde fica o botão Voltar", option A). `hud.ts:48` already has `cancel()` | none (the only visible control is ☰) | Voltar (aria-label: Voltar: cancelar a escolha) | Back (aria-label: Back: cancel the choice) | **CODE.** One word, 44 px button, shown only while there is something to go back to. The aria text says what it undoes. |
| Dialogue box skip (`talk.ts:109`, finding "Pular conversa no toque") | pt `Enter segue · Esc pula` / en `Enter next · Esc skip` | touch: Toque segue · botão Pular | touch: Tap for next · Skip button | **CODE.** The PC text stays; on touch the same hint says tap, and a 44 px button reads Pular / Skip (aria: Pular a conversa / Skip the conversation). |
| Title foot (`title.ts:294`) | pt `Setas escolhem · Enter confirma` / en `Arrows choose · Enter confirms` | Toque para escolher | Tap to choose | **CODE** (`KEYS`). The foot names keys a tablet does not have. |
| Town help line (`town.ts:270`) | pt `W A S D anda · Enter fala ou entra · Esc menu` / en `W A S D walk · Enter talk or go in · Esc menu` | Toque no chão para andar · menu no canto | Tap the ground to walk · menu in the corner | **CODE** (`KEYS`). The onboarding goal tip replaces this line on the first visit; this is what comes back after it. |
| Town menu button title (`town.ts:96`) | pt `Menu da cidade (Esc)` / en `Town menu (Esc)` | Menu da cidade | Town menu | **CODE** (`KEYS`): "(Esc)" only on PC. |
| Options, Controls: new touch line (next to `options.ts:184`) | none | Toque: toque para escolher e confirmar, arraste com um dedo para mover a câmera, dois dedos dão zoom. | Touch: tap to pick and confirm, drag with one finger to move the camera, two fingers zoom. | **CODE** (one more paragraph, shown on touch). Source: `touch-input.ts:1`. (paragraph) |

## 3. Options and settings

| Where | Today (pt / en) | Proposed pt | Proposed en | Why |
|---|---|---|---|---|
| `options.ts:183-184` Controls paragraph | pt `Mouse: passe por cima para escolher, clique para confirmar, botão direito volta; arraste para mover a câmera e use a roda para o zoom. Controle: direcional ou analógico andam, A (×) confirma, B (○) volta, ombros giram a câmera, analógico direito rola a lista de turnos, Start abre este menu.` / en `Mouse: hover to pick, click to confirm, right click goes back; drag to move the camera and use the wheel to zoom. Gamepad: d-pad or stick moves, A (×) confirms, B (○) goes back, shoulders rotate the camera, right stick scrolls the turn list, Start opens this menu.` | Mouse: passe por cima para escolher, clique para confirmar, botão direito volta; arraste para mover a câmera e use a roda para o zoom. Controle: direcional ou analógico andam, A (×) confirma, B (○) volta, X (□) abre o Status, Back desfaz, ombros giram a câmera, gatilhos dão zoom, analógico direito rola a lista de turnos, Start abre este menu. | Mouse: hover to pick, click to confirm, right click goes back; drag to move the camera and use the wheel to zoom. Gamepad: d-pad or stick moves, A (×) confirms, B (○) goes back, X (□) opens Status, Back undoes, shoulders rotate the camera, triggers zoom, right stick scrolls the turn list, Start opens this menu. | Finding "Controles não cita X, Back nem gatilhos". Checked against `gamepad.ts:22-31` (button 2 = status, 8 = undo, 6 and 7 = zoom). (paragraph) |
| `options.ts:56-60` objective line, a map without a Beacon (survival branch aside) | pt `Objetivo: derrote os inimigos e proteja o Farol (o cristal azul).` / en `Goal: defeat the enemies and protect the Beacon (the blue crystal).` (shown on every map) | Objetivo: derrote todos os inimigos. (boss room: Objetivo: derrote o chefe.) | Goal: defeat every enemy. (boss room: Goal: defeat the boss.) | Finding "tela fala do Farol em mapa sem Farol". The Beacon text stays on maps that have one; `dev-menu.ts:216` already has a no-Beacon line for the dev menu. **CODE:** the branch needs `hasObjective(scenario)` (the item says to export it after `main.ts` is split). |
| New item: fps counter (`fps.ts`, finding "Contador de fps ligado de fábrica") | no item (only F3) | Contador de fps: Desligado · Ligado | FPS counter: Off · On | **CODE** (a new `choice` and a stored field). Reuses today's Off/On words (`options.ts:32-33`). Hint, small type: pt "Mostra os quadros por segundo no canto." (39) / en "Shows frames per second in the corner." (38). |
| New item: reduce motion (finding "Reduzir movimento", option B) | no item | Reduzir movimento: Do sistema · Ligado · Desligado | Reduce motion: System · On · Off | **CODE** (stored field with a `parse*`). Hint: pt "Menos tremor e giro de câmera nos golpes." (40) / en "Less shake and camera spin on hits." (35). |
| New item: vibration (finding "Vibração", option B) | no item | Vibração: Ligada · Desligada | Vibration: On · Off | **CODE**; hidden where `'vibrate' in navigator` is false (iPhone, iPad). Hint: pt "Um toque curto nos golpes fortes." (33) / en "A short buzz on heavy hits." (27). Feminine Ligada/Desligada like `options.ts:158`. |

## 4. Confirmations (second tap) and consequences

Five buttons rewrite their own label on the first press and say "Toque de novo" even with a mouse (finding "Toque de novo aparece no PC"). The proposed label is device neutral and says what is confirmed. The buttons never disarm today (finding "botões de 2º toque nunca desarmam").

| Where | Today (pt / en) | Proposed pt | Proposed en | Why |
|---|---|---|---|---|
| `crawl.ts:134-136` gate, "Nova expedição" over a live one | pt `Toque de novo: abandona a expedição atual` / en `Tap again: abandons the current expedition` | Confirmar: abandonar a expedição atual | Confirm: abandon the current expedition | Device neutral. 38/39 characters. |
| `crawl.ts:345` expedition map, Back to town | pt `Toque de novo: perde a expedição` / en `Tap again: the expedition is lost` | Confirmar: perde a expedição | Confirm: the expedition is lost | Same rule, shared with the line below. |
| `options.ts:244` Options, Leave the room | the same pair as `crawl.ts:345` | Confirmar: perde a expedição | Confirm: the expedition is lost | Same string in two files: keep them equal. |
| `options.ts:231` Options, Restart battle | pt `Toque de novo para reiniciar` / en `Tap again to restart` | Confirmar: reiniciar a batalha | Confirm: restart the battle | Says what is confirmed. |
| `saves-ui.ts:79` saved game, Delete | pt `Toque de novo: apaga` / en `Tap again: deletes` | Confirmar: apagar este jogo | Confirm: delete this game | "Apaga" alone did not say which game; the row above names it. |
| All five buttons | stay armed until pressed | no new text | no new text | **CODE:** disarm after ~4 s or when focus leaves; the label goes back to the first text. |
| `town-ui.ts:375` Party sheet, Dismiss (finding "Dispensar recruta sem segundo toque", option A) | `Dispensar` / `Dismiss`, one click and the recruit is gone (`group.ts:70` `dismiss`) | 1st press: Confirmar: dispensar `${name}` | 1st press: Confirm: dismiss `${name}` | **CODE** (flow: a 2nd press like Delete). The first label stays `Dispensar` / `Dismiss`. |
| `town-ui.ts:375`, line under the button, shown with the confirmation | none | Sai do grupo; o equipamento volta para o baú. | They leave the party; their gear returns to the chest. | Consequence, checked in `group.ts:69-86` (gear returns to the chest). **CODE** with the row above. |

## 5. Town windows: Party, Sheet, Shop, Tavern

Already proposed in `onboarding-proposal.md` and not repeated: the "camp" to "town" swap (`town-ui.ts:92,371,383`), the Shop and Tavern zero-gold line, the Sheet "half tiles" tip.

| Where | Today (pt / en) | Proposed pt | Proposed en | Why |
|---|---|---|---|---|
| `town-ui.ts:92` Party row, who goes (finding "in battle x vai à batalha") | pt `vai à batalha` / `no acampamento`; en `in battle` / `at camp` | vai à batalha / fica na cidade | goes to battle / stays in town | The two languages said different things (`in battle` is a state, `vai à batalha` an intent). The "camp" part is the onboarding swap. |
| `town-ui.ts:441-442` Sheet, empty chest | pt `O baú está vazio: compre na Loja da cidade.` / en `The chest is empty: buy at the town Shop.` | with gold: O baú está vazio. A Loja da cidade tem equipamento. (without gold: the onboarding zero-gold line) | with gold: The chest is empty. The town Shop has gear. (without gold: the onboarding zero-gold line) | A new game starts with 0 gold, so "buy" sends the player to a Shop that says "N short". **CODE:** the line reads the chest gold. |
| `town-ui.ts:427-429` Equip button, stats only in `title` (finding "números do Equipar X só no title") | `Equipar ${name}` / `Equip ${name}`; `title: itemStats(...)` | no new text: show `itemStats(...)` in small type under the label | no new text: show `itemStats(...)` in small type under the label | Touch has no hover, so the numbers never show. **CODE** (move the same string into a `small`). |
| `town-ui.ts:268` Shop, Sell tab with nothing to sell | `Vazio.` / `Empty.` | Nada para vender. O equipamento guardado no baú aparece aqui. | Nothing to sell. Spare gear in the chest shows up here. | Empty state with the next step (design system section 4). Avoids promising loot that does not exist yet. |
| `town-ui.ts:214` Shop, short of gold (`shortBy`) | pt `faltam ${n}` / en `${n} short` | faltam ${n} de ouro | ${n} gold short | "A number comes with its unit". Update the `shortBy` test with it. |
| `crawl.ts:221` town menu, last row | `Tela de título` / `Title screen` | Voltar ao título | Back to title | Verb on the button; same row, same orb. |

## 6. Expedition: map, loss and result

Already in the onboarding proposal: the map hint line, the closed-room words (`crawl.ts:308-314`), the enemy count, the heal note, the first-fall tip, the defeat wording at `crawl.ts:408`, the gate sub-line.

| Where | Today (pt / en) | Proposed pt | Proposed en | Why |
|---|---|---|---|---|
| `crawl.ts:245-246` lost screen, shown when the party left a room mid-fight and the page reloads | pt `O grupo saiu no meio da sala. Os feridos voltam à cidade.` / en `The party left in the middle of a room. The wounded return to town.` | O grupo deixou a sala no meio da luta. A expedição acabou. | The party left the room mid-fight. The expedition is over. | **Conflict with the onboarding proposal:** its defeat line (`O grupo caiu. Quem sobrou volta à cidade.`) is for `crawl.ts:408`; applied to this line it would say the party fell when it only left. This one is about leaving. Also drops "the wounded return" (no wounded state exists). |
| `tally.ts:66-67` result card, line under each hero | pt `Caído · volta com 30/120` / `Próxima sala: 90/120`; en `Fallen · back at 30/120` / `Next room: 90/120` | Caiu · volta com 30/120 de vida / Segue com 90/120 de vida | Fell · back at 30/120 HP / Goes on with 90/120 HP | The numbers had no unit. Past tense matches the hero's name on the card. 32 and 27 characters; update the `roomLine` tests. |
| `crawl.ts:339-346` Back to town on the map, before the 2nd press | no text above the button | Voltar agora perde a expedição. | Going back now loses the expedition. | The warning came only after the first press. **CODE:** a small line above the button. |

## 7. Standalone battle end

| Where | Today (pt / en) | Proposed pt | Proposed en | Why |
|---|---|---|---|---|
| `end-screens.ts:126` win note, map without a Beacon (item "tela de fim de batalha avulsa fala do Farol") | pt `Todos os inimigos caíram e o Farol resistiu.` / en `Every enemy fell and the Beacon held.` | Todos os inimigos caíram. | Every enemy fell. | The Beacon line stays on maps that have one. **CODE:** `hasObjective(scenario)` as in section 3. |
| `end-screens.ts:127` defeat note, same case | pt `O Farol caiu ou os heróis tombaram.` / en `The Beacon fell or the heroes were defeated.` | Os heróis tombaram. | The heroes fell. | Same. Mirrors the survival note (`end-screens.ts:124`). |

## 8. Errors

| Where | Today (pt / en) | Proposed pt | Proposed en | Why |
|---|---|---|---|---|
| `saves-ui.ts:14-18` full storage (`alert()`, finding "alert() nativo") | pt `O navegador está sem espaço para salvar. Apague um jogo salvo e tente de novo.` / en `The browser has no room left to save. Delete a saved game and try again.` | title: Não deu para salvar; body unchanged; button: Entendi | title: Couldn’t save; body unchanged; button: Got it | Same message, now in the game's own `dialog()` (the native box ignores the theme and the gamepad). **CODE:** `dialog()` instead of `alert()`. |
| `boot.ts:40` room that cannot be built (`alert()`, then `goHome()`) | pt `Não deu para montar esta sala da masmorra.` / en `This dungeon room could not be built.` | Não deu para abrir esta sala. Você volta para a cidade. | This room wouldn’t open. You’re heading back to town. | Says what happens next (the code goes home right after). Not "montar": the player does not build rooms. As an `alert` the text change alone works. |

## 9. How to play: the leftover "descida"

| Where | Today (pt / en) | Proposed pt | Proposed en | Why |
|---|---|---|---|---|
| `title.ts:218-219` | pt `A descida tem ${floors} andares de ${rows} fileiras de salas: em cada fileira você escolhe 1 de ${width[0]} ou ${width[1]} salas, vendo os inimigos antes. Depois do último andar vem o chefe.` / en `The descent has ${floors} floors of ${rows} rows of rooms: in each row you pick 1 of ${width[0]} or ${width[1]}, seeing the enemies first. After the last floor comes the boss.` | A expedição tem ${floors} andares de ${rows} fileiras de salas. Em cada fileira, escolha 1 de ${width[0]} ou ${width[1]} salas: os inimigos aparecem antes. Depois do último andar vem o chefe. | The expedition has ${floors} floors of ${rows} rows of rooms. In each row, pick 1 of ${width[0]} or ${width[1]}: you see the enemies first. After the last floor comes the boss. | "Descida" is the old term (the gate, the map and the loss lines already say expedição). Only needed if the onboarding "How to play" screen is not built first, since it replaces this section. (paragraph) |

## 10. Corrections to `onboarding-proposal.md` (found while checking the code)

1. **Party size.** Step 1 of the new How to play says "up to 4". The party holds up to 8 (`GROUP_MAX`, `group.ts:18`); 4 go to battle (`DEPLOY_MAX`, `group.ts:19`). Suggested: pt "Monte o grupo (até 8, quatro vão à batalha), equipe e compre." / en "Build your party (up to 8, four go to battle), equip and shop."
2. **Village or town.** Tip 9b and step 5 say "vila" / "village". The code says "cidade" / "town" everywhere (`crawl.ts:66`).
3. **Gate row.** The proposal renames the gate row to "Descer à masmorra". `text-review.md` already changed it to "Nova expedição" (`crawl.ts:128`), the term the brief asks for; keep that and add only the "3 andares e um chefe" sub-line.
4. **Lost screen.** See section 6: the defeat wording must not be applied to `crawl.ts:245`.

## 11. Reviewed, no change proposed

- `hud.ts:322-326` reasons (`Fora do alcance`, `Sem linha de visão`, `Nenhum alvo nesta casa`, `Acabou o estoque ou o MP`): short, specific, neutral rule feedback; text-review left them on purpose.
- `hud.ts:892` "pick a command" and `hud.ts:883` "Enemy turn": fine.
- Tavern reason lines (`town-ui.ts:161-168`) and the party-full text: already say the next step.
- `crawl.ts:162` "Ficar na cidade", `town.ts:333` "Voltar à rua": verbs, short.
- Not text, listed for the implementer: the `I` key and gamepad Y still generate `info` that nothing handles (`keyboard.ts:127` still lists it in this worktree: remove the row with the action); `design-system.md:195` says clicking a tile enters; the counter-attack line in the decision log contradicts the engine; the gamepad cannot reach Credits and has no Tab or F; Loja and Taverna buttons at 36 px and the language button at 32 px (below `--tap` 44); focus not returning after Como jogar, Loja or Taverna.

## 12. Order for the implementer

1. Text only, one pass, no behaviour: section 1 (except the touch variants and the two disabled-row lines), the five labels in 4, section 5 (except the Sheet empty chest and the Equip stats), the first two rows of 6, section 9, and the Controls paragraph in 3.
2. Text plus one small condition: section 7 and the options objective line, together with `hasObjective` (after `main.ts` is split); section 8.
3. Needs controls or flows, texts ready: section 2, the new options in 3, the Dismiss confirmation and the disarm in 4, the small lines in 1, 5 and 6.
