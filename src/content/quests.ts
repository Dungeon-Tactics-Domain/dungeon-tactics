// Bar quests (data): extra battles offered at a town's bar, each with its map, enemy classes and reward. Initial numbers:
// the quests are optional and are not part of the campaign's measured curve. The Mission type and the battle builder live
// in src/client/missions.ts.
import type { Mission } from '../client/missions.ts';

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
