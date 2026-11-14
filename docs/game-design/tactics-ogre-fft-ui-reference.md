# Reference: FFT battle screen and Tactics Ogre mechanics

Study requested by Fernando on Nov 13, 2026 ("you can take all the FFT and Tactics Ogre references possible for this first part of development"). Internal use: only mechanics and flow are copied, never art, text, music or names. Complements `fft-reference.md` (FFT formulas from the Battle Mechanics Handbook); what is already there is not repeated here, only pointed to by section.

**Rule of this document:** every claim has a source and a game version. What has no source is marked **unconfirmed**; what is our own calculation or conclusion is marked **deduction**.

## Sources

How each was read, on three levels:
- **Text extracted here:** PDF downloaded on Nov 13 and read by script; the safest level.
- **Page opened (summary):** the page opened, but was read through an automatic summary; the meaning is reliable, the wording is not.
- **Search only:** the page did not open; only the snippet the search engine showed counts. Every claim that depends on this says "(search only)".

| Abbrev. | What it is | Version | Link | How it was read |
|---|---|---|---|---|
| TUT | Script of the tutorial inside FFT itself, transcribed by the Corpse Brigadier site. The cited pages go as `02_03`, `03_15` etc. | PS1 (deduction: it cites the L2 and R2 buttons and the "Wide" sound, which the PSP does not have) | https://corpsebrigadier.neocities.org/2022/content/info/tutorialscript.html (page `x_y` at `.../tutorial/tutorial_x_y.html`) | Page opened (summary) |
| BMG | *Battle Mechanics Handbook* v6.1, by Aerostar (2004), the same one as in `fft-reference.md` | PS1 | https://www.video-games-museum.com/en/faqs/Playstation/26882-Final-Fantasy-Tactics.pdf | Text extracted here (sections 4.1, 4.3 and 6.5) |
| MAPA | Map 022 (Gariland) as JSON, the same one as in `fft-reference.md` | PS1 | see `fft-reference.md` | Not reopened |
| KAIN | *Tactics Ogre FAQ*, by Kain (Zhou Tai An), 1998; says a good part comes from Japanese pages (rpgdl.com) | PS1 | https://www.video-games-museum.com/en/faqs/Playstation/29008-Tactics-Ogre-Let-Us-Cling-Together.pdf | Text extracted here |
| ZAHL | *Tactics Ogre: LUCT FAQ/Walkthrough*, by Zahlzeit, v2.23 (2016) | PSP | https://www.video-games-museum.com/en/faqs/PSP/12539-Tactics-Ogre-Let-Us-Cling-Together.pdf | Text extracted here |
| SKILL | *Tactics Ogre: LUCT Skill FAQ*, by coineineagh, v3.3 (2015) | PSP | https://www.video-games-museum.com/en/faqs/PSP/12545-Tactics-Ogre-Let-Us-Cling-Together.pdf | Text extracted here |
| GDEV | "What's old is new again" analysis (Game Developer) | PSP | https://www.gamedeveloper.com/business/what-s-old-is-new-again-a-tactics-ogre-let-us-cling-together-analysis | Page opened (summary) |
| RS-N | RPG Site news about the Reborn systems | Reborn | https://www.rpgsite.net/news/13383-tactics-ogre-reborn-details-skills-battiefield-elements-unit-recruitment-the-wheel-of-fortune-the-chariot-tarot-rewind-feature-and-the-world-tarot-route-change-mechanic | Page opened (summary) |
| RS-R | RPG Site review of Reborn | Reborn | https://rpgsite.net/review/13468-tactics-ogre-reborn-review | Page opened (summary) |
| FW | Final Weapon: Reborn news (Oct 12, 2022) and battle system (Aug 25, 2022) | Reborn | https://finalweapon.net/2022/10/12/tactics-ogre-reborn-details-new-features-and-enhancements/ and https://finalweapon.net/2022/08/25/tactics-orge-reborn-details/ | Page opened (summary) |
| DENG | Dengeki Online, Reborn battle design (Japanese) | Reborn | https://dengekionline.com/articles/151981/ | Page opened (summary) |
| IMP | Game Watch (Impress): review and news on Reborn's basic systems (Japanese) | Reborn | https://game.watch.impress.co.jp/docs/review/rev1/1453661.html and https://game.watch.impress.co.jp/docs/news/1434503.html | Page opened (summary) |
| COG | COGconnected review of Reborn | Reborn | https://cogconnected.com/review/tactics-ogre-reborn-review/ | Page opened (summary) |
| VOOKS | Vooks review of Reborn (Switch) | Reborn | https://vooks.net/tactics-ogre-reborn-switch-review | Page opened (summary) |
| DMG | "How Damage is Calculated in Tactics Ogre: Reborn", v1.01 (Jan 20, 2023), by /u/charlesatan, from data extracted from the game | Reborn | https://docs.google.com/document/d/1Q1nUEH7xD8XE-IdUpVs5qUvJSN9FECzeWQR_aRE-aEE | Page opened (summary) |
| TIC-P | RPG Site preview of The Ivalice Chronicles | FFT 2025 | https://www.rpgsite.net/preview/18317-final-fantasy-tactics-the-ivalice-chronicles-new-voice-acting-makes-it-feel-like-a-whole-new-game | Page opened (summary) |
| TIC-R | RPG Site review of The Ivalice Chronicles | FFT 2025 | https://www.rpgsite.net/review/18508-final-fantasy-tactics-the-ivalice-chronicles-review | Page opened (summary) |
| XBOX | Xbox Wire tips for The Ivalice Chronicles | FFT 2025 | https://news.xbox.com/en-us/2025/09/29/final-fantasy-tactics-the-ivalice-chronicles-tips-for-new-and-returning-players/ | Page opened (summary) |
| ENG | Engadget review of The Ivalice Chronicles | FFT 2025 | https://www.engadget.com/gaming/final-fantasy-tactics-ivalice-chronicles-review-140000972.html | Page opened (summary) |
| BUSCA | Search snippets of pages that did not open: Sportskeeda (previews of Reborn and Ivalice Chronicles), RPGamer, PC Gamer, Kotaku and DSOGaming (Reborn), Press Start (Ivalice Chronicles), RPGFan and Destructoid (WotL), Square Enix "A closer look at Tactics Ogre: Reborn", Caves of Narshe (battle 16), FFHacktics wiki (SEQ) | various | https://sportskeeda.com/esports/final-fantasy-tactics-ivalice-chronicles-preview · https://www.sportskeeda.com/esports/tactics-ogre-reborn-ps5-preview-more-simple-visual-overhaul · https://rpgamer.com/review/tactics-ogre-reborn-review/ · https://pcgamer.com/tactics-ogre-reborn-review · https://kotaku.com/tactics-ogre-reborn-review-remaster-tactics-jrpg-switch-1849774409 · https://www.dsogaming.com/?p=167341 · https://press-start.com.au/reviews/ps5-reviews/2025/10/13/final-fantasy-tactics-the-ivalice-chronicles-review-well-worth-it/ · https://www.rpgfan.com/review/final-fantasy-tactics-the-war-of-the-lions/ · https://www.square-enix-games.com/news/tactics-ogre-reborn · https://www.cavesofnarshe.com/fft/walkthrough.php?battle=16 · https://ffhacktics.com/wiki/SEQ | Search only |

