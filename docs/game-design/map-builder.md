# Map builder

A tool for Fernando's own development: making battle maps by hand and testing aim and cover on them. Not a player
feature. Decided in a grill on Nov 25 (three rounds of multiple choice).

## Decisions

- **Where:** inside the game, opened from the debug panel (F2 / L3).
- **Edits:** ground, height (0 to 9) and objects; ramps; start points and units; map size.
- **Painting:** mouse drag (left paints with the chosen tool, right resets to plain ground) and the battle's tile
  cursor with Enter (keyboard, pad, touch).
- **Palette:** every look the game's maps already use (grass, sand, three trees, shallow and deep water, bridge, rubble,
  rock, crates, barrel, corpse, the crypt pieces), each with the terrain it gives (tree = forest, crates = wall).
- **Ramps:** a ramp tool (a click turns the tile into a ramp to the neighbour one level up; another click rotates it)
  and an auto-ramps button (every one-level step becomes a ramp; erase the unwanted ones).
- **Undo:** Ctrl+Z / Ctrl+Y, one drag = one step, 50 steps, with buttons for pad and touch.
- **Size:** width and height rows (4 to 24 tiles) and per-edge add or remove (grow or cut on any side). Cut tiles go
  into Undo.
- **Start:** from the current battle's map (terrain, heights, units) or a blank map of a chosen size (grass, height 0).
- **Units:** class and side as the debug panel's Spawn; a placed unit can get its own life (the game has no unit
  level; the editable numbers are the Developer menu's: life, speed, move, jump). Facing with Q / E.
- **Save:** in the browser (named slots), read back through a `parse*` function that rebuilds field by field.
- **Export:** both JSON and a `.ts` file shaped like `src/content/maps/ash-wood.ts` (KEY table, MAP, H and RAMPS rows,
  spawns).
- **Test:** Play opens a battle on the map with the placed units; the debug panel goes back to the builder.
- **Camera:** the battle camera plus a top view toggle. The top view is also a battle option (a separate request).

## Feasibility spike (Nov 25)

`ash_wood` (12x12) and `crypt_heart` (12x14) were exported as JSON and as `.ts` and read back: every tile identical in
both formats (JSON about 7 KB). The spike used one letter per tile kind (a-z, A-Z: 52 kinds) and one letter per ramp
(rise 1); those were the spike's shortcuts, not limits of the format. The real exporter must handle more kinds and
taller ramps, with a test.

## Open points for the build

- A live battle holds the half-tile grid (`halve`, positions in half cells). The builder edits whole tiles: it reads
  the whole-tile source scenario, or un-splits the half grid. Expedition rooms are generated, so the round trip must
  be tested on one crawl room too, spawns included.

## Top view (battle and builder, Nov 25)

Fernando: "coloque a camera de cima para ser uma opcao a ser ativada durane a luta tbm igual tactics ogre faz".
- Straight down (90°), as Tactics Ogre's tactical view; a short transition in and out.
- T on the keyboard, R3 on the pad, and a touch button next to the rotate buttons (44 px target).
- From above, R turns the map by 90° (4 directions); an attack still plays the action camera, then the view returns
  to the top.
- Height from above: a small number on each tile above 0 AND a light shading by height, both only in the top view.
- Entering the top view frames the whole map; wheel and pinch still zoom.

## Screen (Nov 25, layout A chosen)

- Categories: Paint (full palette), Relief (height + and -, ramp tool, auto-ramps), Map (size, edges, clear), File (save
  slots, export JSON and .ts, import, Play). Units left in round 4 (below).
- Layout A (recommended): a tool bar at the bottom with keys 1 to 9 (ground, tree, water, wall, height +, height -,
  ramp, and since round 4 palette and rubble in place of unit) and a 3D side panel on the right for the rest; the map
  stays visible while painting.
- Layout B: the side panel only.

## Round 4 (Nov 25)

- Units leave the map builder. Fernando: "a posicao das unidades deve ser editavel fora do map builder... vai ter outro
  builder q vai ser o battle builder em cima de um mapa pronto.. o map builder nao deve ter a ver com as unidades q vao
  nele". Placing units, their own life and Play with units belong to a later battle builder over a finished map.
