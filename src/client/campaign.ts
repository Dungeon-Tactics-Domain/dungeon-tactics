// Campaign "Ashes of the Lighthouse" (night of Nov 12: Fernando asked for a campaign with several stages, story, dialogue and
// speech sounds). Our own story. Each stage is a cast from the developer menu (dev-roster.ts) on a game map, with
// lines before and after the battle. Pure and tested; the dialogue screen lives in talk.ts.
import type { Scenario } from '../shared/battle/scenarios.ts';
import { OBJECTIVE_DEF, UNIT_DEFS } from '../shared/battle/units.ts';
import type { Equip } from './chest.ts';
import { buildDevScenario, type DevSetup, type DevUnit, slotsOf, unitFrom } from './dev-roster.ts';
import { defaultGroup, type Group, heroesFor } from './group.ts';
import type { Hero } from './hero.ts';
import type { SongId } from './music.ts';

export interface Line {
  who: keyof typeof SPEAKERS;
  pt: string;
  en: string;
}
export interface Chapter {
  title: [string, string];
  song: SongId; // stage music (music.ts)
  boss?: true; // wins by downing the 1st enemy in the list (chapterScenario)
  light?: number; // stage mood (BattleScene.setDaylight: 0 night, 1 sunrise); without it, the usual light
  setup: DevSetup;
  intro: Line[];
  outro: Line[];
}

// Who speaks: name, portrait figure and speech beep pitch (Hz). Each voice gets a different pitch so it's recognizable without reading the name.
export const SPEAKERS = {
  bran: { name: 'Bran', def: 'warrior', pitch: 150 },
  tess: { name: 'Tess', def: 'archer', pitch: 330 },
  odo: { name: 'Odo', def: 'mage', pitch: 260 },
  lia: { name: 'Lia', def: 'rogue', pitch: 420 },
  vesper: { name: 'Vesper', def: 'dark_mage', pitch: 110 },
  shade: { name: 'A Sombra', en: 'The Shade', def: 'dark_mage', pitch: 80 },
  // the stage 1 enemies are skeletons on screen (the Soldier uses the skeleton figure): the speaker is their captain
  merc: { name: 'Capitão de ossos', en: 'Bone captain', def: 'soldier', pitch: 180 },
  narr: { name: '', def: 'beacon', pitch: 220 },
  // the protagonist created by the player: name and figure swapped on the fly (talk.ts receives the saved hero)
  hero: { name: 'Você', en: 'You', def: 'warrior', pitch: 240 },
} as const;

export const CAMPAIGN_KEY = 'dt:campaign'; // how many stages were already won

// The heroes learn one ability per stage won (2 in the 1st, 3 in the 2nd, all 4 from the 3rd on): the 1st stage teaches a little of
// each at a time and Odo's Heal arrives mid-campaign, when the enemies press
const party = (n: number): DevUnit[] => heroesFor(defaultGroup(), n).map(({ items: _, ...u }) => u);
// abilities each hero gains when going from stage n to n+1 (for the notice at the end of the stage)
// (of the fielded party, with each one's current class)
export const learned = (n: number, hero: Hero | null = null, group: Group = defaultGroup()) =>
  n + 1 >= CHAPTERS.length
    ? []
    : heroesFor(group, n + 1, hero)
        .map((u, i) => ({
          name: u.name,
          abilities: u.abilities.filter((a) => !heroesFor(group, n, hero)[i].abilities.includes(a)),
        }))
        .filter((x) => x.abilities.length);