Did not open in this research (blocked or empty page): `ogrebattlesaga.fandom.com` (402), the `breezewiki.discard.no` mirror of the Final Fantasy wiki (certificate error), `strategywiki.org`, `gematsu.com`, `pushsquare.com`, `rpgamer.com`, `dsogaming.com` (403), `sportskeeda.com` (405), `pcgamer.com` (truncated text), `hardcoregaming101.net` (server migration), `square-enix-games.com` (only the site menu). `gamefaqs.gamespot.com` and `finalfantasy.fandom.com` are blocked according to `fft-reference.md` (Nov 11) and were not tried again. The mechanics *In-Depth FAQ* for the PSP Tactics Ogre lives on GameFAQs and was left out.

**Weak coverage:** The War of the Lions (PSP, 2007) only appears through search snippets about slowness; no source read describes a difference in screen or rules compared to the PS1. The Reborn Tactics Ogre has no source on direction or on trees.

### Versions and names

| Game | Versions cited | Turn order |
|---|---|---|
| Final Fantasy Tactics | PS1 (1997), The War of the Lions (PSP, 2007), The Ivalice Chronicles (2025, outside the request, but it answers screen questions) | CT (`fft-reference.md`, "Turn order") |
| Tactics Ogre: Let Us Cling Together | PS1 (port of the 1995 Super Famicom game), PSP (remade in 2010), Reborn (2022, remade from the PSP) | PS1: WT. PSP and Reborn in English: RT, *Recovery Time* (SKILL, FW). The Japanese article on Reborn calls it WT (IMP) |

