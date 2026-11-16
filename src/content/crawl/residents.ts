// The residents of Vauclair and what they say (names approved by Fernando on Nov 16; the lines come from
// docs/game-design/narrative.md). Data only: the town's interface will read it later, and nothing in the client imports
// it yet, by Fernando's order. Texts are [pt, en] pairs like the names in rooms.ts.

export interface ResidentLine {
  // the sentence milestone that brings the line, or 'fall': said in town after a hero fell in the expedition
  when: 'milestone1' | 'milestone2' | 'milestone3' | 'fall';
  text: [string, string];
}

export interface Resident {
  id: string;
  name: string;
  role: [string, string];
  place: 'gate' | 'shop' | 'smith' | 'tavern' | 'kitchen' | 'square' | 'well' | 'tower';
  lines: ResidentLine[];
}

// The first five keep a place of their own and have exactly 3 lines each (tests/content-residents.test.ts); the last three
// have no facility and only carry rumours
export const RESIDENTS: Resident[] = [
  {
    id: 'hesk',
    name: 'Hesk',
    role: ['Carcereiro', 'Warden'],
    place: 'gate',
    lines: [
      {
        when: 'milestone1',
        text: [
          'Eu conto quem entra e quem sai. Facilite a minha conta.',
          'I count who goes in and who comes out. Keep my count easy.',
        ],
      },
      {
        when: 'milestone3',
        text: [
          'A mata não está na sua pena. Mas o conselho paga pelo que vier de lá.',
          'The woods aren’t in your sentence. But the council pays for whatever comes from there.',
        ],
      },
      { when: 'fall', text: ['Caído conta como voltou. Por pouco.', 'Fallen counts as back. Barely.'] },
    ],
  },
  {
    id: 'marta',
    name: 'Marta Penhale',
    role: ['Lojista', 'Shopkeeper'],
    place: 'shop',
    lines: [
      {
        when: 'milestone1',
        text: [
          'Preso não compra fiado. Mas o que você trouxer lá de baixo, eu pago.',
          'Prisoners get no credit. But whatever you bring up from below, I pay for.',
        ],
      },
      {
        when: 'milestone2',
        text: [
          'O conselho me paga pouco. Me traz coisa boa e a gente se entende.',
          'The council pays me little. Bring me good things and we’ll get along.',
        ],
      },
      {
        when: 'fall',
        text: ['Remédio tem preço. Hoje eu arredondo para baixo.', 'Medicine has a price. Today I round it down.'],
      },
    ],
  },
  {
    id: 'garrick',
    name: 'Garrick Ode',
    role: ['Ferreiro', 'Blacksmith'],
    place: 'smith',
    lines: [
      {
        when: 'milestone2',
        text: [
          'Tem ferro bom no fundo do segundo andar. Ferro velho, de quem trabalhava aqui antes.',
          'There’s good iron at the bottom of the second floor. Old iron, from those who worked here before.',
        ],
      },
      {
        when: 'milestone3',
        text: ['Segura o ferro aqui para mim. Só hoje.', 'Hold the iron here for me. Just today.'],
      },
      {
        when: 'fall',
        text: [
          'Armadura amassada eu conserto. Gente, não. Cuidado lá embaixo.',
          'Dented armour I can mend. People, I can’t. Careful down there.',
        ],
      },
    ],
  },
  {
    id: 'sela',
    name: 'Sela',
    role: ['Taverneira', 'Tavern keeper'],
    place: 'tavern',
    lines: [
      {
        when: 'milestone1',
        text: ['Não precisa dizer nada. A sopa está quente.', 'No need to say a thing. The soup is hot.'],
      },
      {
        when: 'milestone2',
        text: [
          'Quem sobe da mina sempre pede sopa quente. Quem vem da montanha pede duas.',
          'Everyone up from the mine asks for hot soup. Those from the mountain ask for two.',
        ],
      },
      { when: 'fall', text: ['Mais uma tigela, então.', 'One more bowl, then.'] },
    ],
  },
  {
    id: 'wren',
    name: 'Wren',
    role: ['Cozinheira e herbalista', 'Cook and herbalist'],
    place: 'kitchen',
    lines: [
      {
        when: 'milestone1',
        text: [
          'Me traz qualquer coisa verde que cresça lá embaixo. Até a feia.',
          'Bring me anything green that grows down there. Even the ugly ones.',
        ],
      },
      {
        when: 'milestone2',
        text: [
          'Faltam páginas no livro de receitas da minha mãe. O que você traz vai preenchendo.',
          'My mother’s recipe book is missing pages. What you bring fills them in.',
        ],
      },
      { when: 'fall', text: ['Senta. Come primeiro, conta depois.', 'Sit. Eat first, tell me after.'] },
    ],
  },
  {
    id: 'pip',
    name: 'Pip',
    role: ['Criança', 'Child'],
    place: 'square',
    lines: [
      { when: 'milestone2', text: ['Eu vi uma luz na montanha. Juro.', 'I saw a light on the mountain. I swear.'] },
    ],
  },
  {
    id: 'ysolde',
    name: 'Ysolde',
    role: ['Anciã', 'Elder'],
    place: 'well',
    lines: [
      {
        when: 'milestone1',
        text: [
          'Antes da mina, a gente colhia cogumelo na mata. Ninguém volta lá desde que as árvores começaram a cantar.',
          'Before the mine we picked mushrooms in the woods. Nobody goes back since the trees started singing.',
        ],
      },
    ],
  },
  {
    id: 'tobin',
    name: 'Tobin',
    role: ['Sineiro', 'Bell ringer'],
    place: 'tower',
    lines: [
      {
        when: 'milestone2',
        text: [
          'Toco o sino quando vocês vão e quando voltam. O segundo eu toco com mais gosto.',
          'I ring the bell when you go and when you come back. The second one I ring more gladly.',
        ],
      },
    ],
  },
];

// The convicts sentenced alongside the party, and how each sentence ends: paid and gone, paid and settled in the village
// (the tavern's first adventurer to recruit), or never back from the dungeon
export interface Prisoner {
  id: string;
  name: string;
  fate: 'left' | 'stayed' | 'lost';
}

export const OTHER_PRISONERS: Prisoner[] = [
  { id: 'dace', name: 'Dace', fate: 'left' },
  { id: 'rook', name: 'Rook', fate: 'stayed' },
  { id: 'nell', name: 'Nell', fate: 'lost' },
];
