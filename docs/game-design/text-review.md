# Text review (pt/en player-facing strings)

Scope: `src/content/*.ts` and every `t('pt', 'en')` in `src/client`. Names of classes, abilities, items, maps, enemy groups and townsfolk were checked pt against en and across screens: no spelling differences found. Party/Grupo, Shop/Loja, Tavern/Taverna, chest/baú, camp/acampamento are used consistently.

## Fixed

| Where | Before | After |
|---|---|---|
| `src/client/hud.ts:145` (+ `tests/hud-log.test.ts:32`) | pt `Soldado errou (40%)` (reads as the soldier missing; the event's unit is the target; en said `missed Soldier`) | pt `errou Soldado (40%)` |
| `src/client/game/crawl.ts:128` | `Ir para a quest` / `Go on the quest` | `Nova expedição` / `New expedition` |
| `src/client/game/crawl.ts:345` | `perde a descida` / `the descent is lost` (Options says expedition) | `perde a expedição` / `the expedition is lost` |
| `src/client/game/title.ts:214-215` | `começa a quest` / `starts the quest` | `inicia a expedição` / `starts the expedition` |
| `src/client/game/title.ts:143` | en `standalone battles` (title button is Quick battle) | `quick battles` |
| `src/content/crawl/town.ts:64`, `title.ts:214-215` | place `Encantador` / `Enchanter` while the townsfolk and the coming-soon text say the enchantress | `Encantadora` / `Enchantress` |
| `src/client/game/title.ts:~172` | en `you lock it on the character` | `you lock on the character` |
| `src/client/game/title.ts:104`, `src/client/town-ui.ts:74` | en straight apostrophe (`file's`, `${u.name}'s`) while the rest uses `’` | `’` |

## Not fixed (needs a decision or is not just text)

- Long lines for a ~360 px screen (measured by eye, not rendered): `hud.ts:898` (`Mover: não dá para parar aqui; a unidade inteira precisa caber…`), `game/options.ts:183` (controls paragraph), `game/title.ts:216-224` (How to play paragraphs, town and expedition). They are paragraphs in scrolling windows, so they wrap; shortening would lose rules. Suggest a mobile pass when mobile starts.
- `hud.ts:188-189`: `Força (PA)` / `Physical attack (PA)` and `Magia (MA)` do not match `Poder físico/mágico` (`hud.ts:172-173`). They belong to the FFT study panel, so left alone. Suggest `Ataque físico (PA)` if that panel ever ships.
- `hud.ts:85` vs `428`: the ability stat is `acerto`/`accuracy` and the forecast chance is `acerto`/`hit`. Same pt word, two en words. Left: changing en `hit` to `accuracy` would blur the forecast. Suggest `chance de acerto` in the forecast if players get confused.
- `town.ts` place `Ferreiro` / `Blacksmith` names a person, not the shop (`Ferraria` would match `Taverna`, `Loja`). Left: the title text and townsfolk refer to it by this name; suggest renaming together.
- Tone: the town and end-screen lines are warm with a dark edge; the HUD/help lines are neutral and technical (`Acabou o estoque ou o MP`, `Nenhum alvo nesta casa`). Left as is: they are rule feedback, not narrative.
- Gates note: `npm run lint` fails on CRLF line endings of files this review did not touch (`*AGENTS.md`, `src/shared/battle/rng.ts`, `tests/setup.ts`, `tests/sound.test.ts`), a checkout artifact. The edited files pass biome; typecheck, vitest (640 passed, 1 skipped) and vite build pass.