const foe = (base: string, patch: Partial<DevUnit> = {}): DevUnit => ({ ...unitFrom(base), ...patch });
// Vesper grows with each encounter (escape in stage 4, final fight in 5). Casts measured on Nov 12 (MEASURE=300 in
// tests/campaign.test.ts, AI on both sides): hero win rate 81% → 74% → 57% → 44% → 42% in Act I and 40% → 19% in Act II since the x1.75 damage, the facing, the passage-less trees and the gap only downward (Nov 13, battles of 35 to 54 turns, before 50 to 75; stage 3 fell to 16% and came back with 2 archers and 2 Minions of 28 HP, stage 5 rose to 60% and came back with Vesper at 105). Before that, 83% → 72% → 66% → 39% → 30% and 56% → 31%, with the class jump, the gap and the shallow water (without the gap, stage 2 gave 76% and stage 4, 40%): the stage 2 Soldier and the Pass one with 60 HP, Soldier in place of the Minion and the 2 archers whole in the Crypt, Crypt Guard with 45, stage 5 Vesper with 70 and the summit Lookout with 33. Before that: 83% → 71% → 47% → 42% → 35% in Act I (Hill with relief since Nov 13, and the stage 5 Vesper from 95 to 85 HP: on the new relief at 95 it gave 29%, at 80 it gave 40%; Crypt with relief and a new Novice Archer, and Heart with relief since Nov 13) (with the Crypt spikes; stage 4 on its own map, Heart of the Crypt, with the deep moat: with the Minion it gave 57%, with a whole Soldier 15%, hence the Guard with 32 HP and Vesper with 90) and 47% → 26% in Act II (Pass with zigzag relief since Nov 13: with it stage 7 fell to 4% with the summit at 5 and 14% at 4, hence the summit Lookout, an archer with 20 HP; before 39% → 21%; the Summit with the Veil Knight in place of the Soldier; with the Acolyte in the Pass in place of the Dark Mage; as the 4th enemy, in place of the Minion, the stage fell to 8%) (4, 5 and 7 are boss stages; in 7, the 2x2 Colossus with 300 HP), falling stage by stage
// (the 1st, in Ash Wood, teaches). Measured again after the Aimed Shot adjustment in the AI (ai.ts, W.ESCAPE).
// With the abilities unlocked gradually, again on Nov 12. A lone Minion advances and dies early (each one makes it
// much easier) and a whole Soldier in its place makes it much harder: the Recruit (Soldier with 25 HP) sits in the middle.
// What weighs most: skeleton archer (on the Hill, swapping the archer for a Minion takes the stage from 67% to 98%) and
// Vesper's speed (8 → 9 is worth more than 15 HP).
const vesper = (hp: number, speed: number, abilities = ['firebolt', 'blast']) =>
  foe('dark_mage', { name: 'Vesper', hp, speed, abilities });

const L = (who: Line['who'], pt: string, en: string): Line => ({ who, pt, en });