## What FFT's tutorial answers anew

Points that `fft-reference.md` marks as unconfirmed, or does not cover, and that the game's tutorial (TUT) answers:

| Subject | What the tutorial says | Page |
|---|---|---|
| Direction at the end of the turn | After the turn ends, the player chooses which way the unit faces; direction changes evasion against attacks, and the tutorial says to turn toward the enemy | 02_03 |
| Moving cannot be undone | After choosing Move, it cannot be cancelled | 03_08 |
| Charged spell: unit or tile | Whoever charges fixes the target on a unit (the area moves along if it moves) or on a tile (the area stays; the spell goes off even with nobody there) | 03_10 and 02_05 |
| Horizontal gap | Beyond `[Jump / 2]` tiles, the edge you jump from must be at least as high as the one you arrive at | 03_15 |
| Wait | Waiting without moving or acting restarts the charge at 40; after moving or acting, at 20 | 02_04 |

- The Wait line matches the BMG (CT − 60 and CT − 80, `fft-reference.md`, "Turn order") when the unit had CT 100 (**deduction**).
- **Divergence about water of depth 2.** The tutorial (03_16) says: "If you stop when the water depth is 2h, you can't move." The BMG 6.5 says the unit cannot act or react; the BMG note on Float talks about not being able to move. Not resolved here. Our game currently treats 2 or more as water you cannot enter (`src/shared/CLAUDE.md`, "Água em todos os mapas").

## 1. Battle screen and turn flow

### 1.1 Command menu

- **FFT (PS1):** on the unit's turn, the menu has Move, Act, Wait, Status and Auto-Battle (TUT 02_02). A unit does one Move and one Act; Wait closes the turn without doing one of the two (02_02). The tutorial warns to think about range before moving, because after moving there is no going back (03_08); one can act before moving (**deduction** from the same warning). The unit's menu opens with the confirm button on it (02_01). Auto-battle has fighting styles (fight to the end, support an ally, flee) and is turned off through the menu itself (02_02).
- **Where the menu appears on screen (near the unit, in a corner): unconfirmed**, in neither FFT nor Tactics Ogre. No text source read says; the tutorial only says when the menu opens.
- **The Ivalice Chronicles:** the interface was redone to command faster (XBOX), with no description of the position.
- **Tactics Ogre Reborn:** four AI modes for allies (attack, defend, shoot from afar, heal), and all allies switch between manual and automatic at once, in preparation or mid-battle (FW, DENG).

**For Dungeon Tactics:** putting the menu beside the figure is our own decision, with no source to copy. What has a source and is worth copying: one move and one act at a time, in any order, and Wait as the third way out. FFT does not allow undoing the move; Tactics Ogre allows going back moves (section 2.8), and we already have limited undo, so it stays as it is.

### 1.2 Target choice, confirmation and attack preview

- **Colors in FFT (PS1):** movement tiles flash blue; a tile where you cannot stop turns red at the cursor; the strike's range flashes red and the area of effect yellow-green (TUT 02_01 and 02_03). An option makes allies and enemies flash in different colors while aiming (02_08).
- **Preview in FFT (PS1):** appears at the bottom of the screen, with the attacker on the left and the target on the right; shows the expected damage (or healing) and the chance of success; a status spell shows the status name and the chance; the name of the target's reaction (counter-attack, for example) appears below its status (TUT 02_03 and 03_09). The physical chance already discounts class, shield and accessory evasion (03_09). You confirm after seeing the area and effect (02_03).
- **Health bar with the portion that goes away: unconfirmed** in any version.
- **Tactics Ogre (PS1):** when choosing to act, the bottom right corner of the status bar shows the total attack and defense bonus, already with terrain and weather (KAIN).
- **Tactics Ogre Reborn:** the preview shows damage, hit chance and the element's effect (Sportskeeda, search only). Bow, crossbow and straight-line projectile spells show the trajectory before the shot, to avoid hitting an ally (FW, DENG, IMP). The health bar above each unit can be turned on and off (IMP).

