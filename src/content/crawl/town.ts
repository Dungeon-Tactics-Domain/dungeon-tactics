// The walkable town (Nov 15, Fernando's grill: the town becomes a 3D map in Ash Wood's painted style where a hero walks;
// the windows open at the matching building). Written in whole tiles like every map and halved by the client
// (game/town.ts): 14x14 tiles, 28x28 half tiles, about Ash Wood's size. Flat where people walk, so every step is a stop.
import type { Tile } from '../../shared/battle/grid.ts';
import type { Scenario } from '../../shared/battle/scenarios.ts';
import type { Pos } from '../../shared/battle/types.ts';

// A building stands on a 3x3 lot of whole tiles (`#`, the KayKit house drawn over it from its centre tile, scene/board.ts);
// the gate's lot is 3x1. The letter on the centre tile is the place (its look), the rest of the lot is `lot`
const TOWN_KEY: Record<string, Pick<Tile, 'terrain' | 'look'>> = {
  g: { terrain: 'floor', look: 'grass' },
  s: { terrain: 'floor', look: 'sand' }, // the road from the gate to the south edge
  p: { terrain: 'floor', look: 'stone' }, // the square around the well
  T: { terrain: 'forest', look: 'tree2' },
  t: { terrain: 'forest', look: 'tree3' },
  y: { terrain: 'forest', look: 'tree4' },
  c: { terrain: 'wall', look: 'crates' },
  x: { terrain: 'wall', look: 'barrel' },
  o: { terrain: 'wall', look: 'boulder' },
  '#': { terrain: 'wall', look: 'lot' },
  G: { terrain: 'wall', look: 'guild' },
  E: { terrain: 'wall', look: 'enchanter' },
  S: { terrain: 'wall', look: 'shop' },
  A: { terrain: 'wall', look: 'tavern' },
  B: { terrain: 'wall', look: 'smithy' },
  Q: { terrain: 'wall', look: 'gate' },
  h: { terrain: 'wall', look: 'home' },
  w: { terrain: 'wall', look: 'well' },
};
const TOWN_MAP = [
  'TTyTT#Q#TTyTtT',
  'T###ggsgg###gT',
  'T#G#ggsgg#E#gy',
  'T###ggsgg###gT',
  'tgggggsggggggT',
  'Tg###pspp###gT',
  'Tg#S#pppp#A#cT',
  'Tg###ppwp###xT',
  'Tgggpppppggggy',
  'Tg###gsgg###gT',
  'To#B#gsgg#h#gT',
  'Tg###gsgg###gT',
  'Tgggggsgggggct',
  'TyTTTTsTTtTTyT',
];
// the woods around the town one level up, the gate and the road out at the ground's level
const TOWN_H = ['11111000111111', ...Array.from({ length: 12 }, () => '10000000000001'), '11111101111111'];

// the places the hero walks into: the building's centre tile and the tile in front of its door (whole tiles). `soon`:
// what a place without its window yet says (the equipment system is another session's work, Nov 15)
export type PlaceId = 'guild' | 'shop' | 'tavern' | 'smithy' | 'enchanter' | 'gate';
export interface Place {
  id: PlaceId;
  name: [string, string];
  at: Pos;
  door: Pos;
  soon?: [string, string];
}
export const TOWN_PLACES: Place[] = [
  { id: 'gate', name: ['Portão da masmorra', 'Dungeon gate'], at: { x: 6, y: 0 }, door: { x: 6, y: 1 } },
  { id: 'guild', name: ['Guilda dos Aventureiros', 'Adventurers’ Guild'], at: { x: 2, y: 2 }, door: { x: 2, y: 4 } },
  {
    id: 'enchanter',
    name: ['Encantadora', 'Enchantress'],
    at: { x: 10, y: 2 },
    door: { x: 10, y: 4 },
    soon: [
      'A encantadora está viajando. Encantar equipamento chega numa próxima versão.',
      'The enchantress is away. Enchanting equipment comes in a later version.',
    ],
  },
  { id: 'shop', name: ['Loja', 'Shop'], at: { x: 3, y: 6 }, door: { x: 3, y: 8 } },
  { id: 'tavern', name: ['Taverna', 'Tavern'], at: { x: 10, y: 6 }, door: { x: 10, y: 8 } },
  {
    id: 'smithy',
    name: ['Ferreiro', 'Blacksmith'],
    at: { x: 3, y: 10 },
    door: { x: 3, y: 12 },
    soon: [
      'A forja espera o ferro. Melhorar equipamento chega numa próxima versão.',
      'The forge waits for its iron. Upgrading equipment comes in a later version.',
    ],
  },
];