export const CHAPTERS: Chapter[] = [
  {
    title: ['A Estrada de Cinzas', 'The Ash Road'],
    song: 'road',
    setup: {
      map: 'ash_wood',
      heroes: party(0),
      enemies: [
        foe('soldier'),
        foe('soldier'),
        foe('skeleton_archer', { name: 'Arqueiro novato', en: 'Novice archer', hp: 32 }),
        foe('soldier', { name: 'Recruta', en: 'Recruit', hp: 40 }),
      ],
    },
    intro: [
      L(
        'narr',
        'Os Faróis protegem os vilarejos do Véu, a névoa onde os mortos não descansam. Um a um, eles estão se apagando.',
        'The Beacons keep the villages safe from the Veil, the mist where the dead never rest. One by one, they are going dark.',
      ),
      L(
        'bran',
        'Caravana parada no meio da estrada. Isso não é acidente.',
        'A caravan stopped in the middle of the road. That is no accident.',
      ),
      L(
        'lia',
        'Soldados de ossos, e de armadura. Só um homem põe os mortos para trabalhar.',
        'Bone soldiers, in armor. Only one man puts the dead to work.',
      ),
      L(
        'merc',
        'Nada pessoal. O mago sombrio quer os cristais que vocês levam.',
        "Nothing personal. The dark mage wants the crystals you're carrying.",
      ),
      L('tess', 'Então ele que venha buscar. Formação!', 'Then let him come and take them. Formation!'),
      L('hero', 'Ninguém encosta na caravana. Comigo!', 'No one touches the caravan. With me!'),
      // stage 1 hints: the game has no tutorial yet; whoever opens the campaign learns the basics here
      L(
        'narr',
        'Dica: na sua vez, Mover anda até uma casa marcada e Agir usa uma habilidade. Dá para fazer os dois, em qualquer ordem.',
        'Tip: on your turn, Move walks to a lit tile and Act uses an ability. You can do both, in any order.',
      ),
      L(
        'narr',
        'Dica: no rio fundo só se nada: quem está nele não ataca. A ponte e o vau raso são mais seguros; toda água gasta mais movimento. Segure Enter (ou ligue a Batalha rápida no menu do canto) para a vez do inimigo passar rápido.',
        'Tip: in the deep river you can only swim: whoever is in it cannot attack. The bridge and the shallow ford are safer; all water costs more movement. Hold Enter (or turn on Fast battle in the corner menu) to speed up the enemy turn.',
      ),
    ],
    outro: [
      L(
        'odo',
        'Achei isto com um deles: um mapa da Colina, com o Farol marcado em vermelho.',
        'I found this on one of them: a map of the Hill, with the Beacon marked in red.',
      ),
      L(
        'lia',
        'Vesper. Eu trabalhei para ele. Ele não ataca uma vez só.',
        'Vesper. I used to work for him. He never strikes just once.',
      ),
      L('bran', 'Então chegamos antes. Para a Colina.', 'Then we get there first. To the Hill.'),
    ],
  },
  {
    title: ['A Colina do Farol', 'Beacon Hill'],
    song: 'road',
    setup: {
      map: 'beacon_hill',
      heroes: party(1),
      enemies: [foe('brute'), foe('skeleton_archer'), foe('soldier', { hp: 60 }), foe('minion')],
    },
    intro: [
      L(
        'narr',
        'A Colina do Farol. Neve de um lado, campo do outro, e o cristal azul no meio de tudo.',
        'Beacon Hill. Snow on one side, fields on the other, and the blue crystal in the middle of it all.',
      ),
      L(
        'tess',
        'Eles já estão subindo. Um bruto, um arqueiro de ossos e mais dois atrás.',
        "They're already climbing. A brute, a bone archer and two more behind them.",
      ),
      L(
        'odo',
        'Se o cristal cair, o Véu cobre o vale até o anoitecer!',
        'If the crystal falls, the Veil covers the valley by nightfall!',
      ),
      L('bran', 'Ninguém encosta no Farol. Segurem a subida.', 'No one touches the Beacon. Hold the climb.'),
      L('hero', 'Eu fico perto do cristal. Quem subir, cai.', 'I stay by the crystal. Whoever climbs, falls.'),
    ],
    outro: [
      L(
        'lia',
        'Os rastros deles vêm do norte... da cripta velha, debaixo do lago.',
        'Their tracks come from the north... from the old crypt, under the lake.',
      ),
      L(
        'odo',
        'A Cripta Alagada? Ninguém entra lá há cem anos.',
        'The Flooded Crypt? No one has gone in there for a hundred years.',
      ),
      L('bran', 'Então ninguém vai nos esperar. Vamos.', "Then no one will be expecting us. Let's go."),
    ],
  },
  {
    title: ['A Cripta Alagada', 'The Flooded Crypt'],
    song: 'crypt',
    light: 0.5, // under the lake: bluish half-light ("smell of a snuffed candle")
    setup: {
      map: 'flooded_crypt',
      heroes: party(2),
      enemies: [foe('skeleton_archer'), foe('skeleton_archer'), foe('minion', { hp: 28 }), foe('minion', { hp: 28 })],
    },
    intro: [
      L(
        'narr',
        'Água até os joelhos, pilares caídos e o cheiro de vela apagada.',
        'Knee-deep water, fallen pillars and the smell of snuffed candles.',
      ),
      L(
        'tess',
        'A água do canal é rasa, mas pesa: cada passo nela custa o dobro.',
        'The canal water is shallow, but heavy: every step in it costs double.',
      ),
      L(
        'lia',
        'Arqueiros nos pontos altos. Ele sempre gostou de altura.',
        'Archers on the high ground. He always liked height.',
      ),
      L(
        'odo',
        'E eu sempre gostei de fogo. Vamos ver quem gosta mais.',
        "And I always liked fire. Let's see who likes theirs more.",
      ),
      L(
        'hero',
        'Pelas pontes é mais rápido. E longe dos espinhos: ser empurrado em cima deles dói.',
        'The bridges are faster. And stay off the spikes: getting pushed onto them hurts.',
      ),
    ],
    outro: [
      L('bran', 'Uma escada para baixo. A cripta continua.', 'A stairway down. The crypt goes deeper.'),
      L('lia', 'Ouviram? É a voz dele. Está rindo.', 'Did you hear that? It is his voice. He is laughing.'),
    ],
  },
  {
    title: ['O Coração da Cripta', 'The Heart of the Crypt'],
    song: 'boss',
    light: 0.35, // deeper, darker
    boss: true,
    setup: {
      map: 'crypt_heart',
      heroes: party(3),
      enemies: [
        vesper(90, 9),
        foe('dark_mage'),
        foe('skeleton_archer'),
        foe('soldier', { name: 'Guarda da cripta', en: 'Crypt guard', hp: 45 }),
      ],
    },
    intro: [
      L('vesper', 'Lia. Voltou para casa e trouxe amigos.', 'Lia. You came home, and you brought friends.'),
      L('lia', 'Vim apagar o que você acendeu, Vesper.', 'I came to put out what you lit, Vesper.'),
      L(
        'vesper',
        'Os Faróis prendem os mortos longe de quem os ama. Eu só abro a porta.',
        'The Beacons keep the dead away from those who love them. I only open the door.',
      ),
      L(
        'bran',
        'E deixa o vale inteiro do lado de fora. Chega de conversa.',
        'And leave the whole valley outside. Enough talk.',
      ),
      L(
        'narr',
        'Objetivo: derrube o Vesper. Quando ele cair, os outros recuam.',
        'Goal: bring Vesper down. When he falls, the rest retreat.',
      ),
      L(
        'hero',
        'Então vamos direto nele. O resto é distração.',
        'Then we go straight for him. The rest is a distraction.',
      ),
    ],
    outro: [
      L(
        'vesper',
        'Vocês venceram aqui. Mas o último Farol já está no meu caminho.',
        'You won here. But the last Beacon is already on my path.',
      ),
      L('odo', 'Ele sumiu na névoa! Para onde?', 'He vanished into the mist! Where to?'),
      L('tess', 'Para a Colina. É o único Farol que sobrou aceso.', 'To the Hill. It is the only Beacon still lit.'),
    ],
  },
  {
    title: ['O Último Farol', 'The Last Beacon'],
    song: 'boss',
    light: 0.3, // "the Veil already descends over the Hill": the same Hill as stage 2, now in the dark
    boss: true,
    setup: {
      map: 'beacon_hill',
      heroes: party(4),
      enemies: [vesper(105, 9, ['firebolt', 'shadow_wave']), foe('brute'), foe('skeleton_archer'), foe('soldier')],
    },
    intro: [
      L(
        'narr',
        'A neve virou cinza. O Véu já desce pelo lado norte da Colina.',
        'The snow has turned to ash. The Veil is already creeping down the north side of the Hill.',
      ),
      L('vesper', 'Olhem bem para a luz. É a última vez.', 'Take a good look at the light. It is the last time.'),
      L(
        'odo',
        'Ele está juntando o Véu numa onda! Ela vai atrás de quem ele mirou: o resto, saia de perto!',
        'He is gathering the Veil into a wave! It follows whoever he aimed at: everyone else, get clear!',
      ),
      L(
        'lia',
        'Fogo e flechas no Vesper. Quem estiver na frente segura o bruto longe do cristal.',
        'Fire and arrows on Vesper. Whoever is up front keeps the brute away from the crystal.',
      ),
      L('bran', 'Pela Colina. Pelo vale. Agora!', 'For the Hill. For the valley. Now!'),
      L(
        'narr',
        'Objetivo: derrube o Vesper e não deixe o Farol cair.',
        'Goal: bring Vesper down and do not let the Beacon fall.',
      ),
      L(
        'hero',
        'Esta é a última luz do vale. Ela não apaga hoje.',
        'This is the last light in the valley. It does not go out today.',
      ),
    ],
    outro: [
      L('vesper', 'A porta... fechou de novo...', 'The door... it closed again...'),
      L(
        'narr',
        'O cristal brilhou mais forte do que nunca, e o Véu recuou até as montanhas.',
        'The crystal shone brighter than ever, and the Veil fell back to the mountains.',
      ),
      L('lia', 'Acabou. Desta vez, de verdade.', "It's over. For real this time."),
      L('odo', 'Alguém mais está com fome? Eu estou com muita fome.', "Is anyone else hungry? I'm starving."),
      L(
        'tess',
        'Esperem. Se acabou... por que o Passo Gelado ainda brilha roxo lá em cima?',
        'Wait. If it is over... why is Frost Pass still glowing purple up there?',
      ),
    ],
  },
  // Act II (night of Nov 12): the Veil retreated to the mountains, and whoever called the dead wasn't only Vesper
  {
    title: ['O Passo Gelado', 'Frost Pass'],
    song: 'snow',
    setup: {
      map: 'frost_pass',
      heroes: party(5),
      enemies: [foe('skeleton_archer'), foe('soldier', { hp: 60 }), foe('acolyte'), foe('minion')],
    },
    intro: [
      L(
        'narr',
        'Na manhã seguinte. O Passo Gelado, para onde o Véu recuou, ainda brilha roxo à noite.',
        'The next morning. Frost Pass, where the Veil retreated to, still glows purple at night.',
      ),
      L(
        'bran',
        'Subida longa e inimigo no alto. Do jeito que eu odeio.',
        'A long climb with the enemy up high. Just the way I hate it.',
      ),
      L(
        'tess',
        'Lá de cima eles enxergam e alcançam mais longe. Usem as árvores secas para se cobrir.',
        'From up there they see and reach farther. Use the dead trees for cover.',
      ),
      L(
        'lia',
        'Esses mortos não usam as cores do Vesper. Alguém mais está chamando eles.',
        "These dead do not wear Vesper's colors. Someone else is calling them.",
      ),
      L(
        'odo',
        'E aquele de manto roxo é um acólito: ele cura os outros. Derrubem ele primeiro!',
        'And that one in the purple robe is an acolyte: he heals the others. Take him down first!',
      ),
      L(
        'hero',
        'Subimos juntos, devagar. Quem chegar ao cume primeiro espera os outros.',
        'We climb together, slowly. Whoever reaches the summit first waits for the rest.',
      ),
    ],
    outro: [
      L(
        'odo',
        'No cume... uma figura. Parece o Vesper, mas é feita de névoa.',
        'On the summit... a figure. It looks like Vesper, but it is made of mist.',
      ),
      L(
        'shade',
        'O mago era só a porta. Eu sou o que estava do outro lado.',
        'The mage was only the door. I am what waited on the other side.',
      ),
      L(
        'bran',
        'Então a gente fecha a porta com você do lado de fora.',
        'Then we shut the door with you on the outside.',
      ),
    ],
  },
  {
    title: ['A Sombra no Cume', 'The Shade on the Summit'],
    song: 'boss',
    light: 0.15, // night on the summit; the sun rises only at the end of the exit conversation
    boss: true,
    setup: {
      map: 'frost_pass',
      heroes: party(6),
      enemies: [
        foe('colossus', { name: 'A Sombra', en: 'The Shade', hp: 300 }),
        foe('skeleton_archer', { name: 'Vigia do cume', en: 'Summit lookout', hp: 33 }),
        foe('veil_knight'),
        foe('minion'),
      ],
    },
    intro: [
      L(
        'shade',
        'Cada Farol que vocês acendem me empurra para cá. Aqui em cima não sobrou luz nenhuma.',
        'Every Beacon you light pushes me up here. Up here, there is no light left at all.',
      ),
      L('odo', 'Sobrou a gente. E eu trouxe fogo.', 'There is us. And I brought fire.'),
      L(
        'narr',
        'A Sombra se cobre com os ossos dos mortos do cume e cresce até ocupar o topo inteiro.',
        'The Shade wraps itself in the bones of the summit dead and grows until it fills the whole peak.',
      ),
      L(
        'bran',
        'Grande desse jeito, não sai do lugar. Cerquem e batam de todos os lados!',
        'That big, it cannot move. Surround it and strike from every side!',
      ),
      L(
        'lia',
        'A mesma regra de sempre: a onda segue quem foi mirado, então o resto se espalha.',
        'Same rule as always: the wave follows its target, so everyone else spreads out.',
      ),
      L('narr', 'Objetivo: derrube A Sombra.', 'Goal: bring down The Shade.'),
      L('hero', 'Por Vauclair. Por todo mundo que o Véu levou.', 'For Vauclair. For everyone the Veil took.'),
    ],
    outro: [
      L('shade', 'A luz... de novo...', 'The light... again...'),
      L(
        'narr',
        'A névoa do cume se desfez ao amanhecer. Pela primeira vez em anos, o vale inteiro viu o sol nascer.',
        'The mist on the summit melted away at dawn. For the first time in years, the whole valley watched the sun rise.',
      ),
      L('tess', 'E agora?', 'And now?'),
      L('bran', 'Agora a gente desce. Devagar. Com café.', 'Now we go down. Slowly. With coffee.'),
      L('odo', 'E comida!', 'And food!'),
    ],
  },
];

