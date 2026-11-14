# Sandbox: scripted scenes and screenshots

A battle you stage from code instead of playing to it: pick a map, move heroes and enemies, open a menu or an attack
forecast, frame the camera, hide the interface and take the screenshot. It is for the UX and design work, the README
media and any agent that needs to see a screen.

It works only on `localhost` / `127.0.0.1` with `?sandbox=` in the address. The code is its own chunk
(`src/client/dev/sandbox.ts`), loaded with a dynamic import behind that check. The online game never downloads it.

## Quick start

```bash
npm run sandbox -- scripts/sandbox --sheet          # the 3 example specs -> screenshots/*.png|webp + contact-sheet.png
npm run sandbox -- my-spec.json --out shots         # one spec (a file may also hold a list of specs)
npm run sandbox -- specs/ --url http://localhost:5181   # reuse a dev server that is already running
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

Notes:

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
- **Not in the game, so not in the spec:** weather and fog. Each map has its own mood (`ambience.ts`); `daylight` is
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
__sandbox.problems;                           // what went wrong when the page loaded
```

A hand-written address works too:
`http://localhost:5181/?scenario=frost_pass&sandbox={"hide":["all"],"camera":{"angle":2}}`.

## Examples (`scripts/sandbox/`)

- `battle-ui.json`: Ash Wood. The archer aims a Shot at a soldier moved across the river, with the "Execute?" window,
  the strike strip and the shot line.
- `battle-clean.json`: the same scene with `"hide": ["all"]`, framed identically.
- `frost-pass-ambush.json`: Frost Pass, with three enemies moved next to the heroes and a wounded skeleton archer. The
  command menu is open, the camera is turned to angle 3, the output is WebP.

## How it fits

- **`src/client/dev/sandbox-spec.ts`** holds the pure part: `parseSpec`, `specUrl`, `storageFor`, `castOf`,
  `patchUnits` and `placementProblems`. Both the page and the Node CLI use it. Tested in `tests/sandbox-spec.test.ts`.
- **`src/client/dev/sandbox.ts`** does two jobs:
  - `stage(scenario)` builds the battle before the scene exists (cast, seed, actor).
  - `install(game, scene)` applies the rest and exposes `window.__sandbox`.
- **Hooks in the game:**
  - `boot()` in `main.ts`, with a separate save key and no intro talk.
  - `Game.showScreen` (a turn screen, cursor and marks set directly).
  - `BattleScene.actionCam`.
