# Sandbox: scripted scenes, screenshots and gameplay clips

A battle you stage from code instead of playing to it: pick a map, move heroes and enemies, open a menu or an attack
forecast, frame the camera, hide the interface and take the screenshot. Add `steps` and the units walk, strike and wait
through the game's own rules and animation, recorded as a video clip. It is for the UX and design work, the mechanics
and game-feel lab, the README media and any agent that needs to see a screen.

It works only on `localhost` / `127.0.0.1` with `?sandbox=` in the address. The code is its own chunk
(`src/client/dev/sandbox.ts`), loaded with a dynamic import behind that check. The online game never downloads it.

## Quick start

```bash
npm run sandbox -- scripts/sandbox --sheet          # the 3 example specs -> screenshots/*.png|webp + contact-sheet.png
npm run sandbox -- my-spec.json --out shots         # one spec (a file may also hold a list of specs)
npm run sandbox -- specs/ --url http://localhost:5181   # reuse a dev server that is already running
npm run sandbox -- scripts/sandbox/clips --video --out clips   # gameplay clips: clips/<name>.webm + .mp4 + clips.json
```

The CLI (`scripts/sandbox.mjs`) does three things:

- It starts its own Vite dev server on port 5290 (or the next free one), so it always shows the current code with no
  build step.
- It opens every spec in one headless Chrome, muted with `--mute-audio`, giving each spec a fresh context with empty
  saves.
- It writes `<out>/<name>.png`, or `.webp` when the spec sets `"format": "webp"`. `--sheet` adds `contact-sheet.png`,
  which shows every shot of the run in a grid.

A spec with a problem fails before Chrome opens if the shape is wrong. Otherwise it fails on the page: a unit on a wall,
a tile that is already taken, an ability the unit lacks. The CLI prints the reason and exits with code 1.

**Same spec, same picture.** For battle specs the page runs on Playwright's fake clock:

- The clock stands still while the page loads, however long that takes, then runs exactly 3 s of page time.
- `Math.random`, which only draws the water splashes, uses a fixed seed.
- CSS animations are stopped for the shot.

Measured: two runs of the same spec gave byte-identical PNGs. The fps counter reads that fake clock, so its numbers
mean nothing in a shot; hide it with `"hide": ["fps"]`. `path` specs (world map, title) are not frozen. They wait for
the network to go idle.

## Scene spec

JSON, checked by `parseSpec` (`src/client/dev/sandbox-spec.ts`). Unknown keys are errors, so a typo never yields a
different picture.

| Key | Value | When it applies |
|---|---|---|
| `name` | output file name (default: the spec file name) | CLI |
| `scenario` | map id: `skirmish`, `beacon_hill`, `flooded_crypt`, `crypt_heart`, `ash_wood`, `frost_pass` (also `survival`, `half`, `fft-gariland`) | page load |
| `stage` | campaign stage index (0-6); the CLI unlocks it | page load |
| `path` | any other page with no staged battle, e.g. `"/?world"` (a hero is seeded) or `"/"` (title) | page load |
| `seed` | battle dice (default 1) | page load |
| `lang` | `"pt"` or `"en"` (the CLI defaults to `en`) | page load |
| `viewport` | `{ "width": 1600, "height": 900 }` (default) | CLI |
| `format` | `"png"` (default) or `"webp"` | CLI |
| `units` | `{ "<unit id>": { "x", "y", "facing", "hp", "ct", "remove": true } }` | load; live (no `remove`) |
| `add` | `[{ "id", "def", "team": "hero" \| "enemy", "x", "y" }]` | page load |
| `actor` | the hero whose turn it is (default: the first hero that plays) | load and live |
| `screen` | `"menu"`, `"abilities"`, `"move"`, `"facing"` or `{ "aim": "<ability>", "target": {x,y}, "confirm": true }` | load and live |
| `cursor` | `{x,y}`: the tile under the cursor (tile info, target panel, move preview) | load and live |
| `camera` | `{ "angle": 0-7, "zoom": 1.5, "focus": {x,y}, "action": { "from": "<unit id>", "to": {x,y} } }` | load and live |
| `hide` | any of `tile`, `queue`, `help`, `banner`, `tools`, `menu`, `units`, `strikes`, `numbers`, `fps`, `dialogs`, `marks`, or `all` | load and live |
| `pixel` | `0` (plain 3D), `2`, `3`, `4`: pixel-art block size | load and live |
| `daylight` | `0` night to `1` day: the light that Until Dawn and the dark stages use | load and live |
| `steps` | `[{ "move": { "unit", "to": {x,y} } }, { "act": { "unit", "ability", "target": {x,y} } }, { "wait": { "unit", "facing"? } }]` | played after the scene settles (CLI) or by `play` |

