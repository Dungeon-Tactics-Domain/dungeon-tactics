# Game design docs

Index of the design documents and of what each lab touches. Decision of Nov 14 (Fernando, cleanup grill): content and rules are kept apart so the labs change data, not the engine.

## Documents

| Document | What it holds |
|---|---|
| [pillars.md](pillars.md) | the design pillars and the criterion for every design decision (Oct 25) |
| [narrative.md](narrative.md) | the town and the prisoner's sentence: tone, milestones, residents, story channels, first lines (Nov 15 draft, names pending approval) |
| [design-system.md](design-system.md) | interface tokens, pieces, states, input and contrast; source of truth for the UI |
| [client-battle-screen.md](client-battle-screen.md) | battle HUD, windows, end of battle and input: what each screen does, the request behind it and its date |
| [client-town-expedition.md](client-town-expedition.md) | town, expedition, walkable town, party, standalone crawl rooms and save slots in the browser |
| [client-scene.md](client-scene.md) | half tiles on screen, water, ambience, game feel, terrain, tile marks, dialogue box and music |
| [towns-party-equipment.md](towns-party-equipment.md) | towns, party management, equipment, recruiting and new classes (Nov 13; historical: written for the Beacon Ashes campaign, removed from the code on Nov 15) |
| [fft-reference.md](fft-reference.md) | Final Fantasy Tactics formulas with sources, for the `battle/fft/` study |
| [tactics-ogre-fft-ui-reference.md](tactics-ogre-fft-ui-reference.md) | FFT battle screen and Tactics Ogre mechanics, with sources |

## Labs

**Rule: labs change content in `src/content` first; the engine changes only when a new mechanic needs it.** A lab that only tunes numbers, lines or maps should not touch `src/shared`. How to add each kind of content, and the tests that guard it, is in [`src/content/CLAUDE.md`](../../src/content/CLAUDE.md).

| Lab | Content it changes (`src/content`) | Modules it may touch when content is not enough |
|---|---|---|
| Design system and UX | none (it changes the interface, not the game data) | `src/client/style.css` (`:root` tokens), `dialog.ts`, `icons.ts`, `hud.ts`, `town-ui.ts`, `talk.ts`, `dev-menu.ts`; [design-system.md](design-system.md); screenshots of any screen from code: [sandbox.md](../sandbox.md) |
| Narrative and game loop | `party.ts`, `crawl/rooms.ts` (groups, themes, town, expedition numbers), `items.ts` (prices) | `src/client/group.ts` (recruit cost, party size), `game/crawl.ts` (town and expedition flow), `src/shared/crawl/` (room generator and expedition rules), `music.ts` (tracks) |
| Mechanics and game feel | `units.ts`, `abilities.ts`, `items.ts` (stats), `maps/` | `src/shared/battle/` (a new mechanic: `combat.ts`, `pathing.ts`, `turn-queue.ts`, `ai.ts`), `src/client/timing.ts`, `fx.ts` (ability gestures), `scene/board.ts` (tile looks), `ambience.ts` (map moods), `sound.ts`; gameplay clips of a mechanic before and after a change: [sandbox.md](../sandbox.md#gameplay-clips) |

Content ids also key some client lookup tables that stay in the client because they are drawing, not data of the game: `MODEL` (`markers.ts`), `LOOKS` (`fx.ts`), `LOOK` (`scene/board.ts`), `LOOK_NAME` (`hud.ts`), `KIND` (`ambience.ts`), `TRACKS` (`music.ts`). A new class, ability, tile look or map usually needs a line there too.
