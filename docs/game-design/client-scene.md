# Client: scene, look and game feel

How the 3D board is drawn and how the battle feels, moved out of `src/client/CLAUDE.md` (the rules of code stay there). Decisions with their dates are also in [docs/decisions.md](../decisions.md).

## Half tiles on screen

Nov 14, Fernando's request; rules in `src/shared/battle/half.ts`.

- `selectBattle` (`game/boot.ts`) halves every battle it opens, under the id `<scenario>½`; the `?scenario=half` test map comes split already. Since Nov 15 (Fernando: no whole-tile battle left) the developer battle is halved too, so no option, URL or branch opens a battle on whole tiles; a save of another id (the whole-tile ones from before) starts the battle over.
- Drawing: a whole tile's object once over its 4 cells (`Tile.span` in `scene/board.ts`); the camera zoom and the walk time per cell scale by `Grid.sub` (`scene/camera.ts`; `stepMs` takes whole tiles); the mood comes from the whole map (`kindOf`); the range marks and ring measure from the token's cells (`aimEnds`, `areaOf` in `interaction.ts`); the HUD shows the class of the original sheet (`baseDef`).
- Every screen shows Move and Jump in half tiles, the points the game spends (Nov 15, Fernando): the Status window, the party list and sheet, item stats, the developer menu (its inputs step by `SUB` and store whole-tile values) and How to play (`statsLine` and `jumpHelp` in `town-ui.ts`, tested in `tests/half-numbers.test.ts`).

## Living water

Nov 13, Fernando's request: "prettier water… transparent… with water physics".