Notes:

- **Whole tiles:** every `x`, `y` in a spec (units, `add`, `screen.target`, `cursor`, `camera.focus`,
  `camera.action.to`, `steps[].move.to`, `steps[].act.target`) is a whole map tile, the way the map files count them. Game battles run on the split map
  (half tiles, `src/shared/battle/half.ts`), so the sandbox turns each tile into the corner cell of its 2x2 square
  and each `add` sheet into its 2x2 token, the same way the map's own spawns are split. Problems and `list()` speak
  in whole tiles too (`list()` shows `x.5` for a token standing between tiles).
- **Units:** unit ids are the map's spawn ids (`h-archer`, `e-brute`…). `__sandbox.list()` shows them with their
  positions. `facing` is an index into `FACING`: 0 +y, 1 +x, 2 −y, 3 −x. A unit is valid on ground it can stand on (deep
  water included) that is inside the map and free, across every tile of a large unit's footprint
  (`placementProblems`). A cast that does not fit falls back to the map's own cast and reports why.
- **`add` and `remove` only at load:** models load with the map, and a unit removed on a live page would be drawn as a
  corpse.
- **Camera:**
  - `angle` is one of the 8 rotations, 45° apart; 0 is the opening view.
  - `zoom` is relative to the whole map: 1 shows all of it, 2 is twice as close.
  - `action` runs the strike camera from that unit to the tile, as during an attack.
- **Hiding:** panels are hidden with `visibility`, so they keep their space and the camera frames the map exactly as
  with the interface on (compare the two Ash Wood examples). `marks` removes the 3D tile marks, cursor, range ring and
  shot line, and stays off through the game's own redraws.
- **Turns:** the AI never plays on its own, because the sandbox puts a hero on the turn. The opening conversation of a
  stage is skipped. Acting in the battle by hand saves to `dt:battle:sandbox`, never to the real save.
- **Restart resets the sandbox:** Options → Restart builds a new battle the sandbox no longer holds; reload the
  page (or `load`) to go on scripting.
- **Saves in a dev browser:** `load` only raises campaign progress and keeps an existing hero, because those are the
  real saves there. The CLI's fresh contexts start empty.
