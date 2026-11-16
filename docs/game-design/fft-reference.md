# Reference: Final Fantasy Tactics (PS1, 1997)

Reference study requested by Fernando on Nov 11, 2026 to start balancing. Internal use: not game content. FFT proper names appear only here. The study scenario built from it (`src/shared/battle/fft/`, the Gariland and basic-classes battles) was removed on Nov 16 (see `docs/decisions.md`); its sections below stay as the record of what it reproduced.

**Rule of this document:** every number has a source. What has no source is marked **unconfirmed** or **study assumption**.

## Sources

| Abbrev. | What it is | Link | How it was read |
|---|---|---|---|
| BMG | *Battle Mechanics Handbook* v6.1, by Aerostar (2004) | https://www.video-games-museum.com/en/faqs/Playstation/26882-Final-Fantasy-Tactics.pdf | PDF downloaded and text extracted on Nov 11; each number below was checked against the text |
| MAPA | Data of map 022 already extracted as JSON (`fft-map-json` repository) | https://raw.githubusercontent.com/rainbowbismuth/fft-map-json/master/data/MAP022.json | File downloaded on Nov 11 and read by script |
| NOMES | Map name list from FFTPatcher (`hex="16"` = Magic City Gariland; 0x16 = 22) | https://github.com/Glain/FFTPatcher | Read by a research subagent; not reopened |
| CoN | Guide to the battle at the Caves of Narshe | https://www.cavesofnarshe.com/fft/walkthrough?battle=2 | Read by a research subagent; not reopened |
| FAQ | PS1 FAQ/Walkthrough (v1.2, 2005) | https://www.video-games-museum.com/en/faqs/Playstation/26872-Final-Fantasy-Tactics.pdf | Read by a research subagent; not reopened |

Did not open (blocked): `ffhacktics.com` (403), `gamefaqs.gamespot.com` (403), `finalfantasy.fandom.com` (402), `web.archive.org`. Because of that, almost all mechanics come from a single source, the BMG, without a second check.

BMG notation: `[x]` drops the remainder of the division; `(a..b)` is a drawn integer, both ends included; `RU{x/y}` rounds up.

## Turn order (BMG 1.1 and appendix A.2)

- On every tick, each unit gains CT equal to its Speed. Whoever reaches **100 or more** has the turn.
- CT at the end of the turn:

| What the unit did | New CT |
|---|---|
| Moved and acted | CT − 100 |
| Only moved | CT − 80 |
| Only acted | CT − 80 |
| Neither moved nor acted | CT − 60 |

- If the new CT is above 60, it becomes 60.
- Tie (more than one unit with CT ≥ 100): the one with the lowest number in the character list acts first. Enemies are numbered first; the player's, by the tile where they were placed.
- Charged ability: it has a CTR (ticks until it resolves). Squire and Chemist have none.
- Haste and Slow: `[Speed × 3/2]` and half. Read by a subagent (BMG 5.2 and 5.3), not reopened.

## Attack damage by weapon (BMG 2.1)

| Weapon | Damage |
|---|---|
| Fist | `[(PA × Brave) / 100] × PA` |
| Sword, rod, spear, crossbow | `PA × WP` |
| Knife, longbow | `[(PA + Speed) / 2] × WP` |
| Knight's sword, katana | `[(PA × Brave) / 100] × WP` |
| Staff | `MA × WP` |
| Axe, flail, bag | `(1..PA) × WP` |
| Gun | `WP × WP` |

- Only fist, knight's sword and katana use Brave. Read by a subagent, not reopened: formulas for cloth, instrument, dictionary and magic gun.
- **Critical:** about 5% of attacks ("approximately" in the guide; the exact value is unconfirmed). The attribute becomes `XA + (1..XA) − 1` before multiplying by the weapon: the damage falls between normal and almost double. Pushes back 1 tile 50% of the time (read by a subagent, not reopened).
- Vertical range of melee: 1 tile, up to 2 in height coming from below and 3 coming from above (BMG B.1, in the knife table).

## Magic damage (BMG 3.2, 3.4 and 3.5)

Reopened in the guide on Nov 12 for the `fft-classes` scenario.

