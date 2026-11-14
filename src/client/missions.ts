// Bar missions (Nov 13, delivery 4 of the design docs/game-design/cidades-grupo-equipamento.md): extra battles outside the
// campaign line, accepted at a town's bar, with the current party against their own enemies on an existing map.
// Winning gives gold and an item to the chest (chest.ts) and removes the mission from the bar. Initial numbers: the missions are optional and are not
// part of the campaign's measured curve.
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

export const MISSIONS: Mission[] = [
  {
    id: 'road-rats',
    town: 'vauclair',
    name: ['Ossos na estrada', 'Bones on the road'],
    text: [
      'Lacaios de osso atacam as carroças na estrada. Limpem o caminho e o ferreiro paga.',
      'Bone minions raid the carts on the road. Clear the way and the smith pays.',
    ],
    map: 'ash_wood',
    enemies: ['minion', 'minion', 'minion', 'skeleton_archer'],
    gold: 150,
    item: 'leather_vest',
  },
  {
    id: 'shallow-crypt',
    town: 'vauclair',
    name: ['O porão alagado', 'The flooded cellar'],
    text: [
      'Algo se mexe na água da cripta velha. Desçam e voltem com a lâmina que ficou lá.',
      'Something stirs in the old crypt’s water. Go down and come back with the blade left there.',
    ],
    map: 'flooded_crypt',
    enemies: ['skeleton_archer', 'soldier', 'minion', 'minion'],
    gold: 200,
    item: 'iron_blade',
  },
  {
    id: 'pass-wolves',
    town: 'camp',
    name: ['Guarda do passo', 'Pass watch'],
    text: [
      'Uma patrulha do Véu vigia o caminho do cume. Afastem-na antes da subida.',
      'A Veil patrol watches the summit path. Drive it off before the climb.',
    ],
    map: 'frost_pass',
    enemies: ['veil_knight', 'acolyte', 'skeleton_archer', 'minion'],
    gold: 300,
    item: 'spring_greaves',
  },
];

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
