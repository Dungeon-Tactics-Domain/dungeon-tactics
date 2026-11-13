// Campanha "Cinzas do Farol" (noite de 12/11: o Fernando pediu uma campanha com várias fases, história, diálogo e
// sons de fala). História nossa. Cada fase é um elenco do menu de desenvolvedor (dev-roster.ts) num mapa do jogo, com
// falas antes e depois da batalha. Puro e testado; a tela das falas fica em talk.ts.
import type { Scenario } from '../shared/battle/scenarios.ts';
import type { BattleState } from '../shared/battle/types.ts';
import { OBJECTIVE_DEF, UNIT_DEFS } from '../shared/battle/units.ts';
import { buildDevScenario, slotsOf, unitFrom, type DevSetup, type DevUnit } from './dev-roster.ts';
import { withHero, type Hero } from './hero.ts';
import type { SongId } from './music.ts';

export interface Line {
  who: keyof typeof SPEAKERS;
  pt: string;
  en: string;
}
export interface Chapter {
  title: [string, string];
  song: SongId; // música da fase (music.ts)
  boss?: true; // vence ao derrubar o 1º inimigo da lista (chapterScenario)
  light?: number; // clima da fase (BattleScene.setDaylight: 0 noite, 1 sol nascendo); sem isto, a luz de sempre
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
  shade: { name: 'A Sombra', en: 'The Shade', def: 'dark_mage', pitch: 80 },
  // os inimigos da fase 1 são esqueletos na tela (o Soldado usa o boneco de esqueleto): quem fala é o capitão deles
  merc: { name: 'Capitão de ossos', en: 'Bone captain', def: 'soldier', pitch: 180 },
  narr: { name: '', def: 'beacon', pitch: 220 },
  // o protagonista criado pelo jogador: nome e boneco trocados na hora (talk.ts recebe o herói salvo)
  hero: { name: 'Você', en: 'You', def: 'warrior', pitch: 240 },
} as const;

export const CAMPAIGN_KEY = 'dt:campanha'; // quantas fases já foram vencidas

// Os heróis aprendem uma habilidade por fase vencida (2 na 1ª, 3 na 2ª, as 4 da 3ª em diante): a 1ª fase ensina pouco de
// cada vez e a Cura do Odo chega no meio da campanha, quando os inimigos apertam
const party = (n: number): DevUnit[] => [unitFrom('warrior', 'Bran'), unitFrom('archer', 'Tess'), unitFrom('mage', 'Odo'), unitFrom('rogue', 'Lia')]
  .map((u) => ({ ...u, abilities: u.abilities.slice(0, Math.min(4, 2 + n)) }));
// habilidades que cada herói ganha ao passar da fase n para a n+1 (para o aviso no fim da fase)
export const learned = (n: number, hero: Hero | null = null) => n + 1 >= CHAPTERS.length ? [] : withHero(CHAPTERS[n + 1].setup, hero).heroes
  .map((u, i) => ({ name: u.name, abilities: u.abilities.filter((a) => !CHAPTERS[n].setup.heroes[i].abilities.includes(a)) }))
  .filter((x) => x.abilities.length);
