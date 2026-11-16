# Onboarding proposal: text and feedback for the loop (Nov 16, 2026)

Proposal only, no code. Goal: a new player understands town, descent (rooms, node map), camp and return without long text (pillars: "understands the objective, the queue and confirm without long tutorial text", `pillars.md` goals). Tone: warm with a shadow underneath (`narrative.md`), short sentences. For the interface implementation session.

**How this was checked.** Read from the code in this worktree (file:line below, Nov 16). The browser pane refused to open the dev server (`navigation to http://127.0.0.1:5246 ... was denied`), so **nothing here was observed on screen**; every "where they get lost" is a reading of the code and marked as such. The dev server I started on port 5246 is down. Please confirm each point with a real first-time run (3 people, as the pillar asks).

**Origin tags.** `file:line` = read in code. *Deduction* = my inference from the code, to confirm by playing.

## 1. What a new player sees, stage by stage

| # | Stage | What is on screen | Where they probably get lost | Origin |
|---|---|---|---|---|
| 1 | Title | Menu rows: New game, Quick battle, How to play, Developer, Credits (+ Continue with saves). Foot: "Arrows choose · Enter confirms". | "Quick battle" and "Developer" sit beside New game and look like equal paths. "How to play" is 4th. Its text is 6 sections, about 20 long sentences; the loop (town, expedition) is the **last** section, after turns, charges and counter-attacks. It is only reachable from the title (nothing in town or Options opens it). | `title.ts:277-289`, `title.ts:120-229`; `grep "howToPlay"`: only `title.ts` |
| 2 | Town (first walk) | Walkable village, hero on the south road. Help line: "W A S D walk · Enter talk or go in · Esc menu" until something is in reach. Party members wait by the Guild saying "Ready when you are". | No goal is stated. The gate is at the far north (`TOWN_PLACES` gate y=0, start y=11). Townsfolk lines are flavour, with one useful hint each at best (Mira: tavern hires for 200 gold). *Deduction:* a player who walks to the first building they see (Shop) never learns that the gate is the point. | `town.ts:270`, `crawl/town.ts` places and `TOWNSFOLK`, `GUILD_LINE` |
| 3 | Preparation (Party, Sheet, Shop, Tavern) | Party list: "N of 4 go to battle", rows say "in battle" or "**at camp**". Sheet button "Leave at camp". Shop: Buy rows with "N short". Tavern: Recruit 200 gold. | (a) **"camp" means "left in town"** here, but in the loop "camp" is the rest stop inside the dungeon (decision 4 of the loop notes). Two meanings for one word. (b) A new game starts with **0 gold and an empty chest** (`newGame` writes `data: {}`, `parseChest` defaults to 0 and `[]`), so every Buy is off with "N short", Recruit is off, and the Sheet says "The chest is empty: buy at the town Shop": a loop with no way out. The code has **no gold or loot income** (no reward code outside `chest.ts` selling). *Deduction:* the player thinks the game is broken or that they must grind something unnamed. (c) Stats line "Speed 8 · Move 8 · Jump 4" in half tiles has no help at the point of use (it is in How to play only). | `town-ui.ts:92,115,371,441`; `saves.ts:112-115`; `chest.ts:13-20`; `grep -rn "gold"` and `reward/loot` found no income |
| 4 | Choosing the destination | Walking into the gate opens a window with "Go on the quest" (primary) and "Stay in town". With a live expedition: "Continue the expedition (floor 2 of 3)" first, and the quest row asks a 2nd tap. | "quest" is jargon from the old campaign; it does not say where it leads, how deep, or that there is a boss. There is **one** gate and one destination (the three `CRAWL_THEMES` are look only), so "choosing" is only "go or stay". The abandon warning exists and is clear. | `crawl.ts:110-145,149-168`; `rooms.ts:63-110` |
| 5 | Node map (expedition screen) | Title "Dungeon · floor 1 of 3". A legend panel of the party's life ("Ana · Warrior · HP 120/120"). One row of buttons per row of rooms: each button = enemy group name over the enemy list; the open ones are primary, the others off with a reason in brackets. "Back to town" (2nd tap: "the descent is lost"). | No line says what to do ("pick a room"). The map is stacked buttons with no links, so it does not read as a map of nodes (decision 21). **Picking a room closes its row-mates**, and the player only learns it afterwards from "path not taken". "opens after the one before" reads as a bug, not a rule. Enemy names alone do not say how dangerous a room is. | `crawl.ts:299-358` (`state` strings at 308-314) |
| 6 | Room (battle) | The tactical battle. Help line "Ana: pick a command." No banner at the start. | **No objective.** The start banner is only for Until Dawn (`announce(survivalGoal)`, `main.ts:899`); a crawl room says nothing. The win rule is "no enemies left" (`combat.ts:523`) but the player is never told. First-time battle UI (menu, queue, hit chance) is covered by the existing HUD and is out of scope here. Leaving through Options is guarded by a 2nd tap ("the expedition is lost"). | `main.ts:899`, `hud.ts:879-890`, `combat.ts:523`, `options.ts:239-247` |
| 7 | End of a room | Result board: "Room cleared!" / "Floor 1 cleared!", one card per hero ("Next room: 90/120" or "Fallen · back at 30/120"), columns Floor and Rooms cleared, a note, button "On to the map". | The note for "floor cleared" is 2 clauses and 3 numbers (about 150 characters). Nothing says that **the fall is not permanent** (it is said only for the fallen card). No gold or loot line exists. "The wounded return to town" (defeat) promises a state the town never shows. | `crawl.ts:383-427`, `tally.ts:62-68`; party list in town shows no life (`town-ui.ts:61-105`) |
| 8 | Camp | **Does not exist.** Between rooms the game heals automatically (+25% per room, +50% per floor, fallen back at 25%). | Nothing to teach yet; but the player is never told that this heal is automatic and temporary (the camp will replace it). | `rooms.ts:112-124` (comment: "provisional until the camp exists"); loop decisions 4, 26, 38 |
| 9 | Return | After the boss: "Expedition complete!", "The dungeon's boss fell. The party returns to town." Then the walkable town, same as the first time. | The town does not acknowledge the return (the narrative draft has the "First return" scene: bell, soup, ledger; no code). With no gold or loot reward, the player does not know why they came back or what to do next (heal? buy? go again?). | `crawl.ts:395-412`; `narrative.md` "Return events" |

