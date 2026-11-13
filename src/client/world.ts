// Mapa mundial da campanha (noite de 12/11, pedido do Fernando: "personagem andando pelo mapa... mapa mundial... cada
// ponto é um mapa sendo de história ou batalha"). No jeito do mapa do FFT: pontos ligados por uma estrada, o grupo anda
// de ponto em ponto e entra no escolhido. Puro e testado; a tela fica em world-ui.ts.
// Os pontos vêm em ordem: vencer (batalha) ou ver (história) um ponto libera o seguinte. Rejogar o que já passou vale.
import { CHAPTERS, type Line } from './campaign.ts';
import type { DevUnit } from './dev-roster.ts';
import { withHero, type Hero } from './hero.ts';

export interface WorldNode {
  id: string;
  name: [string, string];
  x: number; // posição no mapa, em % da largura e da altura do desenho
  y: number;
  chapter?: number; // ponto de batalha: a fase da campanha (campaign.ts)
  scene?: Line[]; // ponto de história: a conversa que toca ao entrar
}

const L = (who: Line['who'], pt: string, en: string): Line => ({ who, pt, en });

// Abertura da história (jogo novo, tela escura, antes da criação do protagonista)
export const INTRO: Line[] = [
  L('narr', 'Há cem anos, os magos do vale ergueram os Faróis: cristais azuis que empurram para longe o Véu, a névoa onde os mortos não descansam.', 'A hundred years ago, the valley mages raised the Beacons: blue crystals that push back the Veil, the mist where the dead never rest.'),
  L('narr', 'Enquanto os Faróis brilham, o vale dorme em paz. Mas neste outono, um a um, eles começaram a se apagar.', 'While the Beacons shine, the valley sleeps in peace. But this autumn, one by one, they began to go dark.'),
  L('narr', 'Em Vauclair, a última vila antes da Estrada de Cinzas, quatro viajantes se preparam para levar cristais novos até a Colina do Farol.', 'In Vauclair, the last village before the Ash Road, four travelers prepare to carry new crystals to Beacon Hill.'),
  L('narr', 'Falta alguém para liderá-los.', 'They still need someone to lead them.'),
];