- `water.ts` draws the surface (one `InstancedMesh`; geometry in `water-mesh.ts`; Phong with `onBeforeCompile` in `water-shaders.ts`: shallow clear and transparent, deep dark, foam at the shore, a glint that runs) over the gravel bed, which sits where `stand()` puts the feet (pure, tested heights in `water-levels.ts`).
- The water reacts to the characters by itself, through their position every frame (`Water.update`, called every frame through `Board.update`): entering splashes by the speed on the ground (jump ~2.2 m/s, push ~3.8: the push splashes more; sync and undo, which place the character in one frame, do not splash), walking leaves a wake, standing still emits rings and gets a foam collar.
- Since the night of Nov 13 (Fernando's request: "truly volumetric water, with physics") it is real physics: `WaveField` (`water-field.ts`, pure, tested in `tests/water-field.test.ts`) is an 8x8-cell-per-tile height field with a damped wave equation on the CPU, in fixed steps of 1/60 s of the battle clock. The wave reflects off the shore and the step, the river current (`River` in `terrain-outer.ts`) drags the field and the drawing, and the field sleeps when it calms.
- The field goes up to the GPU in an 8-bit texture and displaces the vertices of a single subdivided mesh (8x8 per tile; neighbouring tiles at the same height become one continuous surface). Colour in 3 bands by depth (shallow transparent, deep dark); a water step becomes an arched waterfall and the map edge shows the cut of the volume.
- Touch is an invisible plane per tile (`pickTiles`). The water comes before the other transparents (`renderOrder -1`), so marks, path, cursor and team ring stay on top.

## Board surroundings

Nov 13, Fernando's request: "more realistic scenery… fog, lighting, godrays".

- `ambience.ts` (the moods are in `ambience-moods.ts`, the air effects in `ambience-effects.ts`), one mood per map (`MOODS`: forest, field, crypt, frost and, for the crawl dungeon, cave; the map comes from the `Grid`). Ground that continues past the edge, models in rings, fog by distance from the edge (only on the surroundings' materials: the board stays sharp), low mist, light rays, torches and particles, on the battle clock.
- Nothing goes past `LIMIT` (it covers no tile or character at any rotation).
- A mood may darken the scene's sky and sun and change the sun's position (`MOODS.*.light`, today only Ash Wood: low light from the side), which changes the board's light too; it applies on top of the map's light.
- The scene only calls `loadAmbience`/`mount`, `update`, `setDaylight` and `dispose`.

## Game feel

Fernando's request, Nov 12: "more responsive and enjoyable to play". On Nov 13 he asked for the opposite on pacing: "slow walking… a really realistic jump… I don't want fast animations", and the `timing.ts` timings got ~40% slower. Gesture and effect of each ability are in `fx.ts`; sound in `sound.ts`.

- Walking at a step (`Walking_A`, 0.6 s per tile) and every step up or down is a jump in 3 parts (`jump` in `scene/unit-moves.ts`: crouch with `Jump_Start`, fly in an arc with `Jump_Idle`, land with `Jump_Land`). The duration of each step comes from `stepMs` (`timing.ts`), which the footstep sound also uses (on a jump, the sound goes on landing). Clips in `public/models/animations.glb` (`scripts/assets/anim-pack.mjs`).
- Every wait and animation in battle runs on the battle clock (`BattleScene.wait`, `Timeline.animate` in `scene/timeline.ts`). Holding Enter, Space or A speeds up 3 times; on touch, the Fast battle row of the corner menu toggles it (`dt:fast`) (`pace`/`speed()` in `timing.ts`).
- Strike with a pause on impact (`hitStop`), target flashing white and shaking (`shake`). Heal flashes green, a miss shows a little step back, whoever dies blinks 3 times (`blink`), marked tiles breathe. A strike of 25% of life or more shakes the camera and enlarges the number; whoever starts the turn does a little hop (`pop`); the cursor slides between tiles. Each character has its own copy of the materials.
- **Weight of a blow** (Fernando's grill of Nov 15, drawing only; the Mechanics lab's `peso.json` and its impact scene are the starting numbers, `WEIGHT` in `hit-weight.ts` and the timings in `timing.ts`): the hit-stop is 70 ms, 140 on a strong strike (25% of life or more from an attack, `isBig`; a fall, a bump or spikes never count, or a 2-level fall always would), which also shakes the camera (`Units.quake`); the struck body steps back half a tile along the push's axis and returns, only onto level open ground (`behind` in `scene/unit-hits.ts`, read with `standH`: no unit, wall, step, drop, deep water or edge there), only for a unit a push can move (a large one does not, as in `simulatePush`) and not when the strike's own push moves it (`shoved`). A push off a drop flies a real gravity arc (`fall` in `scene/unit-moves.ts`), lands with dust (`dust` in `fx.ts`), a short bounce and a light camera shake, and the fall's number comes on landing. A bump into rock (wall terrain or a step up, along the last push or away from the area's centre as the rule pushes) slides the body to it, stops dead with stone sparks (`sparks`), trembles and comes back; against a unit, the map's edge, deep water or on the way back to where it last rested it only trembles. The damage that downs the last enemy or the last hero (`fatal` and `lastOfSide`, pure lookaheads; Fernando, Nov 16: other deaths get no slow motion) runs the battle clock at 0.3 for `TIMING.slowmo` while the camera closes in on it (`CameraRig.closeUp`), once per sequence (an area strike that downs three would hold the battle ~10 s), never closer than 2 tiles of view (`CLOSE_UP`), unless Options → Video and effects → Slow motion on deaths is off (`dt:death-slowmo`, a global setting, `parseSlowmo`); the body falls and becomes the usual corpse. A resumed battle (a reload, a save slot, a crawl room) lays a body on every saved corpse cell on its first draw (`Units.restoreCorpses`, Nov 16 review: the cells blocked movement with nothing on them), one token-sized body per full half-tile square (`corpseSquares`), in the map bodies' look (`layBody`); undoing that kill takes it away. Recoil, bounce and rebound move the unit's `sway` group (between the holder and the body), so the holder stays on its tile. The number pops from the chest on the impact frame and follows it on screen, lifted over any number still showing so an area strike's targets side by side do not stack their numbers (`liftOver`, Nov 16), and leaves after 1.5 s on the wall clock, slow motion or not; its size grows with the share of life it takes (`numberPx`: 26 px at 10%, 38 at 25%, up to 56, x1.4 with a gold edge on a strong strike) and its colour says the kind (`numberKind`: white physical, violet magic with a ✦ after the number so colour is not the only cue, green heal with its +, grey miss with its word). Reduced motion keeps the pauses and the flash and drops the recoil, bounce, body tremble, dust, sparks, camera shake and slow motion.
- Confirm only on press (no key repeat).
- The camera opens close (`PC_START`) and frames the attacker and the target.
- **Action camera on the strike** (`CameraRig.actionCam` in `scene/camera.ts`; Nov 13, Fernando's request: "XCOM-style action cam" and then "try several options such as over the shoulder, from behind the enemy"): `ACTION_CAMS` holds the options and `?camera=<name>` picks one to compare: `hero` (the default since Fernando's choice on Nov 13: `shoulder` when the hero attacks and `behind` when it is the enemy, always from the heroes' side), `xcom` (the previous one), `shoulder`, `behind`, `side`, `top`, `none`. The low-camera ones change the tilt (`pitch`), aim at character height and cut what is in front with the camera's clipping plane (`clip`), because the outer woods and the cliffs covered the strike. Zoom applies through `frameView()` every frame (before, the action camera changed `viewH` and nothing happened).
- Menus open in 90–120 ms and the ▶ pulses; with reduced motion, nothing animates.

## Terrain that does not look like Minecraft

Nov 13, Fernando's request: "more diagonal tiles… it doesn't need to be all straight" and "bigger trees… some can take up more than 1 tile". All drawing in `scene/board.ts` (the climb in `scene/space.ts`).

- **Ramp** (`Tile.ramp`, data in `src/content/maps/`): `slope`/`surfaceY` (`TileSpace` in `scene/space.ts`) are the single calculation of the climb; the tile top, the character (`world`), the marks, the cursor (`lay`) and the character's ring and arrow (`tiltGround`) lie on it. Walking to/from a ramp follows the ground (`walkY`) at the flat step's pace; going up from the ramp to the tile above is still a jump (the rule measures by standing height, and the footstep sound counts on that). Dungeon floor (`LOOK.stairs`) draws the ramp as stairs (`buildStairs`), sunk 1 step so nothing disappears behind the steps.
- **Trees** (`TreeCrowns` in `scene/tree-crowns.ts`): bigger than the tile (`TREE_SIZE`); neighbouring forest tiles at the same height become one tree (2x2, then 2x1). The canopy has a cutout (`cutMaterial`): the part in front of a character, the cursor or a marked tile disappears, with a checkerboard edge.
- **Painted pieces** (Nov 13, Fernando put this front on "model the maps and objects" in the painted style he chose): on the open maps, trees (`trees.ts`) and objects (`props.ts`: crates, barrels, rocks, bottles, sacks, bridge debris and the remains beside corpses) are assembled by code and take the place of the KayKit pieces by the same name (`swapTrees`, `swapProps`); the crypts stay with KayKit.
  - A single material (`painted.ts`): paint colour per vertex in tone masses (`ramp`, with a short step) and the neutral `tex/paint.jpg` ink on top; one mesh per piece. Base pieces: `tube` (trunk, branch, root, barrel), `lump` (canopy tuft, rock, sack), `slab` (plank).
  - Convention: y = 0 is the ground and what goes below (trunk skirt, root) enters the earth; `userData.box` is the box above ground, the one that counts for measuring (`boxOf`), `userData.foot` the foot radius (the scene does not let it go past the flat core of the tile, 0.4) and `userData.tall` lets the pine go past the `TREE_SIZE` ceiling.
  - Variations: `name`, `name~1`, `name~2`… in the piece map; `variant(pieces, name, draw)` picks by position. The surroundings use the light version (`swapTrees(models, true)`), otherwise the outer woods cost twice the triangles of the rest of the scene.
  - Characters and corpses no longer carry the grain from `detail.ts`, only light shading (`Board.shaded`); the grain stayed for the remaining KayKit pieces (brick).
  - Bridge (`bridge.ts`): where the bank is at the plank height the planks extend 1/4 of a tile over the earth (the terrain rounds off the edge); a bridge of 3 tiles or more gets a middle beam and a broken railing; a bridge tile with `rubble` terrain gets the debris on top.
- **Details** (`buildDetails`): stones at the foot of cliffs and tufts or pebbles in the corner of some tiles, outside the character's ring (0.44). Fixed draw by position (`hash`).
- **Cost:** a column cube that never shows is not drawn (`buried`: its 4 neighbours of solid ground reach its top; water and bridge are left out). On the Hill the triangles dropped from 1.2 million to 0.73 million, which pays for the trees and details. A different tone per tile on top (per-instance colour) was measured and rejected: it cost 16% to 28% of the frames in Chrome without a graphics card, barely visible.

## Tile marks

Nov 13, Fernando found the flat white square "too white".

- Thin frame in the colour of the type with a dark line outside, weak centre and one pattern per type (`MARK` and `markTexture` in `scene/mark-looks.ts`): plain blue for moving, orange stripes for the strike range, filled for the chosen tile and the area, purple X for the blocked shot, red X where the square of a unit bigger than one cell does not fit (a 1-cell unit keeps the plain cursor, Nov 14 review). Canvas texture without mipmaps; the colour comes from the material. The help text says "marked tile", without naming the colour.
- **Units bigger than one cell** (the 2x2 token, the Colossus) are marked by their whole square (Nov 14, Fernando on stage 0: "it needs a preview of the tiles the units will occupy in 2x2"; `highlights` in `interaction.ts`): its own cells, the blue as every cell its square can cover, the destination's whole square (red X when `reach` does not have it), the facing tiles beside each side, the cursor frame (red, with its arrow, where the square does not fit; hidden over a step or a ramp, where it floated off the lower marks) and the path dots in the middle of the square. The mouse picks the square centred under it (`squareUnder` in `scene/space.ts`) and the keyboard cursor keeps the whole square on the map.
- **Aim mark** (Nov 15, Fernando: no 2x2 preview on empty ground): one half-tile cell, or the whole body of the unit the strike lands on, the Colossus' 4x4 included (`aimMark` in `interaction.ts`: the rule aims at the whole tile, so a token on its corner is the one hit even from an empty cell beside it). The cursor frames the same square, and a keyboard step that would leave the mark where it was goes on until it moves, so one press crosses a body. An area aimed at empty ground keeps that one cell and marks the rest of the area the rule hits, centred on the aimed whole tile.

## Mark styles: light, stone, neon or flat

Nov 17, Fernando: "the lines on the ground and the circles round the characters, with relief, texture and lighting... I
want nothing flat". Three lit styles and the flat one of before, picked in Options → Video and effects → "Marks"
(Simple, Light, Stone, Neon), saved in `dt:marks` (`mark-style.ts`, pure choice tested in `tests/mark-style.test.ts`);
`?marks=simples|luz|pedra|neon` in the address wins when the page opens, and a sandbox spec's `marks` sets it for its
page. No automatic fallback: the player picks. A change applies at once (`BattleScene.restyle` builds the marks again).

- **What takes the style:** the marked tiles (move, strike range, threat, area, target, blocked, no-fit, counter) and
  the charge danger, the path studs, the cursor frame and arrow, the team ring and front arrow under each unit, the
  dotted range ring, the map's dotted border, the charge lines, the counter lines and arrows, and the shot preview
  (dots, landing ring, cast circle and its dashed line, the X).
- **Luz (default):** light etched in the ground. A low strip with chamfered edges round each tile and a sheet of deep
  glass inside, glowing in the mark's colour and breathing slowly (FFT's blue move tile and ring of light).
- **Pedra:** pieces of stone and metal. A chiselled stone curb round each tile (the terrain's own `tex/cliff.jpg` under
  a normal map drawn by code) with a glossy inlay, and metal rings, cursor and lines that reflect a small sky drawn by
  code. Rings and cursor cast shadows; the tile curbs only receive them (casting cost two more draw calls a tile).
- **Neon:** tubes of light with a hot core and an additive halo round them (no bloom pass: it would hit the whole frame).
- **How they are built** (`scene/mark-kit.ts`): a profile swept along a path (`sweep`, `piece`), `MeshStandardMaterial`
  under the scene's sun, sky and shadow map (`litPaint`), kept in the transparent queue like the flat marks. The
  patterns of `MARK` stay in every style as the glass's drawing and relief (stripes, cross, full), since colour is never
  the only signal; the heroes' ring is whole and the enemies' is broken in four.
- **Relief:** a lit tile mark is one geometry bent over the drawn ground (`groundOf` reads the smooth terrain's own
  vertices), up to 12 cm off its tile's plane, so it rolls over the soft edge between two levels and lies on a ramp;
  at a cliff it stops instead of climbing the wall. Built the first time a tile is marked and kept for the battle.
- **Reduce motion:** no pulse, in every style (the flat marks' breath stops too).
- **Cost, measured on Nov 17** in Edge at 1920x1080 on Ash Wood's move screen (`bench/marks-*.json`, 148 marked cells, which is 37 whole tiles, counted from the draw calls;
  plain 3D, a 72 Hz monitor, the machine shared with other work): the median frame was 13.9 ms in all four, the
  monitor's own rate, so the styles could not be told apart by frame time there. Draw calls: Simple 438, Light 586,
  Stone 595, Neon 743; triangles 612k, 639k, 663k, 709k. Not measured: a phone or tablet. Light is the default on that: same frame time as the flat marks, the fewest extra calls.
- **Not done:** the town's debug grid and the charge aura stay flat; no textures were downloaded.

## Dialogue box and music

Nov 12 and 13.

- The dialogue box is in `talk.ts`, after FFT's (Nov 16): a wide box at the bottom with the speaker's name on a tab over its top left corner, the face at the left, letter-by-letter text, a blip per voice (`blip` in `sound.ts`) and the painted faces; Esc or the "Skip" button (44 px, Nov 16) skips the conversation, and on a touch screen the hint reads "Tap to continue". Today the walkable town calls it (`game/town.ts`): the townsfolk's rumours and a party member's greeting before their sheet opens.
- Music is a CC0 .ogg file from `public/music/` per screen, with per-track gain in `music.ts`, played in a loop with a 0.5 s fade by `sound.ts` (Nov 13, Fernando's request: "use free music instead of the ones you created").
- **Testing without music** (Fernando's request, Nov 13): on `localhost` the music starts at 0 and, on a page opened by automation (`navigator.webdriver`, Playwright), it never plays unless the URL has a `music` parameter (`?music=1`). Test scripts launch Chrome with `--mute-audio`.