- Damage: `[(MA × caster's Faith × target's Faith × Q) / 10000]`, with Q fixed per spell (BMG 3.4: Fire, Ice and Bolt 14; Fire 2 18; Fire 3 24; Cure 14, Cure 2 20, Cure 3 30).
- **Fire** (BMG 3.3): damage with Q 14, range 4, area 2 (the target and the neighboring tiles), 6 MP, 4-tick charge, can be avoided by magic evasion. **Cure:** the same formula to heal, same range, area, MP and charge; it is not evaded.
- Spell hit chance (BMG 1.4): `[base × (100 − magic shield) × (100 − magic accessory) / 10000]`, from either side. Guide example: Flare against a 15% magic shield and a 30% mantle hits 59%.
- Status spell hit chance: `[Faith/100 × Faith/100 × (MA + Y)]`, with Y fixed per spell (read by a subagent, not reopened).
- **Slow action** (BMG 1.1 and A.1): spells and Charge only resolve after N ticks ("CTR"); whoever is the target can leave the tile in the meantime, and whoever is charging takes more damage (`XA × 3/2`, BMG 3.2).

## Archer's Charge (BMG 2.2)

- Charge +K adds K to PA and Speed in the weapon formula. Longbow: `[((PA + K) + (Speed + K)) / 2] × WP`.
- Charge ticks: +1 in 4, +2 in 5, +3 in 6, +4 in 8, +5 in 10, +7 in 14, +10 in 20, +20 in 35. The charge aims at the tile, not the unit.

## Knight's Battle Skill (BMG 3.6)

- Attribute break: hit chance `(PA + 50)%` before physical evasion (front, side, back). Speed Break takes 2 Speed; Power Break, 3 PA; Mind Break, 3 MA; Magic Break, half the MP.
- Equipment break: hit chance `(PA + WP + K)%`, with K 45 (helmet), 40 (armor), 55 (shield) and 30 (weapon). If the target does not have the piece, it becomes an ATTACK.

## Hit chance and evasion (BMG 1.4)

Base hit chance of the physical attack: 100%. The attacker's position decides which of the target's evasions count:

| Position | Hit chance in % |
|---|---|
| From the front | `[base × (100 − class) × (100 − shield) × (100 − accessory) × (100 − weapon) / 10^8]` |
| From the side | `[base × (100 − shield) × (100 − accessory) × (100 − weapon) / 10^6]` |
| From behind | `[base × (100 − accessory) / 100]` |

- The weapon's evasion only counts with the Weapon Guard reaction.
- Front, side or back: the greatest of the distances in front of, beside and behind the target wins; on a tie, front beats side and side beats back; tile height does not count. Reopened on Nov 12 and fixed in the test with the guide's 5x5 diagram (`tests/fft-supplements.test.ts`).
- Squire and Chemist: class evasion 5%. Ramza: 10%. With no shield or accessory at the start, the hit chance is 95% from the front and 100% from the side or behind: **in Gariland the direction barely changes the hit chance**; it matters with a shield (the Knight: 81% front, 90% side, 100% behind, calculations of this study).
- Guide example: from the side, a 40% shield and a 40% mantle leave a 36% hit chance.
- **Which way the unit turns when walking and attacking, and how the AI chooses the direction at the end of the turn: unconfirmed** (the guide does not cover it).

## Height and movement (BMG 6.5, 6.9 and 7.4)

- Move is how many tiles the unit walks; Jump is how much height it climbs in one step. The guide gives an example of climbing (Jump 3 climbs 3). **Rule for voluntary descent: unconfirmed.**
- Horizontal gap the unit leaps: `[Jump / 2]` tiles.
- Fall damage (knockback): `RU{((fall − Jump) × max HP) / 10}`, only when the fall exceeds the Jump.
- Longbow: range 3 to `5 + [(shooter's height − target's height) / 2]`. Crossbow and gun do not have this bonus.

## Zodiac (BMG 1.3)

Read by a subagent, not reopened; the study does not use it.

- Multipliers on the attribute: good ×1.25, bad ×0.75, best ×1.5, worst ×0.5. Does not affect evasion.
- **Table per sign: unconfirmed** (it came out misaligned in the PDF extraction).

