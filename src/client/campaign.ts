// Campanha "Cinzas do Farol" (noite de 12/11: o Fernando pediu uma campanha com várias fases, história, diálogo e
// sons de fala). História nossa. Cada fase é um elenco do menu de desenvolvedor (dev-roster.ts) num mapa do jogo, com
// falas antes e depois da batalha. Puro e testado; a tela das falas fica em talk.ts.
import type { Scenario } from '../shared/battle/scenarios.ts';
import { buildDevScenario, unitFrom, type DevSetup, type DevUnit } from './dev-roster.ts';
import type { SongId } from './music.ts';

export interface Line {
  who: keyof typeof SPEAKERS;
  pt: string;
  en: string;
}
export interface Chapter {
  title: [string, string];
  song: SongId; // música da fase (music.ts)
  setup: DevSetup;
  intro: Line[];
  outro: Line[];
}

// Quem fala: nome, boneco do retrato e tom do bipe de fala (Hz). Tons diferentes para cada voz se reconhecer sem ler o nome.
export const SPEAKERS = {
  bran: { name: 'Bran', def: 'warrior', pitch: 150 },
  tess: { name: 'Tess', def: 'archer', pitch: 330 },
  odo: { name: 'Odo', def: 'mage', pitch: 260 },
  lia: { name: 'Lia', def: 'rogue', pitch: 420 },
  vesper: { name: 'Vesper', def: 'dark_mage', pitch: 110 },
  merc: { name: 'Mercenário', def: 'soldier', pitch: 180 },
  narr: { name: '', def: 'beacon', pitch: 220 },
} as const;

export const CAMPAIGN_KEY = 'dt:campanha'; // quantas fases já foram vencidas

const party = (): DevUnit[] => [unitFrom('warrior', 'Bran'), unitFrom('archer', 'Tess'), unitFrom('mage', 'Odo'), unitFrom('rogue', 'Lia')];
const foe = (base: string, patch: Partial<DevUnit> = {}): DevUnit => ({ ...unitFrom(base), ...patch });
// Vesper cresce a cada encontro (fuga na fase 4, luta final na 5). Elencos medidos em 12/11 (MEDIR=300 no
// tests/campaign.test.ts, IA nos dois lados): vitória dos heróis 64% → 55% → 42% → 36% → 35%, caindo fase a fase.
// Recrutas e Ossadas (pouca vida) acertam o degrau: com 3 inimigos a fase ia a ~100%, com 4 inteiros a ~30%.
const vesper = (hp: number, speed: number) => foe('dark_mage', { name: 'Vesper', hp, speed, abilities: ['firebolt', 'blast'] });

const L = (who: Line['who'], pt: string, en: string): Line => ({ who, pt, en });