**For Dungeon Tactics:** our preview already calculates chance, side of the hit and minimum and maximum damage (`TargetPreview` in `src/shared/battle/combat.ts`). Copy from FFT the side-by-side comparison (attacker on the left, target on the right) with the name of the target's counter-attack, if any; copy from Reborn the trajectory line on ranged attacks and the health bar above the units. The portion of health that goes away stays our own decision, with no source.

### 1.3 Turn list and charged spell

- **FFT (PS1):** the turn list opens through the environment menu, Active Turn option; in it the spell appears by name, next to the unit, in the order it will go off (TUT 03_04 and 02_05). In the spell menu, the Turn column says at which point of the list the spell goes off: 2 means one unit plays before it, 3 means two do (03_05). Left and right on the spell open the detailed list with it slotted in (03_05). The unit's sheet shows its position in the queue over the total number of units, and the tutorial warns that it is an estimate, because Wait changes the count (02_04). With no menu open, a button moves the cursor across the units in turn order (03_04).
- **During the charge (FFT PS1):** if the unit's turn comes before the spell goes off, acting again cancels the spell; waiting lets the charge continue (TUT 02_05).
- **The Ivalice Chronicles:** the list stays fixed on the side of the screen (TIC-P, TIC-R; Press Start says left side, search only), shows the abilities and spells that are about to go off (Sportskeeda, search only) and, when highlighting an action in the menu, shows where the unit will land in the queue (TIC-P).
- **Tactics Ogre (PS1):** a button shows the turn order; it must be turned on in the options (KAIN).
- **Tactics Ogre Reborn:** the order stays at the bottom of the screen (COG; RPGamer, search only).

**For Dungeon Tactics:** we already have the list at the top with charges at the point where they go off (`src/shared/battle/turn-queue.ts`). The next step with a source is the Ivalice Chronicles one: when hovering over a menu action, show on the list where the unit would land (Wait, only move or only act, and move and act have different costs) and, for a charged spell, where it would go off, like FFT's Turn column. Recorded difference: in FFT the player chooses whether the charge follows the unit or stays on the tile; in our game this is fixed per ability (`panel`, `src/shared/CLAUDE.md`, "IA e carga").

### 1.4 Tile information

- **FFT (PS1):** the height of the tile under the cursor is in the top right corner; right below it, the sheet of the unit standing on it (TUT 02_01). On bridges and other layered terrain, the cursor alternates between the layers (02_01).
- **Tactics Ogre (PS1):** the inspect button shows everything about the chosen terrain, including the geographic effect, with the tile's attack and defense value (KAIN).

**For Dungeon Tactics:** a fixed corner with the height and type of the tile under the cursor; when putting terrain effect in the rules (section 2.4), show the number there, like Tactics Ogre.

### 1.5 Camera

- **FFT (PS1):** two buttons rotate the field, one zooms in and out, another switches to a higher angle; holding a button and using the arrows scrolls the screen (TUT 02_01). **How many degrees each rotation gives: unconfirmed** (the text does not say).
- **The Ivalice Chronicles:** the camera rotates and tilts (ENG) and there is a straight top-down view, to read the map without obstruction, but without giving orders in it (TIC-P, TIC-R); in the demo it was by holding a button (TIC-P).
- **Tactics Ogre Reborn:** more perspective options (COG) and a 2D map view that helps read heights (IMP).

**For Dungeon Tactics:** rotation, two angles and zoom, like FFT. The top-down view is useful for reading heights, but the two versions that have it do not let you command in it; if we build it, decide whether it commands.

## 2. Mechanics

### 2.1 Direction (front, side, back)

