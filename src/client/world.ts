// Campaign worldmap (night of Nov 12, Fernando's request: "character walking on the map... worldmap... each
// node is a map, either story or battle"). FFT map style: nodes linked by a road, the party walks
// node to node and enters the chosen one. Pure and tested; the screen lives in world-ui.ts.
// Nodes come in order: winning (battle) or seeing (story) a node unlocks the next one. Replaying what's already passed is allowed.
import { CHAPTERS, type Line } from './campaign.ts';
import type { DevUnit } from './dev-roster.ts';
import { defaultGroup, type Group, heroesFor } from './group.ts';
import type { Hero } from './hero.ts';

export interface WorldNode {
  id: string;
  name: [string, string];
  x: number; // position on the map, in % of the drawing's width and height
  y: number;
  chapter?: number; // battle node: the campaign stage (campaign.ts)
  scene?: Line[]; // story node: the conversation that plays on entering
  // town (Nov 13, delivery 3 of the design docs/game-design/cidades-grupo-equipamento.md): menu with Shop, Bar and Party;
  // `rumors` are the bar's rumors, which tell the story and give hints (pt, en)
  town?: { rumors: [string, string][] };
}

const L = (who: Line['who'], pt: string, en: string): Line => ({ who, pt, en });

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
  { id: 'estrada', name: ['Estrada de Cinzas', 'Ash Road'], x: 27, y: 64, chapter: 0 },
  { id: 'colina', name: ['Colina do Farol', 'Beacon Hill'], x: 42, y: 70, chapter: 1 },
  {
    id: 'lago',
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
  { id: 'cripta', name: ['Cripta Alagada', 'Flooded Crypt'], x: 62, y: 60, chapter: 2 },
  { id: 'coracao', name: ['Coração da Cripta', 'Heart of the Crypt'], x: 70, y: 46, chapter: 3 },
  { id: 'farol', name: ['O Último Farol', 'The Last Beacon'], x: 56, y: 34, chapter: 4 },
  {
    id: 'acampamento',
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
  { id: 'passo', name: ['Passo Gelado', 'Frost Pass'], x: 80, y: 32, chapter: 5 },
  { id: 'cume', name: ['O Cume', 'The Summit'], x: 88, y: 14, chapter: 6 },
  {
    id: 'epilogo',
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

export const WORLD_KEY = 'dt:mundo'; // how many nodes were already won or seen, in order

// trust boundary: the number saved in the browser is only valid between 0 and the total number of nodes
export function parseWorld(raw: unknown): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= WORLD.length ? n : 0;
}

// open node: the ones already passed and the next one
export const isOpen = (i: number, done: number) => i <= Math.min(done, WORLD.length - 1);

// progress after passing node i (never goes backwards when replaying an old one)
export const afterNode = (i: number, done: number) => Math.max(done, i + 1);

export const nodeOfChapter = (n: number) => WORLD.findIndex((w) => w.chapter === n);

// next open node in the requested direction (keyboard arrows, gamepad d-pad); stops at the ends
export function step(i: number, dir: 1 | -1, done: number): number {
  const j = i + dir;
  return j >= 0 && j < WORLD.length && isOpen(j, done) ? j : i;
}

// Party for the next battle (map's Party screen): the unlocked abilities and who stays out so the protagonist can join
export function partyFor(
  done: number,
  hero: Hero | null,
  group: Group = defaultGroup(),
): { units: DevUnit[]; benched: string | null; chapter: number } {
  const next = WORLD.slice(done).find((w) => w.chapter !== undefined)?.chapter ?? CHAPTERS.length - 1;
  const benched = hero ? (group.members.find((m) => m.id === hero.cls)?.name ?? null) : null;
  return { units: heroesFor(group, next, hero), benched, chapter: next };
}

// every campaign stage has a node on the map, exactly once (the test checks)
export const chaptersOnMap = () =>
  WORLD.filter((w) => w.chapter !== undefined)
    .map((w) => w.chapter!)
    .sort((a, b) => a - b);
export const ALL_CHAPTERS = CHAPTERS.map((_, i) => i);