## How the stats are born (BMG 7.1)

- `stat = [raw value × class multiplier / 1,638,400]`, minimum 1. Applies to HP, MP, Speed, PA and MA.
- Raw values at level 1:

| Gender | Speed | PA | MA | HP | MP |
|---|---|---|---|---|---|
| Male | 98,304 | 81,920 | 65,536 | 491,520 to 524,287 | 229,376 to 245,759 |
| Female | 98,304 | 65,536 | 81,920 | 458,752 to 491,519 | 245,760 to 262,143 |

- The guide's own example: a level 1 female Squire has 28 or 29 HP and 11 MP.
- Every recruit comes with Clothes (HP +5) and Leather Hat (HP +8): +13 HP.
- Growth per level: `raw bonus = [raw / (C + level)]`, with C from the class (read by a subagent, not reopened).
- Brave and Faith of a unit generated at the start of the game: 45 to 74 (BMG 6.10). **Ramza's Brave and Faith: unconfirmed.**

## Classes (BMG 7.4)

| Class | Move | Jump | Evasion | HP | MP | Speed | PA | MA |
|---|---|---|---|---|---|---|---|---|
| Generic Squire | 4 | 3 | 5% | 100 | 75 | 100 | 90 | 80 |
| Chemist | 3 | 3 | 5% | 80 | 75 | 100 | 75 | 80 |
| Ramza's Squire (chapter 1) | 4 | 3 | 10% | 125 | 105 | 107 | 111 | 102 |
| Knight | 3 | 3 | 10% | 120 | 80 | 100 | 120 | 80 |
| Archer | 3 | 3 | 10% | 100 | 65 | 100 | 110 | 80 |
| White Mage (Priest) | 3 | 3 | 5% | 80 | 120 | 110 | 90 | 110 |
| Black Mage (Wizard) | 3 | 3 | 5% | 75 | 120 | 100 | 60 | 150 |

The last five columns are the class multipliers. Equipment: the Squire uses knife, sword, axe and flail; the Chemist, knife and gun; both use hat, clothes and accessory, no shield. The Knight uses sword, shield, helmet and armor; the Archer, crossbow, bow and shield; the White Mage, staff; the Black Mage, rod.

### Level 1 calculated (male, raw HP in the middle of the range)

Calculation of this study with the formula above; the guide only shows the female Squire's.

| Unit | HP (with the +13) | PA | Speed | Weapon | Attack damage |
|---|---|---|---|---|---|
| Squire | 43 | 4 | 6 | Broad Sword (WP 4) | 16 |
| Chemist | 37 | 3 | 6 | Dagger (WP 3) | 12 |
| Ramza | 51 | 5 | 6 | Broad Sword (WP 4) | 20 |
| Knight | 57 (37 + leather helmet and armor, 10 each) | 6 | 6 | Broad Sword (WP 4) and Escutcheon | 24 |
| Archer | 43 | 5 | 6 | Long Bow (WP 4), range 3 to 5 | 20; Charge +1 24, +2 28 |
| White Mage | 37 | 4 | 6 | Oak Staff (WP 3), MA 4 | 12; Cure 20 (Faith 60) |
| Black Mage | 36 | 3 | 6 | Rod (WP 3), MA 6 | 9; Fire 30 (Faith 60) |

For the four new classes, the equipment (the cheapest weapon and armor each one uses) and Faith 60 are a **study assumption**. MP at level 1: 17 for both mages (enough for 2 spells of 6).

## Starting weapons (BMG B.1 and B.2)

| Weapon | Power (WP) | Evasion | Price |
|---|---|---|---|
| Dagger | 3 | 0 | 100 |
| Mythril Knife | 4 | 5 | 500 |
| Broad Sword | 4 | 5 | 200 |
| Long Sword | 5 | 10 | 500 |
| Escutcheon (shield) | evasion 10 | magic 3 | 400 |
| Long Bow | 4 | 0 | 800 |
| Oak Staff | 3 | 15 | 120 |
| Rod | 3 | 20 | 200 |
| Leather Helmet, Leather Armor | HP +10 each | | 200 each |