// where the hero (the first of the party who goes to battle) starts: on the road, near the south edge
export const TOWN_START: Pos = { x: 6, y: 11 };
// the rest of the party waits by the Guild, in this order (Fernando: the party's heroes stand there as NPCs): in the yard
// beside it, then across the square when the party outgrows it. Never in the street to its door, where the keyboard's
// single steps could not pass them (review of Nov 15), and each with free ground beside them to talk
export const GUILD_SPOTS: Pos[] = [
  { x: 4, y: 3 },
  { x: 4, y: 2 },
  { x: 4, y: 1 },
  { x: 5, y: 5 },
  { x: 5, y: 6 },
  { x: 5, y: 7 },
  { x: 8, y: 5 },
];
// what a party member says before their sheet opens, and each class's voice (the speech beep, in Hz)
export const GUILD_LINE: [string, string] = ['Pronto quando você estiver.', 'Ready when you are.'];
export const CLASS_VOICE: Record<string, number> = { warrior: 247, archer: 392, mage: 330, rogue: 440, lancer: 294 };

// Townsfolk who stroll near home and tell rumours, one more each time (bilingual, our own text). `def` picks the KayKit
// character and the painted face (faces.json by model)
export interface Townsfolk {
  id: string;
  def: string;
  name: string;
  pitch: number;
  home: Pos;
  lines: [string, string][];
}
export const TOWNSFOLK: Townsfolk[] = [
  {
    id: 'guard',
    def: 'lancer',
    name: 'Aldo',
    pitch: 262,
    home: { x: 7, y: 2 },
    lines: [
      [
        'A estrada ao norte acaba no portão da masmorra. Ninguém desce sozinho.',
        'The north road ends at the dungeon gate. Nobody goes down alone.',
      ],
      [
        'Quem volta ferido é cuidado aqui. Quem não volta, a gente lembra.',
        'Whoever comes back hurt is cared for here. Whoever doesn’t, we remember.',
      ],
    ],
  },
  {
    id: 'smith',
    def: 'brute',
    name: 'Hugo',
    pitch: 196,
    home: { x: 5, y: 10 },
    lines: [
      [
        'A forja está fria até o ferro chegar. Volte mais tarde.',
        'The forge is cold until the iron arrives. Come back later.',
      ],
      ['Esqueleto não sangra: bata onde os ossos se juntam.', 'Skeletons don’t bleed: hit them where the bones meet.'],
    ],
  },
  {
    id: 'apprentice',
    def: 'mage',
    name: 'Selene',
    pitch: 494,
    home: { x: 12, y: 3 },
    lines: [
      [
        'A mestra encantadora está viajando. Quando voltar, suas armas vão brilhar.',
        'The enchantress is away. When she returns, your weapons will glow.',
      ],
      [
        'O chefe lá embaixo é feito dos ossos de muitos. Leve quem cure.',
        'The boss down there is made of many people’s bones. Bring a healer.',
      ],
    ],
  },
  {
    id: 'hunter',
    def: 'archer',
    name: 'Mira',
    pitch: 349,
    home: { x: 8, y: 10 },
    lines: [
      ['Lacaios são rápidos, mas quebram fácil. Arqueiro adora.', 'Minions are fast but brittle. Archers love them.'],
      ['Na taverna tem gente para contratar, 200 de ouro cada.', 'The tavern has hands for hire, 200 gold each.'],
    ],
  },
];

// the town the game opens in (Nov 15, Fernando: no world map; the expedition leaves from it and comes back to it)
export const TOWN: Scenario = {
  id: 'vauclair',
  name: 'Vila de Vauclair',
  en: 'Vauclair Village',
  grid: {
    width: 14,
    height: 14,
    tiles: TOWN_MAP.flatMap((row, y) => [...row].map((c, x) => ({ ...TOWN_KEY[c], h: Number(TOWN_H[y][x]) }))),
  },
  spawns: TOWNSFOLK.map((f) => ({ id: `f-${f.id}`, def: f.def, team: 'hero' as const, x: f.home.x, y: f.home.y })),
};