## 2. Contextual help, one per point

Rules for all of them (no new component):

- **Trigger "once"** means: shown the first time per device, then never again. Stored in one small key (for example `dt:seen`, a list of tip ids, outside the save slots so a second New game does not repeat them). Proposal for the code side: one helper `tipOnce(id, pt, en)`; this document does not write it.
- **Where they live**, all existing pieces: the town help line (`.help.town-prompt`), a first `.learned` line inside a dialog (the Tavern's "why" line, `town-ui.ts:179`, `style.css:415`), the 2.2 s `announce()` banner (`main.ts:905`), a button's `small.continue-where` sub-line, and the Result board `note`.
- **Size.** Every text is at most 80 characters. At 360 px the `--fs-sm` (16 px) line holds about 36 characters, so a tip wraps to 2 or 3 lines; the help line and `.learned` already wrap. `announce()` is large type (`.announce`): keep its text under 40 characters and check at 360 px.
- **Tone.** Short, warm, no exclamation. "You", not "the player".

| # | Point | Proposed text (pt / en) | Trigger | Where |
|---|---|---|---|---|
| 1 | Title: where to start | No text. Reorder when there are no saves: New game, **How to play**, Quick battle, Credits, Developer last. Row label "Como jogar" / "How to play" stays. | always (layout) | title menu (`title.ts:259-289`) |
| 2 | Town: the goal | pt "Quando o grupo estiver pronto, o portão ao norte leva à masmorra." (66) / en "When the party is ready, the north gate leads down into the dungeon." (68) | First time in town of a new game, replacing the walk-keys line, until the gate window is opened once. | town help line (`town.ts:270`) |
| 3a | Party: "camp" wording | Replace the words, no tip: "no acampamento" → "na cidade" / "at camp" → "in town"; "Deixar no acampamento" → "Deixar na cidade" / "Leave at camp" → "Leave in town". Frees "acampamento" for the dungeon camp. | always | `town-ui.ts:92,371,383` |
| 3b | Shop and Tavern with 0 gold | pt "Ouro vem do que o grupo traz da masmorra." (41) / en "Gold comes from what the party brings back." (43). **Only once an income exists**; until then pt "Ainda sem ouro: o grupo parte com o que tem." (44) / en "No gold yet: the party sets out with what it has." (49). | Shop or Tavern opened with 0 gold, once | first `.learned` line of the Shop and Tavern (`town-ui.ts:179` pattern) |
| 3c | Party: numbers | pt "Movimento e Salto contam em meias casas." (40) / en "Move and Jump count in half tiles." (34) | first time the Sheet opens | `.learned` line on the Sheet, above the numbers |
| 4 | Gate window | Rename the row: "Ir para a quest" → pt "Descer à masmorra" / en "Go down the dungeon". Sub-line (`small.continue-where`): pt "3 andares e um chefe" / en "3 floors and a boss" (numbers from `CRAWL_RUN.floors`). 2nd-tap texts stay as they are. | always | `crawl.ts:126-143` |
| 5a | Node map: what to do | pt "Escolha uma sala. As outras desta fileira se fecham." (53) / en "Pick a room. The others in this row close." (43) | first time the map opens | first `.learned` line of the dialog, above the party legend |
| 5b | Node map: closed rooms | Replace the bracket words. pt "(vencida)" / "(fechada)" / "(depois da anterior)"; en "(cleared)" / "(closed)" / "(after the one before)". Same meaning, shorter and without "path not taken", which sounds like an error. | always | `crawl.ts:308-314` |
| 5c | Node map: danger | pt "Inimigos: 3" / en "Enemies: 3" in the sub-line before the names (`foes.enemies.length`); nothing else until balance gives a real danger number. | always | room button sub-line |
| 6 | Room: the objective | pt "Derrote todos os inimigos." (25) / en "Defeat every enemy." (19) | start of **every** crawl room (a short banner is cheap and does not need a flag); on a boss room: pt "Derrote o chefe." / en "Defeat the boss." | `announce()` in `main.ts` (today survival only) |
| 7a | Room end: heal rule | pt "Quem ficou de pé recupera 25% da vida. Quem caiu volta com 25%." (63) / en "Whoever stood recovers 25% of life. The fallen come back at 25%." (63). Floor version: append pt "Ao descer: mais 50%." (20) / en "Going down: 50% more." (21), as a second line of the board. | each room end (replaces the two-clause note); numbers from `CRAWL_RUN` | Result board `note` (`crawl.ts:406-421`) |
| 7b | First fall | pt "Cair não é o fim: quem cai volta, com pouca vida." (49) / en "Falling is not the end: the fallen come back, weak." (51) | first room end with a fallen hero, once | Result board `note`, above the heal rule |
| 8 | Camp (future) | Not written for a mechanic that does not exist. Stub: pt "No acampamento cada um faz uma coisa. Gaste com cuidado." / en "At camp each one does one thing. Spend with care." | first camp, once | camp window `.learned` line |
| 9a | Defeat wording | pt "O grupo caiu. Quem sobrou volta à cidade." (40) / en "The party fell. Those left return to town." (42), instead of "the wounded return to town", until the town shows a wounded state. | defeat | `crawl.ts:245,408` |
| 9b | Return to town | pt "De volta à vila. Prepare-se e desça de novo." (43) / en "Back in the village. Get ready and go down again." (48) | first return to town after an expedition, once | town help line, like tip 2 |

## 3. "How to play" screen (short)

Today's screen (`title.ts:120-229`) is the **rules reference**: keep it, but rename it "Regras da batalha" / "Battle rules" and move its "Town and expedition" section out (the new screen replaces it).

New screen **"Como jogar" / "How to play"**: a `dialog('title', ...)` like the others, 5 steps, each a bold step title plus one line (a `ul.legend` with `strong`, no new CSS), a primary Back, and a secondary "Regras da batalha" / "Battle rules" that opens the old one. Numbers are read from `CRAWL_RUN` and the group rules, like `jumpHelp()`. It must fit 1280x720 with no scrolling and read at 360 px (5 steps x 2 lines).

| Step | Title (pt / en) | Line (pt / en) |
|---|---|---|
| 1 | Prepare-se / Get ready | pt "Monte o grupo (até 4), equipe e compre na Loja." (47) / en "Build your party (up to 4), equip and shop." (43) |
| 2 | Desça / Go down | pt "O portão ao norte leva à masmorra: 3 andares e um chefe." (56) / en "The north gate leads down: 3 floors and a boss." (47) |
| 3 | Escolha a sala / Pick a room | pt "Em cada fileira, uma sala. Você vê os inimigos antes." (53) / en "One room per row. You see the enemies first." (44) |
| 4 | Lute com calma / Take your time | pt "Turnos: a fila mostra quem joga, e a chance de acerto vem antes." (64) / en "Turns: the list shows who acts; hit chance comes first." (55) |
| 5 | Recupere-se e volte / Recover and return | pt "Entre salas o grupo se recupera um pouco. Depois do chefe, volta à vila." (73) / en "The party heals a little between rooms. After the boss, back to the village." (77) |

A sixth step, "Acampe" / "Camp", is added when the camp exists (what the rest stop costs, what food gives).

**Shortcuts** (all existing places):

1. Title: the row "Como jogar", second when there are no saves (tip 1), unchanged position with saves.
2. Town menu: a row "Como jogar" with a blue orb above "Title screen" (`crawl.ts:219`). The town has no Options today (`options.ts:27` comment), so the menu is the only place.
3. Options: a row in the Game section (to confirm in `options.ts`, which I read only partly: lines 1-40, 215-250).
4. Optional, cheap: after tip 2 has shown once, the town help line adds "H: how to play" once. Skip if the town menu row is enough.

## 4. Missing feedback

| Feedback | Today | Proposal | Depends on |
|---|---|---|---|
| **What the bag weight does** | No bag in code (`grep bag/weight` finds nothing in the game). Decisions: 40 kg shared, equipped gear does not count, you **cannot pick up** past the limit, no slowness (loop 14, 19, 37). | A counter "Bolsa 12/40 kg" / "Bag 12/40 kg" in the `.gold` counter piece (`goldNote`, `town-ui.ts:217`) on the Shop and the packing window; the Buy button off with its reason in small type, per the Disabled rule: pt "bolsa cheia" / en "bag full" (like "20 short"). Tip, once: pt "Passou de 40 kg, nada mais cabe." (31) / en "Past 40 kg, nothing else fits." (30). In a room, loot you cannot take says the same. | Bag (not in code) |
| **What "wounded" means** | Fallen heroes get a card line "Fallen · back at 30/120" (`tally.ts:66`); in battle the face turns "wounded" under 30% life (`battle-face.ts:30`). No word "wounded" for the party, no state in town. | One definition, used everywhere: pt "Ferido: volta com 25% da vida e precisa descansar." (50) / en "Wounded: back with 25% life and needs rest." (44). Show a "Ferido" / "Wounded" tag in the expedition map legend next to the life number (`crawl.ts:292`) while below 30%; in town, a tag on the Party row once wounded persists between expeditions. Until then, do not say "the wounded return" (tip 9a). | Wounded state kept between expeditions (loop 5, 34); the map tag works today |
| **What food gives** | No food, no camp, no cooking in code (`grep cozinh/food/comida`: none). Decisions: food heals and buffs, buff lasts the floor, **no food, no camp heal, no extra punishment** (loop 4, 31, 36). | Camp window row per food item: name, what it gives, weight: pt "Ensopado: +30 de vida, dura o andar." / en "Stew: +30 life, lasts the floor." (numbers from data). Empty state per the design system ("an empty state says the next step"): pt "Sem comida: nada a cozinhar. Use o que sobrou ou volte à vila." (60) / en "No food: nothing to cook. Use what is left or head back." (56). | Camp, kitchen, bag |
| **Where gold comes from** | No income in code (see stage 3). The gold counter appears only inside the Shop and Tavern. | After income exists: a line in the Result board columns "Ouro: +40" / "Gold: +40" (the board already has `cols`, `crawl.ts:402-405`), and the current gold on the town help line corner or the menu. Before: tip 3b. | Gold or loot income |
| **The automatic heal is temporary** | Heal numbers live in the board note only (`crawl.ts:415-421`). | Tip 7a covers it today; when the camp exists, the board stops healing and says pt "Descanse no acampamento." / en "Rest at camp." | Camp |
| **A room's danger** | Enemy names only. | Tip 5c (enemy count) now; a danger word only when balance defines it. | Balance data |

## 5. Implementation order (cost x benefit) and dependencies

| Order | What | Cost | Benefit | Needs unbuilt mechanics? |
|---|---|---|---|---|
| 1 | Room objective banner (tip 6) | very low (a call in `main.ts`) | high: the only battle with no stated goal | no |
| 2 | Wording fixes: "camp" to "town" (3a), gate row and sub-line (4), closed-room words (5b), defeat line (9a), shorter heal note (7a) | low (strings only, 4 files) | high: removes two false promises ("camp", "the wounded return") and the jargon "quest" | no |
| 3 | Node-map hint line (5a) and enemy count (5c) | low | high: the map is the new screen | no |
| 4 | Town goal tip (2) and the `tipOnce` helper with its `dt:seen` key | low to medium (one helper, tested like the other `parse*`) | high: a new player's first minute | no |
| 5 | New "Como jogar" screen, rename the old one "Regras da batalha", the three shortcuts | medium (one dialog, two rows) | high: replaces a 20-sentence wall | no |
| 6 | First-fall tip (7b), Sheet numbers tip (3c), return tip (9b) | low | medium | no |
| 7 | "Wounded" tag in the expedition map legend | low | medium | no (the tag works from current life) |
| 8 | Zero-gold empty states (3b, first text) | low | medium, but a **stopgap** that exposes the bigger gap: no gold income | no, but the real fix needs income |
| 9 | Gold line on the Result board, Bag counter and its reasons, camp window, food rows, wounded in town | medium to high | high once built | **yes: gold or loot income, bag, camp, kitchen or food, a persistent wounded state** (none exist in code) |

**Marked as not existing in the code (Nov 16):** bag and weight, camp and its actions, kitchen and food, gold or loot income, a persistent wounded state, multiple destinations (one gate). Everything in rows 1 to 8 works today; row 9 and the "(future)" texts wait for those mechanics.

**Conflicts to settle before implementing** (not decided here):

- Loop decision 32 says returning keeps loot, but the map's 2nd tap says "the descent is lost" (`crawl.ts:345`). Fine while there is no loot; the text must change when loot exists.
- Pillar 6 says "grim"; this proposal follows the narrative grill ("warm with a shadow") as the draft does (`narrative.md` conflict 1).
- Tip 3b depends on a decision not yet made: where gold comes from (loop 12: selling loot and leftover ingredients).

## 6. Design-system fit

- Pieces used: `dialog()`, `button()`, `el()`, `.legend`, `.learned`, `.camp-list` rows from `commandRow()`, `small.continue-where`, the Result board `note`, `goldNote`/`.gold`, `announce()`. No new piece, no new token.
- Copy rules (`design-system.md` section 4): verbs on buttons ("Descer à masmorra"), numbers with units ("40 kg", "3 andares"), empty states that say the next step.
- All text through `t('pt', 'en')`; numbers from `CRAWL_RUN` so a balance change does not leave stale text.
- Not checked: the 360 px width on screen (the 80-character limit is a length estimate), `announce()` size at 360 px, a physical gamepad on the new rows.