- **FFT (PS1):** the direction is chosen by the player at the end of the turn (TUT 02_03) and changes only the hit chance, through the evasions that count on each side (`fft-reference.md`, "Hit chance and evasion"). The BMG damage formulas have no direction term (**deduction**: a hit from behind lands more often, it does not hit harder).
- **Tactics Ogre (PS1):** hit chance rises 25% from the side and 50% from behind (KAIN). Single source, from 1998, taken from Japanese pages; whether the addition is in points or in proportion: **unconfirmed**.
- **Tactics Ogre (PSP):** attacking from behind improves the hit chance, with no number (ZAHL).
- **Tactics Ogre Reborn:** **unconfirmed**. The damage document (DMG) does not cover direction.

**For Dungeon Tactics:** we already have +15 hit chance from the side and +30 from behind, as initial numbers (`SIDE_BONUS` and `BACK_BONUS` in `combat.ts`, Nov 13). The PS1 Tactics Ogre gives +25 and +50: it is the reference if direction needs to weigh more, after measuring in the simulator. In FFT direction does not add damage (deduction above); in Tactics Ogre no source read talks about damage by direction. With what we have, keep direction only on hit chance.

### 2.2 Jump and gap

- **FFT (PS1):** jump and the `[Jump / 2]` tile gap and the edge rule on ramps are in `fft-reference.md` ("Height and movement") and in BMG 6.5. New: the gap requires the departure edge to be at least as high as the arrival one (TUT 03_15); the jump bonus increases the gap, but the ability that ignores height does not (BMG 6.5).
- **Tactics Ogre (PSP):** climbing and descending are separate limits. Most fighting classes climb 2 and descend 3; mages and clerics climb 1 and descend 2; the Ninja walks 5, climbs 3 and descends 4; flyers ignore height (SKILL, each class's sheet). On the PS1 the Ninja already climbed 3 and descended 4 (KAIN).
- **Vertical range of the strike:** in the PSP Tactics Ogre, common melee reaches 2 in height upward and 3 downward (SKILL); on the PS1, spear and whip reach 1 tile more and 2 in height more (KAIN). In FFT, the vertical limit appears in the ability's help text (for example, "Vertical 2") (TUT 03_06; numbers in `fft-reference.md`, "Attack damage by weapon").

**For Dungeon Tactics:** we already have jump per class (climbing and descending equal) and FFT's gap (`leaps` in `pathing.ts`). Missing is the tutorial's edge rule: today the gap lands up to `jump` levels above where it started, and in FFT the arrival tile cannot be higher than the departure one. Tactics Ogre also suggests descending 1 more than you climb and magic classes with a smaller jump; and a height limit on the melee strike (climb 2, descend 3), which we do not have today (`inAbilityRange` only looks at distance and the extra range from height). All of this affects map victory: measure first.

### 2.3 Height

- **FFT (PS1):** height gives range to the longbow (`fft-reference.md`, "Height and movement"); in the BMG formulas, height does not add damage or hit chance (**deduction**). Whoever is in water counts the tile's height minus the depth (BMG 6.5).
- **Tactics Ogre (PSP):** the bow shoots in an arc, passes over obstacles and goes beyond the marked range when fired from high up; from below, it loses range (SKILL). The archer gains attack and hit chance the higher he is (GDEV).
- **Tactics Ogre (PS1):** the arrow almost always goes 1 tile beyond what is marked, sometimes 2, much more from top to bottom, and almost never rises more than 2 in height (KAIN).
- **Tactics Ogre Reborn:** height and line of sight count in the action (RS-R); some forbidden spells change the damage by the defender's height (DMG).

**For Dungeon Tactics:** we already have extra range from height (`pathing.ts`) and +5 hit chance per level above the target, for everyone (`HEIGHT_BONUS` in `combat.ts`), closer to Tactics Ogre than to FFT. If the high ground needs to be worth more, Tactics Ogre gives the way (more damage for the archer up high), measuring in the simulator.

### 2.4 Terrain

- **Water (FFT PS1):** is in `fft-reference.md` and in our game. The divergence about depth 2 is at the top of this document. Some swamps have depth 2 (Caves of Narshe, search only). With heavy rain, swamp and still lake also cost 2 to walk (BMG 6.5).
- **Lava (FFT PS1):** the float ability lets you stop on top of lava; the float status lets you pass, but not stop (BMG 4.3); the BMG also cites, in passing, an ability to walk on lava. So, without one of them, you do not stop on lava (**deduction**). **Whether lava hurts: unconfirmed.**
- **Trees (FFT PS1):** on the Gariland map, the only two tiles where you cannot stand are trees (MAPA). It is the data of one map only; **as a general rule, unconfirmed**.
- **Shooting with an obstacle (FFT PS1):** a wall or unit in the way takes the arrow or bullet instead of the target; a preview with effect 0 is a sign of this (TUT 03_14). At night, bow and crossbow hit less (BMG 6.5).
- **Geographic effect (Tactics Ogre PS1):** each terrain gives an attack and a defense value to whoever stands on it, and 5 points of difference can change hit chance and damage by 20% or more (KAIN). Guide examples: road attack 40 and defense 20; water attack 10 and defense 5, even for swimmers; lava defense 30 (KAIN).
- **Tactics Ogre (PSP):** some classes have "+Swim" and a dragon walks on lava, a sign that the others do not (SKILL, **deduction**). A fallen unit becomes an obstacle until revived or exorcised (ZAHL). Weather changes the hit chance of some ranged weapons (ZAHL).
- **Tactics Ogre Reborn:** the terrain of the tile the unit is on changes melee and ranged hit chance; bad weather reduces hit chance and may change the cost of walking on some terrains (RS-N).
- **Trees in Tactics Ogre: unconfirmed.**

**For Dungeon Tactics:** forest is already not walkable and blocks the view of whoever is on the same level (`grid.ts`), which matches the only FFT data point; and a Tactics Ogre-style terrain effect already exists: −20 hit chance at range against whoever is on terrain with cover (`COVER_PENALTY` in `combat.ts`). If forest blocks the path too much, Tactics Ogre suggests the other way: a walkable tile with a defense bonus (the "geographic effect"), shown in the tile information. For lava, FFT only gives "you do not stop"; lava damage would be our own rule.

### 2.5 Counter-attack

- **FFT (PS1):** it is not automatic. It is a reaction ability: it triggers at the unit's Brave percentage, even if the strike misses, and only if the attacker is within the reacting unit's weapon range; the counter-attack does not generate another reaction (BMG 4.1). The reaction is immediate when the unit becomes a target (TUT 03_32), and its name appears in the preview (03_09).
- **Tactics Ogre (PS1):** the guide says a lancer counter-attacks and can hit the ally who was in between (KAIN); this suggests a counter-attack without a purchased ability (**deduction**; the exact rule was not confirmed).
- **Tactics Ogre (PSP and Reborn):** counter-attack becomes a support ability, in 4 levels on the PSP (SKILL; RS-N). Reborn also has the pincer attack: the ally on the other side of the enemy lands an extra hit (Square Enix, search only).

**For Dungeon Tactics:** today we have no counter-attack (search in `src/` with no results, Nov 13). If it goes in, the model with a source is FFT's: an ability of the defender, with a chance, only within weapon range, and with the name in the attacker's preview.

### 2.6 Charge and turn order

- **FFT (PS1):** in `fft-reference.md` ("Turn order", "Slow action") and in section 1.3.
- **Tactics Ogre (PS1):** each unit's wait is 550 minus agility, plus what equipment adds or removes, plus or minus the class value (KAIN). Moving and acting lengthen the wait until the next turn (GDEV, about the PSP).
- **Tactics Ogre (PSP):** each class has a recovery time; the lower, the earlier it plays (**deduction** from how the guide uses it). Examples: Ninja 22, Cleric 24, Mage 25, Archer 26, Warrior 32, Knight 36 (SKILL). Some abilities add extra time (the guide lists one with +20) (SKILL). Here the strong action delays the user's next turn, instead of taking long to go off.
- **Tactics Ogre Reborn:** friends and enemies in the same queue; the wait comes from equipment weight, class and actions (IMP, FW).

**For Dungeon Tactics:** the rule already decided is FFT's ("Habilidade forte é lenta pela carga, não por atraso", `src/shared/CLAUDE.md`). Tactics Ogre is recorded as an alternative, with no suggestion to switch.

### 2.7 Damage and hits to take down

- **FFT (PS1):** multiplicative damage (strength times weapon power; `fft-reference.md`, "Attack damage by weapon"). With the level 1 table in `fft-reference.md`: a Squire (43 health) falls to 3 hits from another Squire (16), 3 from Ramza (20), 2 from the Knight (24), 4 from the Chemist (12) and 2 Fires from the Black Mage (30) (**deduction**). Hit chance of 95% to 100% without a shield, critical of about 5% (`fft-reference.md`).
- **Tactics Ogre Reborn:** subtractive damage: the attacker's attributes minus the defender's, plus the weapon's attack minus the equipment's defense, with weights per weapon type (DMG). The inflated attributes make enemies take a long time to fall until the bonus cards come in (RS-R).
- **Hits to take down in Tactics Ogre: unconfirmed.**

**For Dungeon Tactics:** the FFT reference is 2 to 4 hits, 3 in the common case, for an early unit to fall. It serves as a target to measure against after the Nov 13 adjustment (damage ×1.75 for "slow battle").

### 2.8 Battle length and undoing moves

- **FFT:** **turns per battle: unconfirmed.** Gariland has 5 enemies; the size of the player's side is a study assumption (`fft-reference.md`, "The Gariland battle").
- **Tactics Ogre Reborn:** one map took 40 minutes and battles come close to 1 hour with fine control of each unit (VOOKS); even at 2x, it gets slow with a dozen units on each side (DSOGaming, search only).
- **Undoing moves:** on the PSP, the time-rewind feature (Chariot Tarot) keeps the last 50 moves and any one can be resumed (ZAHL, GDEV); repeating the same action gives the same draw, changing anything draws again (GDEV, IMP). In Reborn, the start of the game lets you go back up to 10 moves and the limit grows later (RS-N); the Japanese review mentions up to about 50, depending on the scene (IMP). PSP × Reborn divergence recorded, not resolved.

**For Dungeon Tactics:** measure turns and minutes per battle in the simulator, because no source gives FFT's number. Our undo does the opposite of Tactics Ogre with the draw: there, the same action repeats the same result; here the draw does not come back and attacking again may give another, which is why attack undo is limited (`battle.ts`).

## 3. Pace and animation

The text sources do not give frames per tile when walking, jump duration, or how long the damage number stays on screen; **all of this: unconfirmed**. What exists:

- **FFT (PS1):** has a time base of about 59 Hz and animations wait a number of frames per command; there are separate walking animations for normal and accelerated speed (FFHacktics, search only).
- **FFT (PS1 options):** message speed, showing or not the ability name, the effect message and the experience gain (TUT 02_08). These are the time cuts the game offers.
- **The War of the Lions:** slower than the PS1 in spell animations (RPGFan 2007 and 2008, Destructoid, search only).
- **The Ivalice Chronicles:** speed up by holding a button (TIC-R) and a speed option (ENG, XBOX).
- **Tactics Ogre Reborn:** double speed button for all animations (RS-R, IMP; PC Gamer and Kotaku, search only).
- **Camera following the action: unconfirmed.**

**For Dungeon Tactics:** put the 2x speed in right away and the options to hide the name and messages; the times for walking, jumping and showing damage come from our own measurement. To get FFT's numbers, count frames in a gameplay video at 60 frames per second.

## 4. Summary per ongoing front

| Front | What the sources say | Source |
|---|---|---|
| Menu beside the figure | Menu position: unconfirmed. Flow: one move and one act, in any order, plus Wait | TUT |
| Attack preview | Attacker on the left, target on the right, expected damage, chance and name of the target's reaction (FFT); shot trajectory and health bar above the units (Reborn). Portion of health that goes away: unconfirmed | TUT, FW, DENG, IMP |
| Turn list with charge | We already have it; the next step is to show where the chosen action puts the unit in the queue | TUT, TIC-P |
| Direction and hit chance from behind | FFT: only hit chance, through evasions. Tactics Ogre PS1: +25 side, +50 back. Us: +15 and +30 | BMG, KAIN |
| Trees blocking passage | FFT: tree not walkable on 1 map. Tactics Ogre: unconfirmed; alternative of terrain with defense | MAPA, KAIN |
| Damage per hit and pace | FFT: 2 to 4 hits, 3 in the common case (deduction). Turns per battle: unconfirmed. Speed-up in both remakes (2x confirmed only in Reborn) | `fft-reference.md`, RS-R, TIC-R |
