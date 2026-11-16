# Narrative: the town and the sentence

Draft of Nov 15 from the narrative grill with Fernando (town and story, after the core loop was closed). Everything here is a
**draft for his review**: names marked _(proposed)_ need his approval before they enter `src/content`. Lines are written in
both languages because the game shows `t('português', 'English')`.

The loop itself (town, descent through rooms, camp, return) is in `_notas/LOOP-DUNGEON-CRAWLER-AUDIO.md` and in
`src/content/crawl/rooms.ts`. This document only covers what the story adds on top of it.

## Decisions (Nov 15 grill)

| Topic | Decision |
|---|---|
| Tone | Warm with a shadow underneath: a lively, kind village; the descent brings losses and secrets little by little. No stress or afflictions: the weight comes from the story, not from a mechanic. |
| Why the party goes down | The protagonist is a **prisoner** the town forces to go down. Only the protagonist has a main story for now. They start going down with other prisoners; as their runs go well they gain independence, and the party turns from prisoners into adventurers. Other stories happen alongside. |
| Who holds them | The town itself: going down is the sentence it hands to convicts. |
| The sentence | A quota of descents (each a win over the descent's boss) paid off through **milestones**. Each milestone changes how they are treated and unlocks places, people and lines. Numbers come from the Mechanics lab later. |
| The protagonist | **Created by the player**, Dragon Age style (Fernando, Nov 15); the player picks a name, a look (KayKit models), and a starting class. No crime choice for now: every protagonist is sentenced for **a debt they could not pay**, so the sentence is paying it off with work (Nov 16). The party of four is picked from a roster of recruits after the prologue (Nov 16). |
| The other party members | A prologue with one or two characters, then four go down, picked like in Darkest Dungeon; only the protagonist is fixed in the MVP. No past for the others in this draft. |
| The town | A small border village with a fixed name and past, written by hand: about 8 to 12 named residents; the four facilities are its centre. |
| Residents | One resident per facility, each with a different first attitude that shifts with every milestone, plus a few residents without a facility who carry rumours. |
| How the story reaches the player | Three channels: the **request board** (short quests), **talking** to each resident (a new line per milestone; rumours are lines that point at a place), and **return events** (a short scene when an expedition meets a condition). |
| What the story unlocks | Places (forest, mountain, deeper floors), recipes and items (shop and crafting), lines and scenes, and small mechanical bonuses (a trinket, a discount, a slot). |
| A fall in battle | The story reacts only in town, with short lines per resident ("someone fell"); nothing during battle. |
| The bottom | **Open for now.** Rumours may hint, never answer. |
| Language and names | Both languages from the first draft; names proposed in short lists for Fernando to pick. |
| Out of this draft | The companions' stories, a conflict inside the town (who rules, who profits), the bottom. |

## The village

**Vauclair** (the name already in `CRAWL_TOWN`; alternatives _(proposed)_: Brinkwell, Lastlantern). A village built on the
lip of the old workings, where the ground opens into the dungeon, with the forest behind it and the mountain above. It
grew rich once on what came up from below and still lives on it, but its own people stopped going down a generation ago.
Since then the council sends convicts instead: serve the descent, bring back what the village needs, and the sentence
shortens.

What the village does not say out loud (kept open, only hinted): why its own people stopped going down.

## The sentence and its milestones

Four milestones, no numbers yet (the Mechanics lab sets how many descents or how much value each one costs).

| Milestone | How they are treated | What opens |
|---|---|---|
| 1. Chained | Escorted from the cell to the entrance and back; few talk to them. | The dungeon; every facility is open, at prisoner prices. |
| 2. Tethered | Free to walk the village between descents, a bell on the ankle. Residents start talking to them. | Rumours about the forest and the mountain. |
| 3. Paid | Keeps a share of what they bring up and spends it themselves. | Small bonuses from residents' stories. |
| 4. Free | The sentence is paid. They choose to stay as an adventurer; the party is no longer prisoners. | Deeper floors; recruits who are adventurers, not convicts. |

## Residents

Attitudes are the starting point; each milestone moves them one step. Every name is _(proposed)_.

| Resident | Where | First attitude | Their own small problem (a side story) |
|---|---|---|---|
| **Hesk**, the warden | the gate and the cells | Duty, no warmth: counts what comes up. | He keeps a ledger of every convict sent down and of the ones who came back; the second column is short. |
| **Marta Penhale**, shopkeeper | Shop | Business: a prisoner is a supplier. | The council buys from her at a low price; she needs goods from below to stay open. |
| **Garrick Ode**, smith | Smith | Distrust: has seen convicts steal tools. | His hand was hurt; he cannot hold the hot iron alone any more and will not say so. |
| **Sela**, tavern keeper | Tavern | Pity: pours them soup, asks nothing. | Keeps a shelf of mugs, one per convict who went down; she does not wash the ones that did not come back. |
| **Wren**, cook and herbalist | Kitchen / apothecary | Curiosity: wants to know what grows below. | Her mother's recipe book is missing pages; ingredients from below fill them in (unlocks recipes). |
| **Pip**, a child | the square | Admiration: thinks prisoners are heroes. | Wants to go down; follows the party to the entrance. |
| **Old Ysolde** | the well | Memory: talks about how it was before. | Remembers the forest and the mountain paths; her stories are the first rumours. |
| **Tobin**, the bell ringer | the chapel tower | Indifference, then respect. | Rings the bell for every party that goes down and every one that comes back. |

## The other prisoners

They go down in the same sentence and show that the path from prisoner to adventurer happens to others too. Names
_(proposed)_.

- **Dace** pays the sentence quietly and leaves the village; a line in the tavern remembers him.
- **Rook** pays and stays: he becomes the first adventurer the tavern can recruit.
- **Nell** goes down one day and does not come back; her mug stays on Sela's shelf (the shadow under the warmth).

## Channels and examples

Each item is data shaped as **trigger → text → effect**. Below, the first examples for review.

### Rumours (talking)

| Who | Trigger | Line (pt / en) | Effect |
|---|---|---|---|
| Ysolde | milestone 1 | "Antes da mina, a gente colhia cogumelo na mata. Ninguém volta lá desde que as árvores começaram a cantar." / "Before the mine we picked mushrooms in the woods. Nobody goes back since the trees started singing." | points at the forest |
| Wren | milestone 1 | "Me traz qualquer coisa verde que cresça lá embaixo. Até a feia." / "Bring me anything green that grows down there. Even the ugly ones." | none (hook for recipes) |
| Sela | milestone 2 | "Quem sobe da mina sempre pede sopa quente. Quem vem da montanha pede duas." / "Everyone up from the mine asks for hot soup. Those from the mountain ask for two." | points at the mountain |
| Garrick | milestone 2 | "Tem ferro bom no fundo do segundo andar. Ferro velho, de quem trabalhava aqui antes." / "There's good iron at the bottom of the second floor. Old iron, from those who worked here before." | points at deeper floors |
| Pip | milestone 2 | "Eu vi uma luz na montanha. Juro." / "I saw a light on the mountain. I swear." | points at the mountain |
| Hesk | milestone 3 | "A mata não está na sua pena. Mas o conselho paga pelo que vier de lá." / "The woods aren't in your sentence. But the council pays for whatever comes from there." | opens the forest as paid work |

### Request board (short quests)

| Request | From | Ask | Reward |
|---|---|---|---|
| Green from below | Wren | bring 3 ingredients from the dungeon | a recipe |
| Old iron | Garrick | bring 1 piece of old iron from floor 2 | a repair discount |
| Mushrooms for the soup | Sela | bring forest mushrooms | a trinket (Sela's spoon, _proposed_) |

### Return events (short scenes)

- **First return.** Trigger: the first expedition ends. Tobin rings the bell; Sela's soup; Hesk writes a line in the
  ledger. Effect: talking opens.
- **Nell's mug.** Trigger: milestone 2. Nell does not come back; Sela keeps her mug on the shelf. Effect: none
  (atmosphere).

### Someone fell (reaction in town)

| Who | Line (pt / en) |
|---|---|
| Wren | "Senta. Come primeiro, conta depois." / "Sit. Eat first, tell me after." |
| Hesk | "Caído conta como voltou. Por pouco." / "Fallen counts as back. Barely." |
| Sela | "Mais uma tigela, então." / "One more bowl, then." |

## Conflicts settled on Nov 16

Checked against `pillars.md`, the decision log in `CLAUDE.md` and `_notas/LOOP-DUNGEON-CRAWLER-AUDIO.md`; Fernando decided each one the same morning.

| Topic | Decision |
|---|---|
| Pillar 6 ("grim") | One tone for the whole game: warm with a shadow underneath. Pillar 6 was reworded. |
| Facilities | All four open from the start; milestones change prices, lines and rumours, they do not unlock facilities. |
| What counts as a descent | A win over the descent's boss. |
| Request board | In the MVP the requests are spoken rumours; the Board window comes later. |
| Starting party | A prologue with one or two characters (the protagonist and a prisoner, a short first descent), then the descent with four, picked as in Darkest Dungeon. Only the protagonist is fixed in the MVP; the other three come from a roster of recruits. |
| Wren and the scout-cook class | Wren sells ingredients and teaches recipes; the class cooks in camp. |
| When the text becomes data | Now: three lines per key resident in `src/content/crawl/residents.ts`, no interface. |
| Names | All proposed names approved. |

Still open: the prologue (how many rooms, who the second prisoner is), what the sentence costs in descents, and a conflict between this cast and the one already in `town.ts` (see Open questions).

## What this feeds in `src/content`

Since Nov 16, `src/content/crawl/residents.ts` holds the residents and three lines for each key one (warden, shop, smith, tavern, kitchen), with a `when` of milestone 1 to 3 or `fall`; nothing in the client reads it yet. Still to come as data: milestones, rumours that unlock places and recipes, and return events, each with a trigger and an effect. The engine needs a trigger check (milestone reached, expedition ended, someone fell); that is work for the implementation session.

## Open questions

- Milestone costs (how many boss wins per milestone) and whether a failed expedition counts.
- The prologue: how many rooms, who the second prisoner is (Dace, Rook or Nell), and how the player reaches the town and the roster.
- `src/content/crawl/town.ts` already has townsfolk (Aldo, Hugo, Selene, Mira) and `residents.ts` has Hesk, Marta, Garrick, Sela, Wren, Pip, Ysolde and Tobin: which cast wins, or how they merge; the places also differ (`smith` and `smithy`).
- What lies at the bottom and why the village stopped going down.
- The companions' stories and the conflict inside the town (left out of this draft).