export const chapterId = (n: number) => `camp${n}`;
// Boss stage (boss: true, the 1st enemy in the list, id e0): downing the boss wins, even with others still standing; losing all
// heroes (or the Lighthouse, if there is one) loses. Calls for another tactic: cut a path to him instead of clearing the map.
// `eq`: each member's saved equipment (chest.ts) and `group`: who goes to battle (group.ts); the difficulty measurement
// runs without both (the story party, no items)
export function chapterScenario(
  n: number,
  hero: Hero | null = null,
  eq: Equip = {},
  group: Group = defaultGroup(),
): Scenario {
  const s = buildDevScenario(
    { ...CHAPTERS[n].setup, heroes: heroesFor(group, n, hero, eq) },
    chapterId(n),
    CHAPTERS[n].title,
  );
  if (CHAPTERS[n].boss) {
    UNIT_DEFS[s.spawns.find((sp) => sp.id === 'e0')!.def].boss = true;
    const beacon = s.spawns.some((sp) => sp.def === OBJECTIVE_DEF);
    s.rules = {
      outcome: (state) =>
        !state.units.some((u) => u.id === 'e0')
          ? 'victory'
          : !state.units.some((u) => u.team === 'hero' && u.def !== OBJECTIVE_DEF) ||
              (beacon && !state.units.some((u) => u.def === OBJECTIVE_DEF))
            ? 'defeat'
            : 'ongoing',
    };
  }
  return s;
}