Another source (the Overated FAQ, read by a subagent) gives 5% evasion for the Dagger; kept as a divergence.

## Squire abilities (BMG 3.3)

| Ability | Range | Effect | Cost |
|---|---|---|---|
| Accumulate | self | PA +1, always hits | 300 JP |
| Dash | 1 tile, 1 in height | Damage `PA × (1..4)`, pushes back ~50%, cannot be evaded | 75 JP |
| Throw Stone | 4 tiles | Damage `PA × (1..2)`, pushes back ~50%, can be evaded | 90 JP |
| Heal | 1 tile, 2 in height | Cures Darkness, Silence and Poison | 150 JP |

Ramza's (Guts, BMG 3.3, reopened on Nov 12):

| Ability | Range | Effect | Cost |
|---|---|---|---|
| Yell | 3 tiles | Speed +1 on the target, always hits | 200 JP |
| Cheer Up | 3 tiles | Brave +5 on the target | 200 JP |
| Wish | 1 tile, 3 in height | Heals `RU{user's max HP × 2/5}` on the target and takes `RU{max HP × 1/5}` from the user | 0 JP |
| Scream | | Brave +10, PA +1, MA +1, Speed +1 | 500 JP |

**Which abilities each unit already has learned in the 1st battle: unconfirmed.** **What Wish does when the cost exceeds the user's health: unconfirmed.**

## Chemist items (BMG 2.5)

- Range 4 with line of sight for whoever has Throw Item (every Chemist has it); 1 for the others. Each use spends 1 item from the stock.

| Item | Effect | Cost |
|---|---|---|
| Potion | Heals 30 HP | 30 JP |
| Hi-Potion | Heals 70 HP | 200 JP |
| X-Potion | Heals 150 HP | 300 JP |
| Phoenix Down | Removes the Dead status and restores (1..20) HP | 90 JP |
| Antidote, Eye Drop, Echo Grass | Cure Poison, Darkness and Silence | 70, 80 and 120 JP |

**Starting item stock of the player and of the enemy Chemist: unconfirmed.**

## The Gariland battle

| Data | Value | Source |
|---|---|---|
| Victory | Defeat all enemies | CoN |
| Defeat | **Unconfirmed** (no open source says "Ramza down = game over") | |
| Enemies | 4 Squires and 1 Chemist | CoN and FAQ |
| Level, gender, equipment and abilities of the enemies | **Unconfirmed** | |
| Player side | Ramza, Delita as a guest (Squire, controlled by the game) and cadets; "Party Slots: 4" | CoN |
| How many cadets and of which classes | **Unconfirmed** (the FAQ mentions two Chemists among the cadets) | FAQ |
| Reward | Mythril Knife, Phoenix Down, Potion and 2,000 Gil | CoN |
| Guides' tip | The enemy Chemist heals the Squires: it is the priority target; a river divides the field | CoN and FAQ |
| Typical duration in turns | **Unconfirmed** | |

### The map (MAPA)

- Map 022, 10 wide by 15 deep. Height of each tile (row = y from 0 to 14, column = x from 0 to 9):

```
 2  2  5  2  0  0  0  0  2  3
 2  2  2  2  4  2  0  2  2  3
 0  0  2  8  6  2  0  2  2  2
 2  0  2  8  8  2  0  2  5  2
 2  0  0  6  6  2  2  2  2  0
 2  0  2  2  2  2  2  2  2  0
 2  0  8  6  2  0  0  2  4  5
 2  2  8  8  2  0  0  2  6  6
 0  2  6  6  2  0  2  2  8  8
 0  2  3  5  4  0  2  2  6  8
 0  0  0  0  2  0  2  2  2  1
 0  2  2  2  2  0  0  0  2  2
 7  8  7  2  2  2  2  2  2  2
 8 10  8  6  4  0  0  2  2  3
 8  9  8  7  4  0  0  0  2  3
```

