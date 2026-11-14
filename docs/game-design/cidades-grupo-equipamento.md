# Towns, party management, equipment, recruiting and new classes

Request from Fernando (Nov 13): "create the character management menu just like FFT's and towns just like FFT's too, with taverns, side quests, equipment, shops, recruiting; implement new classes; and overall keep testing in loops to find bugs and improvements in interface, UX and game feel".

Reference: only the flow and mechanics of FFT (PS1) and Tactics Ogre; no art, text, names or music (project rule). Sources already gathered in `referencia-fft.md` and `referencia-tactics-ogre-e-fft-ui.md`.

## 1. Party management ("Formation", like FFT)

- **Where:** Party button on the map (G key, the read-only list already exists in `world-ui.ts` `openParty`) and inside every town.
- **Screen 1, list:** portrait, name, class and health of each unit; marks who goes to the next battle (up to 4) and who stays in camp.
- **Screen 2, unit sheet** (when someone is chosen): numbers (health, speed, movement, jump), abilities with an explanation of each, the 3 equipment slots (weapon, armor, accessory) and the actions:
  - **Equip:** picks an item from the party chest for each slot; shows before → after for each number, like FFT.
  - **Change class:** among the unlocked classes; abilities come from the class (learned per stage, `party(n)`).
  - **Dismiss:** recruits only; story characters stay.
- **Data:** the party saved in `dt:grupo` (list of units: base/class, name, equipment, recruited or story) and the chest in `dt:bau` (items and gold). Trust boundary: `parseGroup`/`parseChest` reject garbage, like the other saves.

## 2. Equipment

- **Rule (src/shared):** an item is data with general stats, equal against everything (project rule): `+health`, `+damage` (adds to the range of physical or magical abilities, depending on the item), `+accuracy`, `+movement`, `+jump`, `+speed`. The battle sheet = class + items (`buildDevScenario` already builds each unit's sheet: add it up there).
- **Slots:** weapon (damage/accuracy), armor (health), accessory (movement, jump, speed).
- **Balancing:** each item measured in the simulator before it goes in (`MEDIR=300`); the campaign curve must keep falling stage by stage.

## 3. Towns

- **On the map:** town points (Vauclair and one in Act II), entered the same way as story points. Entering opens the town menu in parchment, over the map, with the town music.
- **Tavern:** rumors (short lines that tell the story and give hints) and **optional quests**: extra battles off the main line, with their own rule (survive N turns, protect an ally, defeat a boss), which give gold and items. A quest disappears after it is won.
- **Shop:** buying and selling equipment with the chest's gold; stock grows each act. Shows before → after on the sheet of whoever will use it (like FFT).
- **Recruiting:** hires a generic unit of an unlocked class, with a drawn name; priced in gold; the party has a cap (e.g. 8).
- **Gold:** winning a stage gives gold per star; quests give more.

## 4. New classes

Each one with an existing KayKit figure (with `tint` when sharing a figure) and abilities with general stats:

| Class | Role | Idea of numbers (initial, to be measured) |
|---|---|---|
| Lancer | jumps high and reaches 2 tiles with the spear | health 38, mov 4, **jump 3**; Long Thrust (range 2, physical damage), Leap (lands from above on a tile, with charge) |
| Monk | bare-handed melee, heals himself | health 40, mov 4, jump 2; Punch, Spinning Kick (area 1), Breathe (heals self) |
| Priest | area healing and protection | health 26, mov 3; Area Heal (charge), Protection (reduces damage for 1 round) |
| Chemist | items everyone uses | health 30, mov 4; Potion (heal, range 1, no charge), Bomb (area, knockback) |

The classes are unlocked gradually (recruiting and class change), not part of the campaign's fixed cast, so as not to disturb the measured curve.

## 5. Loop testing

- **Playwright scripts** always with `--mute-audio` (Fernando's request): the whole campaign with `?auto=1`, every town screen, buying, equipping, recruiting, a tavern quest, and the party in battles.
- **At each block:** gates, campaign measurement, screenshots at 1280x720 and 1920x1080, and an independent reviewer.

## 6. Delivery order

1. Unit sheet in the Party screen (numbers, abilities, equipment slots), read-only. **Starts Nov 13.**
2. Equipment rule (src/shared) + chest + Equip on the sheet, with 6–9 measured starting items.
3. Vauclair town on the map: town menu, Shop and Tavern with rumors.
4. Tavern quests (first 2) with gold and item rewards.
5. Recruiting and class change; then the 4 new classes, one at a time, each measured.
6. Second town (Act II) and stock per act.
