# Warlock Wars assets

Index of all the art, sound and fonts in the project, so people and AIs know what already exists before looking for or creating something new. **Every new asset goes in here** (rule at the end of the page).

- What is in `public/` goes to the live game on each deploy; what is in `assets/` is a library for contributors and does **not** go live.
- Credit and licence of each published file: [`public/CREDITS.txt`](../public/CREDITS.txt).

## Visual identity

- **Theme:** dark fantasy of dark stone, lava and gold. The colours are all in the `:root` variables of [`src/client/style.css`](../src/client/style.css): background `--bg #140806`, panels `--panel`/`--panel2`, lava `--lava #ff6a1a`, ember `--ember #ffb347`, gold `--gold #ffd666`, text `--fg #f7ecdf`. Loose colours in the code are not allowed (rule in `CLAUDE.md`).
- **Colour by spell group:** Attack `#ff6b4a`, Mobility `#8be36a`, Defence `#5fb0ff`, Control `#c58bff`, Items silver `--item #c9d4e0`.
- **Panels:** aged metal with a thin gold border and rivets in the corners (`--plate`, `--plate-edge`, `--frame`).
- **Fonts** (Google Fonts, loaded in `index.html`): titles in **Grenze** (`--display`), text in **Alegreya Sans**.
- **Dungeon Tactics (Oct 25):** text in **Alegreya Sans** (`--font`) and titles, Confirm, queue and floating numbers in **Tiny5** (`--font-px`, SIL OFL 1.1, Google Fonts, loaded in `index.html`). Chosen among Pixelify Sans, VT323, Silkscreen, Jersey 10, Micro 5, Handjet and DotGothic16: Pixelify made the "2" look like an "8" and the "fi" ligature turn into an "A". The frame of panels and buttons is pure CSS (variables `--frame`, `--trim`, `--bevel-*` in the `:root` of `src/client/style.css`), with no image. The logo's W uses Grenze Gotisch, only drawn in the SVG.
- **3D:** low-poly from **KayKit** (flat colours with a small palette texture), top-down view like Dota. A new model must be KayKit or in the same style; the `legado-*` packs are from an older KayKit phase and stand out a little.
- **Icons:** game-icons.net silhouettes in a single colour (`currentColor`), tinted by the group colour.
- **Particles:** white Kenney sprites, tinted in code.
- **Sound:** short mono MP3 effects and an epic orchestral looping track.

## In the game (`public/`)

