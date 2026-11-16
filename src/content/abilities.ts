// Abilities of the game (data; the type and the registry live in src/shared/battle/abilities.ts). Initial numbers from Oct 25:
// to be decided by playing and simulating. Damage and healing x1.75 on Nov 13 (Fernando's request: "very low damage making the
// battle slow"): a common hit took ~17% of the life (6 hits to take someone down), in FFT it takes ~37% (FFT study, removed Nov 16); now ~30%.
// Damage and healing x5 on Nov 15 together with the life (Fernando's grill), so the share of life per hit stays; push, fall and
// spike damage (COMBAT in combat.ts) followed the same day. Elements and costs of the Mechanics lab's equipamento.json
// (abilities section): a spell spends mana, a martial ability stamina, and a unit's basic attack (its 1st) costs nothing
import type { AbilityDef } from '../shared/battle/abilities.ts';

// the builder lives here, not in the engine: the engine imports this list, so a builder imported back from it would not be
// initialised yet when this module runs
type Spec = Pick<AbilityDef, 'id' | 'name' | 'en' | 'range' | 'accuracy'> & Partial<AbilityDef>;
const A = (a: Spec): AbilityDef => ({
  radius: 0,
  heal: [0, 0],
  damage: [0, 0],
  push: 0,
  charge: 0,
  heightRange: false,
  needsSight: false,
  ...a,
});

export const ABILITY_LIST: AbilityDef[] = [
  // Warrior and melee
  A({ id: 'strike', name: 'Golpe', en: 'Strike', range: [1, 1], damage: [50, 80], accuracy: 90 }),
  A({
    id: 'heavy_strike',
    name: 'Golpe pesado',
    en: 'Heavy strike',
    range: [1, 1],
    damage: [95, 130],
    accuracy: 75,
    cost: ['stamina', 30],
  }),
  A({
    id: 'shield_bash',
    name: 'Escudada',
    en: 'Shield bash',
    range: [1, 1],
    damage: [20, 25],
    accuracy: 95,
    push: 2,
    cost: ['stamina', 10],
  }),
  A({
    id: 'spin',
    name: 'Giro',
    en: 'Spin',
    range: [0, 0],
    radius: 1,
    damage: [35, 50],
    accuracy: 85,
    cost: ['stamina', 30],
  }),
  // Archer
  A({
    id: 'shot',
    name: 'Tiro',
    en: 'Shot',
    range: [2, 6],
    heightRange: true,
    needsSight: true,
    damage: [45, 70],
    accuracy: 85,
  }),
  A({
    id: 'aimed_shot',
    name: 'Tiro mirado',
    en: 'Aimed shot',
    range: [2, 6],
    heightRange: true,
    needsSight: true,
    damage: [80, 105],
    accuracy: 90,
    charge: 4,
    panel: true,
    cost: ['stamina', 25],
  }), // Carga +1
  A({
    id: 'knock_shot',
    name: 'Tiro de recuo',
    en: 'Knockback shot',
    range: [2, 4],
    heightRange: true,
    needsSight: true,
    damage: [25, 35],
    accuracy: 85,
    push: 1,
    cost: ['stamina', 15],
  }),
  A({ id: 'dagger', name: 'Adaga', en: 'Dagger', range: [1, 1], damage: [25, 35], accuracy: 90, cost: ['stamina', 5] }),
  // Mage
  A({
    id: 'firebolt',
    name: 'Raio de fogo',
    en: 'Firebolt',
    range: [2, 5],
    heightRange: true,
    needsSight: true,
    damage: [50, 80],
    accuracy: 90,
    magic: true,
    element: 'fire',
  }),
  A({
    id: 'blast',
    name: 'Explosão',
    en: 'Blast',
    range: [2, 5],
    heightRange: true,
    needsSight: true,
    radius: 1,
    damage: [45, 70],
    accuracy: 85,
    charge: 4,
    magic: true,
    element: 'fire',
    cost: ['mana', 25],
  }), // like Fire
  A({
    id: 'gust',
    name: 'Rajada',
    en: 'Gust',
    range: [1, 4],
    needsSight: true,
    damage: [10, 20],
    accuracy: 85,
    push: 2,
    charge: 4,
    magic: true,
    element: 'wind',
    cost: ['mana', 15],
  }), // damage spell: like Fire
  A({
    id: 'heal',
    name: 'Cura',
    en: 'Heal',
    range: [1, 4],
    needsSight: true,
    heal: [60, 90],
    accuracy: 100,
    charge: 4,
    magic: true,
    element: 'light',
    cost: ['mana', 20],
  }), // like Cure
  // Rogue
  A({ id: 'stab', name: 'Facada', en: 'Stab', range: [1, 1], damage: [45, 60], accuracy: 95 }),
  A({
    id: 'throwing_knife',
    name: 'Faca arremessada',
    en: 'Throwing knife',
    range: [2, 4],
    heightRange: true,
    needsSight: true,
    damage: [35, 50],
    accuracy: 85,
    cost: ['stamina', 10],
  }),
  A({
    id: 'trip',
    name: 'Rasteira',
    en: 'Trip',
    range: [1, 1],
    damage: [20, 25],
    accuracy: 90,
    push: 1,
    cost: ['stamina', 10],
  }),
  A({
    id: 'deathblow',
    name: 'Golpe mortal',
    en: 'Deathblow',
    range: [1, 1],
    damage: [105, 140],
    accuracy: 70,
    cost: ['stamina', 30],
  }),
  // Brute
  // Shadow wave (Nov 12, Vesper's boss spell in the campaign's final stage): radius 2 area and long charge (6 ticks),
  // so the heroes see the marked area and have time to leave it; initial numbers, measured in stage 5
  A({
    id: 'shadow_wave',
    name: 'Onda sombria',
    en: 'Shadow wave',
    range: [2, 5],
    heightRange: true,
    needsSight: true,
    radius: 2,
    damage: [50, 80],
    accuracy: 85,
    charge: 6,
    magic: true,
    element: 'shadow',
  }),
  A({ id: 'cleave', name: 'Machadada', en: 'Cleave', range: [1, 1], damage: [90, 120], accuracy: 80 }),
  A({
    id: 'slam',
    name: 'Pancada',
    en: 'Slam',
    range: [1, 1],
    damage: [35, 50],
    accuracy: 85,
    push: 2,
    cost: ['stamina', 15],
  }),
  // Lancer (Nov 13, 1st new class of the group design, docs/game-design/towns-party-equipment.md): the lance reaches 2
  // tiles; the Jump drops from above onto the aimed tile after the charge (like the FFT Dragoon's Jump, in general stats: a charge that
  // aims at the tile and misses if the target leaves). Initial numbers, unmeasured (Fernando's request: only implement the mechanics)
  A({ id: 'lance', name: 'Estocada longa', en: 'Long thrust', range: [1, 2], damage: [55, 80], accuracy: 90 }),
  A({
    id: 'sweep',
    name: 'Derrubar',
    en: 'Sweep',
    range: [1, 2],
    damage: [25, 35],
    accuracy: 85,
    push: 1,
    cost: ['stamina', 15],
  }),
  A({
    id: 'lance_jump',
    name: 'Salto',
    en: 'Jump',
    range: [2, 4],
    damage: [95, 130],
    accuracy: 85,
    charge: 4,
    panel: true,
    cost: ['stamina', 30],
  }),
];
