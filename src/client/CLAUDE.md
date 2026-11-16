# src/client — browser

Applies together with the root `CLAUDE.md`. **Web on PC first** (Fernando, Nov 12): mobile only needs to open without errors; keep the media queries and touch input.

## Who owns what

- `main.ts` (`Game`): wires everything; owns the turn loop and the turn screen.
- `game/`: what opens around the battle: URL boot (`boot.ts`, `selectBattle`), title (`title.ts`), Options (`options.ts`), end windows (`end-screens.ts`), save slots window (`saves-ui.ts`), walkable town (`town.ts`, rules in `town-map.ts`), town menu, gate and expedition (`crawl.ts`).
- `command.ts`: what the menu shows and what comes next. `interaction.ts`: what the chosen tile does. Both pure and tested.
- `scene.ts` (`BattleScene`): only draws, composing `scene/` (`Board`, `Marks`, `Units`, `CameraRig`, `TileSpace`, `Timeline`), each built from what it needs.
- `hud.ts` (`BattleHud`): only shows and passes clicks along.
- `touch-input.ts` (`TouchInput`) only translates gestures and mouse; `keyboard.ts` and `gamepad.ts` translate keys and buttons into actions (pure, tested).
- `group.ts`, `chest.ts`, `saves.ts`, `store.ts`: party, gold and items, save slots, storage.
- A class holding a resource (WebGL, listeners) has `dispose()`.

## Rules

- **Logic that can be pure is pure and tested** (`command.ts`, `interaction.ts`, `turn-list.ts`, `charge-lines.ts`, `battle-face.ts`, `tally.ts`, `town-map.ts`, `group.ts`, `saves.ts`); the DOM and Three.js files only show it.
- **Interface follows the [design system](../../docs/game-design/design-system.md).** Change a token or a piece, change that document in the same commit. Colours and sizes only through the `:root` variables. A new HUD piece is a `.panel` with `.item` rows (`.focus` marks the focus), `gauge()` and `unitPanel()` from `hud.ts`. Focus outside the panels takes `--focus-halo`; a disabled button says why in its text.
- **DOM through the pieces** of `icons.ts` (`el`, `icon`, `button` for every text button, `iconButton`) and `dialog.ts` (`dialog()`, `choice()`, `slider()`). Inline `style` only for positions and sizes computed at run time. Colour is never the only signal.
- **Text the player sees:** `t('pt', 'en')` from `i18n.ts`; names via `unitName`/`abilityName`. An action's result also as text (`eventLog`, in the help line), not only the floating number.
- **Input:** keyboard, mouse and gamepad move the same cursor and go through `Game.runKey` (in the town, `Town.run`). A new key or button goes into `keyAction`, the `keyHelp` list and a `hint()` in the HUD. No keyboard `if` in the scene or the HUD.
- **Timing:** every wait and animation in battle runs on the battle clock (`BattleScene.wait`, `Timeline.animate`), so the speed-up applies. No `setTimeout` for battle timing. Flow timings live in `timing.ts`, gestures in `fx.ts`, sound in `sound.ts`.
- **Randomness:** `Math.random` only picks a new seed (`newBattle`, `startExpedition`) or drives cosmetics (town strolls, water, sound, confetti); every roll inside a battle goes through the rules' RNG.
- **Storage:** preferences and saves go through `store.ts` with the `dt:` prefix. A change of key or format goes into `MIGRATIONS` (runs once per browser, counted in `dt:migrated`), so nobody loses progress. A new progress key joins `PROGRESS_KEYS` (`saves.ts`) so it travels with its save slot. Every save read back is rebuilt by its `parse*` function.
- **Half tiles:** every battle the client opens is halved (`selectBattle`). Any screen that shows Move or Jump shows the half-tile number the game spends (sheet value x `SUB`).
- **Automation:** on `localhost` the music starts at 0, and under automation (`navigator.webdriver`) it never plays unless the URL has `?music=1`. Launch Chrome with `--mute-audio`.

## Where the detail lives

What each screen does, the request behind it and its date:

- [client-battle-screen.md](../../docs/game-design/client-battle-screen.md): turn screens, HUD pieces (turn list, faces, menu beside the unit, charge and counter lines, strike preview), windows (title, Options, volume, pixel art, performance counter, developer menu), end of battle, Until Dawn, input map.
- [client-town-expedition.md](../../docs/game-design/client-town-expedition.md): town and expedition flow, walkable town, town menu, party and recruiting, standalone crawl rooms, save slots.
- [client-scene.md](../../docs/game-design/client-scene.md): half tiles on screen, water, ambience, game feel and action camera, terrain and painted pieces, tile marks, dialogue box and music.
- [design-system.md](../../docs/game-design/design-system.md): tokens, pieces, states and contrast. Decisions: [docs/decisions.md](../../docs/decisions.md).
