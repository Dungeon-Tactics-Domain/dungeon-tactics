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
- **Drawing on the battle's scene:** the map is halved as every battle and drawn by `BattleScene`; the board is built
  once per scene, so each finished edit builds a new scene and the camera (heading, zoom, focus, top view) carries
  over (`CameraRig.carry`). Measured on the 12x12 blank only, in headless Chrome: 250 to 280 ms from Undo to the new
  scene; 120 redraws in one session (60 edits, 60 undos) lost no WebGL context. A scene that fails to build says so in
  the help line and the next edit draws again.
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
