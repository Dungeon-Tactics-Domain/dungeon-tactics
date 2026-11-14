// World map (data): the story opening, the nodes in campaign order (battles, story scenes and towns) and the towns' bar
// rumors. The WorldNode type and the walking rules live in src/client/world.ts; a battle node points to a stage of
// src/content/campaign.ts by its index.

import type { Line } from '../client/campaign.ts';
import type { WorldNode } from '../client/world.ts';
import { L } from './campaign.ts';

// Story opening (new game, dark screen, before the protagonist is created)
export const INTRO: Line[] = [
  L(
    'narr',
    'Há cem anos, os magos do vale ergueram os Faróis: cristais azuis que empurram para longe o Véu, a névoa onde os mortos não descansam.',
    'A hundred years ago, the valley mages raised the Beacons: blue crystals that push back the Veil, the mist where the dead never rest.',
  ),
  L(
    'narr',
    'Enquanto os Faróis brilham, o vale dorme em paz. Mas neste outono, um a um, eles começaram a se apagar.',
    'While the Beacons shine, the valley sleeps in peace. But this autumn, one by one, they began to go dark.',
  ),
  L(
    'narr',
    'Em Vauclair, a última vila antes da Estrada de Cinzas, quatro viajantes se preparam para levar cristais novos até a Colina do Farol.',
    'In Vauclair, the last village before the Ash Road, four travelers prepare to carry new crystals to Beacon Hill.',
  ),
  L('narr', 'Falta alguém para liderá-los.', 'They still need someone to lead them.'),
];