export const WORLD: WorldNode[] = [
  {
    id: 'vauclair', name: ['Vila de Vauclair', 'Vauclair Village'], x: 14, y: 80,
    scene: [
      L('narr', 'Vauclair, a última vila antes da Estrada de Cinzas. O Farol do vale ainda brilha azul no alto da colina.', 'Vauclair, the last village before the Ash Road. The valley Beacon still glows blue atop the hill.'),
      L('bran', 'A caravana com os cristais sai ao amanhecer. Ninguém chega à Colina sem passar pela estrada.', 'The crystal caravan leaves at dawn. No one reaches the Hill without taking the road.'),
      L('hero', 'Então a gente vai junto. Se alguém quer esses cristais, vai ter que passar por nós.', 'Then we go with it. If someone wants those crystals, they will have to get through us.'),
      L('odo', 'Eu levo o mapa. E os lanches. Principalmente os lanches.', 'I will carry the map. And the snacks. Mostly the snacks.'),
    ],
  },
  { id: 'estrada', name: ['Estrada de Cinzas', 'Ash Road'], x: 27, y: 64, chapter: 0 },
  { id: 'colina', name: ['Colina do Farol', 'Beacon Hill'], x: 42, y: 70, chapter: 1 },
  {
    id: 'lago', name: ['Margem do Lago Escuro', 'Dark Lake Shore'], x: 52, y: 52,
    scene: [
      L('narr', 'À noite, na margem do lago. Debaixo da água, as ruínas da cripta antiga.', 'Night on the lake shore. Beneath the water lie the ruins of the old crypt.'),
      L('tess', 'Lia, você disse que trabalhou para o Vesper. Por quê?', 'Lia, you said you worked for Vesper. Why?'),
      L('lia', 'Ele prometeu trazer minha irmã de volta do Véu. Eu acreditei. Durante um ano inteiro.', 'He promised to bring my sister back from the Veil. I believed him. For a whole year.'),
      L('hero', 'E agora?', 'And now?'),
      L('lia', 'Agora eu sei que quem volta do Véu não volta inteiro. Vamos acabar com isso.', 'Now I know that whoever comes back from the Veil doesn\'t come back whole. Let\'s end this.'),
    ],
  },
  { id: 'cripta', name: ['Cripta Alagada', 'Flooded Crypt'], x: 62, y: 60, chapter: 2 },
  { id: 'coracao', name: ['Coração da Cripta', 'Heart of the Crypt'], x: 70, y: 46, chapter: 3 },
  { id: 'farol', name: ['O Último Farol', 'The Last Beacon'], x: 56, y: 34, chapter: 4 },
  {
    id: 'acampamento', name: ['Acampamento na Neve', 'Snow Camp'], x: 70, y: 24,
    scene: [
      L('narr', 'Ato II. Ao pé das montanhas, uma fogueira pequena contra o frio.', 'Act II. At the foot of the mountains, a small fire against the cold.'),
      L('odo', 'Li nos livros velhos: todo Farol empurra o Véu para algum lugar. Alguém precisava estar lá para receber.', 'I read it in the old books: every Beacon pushes the Veil somewhere. Someone had to be there to catch it.'),
      L('bran', 'Então a gente sobe e vê quem é.', 'Then we climb and see who it is.'),
      L('hero', 'Descansem. Amanhã é a subida mais longa da nossa vida.', 'Rest. Tomorrow is the longest climb of our lives.'),
    ],
  },
  { id: 'passo', name: ['Passo Gelado', 'Frost Pass'], x: 80, y: 32, chapter: 5 },
  { id: 'cume', name: ['O Cume', 'The Summit'], x: 88, y: 14, chapter: 6 },
  {
    id: 'epilogo', name: ['Vauclair ao amanhecer', 'Vauclair at Dawn'], x: 22, y: 86,
    scene: [
      L('narr', 'Semanas depois. O Farol do vale brilha mais forte do que nunca, e ninguém mais fala do Véu.', 'Weeks later. The valley Beacon shines brighter than ever, and no one speaks of the Veil anymore.'),
      L('lia', 'Minha irmã teria gostado deste lugar.', 'My sister would have liked this place.'),
      L('tess', 'Ela ia gostar de saber quem fechou a porta.', 'She would like to know who shut the door.'),
      L('hero', 'Fechamos juntos. E se a porta abrir de novo, a gente fecha de novo.', 'We shut it together. And if the door opens again, we shut it again.'),
      L('narr', 'Fim. Obrigado por jogar Dungeon Tactics.', 'The end. Thank you for playing Dungeon Tactics.'),
    ],
  },
];

export const WORLD_KEY = 'dt:mundo'; // quantos pontos já foram vencidos ou vistos, em ordem

// fronteira de confiança: o número salvo no navegador só vale entre 0 e o total de pontos
export function parseWorld(raw: unknown): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= WORLD.length ? n : 0;
}

// ponto aberto: os já passados e o próximo
export const isOpen = (i: number, done: number) => i <= Math.min(done, WORLD.length - 1);

// progresso depois de passar pelo ponto i (nunca anda para trás ao rejogar um antigo)
export const afterNode = (i: number, done: number) => Math.max(done, i + 1);

export const nodeOfChapter = (n: number) => WORLD.findIndex((w) => w.chapter === n);

// próximo ponto aberto na direção pedida (setas do teclado, direcional do controle); parado nas pontas
export function step(i: number, dir: 1 | -1, done: number): number {
  const j = i + dir;
  return j >= 0 && j < WORLD.length && isOpen(j, done) ? j : i;
}

// Grupo da próxima batalha (tela Grupo do mapa): as habilidades já liberadas e quem fica de fora para o protagonista entrar
export function partyFor(done: number, hero: Hero | null): { units: DevUnit[]; benched: string | null } {
  const next = WORLD.slice(done).find((w) => w.chapter !== undefined)?.chapter ?? CHAPTERS.length - 1;
  const base = CHAPTERS[next].setup;
  return { units: withHero(base, hero).heroes, benched: hero ? base.heroes.find((u) => u.base === hero.cls)?.name ?? null : null };
}

// toda fase da campanha tem um ponto no mapa, uma vez só (o teste confere)
export const chaptersOnMap = () => WORLD.filter((w) => w.chapter !== undefined).map((w) => w.chapter!).sort((a, b) => a - b);
export const ALL_CHAPTERS = CHAPTERS.map((_, i) => i);