- The map keeps a Portuguese and an English name; the English one starts as a copy of the Portuguese.
- Brush 1x1 and 3x3, B switches; the tiles about to change light up in the tool's colour.
- Core split (his tie-break): the map document is terrain only (size, tiles, ramps, pt and en names); units, their own
  life and facing go to a separate battle document for the battle builder.
- Play in the map builder opens the map with one default hero in a corner; the debug panel creates the rest.

## Battle builder (grill, Nov 25)

- Replaces the title's Developer menu and inherits all of it (life, speed, move, jump, equipment, abilities per unit);
  the Developer cast saved today migrates to the new format.
- Maps: the game's maps, the ones saved in the map builder, and an expedition room by seed and depth.
- Opens from the debug panel, from the map builder ("build a battle on this map") and from the title in place of
  Developer.
- Fernando: "o battle builder pode abrir de dentro do map builder para ja testar um mapa enquanto edita em uma batalha
  ... seria possivel editar o mapa durante a batalha do map builder?" Open question: editing terrain mid-battle.
- Live edit: pause, edit the map, rebuild the board and go on from the same turn. Only when nothing is moving, on a
  turn the player controls (Fernando: "so pode enquanto nao tiver movimento sendo feito... enquanto tiver no turno do
  jogador"). A unit on a tile that became a wall goes to the nearest free tile; the battle's Undo resets.
- Who plays each side: the player can also play the enemies' turns ("no battle builder deve ser possivel o jogador
  jogar os turnos do inimigos tbm"), or either side can be left to the AI (AI against AI included).
- Objective chosen in the builder, from what the engine already knows (defeat all, protect the Beacon, survive).
- Turn order: a starting CT (0 to 100) on each unit's sheet; empty means the usual order by speed.
- Saves: named browser slots and export (JSON and .ts) of the whole battle, like the map builder; the Developer's saved
  cast becomes the first slot.
- Bag: an editable item bag per side, reusing the expeditions' bag.
- The battle builder starts after the map builder is published.
## Screen as built (Nov 25)

The client: `src/client/mapedit/` (controller and pure parts), `window3d/builder3d.ts` (the drawing), `game/debug-builder.ts`.

- **A page of its own:** `?mapedit` (entry.ts). The map being edited is the draft save `dt:mapedit`, written on every
  edit; a reload, Play and the way back read it through `parseMapDoc`. Named slots are `dt:mapedit:slots` (one per
  Portuguese name, the 20 newest; `parseSlots`). Neither is a progress key, so they do not travel with a game slot.
- **Opening:** Debug (F2 / L3) › Map builder: "Start with" this battle's map (`docFromScenario`, units left out) or a
  blank 8x8, 12x12 or 16x16 of grass, then "Open the map builder". Inside an expedition room the row says to finish the
  room first (leaving it loses the expedition). Blank of another size: Map › Clear at the size set by the Width and
  Height rows.
- **Tool bar, keys 1 to 9:** ground (grass), tree, shallow water, wall (brick), height +, height −, ramp, palette (the
  entry picked in Paint, sand at first) and rubble (low cover, what the builder tests aim on). The pad's X walks them.
- **Tile pictures (Nov 25):** every bar plate and every Paint entry shows a picture of what it paints over or beside
  its name: a tiny map per picture (`mapedit/pics.ts`, pure) built on the battle's own pieces and drawn once per page
  by the scene's renderer into a canvas (`scene/tile-shot.ts`, `mapedit/pic-shots.ts`), cropped to the tile. Height +,
  Height − and Ramp show the ground they make with a +, − or ↗ sign; the Palette plate shows the entry picked.
- **Drawing on the battle's scene:** the map is halved as every battle and drawn by `BattleScene`. Each finished edit
  redraws in place (`BattleScene.setGrid`, Nov 25): the scene's `TileSpace` takes the new map and the board is built
  again in the same scene (`Board.rebuild`), with the same renderer, camera, units and surroundings; the terrain keeps
  its mesh and works out and uploads only the vertices of the sub-tiles that changed, the dotted border stays while it
  lies the same, the tile marks move to their new ground, and the top view's shade and numbers are made again. A map
  of another size (Map tab) also gets its marks, its surroundings and the camera's whole-map zoom again. The scene
  loads every palette entry's pieces when it opens (`paletteGrid`), so no edit waits for a download. The host's
  `data-redraws` counts the redraws for timing scripts. Measured in headless Chrome (software WebGL) on a map with
  trees and hills, from the key to two frames after the redraw: 12x12 280 to 390 ms before, 37 to 52 ms after (first
  edit 82 to 102); 24x24 456 to 809 ms before, 62 to 108 ms after, except the first edit after opening, 119 to 138
  (the code still compiling). 100 undo and redo steps in one session kept the same two canvases (the scene's and the
  3D layer's), and the renderer's geometries, textures and programs stayed at the same count. A redraw that fails says so in the help line.
  During a drag the tiles of the stroke and the brush light up in the tool's mark; the stroke lands on release, as one
  undo step, each tile once (height and ramp are not idempotent).
- **Input:** left button or a finger paints, right button paints grass (height kept), the middle button or two fingers
  move the map, wheel or pinch zoom. Keys: the battle's arrows and Enter (paint at the cursor; a click moves the
  cursor too), Del grass at the cursor, B brush, Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, T top view, R and Q E camera, Tab the
  panel's buttons. Pad: d-pad cursor, A paint, B grass, X next tool, Y brush, View undo, Menu into the panel and back
  (there the d-pad walks the controls by place and A presses). Redo has no pad button: the panel's Redo does it.
- **File:** Portuguese and English names (typing a Portuguese name renames the id), Save, Export JSON and Export .ts
  (a download, the clipboard, and the text in the paste box), Import pasted JSON (one undo step; a map with a look no
  palette entry draws is refused, since the scene could not build it), Play, Leave (to the
  title), then the saved slots newest first (the ones past the panel's foot are cut; a tablet shows two).
- **Play:** `?scenario=mapedit` builds the draft with one Warrior (`h0`) on the first standable corner (bottom left,
  top left, bottom right, top right), else the standable tile nearest a corner; a map with none disables Play and
  says why. The battle ends only when the heroes fall (no enemies is not a victory here); the debug panel creates the
  rest and wins or loses it; killing every spawned enemy does not end it. Its save `dt:battle:mapedit` is cleared on every Play. Debug › Map builder › "Back to
  the builder" reopens the draft.
- **Left for later:** the battle builder (units, `battle.ts`), a numeric height field, a slot list longer than the
  panel, deleting a slot.

## Battle builder as built (Nov 25)

The client: `src/client/battleedit/` (controller, pure panel, sheet steps, map sources, saves, live edit) and
`game/debug-battle.ts`; the shared battle-wide edits in `src/shared/mapedit/setup.ts`.

- **A page of its own:** `?battleedit` (entry.ts), drawn with the map builder's layout, unseen controls and 3D screen
  (`mapedit/layout.ts`, `builder-ui.ts`, `window3d/builder3d.ts`). The battle on screen is the draft `dt:battleedit`
  (a slot: name and battle), written on every edit and read back through `parseBattleDoc`; an edit a reload could not
  read back is refused with a word why. Named slots are `dt:battleedit:slots` (20 newest, one per name). The first
  opening seeds them with the Developer menu's saved cast (`dt:dev`) as the slot "Desenvolvedor" and writes them, so
  that runs once per browser. Neither key is a progress key.
- **Opening:** the title's row in Developer's place, Debug › Tools › Battle builder, Debug › Battle builder › Open with
  this battle (its map and starting units; not inside an expedition room), and the map builder's File › Build a battle
  (the draft's units stay where they fit on that map).
- **Bar, keys 1 to 9:** Pick, Hero, Enemy (place the class picked, as the debug Spawn), Remove, Turn ↺, Turn ↻,
  previous and next class, Play. A tap or Enter uses the tool at the tile; the right button or Del removes; B or the pad's
  Y the next class; the pad's X walks the four tools; Menu walks the panel.
- **Units:** the classes two a row, paged, the Beacon last, and how many stand on each side.
- **Sheet:** with no unit picked, every unit as a button (keys and pad reach each one); then the unit with ◀ ▶ to the
  next, and three pages: Numbers (name, life by 10, speed, Move and Jump in half tiles, starting CT by 10 where empty is
  the usual order, facing, back to the class's sheet; a field set on the unit has a dot), Equipment (each of the 7 slots
  round its pieces and none), Abilities (each a button that takes it away, never the last; one to add, at most 8). The
  Beacon has no sheet.
- **Battle:** Map (the game's maps and the map builder's saved ones; Use this map keeps the units that fit; an
  expedition room by seed (New draws one) and depth, with its party and monsters, won by defeating all), Rules
  (objective: the map's, defeat all, protect the Beacon only with one on the heroes' side, survive 1 to 99 turns; Player
  or AI for each side, AI against AI allowed) and Bags (each side's items, 0 to 99). Another map opens the page again so
  the scene loads its pieces; the undo steps start over.
- **Play:** `?scenario=battleedit` builds the draft with `battleToScenario`; each own sheet wears its class's model,
  face and HUD class (`dev-roster.ts` `setClass`). Its save `dt:battle:battleedit` is cleared on every Play. Play is
  off, and says why, with no hero or no enemy that plays. The turn loop and the HUD give a turn to the player or the AI by
  `controlOf`.
- **Live edit (a mode since Nov 25, Fernando: "Pintar com o mouse ao vivo"):** in a battle Play opened, M or Debug ›
  Battle builder › Edit the map live turns it on, only on a player-controlled turn with nothing moving (the row and a
  banner say why not; the hint "M Edit Map" sits beside Options on that turn). The map builder's tool bar (keys 1 to 9,
  the same tools and pictures) shows at the battle's foot right of the turn list, drawn on the HUD's own 3D layer, with
  a help line and the keys over it; the command menu, the combat bar, the banner and the hints hide meanwhile. The map
  builder's input paints (`battleedit/live-mode.ts` on `mapedit/builder-input.ts`): left button or a finger drags a
  stroke, lit in the tool's mark as it grows, the right button grass, the middle button or two fingers move the map;
  Enter or the pad's A paints at the cursor, Del or B grass, B (key) or Y the brush, X the next tool. Each finished
  stroke is one edit: the board is drawn again in place, the units synced, whoever stood where nobody may stop goes to
  the nearest free tile, the battle goes on from the same turn with a new Undo history, Restart and the draft take the
  edited map, and the help line and a banner say what happened. M, Esc, the pad's Menu or the bar's Leave plate (a
  tenth plate right of the tools, with its key while keys show; Fernando, Nov 25: "Botão de sair na tela", so a finger
  leaves without the gear or the debug panel) leave and give the battle its input back (F2 and H still open the debug
  panel and Options). The Palette (a tap, 8, or the pad's X landing on it) opens a list of the palette's entries with
  their pictures over the help line, as wide as the bar and as many columns as it holds (paged on a phone; Fernando,
  Nov 25: "Escolher a cor da Paleta ao vivo"); arrows or the d-pad walk it by place down to the bar and Leave, Enter, A
  or a tap picks (the Palette plate then shows that entry), Esc, B, the pad's Menu, another tool or the Palette again
  close it. The list is the Paint panel's rows with more columns (`panel.ts` `paintRows`, `layout.ts` `pickLayout`). Only in a battle built from a draft (`isPlayed`): the
  default battle standing in for a missing draft has no palette pieces to draw a new look with.
- **Export:** the battle's .ts carries the spawns with their starting CT, `bags`, `control`, the objective as `rules`
  and a `<MAP>_SHEETS` table of the units' own sheets. Import takes the pasted JSON.
- **Left for later:** the pad has no button of its own for the live edit (every one has a battle action; it opens from
  the debug panel's row on L3); importing
  a .ts; deleting a slot; a slot list longer than the panel; the camera opens close on a big map (zoom out with − or the
  wheel). The old Developer screen's code left on Nov 25.