const foe = (base: string, patch: Partial<DevUnit> = {}): DevUnit => ({ ...unitFrom(base), ...patch });
// Vesper cresce a cada encontro (fuga na fase 4, luta final na 5). Elencos medidos em 12/11 (MEDIR=300 no
// tests/campaign.test.ts, IA nos dois lados): vitória dos heróis 83% → 81% → 43% → 39% → 37% no Ato I (com os espinhos da Cripta; a fase 4 no mapa próprio, Coração da Cripta, com o fosso fundo: com o Lacaio dava 57%, com Soldado inteiro 15%, por isso o Guarda de 32 de vida e o Vesper com 90) e 39% → 30% no Ato II (com o Acólito no Passo no lugar do Mago sombrio; como 4º inimigo, no lugar do Lacaio, a fase caía a 8%) (4, 5 e 7 são de chefe; na 7, o Colosso 2x2 com 300 de vida), caindo fase a fase
// (a 1ª, no Bosque, ensina). Medido de novo depois do ajuste do Tiro mirado na IA (ai.ts, W.ESCAPE).
// Com as habilidades liberadas aos poucos, de novo em 12/11. Lacaio sozinho avança e morre cedo (cada um facilita
// muito) e Soldado inteiro no lugar dele dificulta muito: o Recruta (Soldado com 25 de vida) fica no meio.
// O que mais pesa: arqueiro esqueleto (na Colina, trocar o arqueiro por um Lacaio leva a fase de 67% a 98%) e a
// velocidade do Vesper (8 → 9 vale mais que 15 de vida).
const vesper = (hp: number, speed: number, abilities = ['firebolt', 'blast']) => foe('dark_mage', { name: 'Vesper', hp, speed, abilities });

const L = (who: Line['who'], pt: string, en: string): Line => ({ who, pt, en });

