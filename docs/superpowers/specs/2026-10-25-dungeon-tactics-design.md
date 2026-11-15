# Dungeon Tactics — design for slice 1 (Oct 25, 2026)

Origin: pillars grill with Fernando on Oct 25, 2026 (decisions also in the memory `visao-do-jogo.md`). Pillars and goals: [`docs/game-design/pillars.md`](../../game-design/pillars.md).

> **Superseded in part on 15/11.** Changed since this spec: no campaign with a fork (the game is a town, descent, camp and return loop); plain 3D instead of SNES pixel art; PC first instead of mobile first; expedition with resources and the town are now core, permadeath postponed (a fallen hero returns wounded at 25%). The body below is kept as written. Source: `_notas/LOOP-DUNGEON-CRAWLER-AUDIO.md`.

## What it is

Turn-based tactics on a square grid with height, mobile first, SNES pixel art (shader over 3D Three.js). References: Final Fantasy Tactics (turns, height), Into the Breach (planning against what the enemy can reach), D&D (classes, dice) and Darkest Dungeon (feel; its pieces come later).

## Slice 1 decisions

| Topic | Decision |
|---|---|
| Puzzle | Turn queue and each enemy's reach always visible; the player plans against that |
| Goal of the 1st battle | Protect a target (NPC/tower) and kill every enemy. Defeat: the target falls or all heroes die. The final boss changes this to "defeat the boss" |
| Grid | Square |
| Height | +1 range per level above; max jump of 1 level; fall damage (push); line of sight and cover (forest/walls block, height reveals; few cover types in slice 1) |
| Heroes | 4: Warrior, Archer, Mage, Rogue. Abilities: 4 or more per hero; fixed bar of up to 6 icons (basic + specials + move); holding the icon shows the details |
| Enemies | Soldier, Archer, Mage, Brute (one per role). The AI evaluates and picks the best move; the reach is visible, the intent only on its turn |
| Hit chance | Hit chance by distance, height and cover, shown in % before confirming; damage also varies. Always a new die roll (the roll is NOT redone the same on undo) |
| Undo | Limited per battle (initial value 3, to be measured); restart the battle in one tap |
| Turn order | FFT-style queue: unit speed; a strong ability delays the unit's next turn; queue visible at the top |
| Battle | 8 to 12 min, map ~20x20. Requires: saving the battle midway, camera with pinch and drag, performance on phones |
| Touch | 1st tap picks the hero, 2nd tap picks the tile (shows path or range), big Confirm button executes; dragging moves the camera, pinch zooms, camera rotation by buttons |
| Campaign | ~5 scenarios (battles and conversations) in sequence, ONE fork in the middle that changes the next map and the ending; ends with a boss battle |
| Progression | Level (XP) and hero equipment, decision cards between battles; battle winnable with the party at hand (no mandatory grind) |
| Tone | Dark but playable: dark fantasy in colours vivid enough for the pixel art, short text, narrator |
| Out for now | Permadeath, stress/afflictions, expedition with resources, hamlet (Darkest Dungeon). The hero state is already born persistent between battles so these layers can come in without a rewrite |

## Project rules (apply to the code)

- An ability's effect comes from general, documented stats (range, damage, push, cooldown); no "ability X does Y with ability Z".
- A balance number only changes after being measured by battle simulation (AI vs AI, several seeds); goal: winnable battle, no obvious single solution.
- Determinism: all randomness goes through `rng.ts` with the seed kept in the state; the battle state is serializable and cloneable (base of save, undo, simulation and tests).
- Mobile first (the Warlock rule "phone out of focus" does NOT apply here): touch target ≥ 44 px, 393x852 screen, no mandatory hover.
- All visible text in Portuguese and English (`t()`), imports at the top, short comments in Portuguese explaining why.

## Intended architecture

- `src/shared/battle/` (pure logic, no DOM or Three): `Grid` (tiles, height, cover), `Unit`, `TurnQueue`, `Abilities` (data), `Pathing` (movement, range, line of sight), `Combat` (hit, damage, fall), `Ai`, `BattleState` (serializable, cloneable), `History` (limited undo). Arthur's rule: state with a clear owner, a class only when there is a real lifecycle (e.g. `Battle` as the aggregate), composition instead of inheritance, data for the rest.
- `src/client/`: orthographic Three.js scene with `RenderPixelatedPass`, touch input, HUD (queue, ability bar, hit %, Confirm), i18n, sound.
- `src/shared/campaign/`: scenarios as data (battle or conversation), fork, ending.
- Inherited from Warlock and to keep: i18n, store, UI helpers (`dialog()`, `iconButton()`, `tabs()`, `choice()`, `searchFilter()`, `withTip`), `rng.ts`, CI/PR/docs. What belongs to Warlock (sim, match, bots, spells, lava, room worker) goes to the quarantine `D:\_PARA-APAGAR`, never deleted.

## To decide (does not block the start)

- Exact list of abilities and numbers for the 4 heroes and 4 enemies (decide by playing the 1st battle).
- Crit (does it exist? how much?).
- Speed formula and delay per ability.
- Decision cards and progression items.
- Monetization (format and price of campaigns) and measuring the pixel art on a real phone.