// what awaits in the stage, for the map panel (FFT shows the enemy before entering): "4 enemies · boss: Vesper"
export function foesText(n: number, say: (pt: string, en: string) => string): string {
  const c = CHAPTERS[n];
  const count = c.setup.enemies.length;
  const boss = c.boss ? c.setup.enemies[0] : null;
  return say(
    `${count} inimigos${boss ? ` · chefe: ${boss.name}` : ''}`,
    `${count} enemies${boss ? ` · boss: ${boss.en ?? boss.name}` : ''}`,
  );
}

// stage objective in one sentence, announced at the start of the battle (like FFT's objective banner)
export function objectiveText(n: number, say: (pt: string, en: string) => string): string {
  const c = CHAPTERS[n];
  const beacon = slotsOf(c.setup.map).objective.length > 0;
  if (c.boss) {
    const boss = c.setup.enemies[0];
    return say(
      `Derrube ${boss.name}${beacon ? ' e proteja o Farol' : ''}!`,
      `Bring down ${boss.en ?? boss.name}${beacon ? ' and protect the Beacon' : ''}!`,
    );
  }
  return beacon
    ? say('Derrote os inimigos e proteja o Farol!', 'Defeat the enemies and protect the Beacon!')
    : say('Derrote todos os inimigos!', 'Defeat every enemy!');
}

// progress saved in the browser (trust boundary): integer between 0 and the number of stages, otherwise 0
export function parseProgress(raw: unknown): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= CHAPTERS.length ? n : 0;
}
