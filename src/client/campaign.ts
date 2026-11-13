// Campanha "Cinzas do Farol" (noite de 12/11: o Fernando pediu uma campanha com várias fases, história, diálogo e
// sons de fala). História nossa. Cada fase é um elenco do menu de desenvolvedor (dev-roster.ts) num mapa do jogo, com
// falas antes e depois da batalha. Puro e testado; a tela das falas fica em talk.ts.
import type { Scenario } from '../shared/battle/scenarios.ts';
import type { BattleState } from '../shared/battle/types.ts';
import { OBJECTIVE_DEF, UNIT_DEFS } from '../shared/battle/units.ts';
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

// Os heróis aprendem uma habilidade por fase vencida (2 na 1ª, 3 na 2ª, as 4 da 3ª em diante): a 1ª fase ensina pouco de
// cada vez e a Cura do Odo chega no meio da campanha, quando os inimigos apertam
const party = (n: number): DevUnit[] => [unitFrom('warrior', 'Bran'), unitFrom('archer', 'Tess'), unitFrom('mage', 'Odo'), unitFrom('rogue', 'Lia')]
  .map((u) => ({ ...u, abilities: u.abilities.slice(0, Math.min(4, 2 + n)) }));
// habilidades que cada herói ganha ao passar da fase n para a n+1 (para o aviso no fim da fase)
export const learned = (n: number) => n + 1 >= CHAPTERS.length ? [] : CHAPTERS[n + 1].setup.heroes
  .map((u, i) => ({ name: u.name, abilities: u.abilities.filter((a) => !CHAPTERS[n].setup.heroes[i].abilities.includes(a)) }))
  .filter((x) => x.abilities.length);
const foe = (base: string, patch: Partial<DevUnit> = {}): DevUnit => ({ ...unitFrom(base), ...patch });
// Vesper cresce a cada encontro (fuga na fase 4, luta final na 5). Elencos medidos em 12/11 (MEDIR=300 no
// tests/campaign.test.ts, IA nos dois lados): vitória dos heróis 83% → 81% → 56% → 47% → 27%, caindo fase a fase
// (a 1ª, no Bosque, ensina). Medido de novo depois do ajuste do Tiro mirado na IA (ai.ts, W.ESCAPE).
// Com as habilidades liberadas aos poucos, de novo em 12/11. Lacaio sozinho avança e morre cedo (cada um facilita
// muito) e Soldado inteiro no lugar dele dificulta muito: o Recruta (Soldado com 25 de vida) fica no meio.
// O que mais pesa: arqueiro esqueleto (na Colina, trocar o arqueiro por um Lacaio leva a fase de 67% a 98%) e a
// velocidade do Vesper (8 → 9 vale mais que 15 de vida).
const vesper = (hp: number, speed: number) => foe('dark_mage', { name: 'Vesper', hp, speed, abilities: ['firebolt', 'blast'] });

const L = (who: Line['who'], pt: string, en: string): Line => ({ who, pt, en });

export const CHAPTERS: Chapter[] = [
  {
    title: ['A Estrada de Cinzas', 'The Ash Road'],
    song: 'road',
    setup: { map: 'ash_wood', heroes: party(0), enemies: [foe('soldier'), foe('soldier'), foe('skeleton_archer', { name: 'Arqueiro novato', hp: 20 }), foe('soldier', { name: 'Recruta', hp: 25 })] },
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
    setup: { map: 'beacon_hill', heroes: party(1), enemies: [foe('brute'), foe('skeleton_archer'), foe('soldier'), foe('minion')] },
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
    setup: { map: 'flooded_crypt', heroes: party(2), enemies: [foe('skeleton_archer'), foe('skeleton_archer'), foe('dark_mage'), foe('minion')] },
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
    setup: { map: 'flooded_crypt', heroes: party(3), enemies: [vesper(45, 9), foe('dark_mage'), foe('skeleton_archer'), foe('minion')] },
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
    setup: { map: 'beacon_hill', heroes: party(4), enemies: [vesper(65, 9), foe('brute'), foe('skeleton_archer'), foe('soldier')] },
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

// Estrelas da fase (0 a 3), para ter motivo de rejogar: vencer; ninguém caiu; e o Farol inteiro (nos mapas com Farol) ou,
// sem Farol, todos os heróis com mais da metade da vida. A melhor nota de cada fase fica salva em STARS_KEY.
export const STARS_KEY = 'dt:estrelas';
export function starsOf(state: BattleState, n: number): number {
  if (state.outcome !== 'victory') return 0;
  const heroes = state.units.filter((u) => u.team === 'hero' && u.def !== OBJECTIVE_DEF);
  const beacon = state.units.find((u) => u.def === OBJECTIVE_DEF);
  const clean = beacon ? beacon.hp === UNIT_DEFS[OBJECTIVE_DEF].hp : heroes.every((u) => u.hp * 2 > UNIT_DEFS[u.def].hp);
  return 1 + Number(heroes.length === CHAPTERS[n].setup.heroes.length) + Number(clean);
}
export function parseStars(raw: unknown): number[] {
  const list = Array.isArray(raw) ? raw : [];
  return CHAPTERS.map((_, i) => (Number.isInteger(list[i]) && list[i] >= 0 && list[i] <= 3 ? list[i] : 0));
}
export const starText = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n);

// progresso salvo no navegador (fronteira de confiança): inteiro entre 0 e o número de fases, senão 0
export function parseProgress(raw: unknown): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= CHAPTERS.length ? n : 0;
}
