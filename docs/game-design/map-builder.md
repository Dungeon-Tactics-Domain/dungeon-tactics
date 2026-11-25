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

- Categories: Paint (full palette), Relief (height + and -, ramp tool, auto-ramps), Units, Map (size, edges, clear),
  File (save slots, export JSON and .ts, import, Play).
- Layout A (recommended): a tool bar at the bottom with keys 1 to 9 (ground, tree, water, wall, height +, height -,
  ramp, unit) and a 3D side panel on the right for the rest; the map stays visible while painting.
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