export const WORLD: WorldNode[] = [
  {
    id: 'vauclair',
    name: ['Vila de Vauclair', 'Vauclair Village'],
    x: 14,
    y: 80,
    town: {
      rumors: [
        [
          'Dizem que os esqueletos da estrada fogem da luz dos cristais. Mas só quando estão sozinhos.',
          'They say the road skeletons flee the crystals’ light. But only when they are alone.',
        ],
        [
          'O ferreiro jura que uma lâmina de ferro corta osso como manteiga. Ele vende uma, claro.',
          'The smith swears an iron blade cuts bone like butter. He sells one, of course.',
        ],
        [
          'Quem ataca pelas costas raramente erra. Os velhos soldados sabem disso.',
          'Whoever strikes from behind rarely misses. Old soldiers know it.',
        ],
        [
          'A água rasa do lago só atrasa; a funda não deixa ninguém passar. Nem os mortos.',
          'The lake’s shallow water only slows you; the deep water lets no one pass. Not even the dead.',
        ],
      ],
    },
    scene: [
      L(
        'narr',
        'Vauclair, a última vila antes da Estrada de Cinzas. O Farol do vale ainda brilha azul no alto da colina.',
        'Vauclair, the last village before the Ash Road. The valley Beacon still glows blue atop the hill.',
      ),
      L(
        'bran',
        'A caravana com os cristais sai ao amanhecer. Ninguém chega à Colina sem passar pela estrada.',
        'The crystal caravan leaves at dawn. No one reaches the Hill without taking the road.',
      ),
      L(
        'hero',
        'Então a gente vai junto. Se alguém quer esses cristais, vai ter que passar por nós.',
        'Then we go with it. If someone wants those crystals, they will have to get through us.',
      ),
      L(
        'odo',
        'Eu levo o mapa. E os lanches. Principalmente os lanches.',
        'I will carry the map. And the snacks. Mostly the snacks.',
      ),
    ],
  },
  { id: 'road', name: ['Estrada de Cinzas', 'Ash Road'], x: 27, y: 64, chapter: 0 },
  { id: 'hill', name: ['Colina do Farol', 'Beacon Hill'], x: 42, y: 70, chapter: 1 },
  {
    id: 'lake',
    name: ['Margem do Lago Escuro', 'Dark Lake Shore'],
    x: 52,
    y: 52,
    scene: [
      L(
        'narr',
        'À noite, na margem do lago. Debaixo da água, as ruínas da cripta antiga.',
        'Night on the lake shore. Beneath the water lie the ruins of the old crypt.',
      ),
      L('tess', 'Lia, você disse que trabalhou para o Vesper. Por quê?', 'Lia, you said you worked for Vesper. Why?'),
      L(
        'lia',
        'Ele prometeu trazer minha irmã de volta do Véu. Eu acreditei. Durante um ano inteiro.',
        'He promised to bring my sister back from the Veil. I believed him. For a whole year.',
      ),
      L('hero', 'E agora?', 'And now?'),
      L(
        'lia',
        'Agora eu sei que quem volta do Véu não volta inteiro. Vamos acabar com isso.',
        "Now I know that whoever comes back from the Veil doesn't come back whole. Let's end this.",
      ),
    ],
  },
  { id: 'crypt', name: ['Cripta Alagada', 'Flooded Crypt'], x: 62, y: 60, chapter: 2 },
  { id: 'heart', name: ['Coração da Cripta', 'Heart of the Crypt'], x: 70, y: 46, chapter: 3 },
  { id: 'beacon', name: ['O Último Farol', 'The Last Beacon'], x: 56, y: 34, chapter: 4 },
  {
    id: 'camp',
    name: ['Acampamento na Neve', 'Snow Camp'],
    x: 70,
    y: 24,
    town: {
      rumors: [
        [
          'O mascate da fogueira diz que botas ligeiras valem ouro na neve. Ele vende botas ligeiras.',
          'The campfire peddler says swift boots are worth gold in the snow. He sells swift boots.',
        ],
        [
          'Lá em cima, quem tem salto alto corta caminho pelos penhascos.',
          'Up there, those who jump high cut through the cliffs.',
        ],
        [
          'A sombra do cume não anda. Mas ninguém que chegou perto voltou para contar.',
          'The shadow on the summit does not walk. But no one who got close came back to tell.',
        ],
      ],
    },
    scene: [
      L(
        'narr',
        'Ato II. Ao pé das montanhas, uma fogueira pequena contra o frio.',
        'Act II. At the foot of the mountains, a small fire against the cold.',
      ),
      L(
        'odo',
        'Li nos livros velhos: todo Farol empurra o Véu para algum lugar. Alguém precisava estar lá para receber.',
        'I read it in the old books: every Beacon pushes the Veil somewhere. Someone had to be there to catch it.',
      ),
      L('bran', 'Então a gente sobe e vê quem é.', 'Then we climb and see who it is.'),
      L(
        'hero',
        'Descansem. Amanhã é a subida mais longa da nossa vida.',
        'Rest. Tomorrow is the longest climb of our lives.',
      ),
    ],
  },
  { id: 'pass', name: ['Passo Gelado', 'Frost Pass'], x: 80, y: 32, chapter: 5 },
  { id: 'summit', name: ['O Cume', 'The Summit'], x: 88, y: 14, chapter: 6 },
  {
    id: 'epilogue',
    name: ['Vauclair ao amanhecer', 'Vauclair at Dawn'],
    x: 22,
    y: 86,
    scene: [
      L(
        'narr',
        'Semanas depois. O Farol do vale brilha mais forte do que nunca, e ninguém mais fala do Véu.',
        'Weeks later. The valley Beacon shines brighter than ever, and no one speaks of the Veil anymore.',
      ),
      L('lia', 'Minha irmã teria gostado deste lugar.', 'My sister would have liked this place.'),
      L('tess', 'Ela ia gostar de saber quem fechou a porta.', 'She would have liked to know who shut the door.'),
      L(
        'hero',
        'Fechamos juntos. E se a porta abrir de novo, a gente fecha de novo.',
        'We shut it together. And if the door opens again, we shut it again.',
      ),
      L('narr', 'Fim. Obrigado por jogar Dungeon Tactics.', 'The end. Thank you for playing Dungeon Tactics.'),
    ],
  },
];