export const CHAPTERS: Chapter[] = [
  {
    title: ['A Estrada de Cinzas', 'The Ash Road'],
    song: 'road',
    setup: { map: 'skirmish', heroes: party(), enemies: [foe('soldier'), foe('soldier', { name: 'Recruta', hp: 25 }), foe('soldier', { name: 'Recruta', hp: 25 }), foe('skeleton_archer')] },
    intro: [
      L('narr', 'Os Faróis guardam os vilarejos do Véu, a névoa onde os mortos não descansam. Um a um, eles estão se apagando.', 'The Beacons keep the villages safe from the Veil, the mist where the dead never rest. One by one, they are going dark.'),
      L('bran', 'Caravana parada no meio da estrada. Isso não é acidente.', 'A caravan stopped in the middle of the road. That is no accident.'),
      L('lia', 'Mercenários. E esse arqueiro de ossos... só um homem paga com mortos.', 'Mercenaries. And that bone archer... only one man pays with the dead.'),
      L('merc', 'Nada pessoal. O mago sombrio paga bem por quem anda com cristais.', 'Nothing personal. The dark mage pays well for anyone carrying crystals.'),
      L('tess', 'Então que ele pague o enterro. Formação!', 'Then let him pay for the burial. Formation!'),
    ],
    outro: [
      L('odo', 'Achei isto com um deles: um mapa da Colina, com o Farol marcado em vermelho.', 'I found this on one of them: a map of the Hill, with the Beacon marked in red.'),
      L('lia', 'Vesper. Eu trabalhei para ele. Ele não ataca uma vez só.', 'Vesper. I used to work for him. He never strikes just once.'),
      L('bran', 'Então chegamos antes. Para a Colina.', 'Then we get there first. To the Hill.'),
    ],
  },
  {
    title: ['A Colina do Farol', 'Beacon Hill'],
    song: 'road',
    setup: { map: 'beacon_hill', heroes: party(), enemies: [foe('brute'), foe('dark_mage'), foe('skeleton_archer'), foe('soldier')] },
    intro: [
      L('narr', 'A Colina do Farol. Neve de um lado, campo do outro, e o cristal azul no meio de tudo.', 'Beacon Hill. Snow on one side, fields on the other, and the blue crystal in the middle of it all.'),
      L('tess', 'Eles já estão subindo. Um bruto, um mago e soldados.', 'They are already climbing. A brute, a mage and soldiers.'),
      L('odo', 'Se o cristal cair, o Véu cobre o vale até o anoitecer!', 'If the crystal falls, the Veil covers the valley by nightfall!'),
      L('bran', 'Ninguém encosta no Farol. Segurem a subida.', 'No one touches the Beacon. Hold the climb.'),
    ],
    outro: [
      L('lia', 'O mago fugiu para o norte... para a cripta velha, debaixo do lago.', 'The mage ran north... to the old crypt, under the lake.'),
      L('odo', 'A Cripta Alagada? Ninguém entra lá há cem anos.', 'The Flooded Crypt? No one has gone in there for a hundred years.'),
      L('bran', 'Então ninguém vai nos esperar. Vamos.', 'Then no one will be expecting us. Let us go.'),
    ],
  },
  {
    title: ['A Cripta Alagada', 'The Flooded Crypt'],
    song: 'crypt',
    setup: { map: 'flooded_crypt', heroes: party(), enemies: [foe('skeleton_archer'), foe('skeleton_archer'), foe('dark_mage'), foe('skeleton_archer', { name: 'Ossada', hp: 10 })] },
    intro: [
      L('narr', 'Água até os joelhos, pilares caídos e o cheiro de vela apagada.', 'Knee-deep water, fallen pillars and the smell of snuffed candles.'),
      L('tess', 'Cuidado com a água funda no meio: ninguém atravessa ali.', 'Watch the deep water in the middle: no one crosses there.'),
      L('lia', 'Arqueiros nos pontos altos. Ele sempre gostou de altura.', 'Archers on the high ground. He always liked height.'),
      L('odo', 'E eu sempre gostei de fogo. Vamos ver quem gosta mais.', 'And I always liked fire. Let us see who likes theirs more.'),
    ],
    outro: [
      L('bran', 'Uma escada para baixo. A cripta continua.', 'A stairway down. The crypt goes deeper.'),
      L('lia', 'Ouviram? É a voz dele. Está rindo.', 'Did you hear that? It is his voice. He is laughing.'),
    ],
  },
  {
    title: ['O Coração da Cripta', 'The Heart of the Crypt'],
    song: 'boss',
    setup: { map: 'flooded_crypt', heroes: party(), enemies: [vesper(60, 8), foe('brute'), foe('skeleton_archer'), foe('skeleton_archer', { name: 'Ossada', hp: 18 })] },
    intro: [
      L('vesper', 'Lia. Voltou para casa e trouxe amigos.', 'Lia. You came home, and you brought friends.'),
      L('lia', 'Vim apagar o que você acendeu, Vesper.', 'I came to put out what you lit, Vesper.'),
      L('vesper', 'Os Faróis prendem os mortos longe de quem os ama. Eu só abro a porta.', 'The Beacons keep the dead away from those who love them. I only open the door.'),
      L('bran', 'E deixa o vale inteiro do lado de fora. Chega de conversa.', 'And leave the whole valley outside. Enough talk.'),
    ],
    outro: [
      L('vesper', 'Vocês venceram aqui. Mas o último Farol já está no meu caminho.', 'You won here. But the last Beacon is already on my path.'),
      L('odo', 'Ele sumiu na névoa! Para onde?', 'He vanished into the mist! Where to?'),
      L('tess', 'Para a Colina. É o único Farol que sobrou aceso.', 'To the Hill. It is the only Beacon still lit.'),
    ],
  },
  {
    title: ['O Último Farol', 'The Last Beacon'],
    song: 'boss',
    setup: { map: 'beacon_hill', heroes: party(), enemies: [vesper(65, 8), foe('brute'), foe('skeleton_archer'), foe('soldier')] },
    intro: [
      L('narr', 'A neve virou cinza. O Véu já desce pelo lado norte da Colina.', 'The snow has turned to ash. The Veil is already creeping down the north side of the Hill.'),
      L('vesper', 'Olhem bem para a luz. É a última vez.', 'Take a good look at the light. It is the last time.'),
      L('lia', 'Tess, Odo, no mago. Bran, segure o bruto longe do cristal.', 'Tess, Odo, on the mage. Bran, keep the brute away from the crystal.'),
      L('bran', 'Pela Colina. Pelo vale. Agora!', 'For the Hill. For the valley. Now!'),
    ],
    outro: [
      L('vesper', 'A porta... fechou de novo...', 'The door... it closed again...'),
      L('narr', 'O cristal brilhou mais forte do que nunca, e o Véu recuou até as montanhas.', 'The crystal shone brighter than ever, and the Veil fell back to the mountains.'),
      L('lia', 'Acabou. Desta vez, de verdade.', 'It is over. This time, for real.'),
      L('odo', 'Alguém mais está com fome? Eu estou com muita fome.', 'Is anyone else hungry? I am very hungry.'),
    ],
  },
];

export const chapterId = (n: number) => `camp${n}`;
export const chapterScenario = (n: number): Scenario => buildDevScenario(CHAPTERS[n].setup, chapterId(n), CHAPTERS[n].title);

// progresso salvo no navegador (fronteira de confiança): inteiro entre 0 e o número de fases, senão 0
export function parseProgress(raw: unknown): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= CHAPTERS.length ? n : 0;
}