export const CHAPTERS: Chapter[] = [
  {
    title: ['A Estrada de Cinzas', 'The Ash Road'],
    song: 'road',
    setup: { map: 'ash_wood', heroes: party(0), enemies: [foe('soldier'), foe('soldier'), foe('skeleton_archer', { name: 'Arqueiro novato', en: 'Novice archer', hp: 20 }), foe('soldier', { name: 'Recruta', en: 'Recruit', hp: 25 })] },
    intro: [
      L('narr', 'Os Faróis protegem os vilarejos do Véu, a névoa onde os mortos não descansam. Um a um, eles estão se apagando.', 'The Beacons keep the villages safe from the Veil, the mist where the dead never rest. One by one, they are going dark.'),
      L('bran', 'Caravana parada no meio da estrada. Isso não é acidente.', 'A caravan stopped in the middle of the road. That is no accident.'),
      L('lia', 'Soldados de ossos, e de armadura. Só um homem põe os mortos para trabalhar.', 'Bone soldiers, in armor. Only one man puts the dead to work.'),
      L('merc', 'Nada pessoal. O mago sombrio quer os cristais que vocês levam.', 'Nothing personal. The dark mage wants the crystals you\'re carrying.'),
      L('tess', 'Então ele que venha buscar. Formação!', 'Then let him come and take them. Formation!'),
      L('hero', 'Ninguém encosta na caravana. Comigo!', 'No one touches the caravan. With me!'),
      // dicas da 1ª fase: o jogo ainda não tem tutorial; quem abre a campanha aprende o básico aqui
      L('narr', 'Dica: na sua vez, Mover anda até uma casa clara e Agir usa uma habilidade. Dá para fazer os dois, em qualquer ordem.', 'Tip: on your turn, Move walks to a lit tile and Act uses an ability. You can do both, in any order.'),
      L('narr', 'Dica: o rio fundo não se atravessa. Use a ponte ou o vau raso, que gasta mais movimento. Segure Enter (ou toque em ⏩) para a vez do inimigo passar rápido.', 'Tip: the deep river cannot be crossed. Use the bridge or the shallow ford, which costs more movement. Hold Enter (or tap ⏩) to speed up the enemy turn.'),
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
      L('tess', 'Eles já estão subindo. Um bruto, um arqueiro de ossos e mais dois atrás.', 'They\'re already climbing. A brute, a bone archer and two more behind them.'),
      L('odo', 'Se o cristal cair, o Véu cobre o vale até o anoitecer!', 'If the crystal falls, the Veil covers the valley by nightfall!'),
      L('bran', 'Ninguém encosta no Farol. Segurem a subida.', 'No one touches the Beacon. Hold the climb.'),
      L('hero', 'Eu fico perto do cristal. Quem subir, cai.', 'I stay by the crystal. Whoever climbs, falls.'),
    ],
    outro: [
      L('lia', 'Os que fugiram correram para o norte... para a cripta velha, debaixo do lago.', 'The ones who ran went north... to the old crypt, under the lake.'),
      L('odo', 'A Cripta Alagada? Ninguém entra lá há cem anos.', 'The Flooded Crypt? No one has gone in there for a hundred years.'),
      L('bran', 'Então ninguém vai nos esperar. Vamos.', 'Then no one will be expecting us. Let\'s go.'),
    ],
  },
  {
    title: ['A Cripta Alagada', 'The Flooded Crypt'],
    song: 'crypt',
    light: 0.5, // debaixo do lago: meia-luz azulada ("cheiro de vela apagada")
    setup: { map: 'flooded_crypt', heroes: party(2), enemies: [foe('skeleton_archer'), foe('skeleton_archer'), foe('dark_mage'), foe('minion')] },
    intro: [
      L('narr', 'Água até os joelhos, pilares caídos e o cheiro de vela apagada.', 'Knee-deep water, fallen pillars and the smell of snuffed candles.'),
      L('tess', 'Cuidado com a água funda no meio: ninguém atravessa ali.', 'Watch the deep water in the middle: no one crosses there.'),
      L('lia', 'Arqueiros nos pontos altos. Ele sempre gostou de altura.', 'Archers on the high ground. He always liked height.'),
      L('odo', 'E eu sempre gostei de fogo. Vamos ver quem gosta mais.', 'And I always liked fire. Let\'s see who likes theirs more.'),
      L('hero', 'Pelas pontes, um de cada vez. E longe dos espinhos: ser empurrado em cima deles dói.', 'Over the bridges, one at a time. And stay off the spikes: getting pushed onto them hurts.'),
    ],
    outro: [
      L('bran', 'Uma escada para baixo. A cripta continua.', 'A stairway down. The crypt goes deeper.'),
      L('lia', 'Ouviram? É a voz dele. Está rindo.', 'Did you hear that? It is his voice. He is laughing.'),
    ],
  },
  {
    title: ['O Coração da Cripta', 'The Heart of the Crypt'],
    song: 'boss',
    light: 0.35, // mais fundo, mais escuro
    boss: true,
    setup: { map: 'crypt_heart', heroes: party(3), enemies: [vesper(90, 9), foe('dark_mage'), foe('skeleton_archer'), foe('soldier', { name: 'Guarda da cripta', en: 'Crypt guard', hp: 32 })] },
    intro: [
      L('vesper', 'Lia. Voltou para casa e trouxe amigos.', 'Lia. You came home, and you brought friends.'),
      L('lia', 'Vim apagar o que você acendeu, Vesper.', 'I came to put out what you lit, Vesper.'),
      L('vesper', 'Os Faróis prendem os mortos longe de quem os ama. Eu só abro a porta.', 'The Beacons keep the dead away from those who love them. I only open the door.'),
      L('bran', 'E deixa o vale inteiro do lado de fora. Chega de conversa.', 'And leave the whole valley outside. Enough talk.'),
      L('narr', 'Objetivo: derrube o Vesper. Quando ele cair, os outros recuam.', 'Goal: bring Vesper down. When he falls, the rest retreat.'),
      L('hero', 'Então vamos direto nele. O resto é distração.', 'Then we go straight for him. The rest is a distraction.'),
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
    light: 0.3, // "o Véu já desce pela Colina": a mesma Colina da fase 2, agora no escuro
    boss: true,
    setup: { map: 'beacon_hill', heroes: party(4), enemies: [vesper(95, 9, ['firebolt', 'shadow_wave']), foe('brute'), foe('skeleton_archer'), foe('soldier')] },
    intro: [
      L('narr', 'A neve virou cinza. O Véu já desce pelo lado norte da Colina.', 'The snow has turned to ash. The Veil is already creeping down the north side of the Hill.'),
      L('vesper', 'Olhem bem para a luz. É a última vez.', 'Take a good look at the light. It is the last time.'),
      L('odo', 'Ele está juntando o Véu numa onda! Quando a área acender, saiam de dentro dela!', 'He is gathering the Veil into a wave! When the area lights up, get out of it!'),
      L('lia', 'Tess, Odo, no mago. Bran, segure o bruto longe do cristal.', 'Tess, Odo, on the mage. Bran, keep the brute away from the crystal.'),
      L('bran', 'Pela Colina. Pelo vale. Agora!', 'For the Hill. For the valley. Now!'),
      L('narr', 'Objetivo: derrube o Vesper e não deixe o Farol cair.', 'Goal: bring Vesper down and do not let the Beacon fall.'),
      L('hero', 'Esta é a última luz do vale. Ela não apaga hoje.', 'This is the last light in the valley. It does not go out today.'),
    ],
    outro: [
      L('vesper', 'A porta... fechou de novo...', 'The door... it closed again...'),
      L('narr', 'O cristal brilhou mais forte do que nunca, e o Véu recuou até as montanhas.', 'The crystal shone brighter than ever, and the Veil fell back to the mountains.'),
      L('lia', 'Acabou. Desta vez, de verdade.', 'It\'s over. For real this time.'),
      L('odo', 'Alguém mais está com fome? Eu estou com muita fome.', 'Is anyone else hungry? I\'m starving.'),
      L('tess', 'Esperem. Se acabou... por que o Passo Gelado ainda brilha roxo lá em cima?', 'Wait. If it is over... why is Frost Pass still glowing purple up there?'),
    ],
  },
  // Ato II (noite de 12/11): o Véu recuou para as montanhas, e quem chamava os mortos não era só o Vesper
  {
    title: ['O Passo Gelado', 'Frost Pass'],
    song: 'snow',
    setup: { map: 'frost_pass', heroes: party(5), enemies: [foe('skeleton_archer'), foe('soldier'), foe('acolyte'), foe('minion')] },
    intro: [
      L('narr', 'Três dias depois. O Passo Gelado, para onde o Véu recuou, ainda brilha roxo à noite.', 'Three days later. Frost Pass, where the Veil retreated to, still glows purple at night.'),
      L('bran', 'Subida longa e inimigo no alto. Do jeito que eu odeio.', 'A long climb with the enemy up high. Just the way I hate it.'),
      L('tess', 'Lá de cima eles enxergam e alcançam mais longe. Usem as árvores secas para se cobrir.', 'From up there they see and reach farther. Use the dead trees for cover.'),
      L('lia', 'Esses mortos não usam as cores do Vesper. Alguém mais está chamando eles.', 'These dead do not wear Vesper\'s colors. Someone else is calling them.'),
      L('odo', 'E aquele de manto roxo é um acólito: ele cura os outros. Derrubem ele primeiro!', 'And that one in the purple robe is an acolyte: he heals the others. Take him down first!'),
      L('hero', 'Subimos juntos, devagar. Quem chegar ao cume primeiro espera os outros.', 'We climb together, slowly. Whoever reaches the summit first waits for the rest.'),
    ],
    outro: [
      L('odo', 'No cume... uma figura. Parece o Vesper, mas é feita de névoa.', 'On the summit... a figure. It looks like Vesper, but it is made of mist.'),
      L('shade', 'O mago era só a porta. Eu sou o que estava do outro lado.', 'The mage was only the door. I am what waited on the other side.'),
      L('bran', 'Então a gente fecha a porta com você do lado de fora.', 'Then we shut the door with you on the outside.'),
    ],
  },
  {
    title: ['A Sombra no Cume', 'The Shade on the Summit'],
    song: 'boss',
    light: 0.15, // noite no cume; o sol nasce só no fim da conversa de saída
    boss: true,
    setup: { map: 'frost_pass', heroes: party(6), enemies: [foe('colossus', { name: 'A Sombra', en: 'The Shade', hp: 300 }), foe('skeleton_archer'), foe('soldier'), foe('minion')] },
    intro: [
      L('shade', 'Cada Farol que vocês acendem me empurra para cá. Aqui em cima não sobrou luz nenhuma.', 'Every Beacon you light pushes me up here. Up here, there is no light left at all.'),
      L('odo', 'Sobrou a gente. E eu trouxe fogo.', 'There is us. And I brought fire.'),
      L('narr', 'A Sombra se cobre com os ossos dos mortos do cume e cresce até ocupar o topo inteiro.', 'The Shade wraps itself in the bones of the summit dead and grows until it fills the whole peak.'),
      L('bran', 'Grande desse jeito, não sai do lugar. Cerquem e batam de todos os lados!', 'That big, it cannot move. Surround it and strike from every side!'),
      L('lia', 'A mesma regra de sempre: quando a área acender, saiam dela.', 'Same rule as always: when the area lights up, get out of it.'),
      L('narr', 'Objetivo: derrube A Sombra.', 'Goal: bring down The Shade.'),
      L('hero', 'Por Vauclair. Por todo mundo que o Véu levou.', 'For Vauclair. For everyone the Veil took.'),
    ],
    outro: [
      L('shade', 'A luz... de novo...', 'The light... again...'),
      L('narr', 'A névoa do cume se desfez ao amanhecer. Pela primeira vez em anos, o vale inteiro viu o sol nascer.', 'The mist on the summit melted away at dawn. For the first time in years, the whole valley watched the sun rise.'),
      L('tess', 'E agora?', 'And now?'),
      L('bran', 'Agora a gente desce. Devagar. Com café.', 'Now we go down. Slowly. With coffee.'),
      L('odo', 'E comida!', 'And food!'),
    ],
  },
];

export const chapterId = (n: number) => `camp${n}`;
// Fase de chefe (boss: true, o 1º inimigo da lista, id e0): derrubar o chefe vence, mesmo com outros de pé; perder todos
// os heróis (ou o Farol, se houver) perde. Pede outra tática: abrir caminho até ele em vez de limpar o mapa.
export function chapterScenario(n: number, hero: Hero | null = null): Scenario {
  const s = buildDevScenario(withHero(CHAPTERS[n].setup, hero), chapterId(n), CHAPTERS[n].title);
  if (CHAPTERS[n].boss) {
    UNIT_DEFS[s.spawns.find((sp) => sp.id === 'e0')!.def].boss = true;
    const beacon = s.spawns.some((sp) => sp.def === OBJECTIVE_DEF);
    s.rules = {
      outcome: (state) => !state.units.some((u) => u.id === 'e0') ? 'victory'
        : !state.units.some((u) => u.team === 'hero' && u.def !== OBJECTIVE_DEF) || (beacon && !state.units.some((u) => u.def === OBJECTIVE_DEF)) ? 'defeat'
        : 'ongoing',
    };
  }
  return s;
}

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

// objetivo da fase em uma frase, anunciado no começo da batalha (como a faixa de objetivo do FFT)
export function objectiveText(n: number, say: (pt: string, en: string) => string): string {
  const c = CHAPTERS[n];
  const beacon = slotsOf(c.setup.map).objective.length > 0;
  if (c.boss) {
    const boss = c.setup.enemies[0];
    return say(`Derrube ${boss.name}${beacon ? ' e proteja o Farol' : ''}!`, `Bring down ${boss.en ?? boss.name}${beacon ? ' and protect the Beacon' : ''}!`);
  }
  return beacon ? say('Derrote os inimigos e proteja o Farol!', 'Defeat the enemies and protect the Beacon!') : say('Derrote todos os inimigos!', 'Defeat every enemy!');
}

// progresso salvo no navegador (fronteira de confiança): inteiro entre 0 e o número de fases, senão 0
export function parseProgress(raw: unknown): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= CHAPTERS.length ? n : 0;
}