- Not walkable: only two tiles, the trees at (2,0) and (8,3).
- Water (depth 1) on the height-0 tiles of the channel; the file marks them as walkable. The movement rule comes from BMG 6.5 (see the Water row in "Fidelity of the study scenario").
- Starting tiles in the file, 4 per side: (7,1), (8,1), (5,1), (3,1) on one side and (8,12), (7,12), (4,12), (3,12) on the other. The file calls the sides "Player 1" and "Player 2" and does not say who occupies each; **whether they are the story battle's tiles: unconfirmed.**

## Fidelity of the study scenario

What the `fft-gariland` and `fft-classes` scenarios reproduced and what they simplified (updated Nov 12; both removed Nov 16).

| Item | In the study | Fidelity |
|---|---|---|
| Heights and non-walkable tiles | Same as the file | High |
| Ramps | In the rules they become steps (the lower edge counts); in the drawing, since Nov 12, the top slopes per the file's slope_type and slope_height (the 2 corner ramps stay flat) | Medium |
| Water | Since Nov 12, shallow flowing water (`depth: 1`) by the BMG 6.5 rule: walking costs 2, whoever is in it sits 1 level lower; water of 2 or more blocks (none on the map). Knockback stopping in deep water: our assumption. Report in `docs/medicoes/agua-2026-11-12.md` | Medium: the rule is the guide's, the knockback has no source |
| Roofs, bridges, chimneys, crates, stone and wood floor | Since Nov 12, one KayKit piece per tile by the file's surface_type (counts equal to the file's, fixed in a test) | Medium: each tile's type is faithful, the pieces are ours |
| Height of one level in the drawing | 0.25 of a tile, visual choice | No source |
| Stats, health, damage, Move, Jump, CT | By the BMG formulas and tables | High |
| Hit chance | Front, side and back by the BMG diagram, with class and shield evasion | High |
| Direction | Starts facing away; turns when walking (where it went) and when acting (toward the target); the player chooses at the end of the turn (↻ button or T key); the AI ends facing the nearest enemy | Turning rule without a source |
| Critical | 5%, damage by the formula; no critical knockback | Medium |
| Dash and Throw Stone knockback | 50%, 1 tile | High |
| Fall | BMG formula | High |
| Hit when pushed against an obstacle | 3 damage, our engine's rule | No source in FFT |
| Fallen unit | Leaves the battle (in FFT it stays down and can be revived) | Low |
| Accumulate, Yell, Wish | By the BMG formulas; PA and Speed bonuses last the battle | High |
| Wish with low health | The user is left with 1 health | Assumption |
| Phoenix Down, Heal, Cheer Up, Scream, statuses | Out | Not reproduced |
| Potions | 4 per Chemist | Assumption |
| Magic and Charge | Since Nov 12, an action with a real charge: Fire and Cure 4 ticks, Charge +1 and +2 4 and 5 (BMG 3.3, 2.2 and A.2); whoever charges has no evasion and takes +50% (BMG 6; ours since Nov 15: the charging unit loses 50 physical and 25 magic resistance instead, and its dodge still counts). Fire and Cure follow the unit (unconfirmed); Charge aims at the tile. Since Nov 15 the player picks the lock (character or tile; that FFT split is only the default) | High |
| Knight's breaks | Only Speed Break and Power Break (the equipment ones need equipment in the engine) | Medium |
| Longbow | Range 3 to 5, without the height gain of BMG 6.9 | Medium |
| Faith and Brave | 60 for everyone | Assumption |
| Line of sight for stone and potion | Not required | Assumption |
| Vertical range of melee | No limit | Not reproduced |
| Player cast | Ramza, Delita, 2 Squires and 1 Chemist, all controlled by the player | Assumption |
| Delita's sheet | Generic Squire | Assumption |
| Enemies | Level 1, men, Squires with Broad Sword and Chemist with Dagger | Assumption |
| Abilities | Every Squire has Throw Stone, Dash and Accumulate; Ramza also Wish and Yell; Chemist has Potion | Assumption |
| `fft-classes` | One unit of each class per side, on the Gariland map and the file's starting tiles | Test bench, not an FFT battle |
| Starting tiles | The file's 4 per side; the 5th of each side was chosen nearby | Assumption |
| Defeat | All heroes down | Assumption |
