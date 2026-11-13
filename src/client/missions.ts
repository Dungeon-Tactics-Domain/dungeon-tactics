// Missões do bar (13/11, entrega 4 do desenho docs/game-design/cidades-grupo-equipamento.md): batalhas extras fora da
// linha da campanha, aceitas no bar de uma cidade, com o grupo atual contra inimigos próprios num mapa já existente.
// Vencer dá ouro e um item ao baú (chest.ts) e tira a missão do bar. Números iniciais: as missões são opcionais e não
// entram na curva medida da campanha.
import type { Scenario } from '../shared/battle/scenarios.ts';
import { CHAPTERS } from './campaign.ts';
import type { Equip } from './chest.ts';
import { buildDevScenario, unitFrom } from './dev-roster.ts';
import { defaultGroup, heroesFor, type Group } from './group.ts';
import type { Hero } from './hero.ts';

export const MISSIONS_KEY = 'dt:missoes';
export interface Mission {
  id: string;
  town: string; // id do ponto de cidade (world.ts)
  name: [string, string];
  text: [string, string]; // o pedido, como o dono do bar conta
  map: string;
  enemies: string[]; // classes dos inimigos
  gold: number;
  item?: string; // equipment.ts
}

export const MISSIONS: Mission[] = [
  { id: 'ratos-da-estrada', town: 'vauclair', name: ['Ossos na estrada', 'Bones on the road'],
    text: ['Lacaios de osso atacam as carroças na estrada. Limpem o caminho e o ferreiro paga.', 'Bone minions raid the carts on the road. Clear the way and the smith pays.'],
    map: 'ash_wood', enemies: ['minion', 'minion', 'minion', 'skeleton_archer'], gold: 150, item: 'leather_vest' },
  { id: 'cripta-rasa', town: 'vauclair', name: ['O porão alagado', 'The flooded cellar'],
    text: ['Algo se mexe na água da cripta velha. Desçam e voltem com a lâmina que ficou lá.', 'Something stirs in the old crypt’s water. Go down and come back with the blade left there.'],
    map: 'flooded_crypt', enemies: ['skeleton_archer', 'soldier', 'minion', 'minion'], gold: 200, item: 'iron_blade' },
  { id: 'lobos-do-passo', town: 'acampamento', name: ['Guarda do passo', 'Pass watch'],
    text: ['Uma patrulha do Véu vigia o caminho do cume. Afastem-na antes da subida.', 'A Veil patrol watches the summit path. Drive it off before the climb.'],
    map: 'frost_pass', enemies: ['veil_knight', 'acolyte', 'skeleton_archer', 'minion'], gold: 300, item: 'spring_greaves' },
];

// missões já vencidas (save no navegador; só ids conhecidos)
export function parseDone(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string' && MISSIONS.some((m) => m.id === id)) : [];
}

export const missionScenarioId = (id: string) => `missao-${id}`;

// o grupo da fase mais avançada já aberta (com o protagonista e o equipamento), contra os inimigos da missão
export function missionScenario(m: Mission, progress: number, hero: Hero | null, eq: Equip, group: Group = defaultGroup()): Scenario {
  return buildDevScenario({ map: m.map, heroes: heroesFor(group, Math.min(progress, CHAPTERS.length - 1), hero, eq), enemies: m.enemies.map((b) => unitFrom(b)) },
    missionScenarioId(m.id), m.name);
}