| File | What it is | Where it is used | Origin and licence |
|---|---|---|---|
| `models/mage.glb`, `knight`, `barbarian`, `rogue`, `rogue_hooded`, `skeleton_mage`, `skeleton_minion`, `skeleton_rogue`, `skeleton_warrior` | the 9 characters (~0.7 MB each), with the 10 animations the code calls | `src/client/scene.ts` (`/models/${id}.glb`, read with `MeshoptDecoder`), list in `src/shared/characters.ts` | KayKit Adventurers and Skeletons, CC0; trimmed by `scripts/slim-character.mjs`, hood by `scripts/assets/hood.mjs`; on Nov 13 without the 11 never-called animations and compressed with meshopt (`@gltf-transform/functions` `meshopt`, no manual prune; the 9 together 9.3 → 6.3 MB), checked with before/after screenshots |
| `models/ranger.glb` (~0.44 MB) and the portrait `chars/ranger.webp` | Dungeon Tactics (Nov 13): the Archer (`archer`), previously the same as the Rogue. It is the Rogue without the two knives and the hood, green clothes tinted wine, the bow `bow_A_withString` attached to the left hand (`handslot.l`) and the `Idle` replaced by `Ranged_Bow_Idle` (standing with the bow). `rogue.glb` does not change (fallen bodies use it) | `src/client/markers.ts` (`MODEL.archer`), `src/client/scene.ts` and portrait in `src/client/hud.ts` | KayKit Adventurers 1.0, KayKit Fantasy Weapons Bits (`assets/kaykit/armas-de-fantasia`) and KayKit Character Animations 1.1 (`Rig_Medium_CombatRanged`), all CC0; assembled by `scripts/assets/ranger.mjs`, portrait by `scripts/portraits.mjs http://localhost:5173 ranger` (240×320 PNG reduced to 120×160 WebP) |
| `models/lancer.glb` (~0.44 MB) and the portrait `chars/lancer.webp` | Dungeon Tactics (Nov 13): the Lancer (`lancer`), previously with the Barbarian model. It is the Knight without the sword, shield and cape, with the grey armour tinted teal steel, the `spear_A` spear attached to the right hand (`handslot.r`) and, standing, the spear in both hands (`Melee_2H_Idle` in place of `Idle`) | `src/client/markers.ts` (`MODEL.lancer`), `src/client/scene.ts` | KayKit Adventurers, Fantasy Weapons Bits 1.0 and Character Animations 1.1 (Rig_Medium_CombatMelee), CC0; assembled by `scripts/assets/lancer.mjs`, portrait by `scripts/portraits.mjs` (240×320 PNG reduced to 120×160 WebP) |
| `models/KAYKIT-LICENSE.txt`, `KAYKIT-SKELETONS-LICENSE.txt` | licences of the characters | — | KayKit, CC0 |
| `desktop/icon.png` (outside `public/`) | app and installer icon for Windows | `desktop/package.json` (`build.win.icon`; electron-builder converts it into the `.exe` icon) | generated from `public/warlock-wars.svg` (the tab's W) at 512×512, cropped into a transparent circle; project art |
| `models/decor.glb` | arena decoration in a single GLB (skulls, bones, dead trees, torches, columns, candles) | `src/client/decor.ts` | KayKit Halloween and Dungeon, CC0; merged by `scripts/assets/merge-decor.mjs` |
| `models/barrier_half.glb` | wall of the Stone Pillar | `src/client/scene.ts` (`loadFile('barrier_half')`) | KayKit Dungeon Remastered, CC0 |
| `models/hex/rock_single_A..E.gltf` (+ `.bin`, `hexagons_medieval.png`) | rocks at the edge of the refuge islands | `src/client/scene.ts` | KayKit Medieval Hexagon, CC0 |
| `models/poc/quadrado/` (`dirt_with_grass`, `dirt`, `stone`, texture `block_bits_texture.png`) | Dungeon Tactics: grass top, column dirt and wall stone for all maps without a per-tile look | `src/client/scene.ts` (`BattleScene.create`) | KayKit Block Bits 1.0 Free, CC0 |
| `models/poc/hex/tree_single_A.gltf` (+ `.bin`, `hexagons_medieval.png`) | Dungeon Tactics: tree of the forest tile | `src/client/scene.ts` (`BattleScene.create`) | KayKit Medieval Hexagon, CC0 |
| `models/blocos/` (13 cubes: `grass`, `dirt`, `gravel`, `stone`, `stone_dark`, `water`, `wood`, `bricks_A`, `bricks_B`, `snow`, `dirt_with_snow`, `stone_with_gold`, `sand_with_grass`) | Dungeon Tactics: per-tile pieces (`Tile.look`) of Gariland (grass, stone, water, roof, chimney, wood, bridge) and Beacon Hill (rock, snow, sand and gold of the Beacon, brick wall; `dressBeaconHill` in `scenarios.ts`). Since Nov 13 the `water` is no longer drawn: the water surface is made in a shader (`src/client/water.ts`, no texture) and the `gravel` becomes the riverbed seen through it | `src/client/scene.ts` (`LOOK`) | KayKit Block Bits 1.0 Free, CC0 |
| `models/floresta/` (`Tree_1_A_Color1` to `Tree_4_A_Color1`, `Tree_Bare_1_A_Color1`, `Tree_Bare_2_A_Color1`, + `.bin`, `forest_texture.png`) | Dungeon Tactics: trees of Gariland and Beacon Hill (the bare ones on the snow side) | `src/client/scene.ts` (`LOOK`) | KayKit Forest Nature Pack 1.0 Free, CC0 |
| `models/floresta/` (`Tree_1_A_Color1` to `Tree_4_A_Color1`, `Tree_Bare_1_A_Color1`, `Tree_Bare_2_A_Color1`, + `.bin`, `forest_texture.png`) | Dungeon Tactics: trees of Gariland and the maps' forest tiles (the bare ones on the snow side); since Nov 13 bigger than the tile and, with 2 or 4 tree tiles together, a single tree | `src/client/scene.ts` (`LOOK`, `buildTrees`) | KayKit Forest Nature Pack 1.0 Free, CC0 |
| `models/floresta/` (`Rock_1_A_Color1`, `Rock_2_A_Color1`, `Rock_3_A_Color1`, `Grass_1_A_Color1`, + `.bin`; 22 KB, same `forest_texture.png`) | Dungeon Tactics (Nov 13): rocks at the foot of the cliffs, pebbles and grass tufts at the tile corners, so the map does not look like just cubes | `src/client/scene.ts` (`DETAIL`, `buildDetails`) | KayKit Forest Nature Pack 1.0 Free, CC0 |
| `models/animacoes.glb` | Dungeon Tactics: 12 ability gestures (one- and two-handed strike, thrust, bow aiming and releasing, magic charging and releasing, use item) and, since Nov 13, walking at a steady pace and the jump in 3 parts (`Walking_A`, `Jump_Start`, `Jump_Idle`, `Jump_Land`), applied by bone name to the characters | `src/client/scene.ts` (`BattleScene.create`), table in `src/client/fx.ts` | KayKit Character Animations 1.1 Free (Rig_Medium), CC0; merged by `scripts/assets/anim-pack.mjs` |
| `models/masmorra/box_large.gltf` (+ `.bin`, `dungeon_texture.png`; 40 KB) | Dungeon Tactics: box of the Gariland box tiles | `src/client/scene.ts` (`LOOK.box`) | KayKit Dungeon Pack 1.1 Free, CC0 |
| `models/masmorra/stairs_modular_center.gltf` (+ `.bin`; 7 KB) | Dungeon Tactics (Nov 13): stairs of the crypt ramp tiles (`Tile.ramp` with crypt or altar floor), in place of the sloped ramp of the outdoor maps | `src/client/scene.ts` (`LOOK.crypt.stairs`, `buildStairs`) | KayKit Dungeon Pack 1.1 Free, CC0 |
| `models/masmorra/floor_tile_big_spikes.gltf` (+ `.bin`; 46 KB) | Dungeon Tactics: spike tile (night of Nov 12), sized by width to fit the tile | `src/client/scene.ts` (`LOOK.spikes`, `propW`) | KayKit Dungeon Pack 1.1 Free, CC0 |
| `models/floresta/` (`Tree_1_B_Color1`, `Tree_2_C_Color1`, `Tree_4_B_Color1`, `Bush_2_A_Color1`, `Rock_1_A_Color1`, `Rock_3_A_Color1`, + `.bin`; ~100 KB) and `models/masmorra/` (`wall`, `wall_arched`, `wall_broken`, `column`, `torch_mounted`, + `.bin`; ~200 KB) | Dungeon Tactics (Nov 13): surroundings of the board, loaded only on the map that uses them (woods of the Woods and the Hill, rocks and pines of the Frozen Pass; walls, columns and torches of the crypts), together with the trees and the `pillar` that were already in the folders | `src/client/ambience.ts` (`MOODS`, `WALL`, `TORCH`) | KayKit Forest Nature Pack 1.0 Free and Dungeon Pack 1.1 Free, CC0; copied unchanged from `assets/kaykit/` |
| `tex/grass.jpg`, `leaves`, `dirt`, `cliff`, `snow`, `bark`, `wood`, `paint` (512 px each) and the models made in code (no file) | Dungeon Tactics (Nov 13, "FFT-like" painted style chosen by Fernando): ground of the open maps, bark of the posts and bridge planks, and the neutral paint (`paint`) of the vertex-painted pieces. Trees (leafy, old tree, skirted pine, tall pine, dead, bush), rocks, crates, barrels, bottles, sacks and rubble are assembled in code, with variations, and take the place of the KayKit pieces on the open maps (the crypts keep KayKit) | `src/client/terrain.ts`, `bridge.ts`, `painted.ts` (material and base pieces), `trees.ts`, `props.ts` | our own design; textures generated by `scripts/assets/paint-textures.py` (the `wood` was a Poly Haven photo until Nov 13) |
| `chars/*.webp` | portrait of each character (face) | `src/client/ui.ts`, `src/client/avatar.ts` | rendered from the characters themselves by `scripts/portraits.mjs` |
| `tex/stone.jpg`, `tex/stone_nor.jpg` | arena stone (colour and relief) | `src/client/scene.ts` | Poly Haven slate_floor_02, CC0 |
| `tex/lava_emit.jpg` | lava glow | `src/client/scene.ts` | ambientCG Lava001, CC0 |
| `tex/lava005.jpg` | melted edge of the islands | `src/client/scene.ts` | ambientCG Lava005, CC0 |
| `fx/*.png` (23) | particles: fire, flames, smoke, sparks, glow, circle, scorch mark, trail, swirl, star, steam | `src/client/scene.ts` (`/fx/${name}.png`) | Kenney Particle Pack and Smoke Particles, CC0 |
| `sfx/*.mp3` (10) | effects: fireball, explosion, hit, missile, lightning, shield, teleport, lava loop, click, confirm | `src/client/sound.ts` (`/sfx/${name}.mp3`) | Kenney, OpenGameArt and Freesound, CC0 (details in CREDITS) |
| `sfx/taunt/*.mp3` (10) | taunt voices | `src/shared/taunts.ts`, `src/client/sound.ts` | Kenney Voiceover, OpenGameArt, CC0; "Ultra kill" is a synthetic voice made for the game |
| `taunts-local/*.mp4` (5) | taunts recorded by Leonard: Tá pegando fogo!, Bosta city!, Foi uma delícia..., Usaram e abusaram., Lanchado | `src/shared/taunts.ts`, `src/client/sound.ts`, `src/client/scene.ts` | recorded on a phone by Leonard (lboesmans), who authorized use and redistribution in the game; no free licence, accepted by Fernando on Oct 21, 2026 (PR #243) |
| `music/battle.mp3` | standalone battle (loop) | `src/client/music.ts` (`TRACKS.battle`), `src/client/sound.ts` | Emma_MA "Determined Pursuit", CC0 |
| `music/titulo.ogg` | title screen | `TRACKS.title` | CodeManu "A Legend Will Rise (Orchestral)", CC0 |
| `music/mapa.ogg` | world map | `TRACKS.world` | TAD "Once Upon a Time (loop)", CC0 |
| `music/estrada.ogg` | road stages | `TRACKS.road` | cynicmusic "Battle Theme B for RPG", CC0 |
| `music/cripta.ogg` | crypt | `TRACKS.crypt` | nene "Evil Approach", CC0 |
| `music/neve.ogg` | snow (75 s, fade at the end) | `TRACKS.snow` | FAINOD "A Long Winter at Home (Classical)", CC0 |
| `music/chefe.ogg` | bosses | `TRACKS.boss` | cynicmusic "Sinister Boss Appears!", CC0 |
| `sfx/cancel.mp3`, `step.mp3`, `swing.mp3`, `throw.mp3`, `miss.mp3`, `heal.mp3`, `charge.mp3`, `spell.mp3`, `die.mp3` | Dungeon Tactics (Nov 12): cancel, step, swing at air, throw, miss, heal, magic charging, magic releasing, fall; together with `click`, `confirm`, `hit` and `fireball`, which already existed | `src/client/sound.ts` (`FILE`), wired in `src/client/main.ts` (`sound`) | Kenney Interface and Impact, RPG Sound Pack, Swishes, Magic Spell SFX and 80 CC0 RPG SFX (OpenGameArt), all CC0; mono MP3 normalized by ffmpeg |
| `icons.svg` | sprite with all the icons (spells, items, runes, effects, interface) | `src/client/icons.ts`, `src/client/scene.ts`, `src/client/style.css` | game-icons.net, **CC BY 3.0 (credit required)**; assembled by `scripts/assets/build-icons.mjs` |
| `warlock-wars.svg`, `favicon.ico`, `apple-touch-icon.png` | W logo and tab icon | `index.html`, `src/client/ui.ts`, `src/client/style.css` | own art, by `scripts/assets/favicon.py` (Grenze Gotisch font, OFL 1.1) |
| `og.jpg` | share card image (1200×630) | `index.html` | origin not recorded in `CREDITS.txt` (entered in commit 96028ee) |
| `home-cat.jpg` | cat photo on the Home page | `src/client/ui.ts`, `src/client/style.css` | from Leonard, **no free licence** (only in the game, by authorization of Fernando) |
| `wrench.svg` | wrench of the menu bar | `src/client/ui.ts` | own drawing |

## Library (`assets/`, outside the game)

- [`assets/kaykit/`](../assets/kaykit/README.md): all the free KayKit packs (23 folders, 2307 models, ~115 MB, CC0): characters, weapons, dungeon, graveyard, forest, medieval hexagons, city, space base, furniture, restaurant, board, platformer, blocks, resources, tools, Christmas and extra animations on the same skeleton as the characters.
  - What each pack is, origin and licence: [`assets/kaykit/README.md`](../assets/kaykit/README.md).
  - Name of each model, folder by folder: [`assets/kaykit/INDICE.md`](../assets/kaykit/INDICE.md). Look there before asking for a new model (e.g. `torch`, `barrel`, `skull`, `tree`).
- [`assets/sons-rpg/`](../assets/sons-rpg/README.md): 532 RPG sound effects in `.wav` (~31 MB): spells by group (Human, Orc, NightElf, Undead, Demon, Other, Items), weapon projectiles and combat hits. For whoever works on the sound effects (#202, #203, #205).
  - **Origin and licence not provided:** the package came without an author or licence and entered by decision of Fernando on Oct 21, 2026. No sound from here goes to `public/` without first finding the origin and a free licence. Detail and recorded doubt: [`assets/sons-rpg/README.md`](../assets/sons-rpg/README.md).
  - Name of each file, by category: [`assets/sons-rpg/INDICE.md`](../assets/sons-rpg/INDICE.md) (e.g. `FlameStrike`, `FireBallMissile`, `MetalHeavySlice`).
- To bring a model into the game: copy it to `public/models/`, trim what is unused, put the credit in `public/CREDITS.txt` and a line in the "In the game" table above.

## Rule: every new asset is indexed, explained and referenced

Decision by Fernando on Oct 21. Applies to contributors and to every AI.

1. **Indexed:** the file gets a line on this page, in the "In the game" table if it is in `public/` or in the "Library" section if it is in `assets/`. A new pack in `assets/kaykit/` also goes into its `README.md`, and the `INDICE.md` is rebuilt with `node scripts/assets/kaykit-index.mjs`.
2. **Explained:** the line says what it is and what it is for in the game.
3. **Referenced:** the line says where the code uses the file (`file.ts`) and where it came from, with the licence; the credit goes in `public/CREDITS.txt`.
4. An asset that leaves the game leaves here too. All in the same PR as the asset.
