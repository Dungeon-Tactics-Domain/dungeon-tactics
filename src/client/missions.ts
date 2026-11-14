// Bar missions (Nov 13, delivery 4 of the design docs/game-design/towns-party-equipment.md): extra battles outside the
// campaign line, accepted at a town's bar, with the current party against their own enemies on an existing map.
// Winning gives gold and an item to the chest (chest.ts) and removes the mission from the bar. The missions themselves are
// data in src/content/quests.ts.
import { MISSIONS } from '../content/quests.ts';
import type { Scenario } from '../shared/battle/scenarios.ts';
import { CHAPTERS } from './campaign.ts';
import type { Equip } from './chest.ts';
import { buildDevScenario, unitFrom } from './dev-roster.ts';
import { defaultGroup, type Group, heroesFor } from './group.ts';
import type { Hero } from './hero.ts';

export const MISSIONS_KEY = 'dt:quests';
export interface Mission {
  id: string;
  town: string; // id of the town node (world.ts)
  name: [string, string];
  text: [string, string]; // the request, as the bar owner tells it
  map: string;
  enemies: string[]; // classes of the enemies
  gold: number;
  item?: string; // equipment.ts
}

export { MISSIONS };

// missions already won (save in the browser; known ids only)
export function parseDone(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.filter((id): id is string => typeof id === 'string' && MISSIONS.some((m) => m.id === id))
    : [];
}

export const missionScenarioId = (id: string) => `quest-${id}`;

// the party of the most advanced open stage (with the protagonist and equipment), against the mission's enemies
export function missionScenario(
  m: Mission,
  progress: number,
  hero: Hero | null,
  eq: Equip,
  group: Group = defaultGroup(),
): Scenario {
  return buildDevScenario(
    {
      map: m.map,
      heroes: heroesFor(group, Math.min(progress, CHAPTERS.length - 1), hero, eq),
      enemies: m.enemies.map((b) => unitFrom(b)),
    },
    missionScenarioId(m.id),
    m.name,
  );
}
