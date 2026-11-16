# Shared: battle rules

The rules of a battle in `src/shared/battle`, moved out of `src/shared/CLAUDE.md` (the rules of code stay there): what each rule does, the request behind it and its date. Decisions with their dates are also in [docs/decisions.md](../decisions.md). Maps, units and half tiles: [shared-maps-units.md](shared-maps-units.md); the dungeon crawl: [shared-crawl.md](shared-crawl.md).

## Turns

- **FFT turn rules on every map** (Nov 12, Fernando's request): turn cost 100/80/60, tie-break by the list with enemies first, and actions with charge (`AbilityDef.charge`, `BattleState.charges`), sourced in `turn-queue.ts` (BMG 1.1 and A.2). A strong ability is slow because of its charge, not because of a delay.

## Water

- **Water on every map** (Nov 12, Fernando's decision "like FFT", BMG 6.5): `Tile.depth` is optional; 1 = shallow, 2 or more = deep (`isDeep`).
- Entering water costs 1 point, like ground (Nov 13, Fernando's choice: fewer movement shackles; it used to cost 2). Allies pass through each other (you just can't stop on their tile); an enemy blocks.
- Since Nov 13 (Fernando's choice: "enters, but does not act inside"; in FFT only swimmers enter) deep water lets you enter and stop, and a unit in it can only walk or wait (`previewAbility` returns `water`).
- Shallow water does not lower anyone; in deep water the height of whoever is in it = `standH` (height minus depth), used for hit chance, line of sight, range and falls. The jump between tiles is measured by the surface (`t.h`), otherwise the bank would be 2 levels above the deep water.
- Movement, push, save and AI go through `canStand`/`stepCost`/`standH`/`isDeep` in `grid.ts`. A push stopped by deep water is our own assumption (kept on Nov 13).

## Spikes

- **Spikes** (night of Nov 12, our own rule): `Tile.spikes`; being pushed onto the tile (`simulatePush`) or ending your turn on it (`spikeAtTurnEnd`) hurts `COMBAT.SPIKE_DAMAGE` (50 since the x5 of Nov 15), `spike` event; walking over it does not hurt. The AI avoids stopping there and values pushing onto it for the damage.
- Where: the Flooded Crypt (letter `s`) and the crawl rooms (the theme's `hazard` in `src/content/crawl/rooms.ts`, 0 to 6 a room, see [shared-crawl.md](shared-crawl.md)).

## Charge rules

Nov 15, Fernando.

- A unit may start a charge and still walk; starting it costs half the movement left, rounded up (`Battle.act` adds it to `turn.spent`: 5 cells left keeps 2), melee charges too, and after move and charge the free "Undo move" is gone (`lastFree` also compares `usedAbility`).
- The lock is the player's: `act(ability, target, lock)` stores `Charge.follow` (null = the tile, else the unit it follows; `panel` is only the default lock, `defaultLock`), saved and checked by `parseBattleState`.
- The shot is traced when it fires, from where the caster stands then (`chargeAim` + `aimTile` + `resolveAbility` in `turn-queue.ts`), with the usual shot path: behind cover it stops on the obstacle, and the event shows that stop instead of a fizzle.

## Attributes in the hit and the damage

Nov 15, Fernando's grill; the Mechanics lab's `equipamento.json`, formulas section.

- **Hit chance** as before (the side and back bonus spells too), then x (1 - the target's dodge x `COMBAT.DODGE_BY_SIDE`: 100% from the front, 75% from the side, 50% from behind), rounded half up in whole numbers and never below 5% (`afterDodge`; Fernando's choice, where the lab clamps before the dodge), spells dodged too, heals never.
- **Damage** is the roll plus `physPower` on a martial ability or `magPower` on a spell, and a heal adds `magPower` too (Fernando, as the lab), then x (1 - physical or magic resistance) x (1 - the resistance to `AbilityDef.element`), the counter's half and the side share, rounded down, at least 1 (`landed` in `combat.ts`, whole numbers until the last division).
- A charging target loses `CHARGING_PHYS` 50 physical and `CHARGING_MAG` 25 magic resistance (FFT's x1.5 on the Charging status before).
- Resistances stay between -100 and 60 (`resistOf`), dodge at most 50 (`dodgeOf`). Heals and a heal on the undead ignore resistances.
- Push, fall and spike damage x5 with life (`BUMP_DAMAGE` 25, `FALL_DAMAGE` 45 a level, `SPIKE_DAMAGE` 50).
- The preview, the forecast, the counter note and the AI (`damageRange` for the threat of a nearby enemy) read the same calculation.

## Equipment in 7 slots

Nov 16, slice 3 of the Nov 15 grill; the Mechanics lab's `equipamento.json`. No XP, so every number past the class comes from pieces.

- A `Loadout` has main and off hand, head, body, legs and 2 accessories (`SLOTS`); an item has a `kind` (an accessory fits either accessory slot, `kindOf`), a rarity (common, rare, epic) and general stats (`STATS` plus `resist`), the same against everything.
- `bonusOf` sums the worn pieces (`worn` drops an unknown id or a piece in a slot of another kind) and `withGear` adds them to the class sheet with raw sums, so `resistOf` and `dodgeOf` still cap on read and the client's battle sheets (`dev-roster.ts`) count the equipment through the same rule.
- Move and jump in whole tiles; speed never below 1. Mana, stamina and their regeneration (`PENDING`) are summed but nothing in battle reads them yet.

## Friendly fire

- **No exceptions** (Nov 15, Fernando): every hit and heal lands on either side, aimed or as collateral; on the caster's own side damage is `COMBAT.FRIENDLY_FIRE` (half), and a heal on the other side heals half (`sideShare` in `combat.ts`), the same for enemies.
- `UnitDef.undead` (skeleton archer, minion, colossus): a heal hurts it by `COMBAT.UNDEAD_HEAL` (half) of the rolled amount instead, a `hit` event.
- Push, wall and fall damage are not halved. The preview, the forecast, the AI and the roll all read the same numbers.

## Counters

Redefined on Nov 15 after Fernando was struck by a unit he had not attacked that turn.

- A direct strike (not a charge, not on its own side) on a unit with a single-target basic attack (`canCounter`; an area one, radius above 0 like the Colossus' Shadow Wave, never counters for now, a save's owed one included), whatever the strike's kind, puts it in `turn.engaged`, so it lasts only the attacker's turn.
- Each move order of the attacker that starts in the reach of that unit's basic attack and ends out of it (`previewAbility` ok, so range with height; for a ranged one also closer than its minimum) draws its counter, again on each walk back out: the basic attack at `COMBAT.COUNTER` (half), hit before it leaves, friendly fire and shot path included, with the attacker turned to face it so a counter never gets the side or back bonus.
- A shooter the attacker stands too close to (closer than its basic attack's minimum range, `inContact`, measured like the aim: the Archer, Mage, Skeleton Archer, Dark Mage and Acolyte against an adjacent attacker) cannot strike it there, so it fires once a move ends out of that contact and in its range, at the stop, after the walk (Fernando's choice, Nov 15: an archer answers the melee unit that hit it and walked away).
- `PendingCounter.at` says where each counter finds the attacker and `Battle.move` plays the start-tile ones before the walk event and these after it, clearing the free undo either way. Walking back into a shooter's contact leaves its reach, so out, in and out again draws 3 shots.
- `pendingCounters` is the one reading for the rule, the AI's retreat (`counterCost` in `chooseRetreat`, a death weighed like a kill) and the client.
- Saves: `parseBattleState` reads the Nov 13 objects in the turn and the short-lived Nov 15 `BattleState.engaged` (only the actor's strike of this turn, `turns` 2, still counts), dropping repeats, the actor's own side and ids no longer in the battle; a unit that dies leaves `turn.engaged` at once (`hurt`), since a friendly counter can kill another owed one mid-move and the save then named a missing unit.
- Known gaps (review of Nov 15, not fixed): a unit in deep water still counters, since the counter's preview passes `charged` and so skips the water check; the cursor damage reads every counter on the state before the move, so it can differ when an earlier counter of the same move kills a unit in a later shot's path.
- Facing (`UnitState.facing`) is on every map since Nov 13 (units spawn facing the nearest enemy; an older save is filled in), and counter-attacks (`counters` in `combat.ts`) work everywhere; only the counters of `UnitState.vars` (from `UnitDef.vars`) exist for scenarios that ask for them.

## Jump by class

- **Per-class jump** (Nov 13, Fernando's request: "jump mechanics like FFT"): `UnitDef.jump` (without it, `MAX_JUMP` = 1) says how many levels the unit climbs or descends in one step; every jump question goes through `jumpOf` (`pathing.ts`), which a scenario may swap for `rules.jump` (the crawl verifier does).
- Values: Lancer 3, Rogue and Minion 2, the rest 1 (`src/content/units.ts`; in FFT proportion, where the Thief jumps 1 more than the other classes; with Rogue 3 and archers 2, stage 5 ranged from 35% to 77%).
- **FFT gap** (`leaps`, same day, Fernando's request): flies up to `[Jump/2]` tiles in a straight line over deep water or tiles lower than both ends (a wall blocks), 1 movement point per tile flown; the AI sees it in `walkMap`. With jump 2 the Rogue crosses the moat of the Crypt Heart; in the FFT study (jump 3 for every class; removed Nov 16) the gap also counts, and the battle ended at 73% (300 seeds).
- A push still hits a step of 2 (`MAX_JUMP`, it is physics, not the jump of whoever is pushed).
- **On half tiles** (Nov 15, Fernando: "the move and jump values double; 1 per half tile") the jump counts in cells like the move, so a token's gap is up to J cells for jump J (`squareMoves`), 1 movement point per cell. That it lands level, wholly past the gap, is our own reading (Nov 15, kept by Fernando the same day): a 1-cell hop landed half inside a 1-tile trench, so a jump-1 archer crossed the Flooded Crypt trench it cannot cross on whole tiles. Climbing and dropping stay in height levels: a level is a physical step and has no half. With the level landing the AI's walking map on half tiles is exactly twice the whole one for every unit on every map.

## AI

- **AI and charge** (Nov 12; Nov 15): the Aimed Shot (default lock on the tile) is worth 40% against whoever plays before it fires (`W.ESCAPE`); a charge locked on the unit gets no discount. The AI scores hits on its own side at half like the rule, and moves out of queued charges' line of fire (`inLine`, `W.LINE`: chance times average damage of every charge that would hit it there); after acting, a charging unit's retreat also scores its own charge from the new spot (`chooseRetreat`).
- **The AI measures distance on foot** (`walkMap` in `ai.ts`, Nov 12): the unit's water cost and jump count; the straight line left units standing on neighboring rooftops. A half-tile token walks it as its square, with the same moves as `reachable` (`squareMoves`, Nov 14 review: a 1-cell walker took gaps the token cannot).

- **Mana and stamina** (Nov 15 grill, built Nov 16; numbers from the Mechanics lab's `equipamento.json`, a starting point Fernando tunes by playing): a spell spends mana and a martial ability stamina, by `AbilityDef.cost` (`['mana' | 'stamina', amount]`, the study's `[counter, amount]` field); a unit's basic attack has no cost and a counter is free (it resolves `charged`). The pools are `UnitDef.vars` (`RESOURCES`; the start value is the max) and live in `UnitState.vars` like the study's counters; `UnitDef.regen` adds back at the start of each of the unit's turns (`regen` in `startNextTurn`), never above the max. The lab gives no class life regen, so there is none. `poolOf` (a key absent reads full), `canPay` and `pay` in `combat.ts` are the one reading: `previewAbility` returns `spent`, the AI (its pick through the preview, the threat through `canPay`) and the menu follow it. A charge pays when it starts (as the study's MP did) and fires free; a charge replaced by a new one is not refunded. A new battle starts every pool full, so stamina refills in every room; mana is carried by the expedition (below). `parseBattleState` fills a missing pool with its max and refuses one below 0 or above it.