- **Steps** (see [Gameplay clips](#gameplay-clips)): played in order, each one only after the last has settled. A
  step whose unit does not have the turn gets it first, as if the queue had reached it; any unit that plays may take a
  step, enemies included.
- **Not in the game, so not in the spec:** weather, fog and unit status effects. Each map has its own mood (`ambience.ts`); `daylight` is
  the only light control.

## Live API: `window.__sandbox`

On a page opened with `?sandbox=`:

```js
await __sandbox.idle();                       // waits until every unit holds still on screen, then 300 ms for the menus
__sandbox.list();                             // maps, stages, unit defs, panels, the units here (id, def, team, x, y, hp, ct, facing)
__sandbox.apply({ camera: { angle: 3, zoom: 2 }, hide: ['all'] });                 // returns the problems ([] = ok)
__sandbox.apply({ units: { 'e-brute': { x: 4, y: 5, hp: 10 } }, actor: 'h-mage', screen: 'abilities' });
__sandbox.apply({ screen: { aim: 'firebolt', target: { x: 4, y: 5 }, confirm: true } });
__sandbox.load({ scenario: 'crypt_heart', lang: 'pt', seed: 4 });                  // another map, cast, seed or language: reloads
await __sandbox.play({ act: { unit: 'h-archer', ability: 'shot', target: { x: 5, y: 3 } } });  // one step or a list; returns the problems
await __sandbox.play(__sandbox.spec.steps);   // the steps of the spec in the address
__sandbox.problems;                           // what went wrong when the page loaded
```

A hand-written address works too:
`http://localhost:5181/?scenario=frost_pass&sandbox={"hide":["all"],"camera":{"angle":2}}`.

## Gameplay clips

`steps` turn a scene into a short piece of play, and `--video` records it.

- **The game's own path.** Each step calls the `Battle` method the turn screen calls (`move` and `act`, as
  `interaction.ts` `confirm` does; `face` and `endTurn` for `wait`) and plays the events through `Game.animate`: the
  walk and jumps, the ability banner, the action camera, the floating numbers, the shake of a strike of 25% of life or
  more. Nothing is drawn by the sandbox itself.
- **What differs from a real turn.**
  - `wait` passes the turn without the facing screen. The AI never plays: the next step gives the turn to its own unit.
  - The scene's camera is kept, so the camera does not follow the cursor to the next actor.
  - A battle that ends shows no end screen.
  - Giving the turn to another unit mid-turn skips the previous unit's turn end: its CT is not charged and its undo
    history stays, so the menu may offer "Undo move", which would restore the previous unit's step. A `wait` for a unit
    below 100 CT leaves it with a negative CT. Specs set the CT they need (`units.<id>.ct`).
- **A step that cannot be played stops the run with its reason:** a tile out of reach, an ability the unit lacks, out
  of range, already acted, the battle already over. A step never does nothing in silence. A shot with no line of sight
  is not refused: as in the game, it fires and stops at the first obstacle or unit on its path.
- **Charged actions** (Blast) fire inside `endTurn`, when their ticks run out before anyone reaches 100 CT. A `wait` after
  the charge plays the blast, provided the spec gives the other units a low `ct`. Otherwise the turn queue reaches someone
  first (`clips/blast-charge.json`).

**`--video`** (`npm run sandbox -- <specs> --video [--out dir]`):

- **Real time.** Chrome runs with no fake clock, 1280x720 (or the spec's `viewport`), with Playwright's `recordVideo`.
  The battle clock follows the wall clock, so a slow frame rate makes the clip choppy, never slow.
- **Cut.** The scene loads and settles, then the steps play. The clip starts 0.5 s before the first step and runs 1.2 s
  after the last.
- **ffmpeg.** With `ffmpeg` on the PATH the load is cut out, giving `<name>.webm` (VP9) and `<name>.mp4` (H.264).
  Without it, the raw recording is kept whole and `clips.json` gives the second where the action starts.
- **`clips.json`** in the output folder lists each clip with its spec file, the spec itself, and the game commit, branch
  and dirty flag (a change to a tracked file; untracked files such as the clips themselves do not count) it was
  recorded from. Recording a clip again replaces its entry; other keys of the file stay.
- **Before and after.** The same specs, recorded on another commit (a proposal applied), give a comparison.
- **The specs.** `scripts/sandbox/clips/` holds one spec per mechanic: walk, climb and drop, leap over water, hit, miss,
  heavy hit, shot, push into a fall, death, Fire Bolt and the charged Blast. Their seeds were picked so the dice give the
  named outcome. `tests/sandbox-spec.test.ts` plays each one on the split map, as the page does, and checks it.
- **The interface.** The clip specs hide every panel except the ability banner and the damage numbers.
- **Without `--video`.** The same specs give a screenshot of the scene after the steps (fake clock, run in slices until
  the steps end).

## Examples (`scripts/sandbox/`)

- `battle-ui.json`: Ash Wood. The archer aims a Shot at a soldier moved across the river, with the "Execute?" window,
  the strike strip and the shot line.
- `battle-clean.json`: the same scene with `"hide": ["all"]`, framed identically.
- `frost-pass-ambush.json`: Frost Pass, with three enemies moved next to the heroes and a wounded skeleton archer. The
  command menu is open, the camera is turned to angle 3, the output is WebP.

## How it fits

- **`src/client/dev/sandbox-spec.ts`** holds the pure part: `parseSpec`, `specUrl`, `storageFor`, `castOf`,
  `patchUnits`, `placementProblems`, `giveTurn` and `playStep`. Both the page and the Node CLI use it. Tested in `tests/sandbox-spec.test.ts`.
- **`src/client/dev/sandbox.ts`** does two jobs:
  - `stage(scenario)` builds the battle before the scene exists (cast, seed, actor).
  - `install(game, scene)` applies the rest and exposes `window.__sandbox`.
- **Hooks in the game:**
  - `boot()` in `main.ts`, with a separate save key and no intro talk.
  - `Game.showScreen` (a turn screen, cursor and marks set directly).
  - `Game.playStep` (a step's events through `animate`, then the turn menu).
  - `BattleScene.actionCam`.
