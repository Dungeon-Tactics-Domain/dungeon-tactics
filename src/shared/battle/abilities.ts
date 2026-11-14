// Abilities are data with general stats (range, damage, push, delay, area); none has its own rule against another
// (decision of Oct 21 inherited from Warlock). Initial numbers from Oct 25: to be decided by playing and simulating. Damage and healing x1.75 on
// Nov 13 (Fernando's request: "very low damage making the battle slow"): a common hit took ~17% of the life (6 hits
// to take someone down), in FFT it takes ~37% (Gariland study); now ~30%
export interface AbilityDef {
  id: string;
  name: string;
  en: string;
  range: [min: number, max: number]; // in tiles; [0, 0] = centered on the user
  heightRange: boolean; // +1 max range per level above the target (only ranged attackers)
  needsSight: boolean; // requires line of sight to the target
  radius: number; // 0 = only the target tile; 1 = the tile and its 4 neighbors (the area never hits the user)
  damage: [min: number, max: number]; // [0, 0] = deals no damage
  heal: [min: number, max: number]; // [0, 0] = does not heal; healing targets an ally and never misses
  accuracy: number; // base % before distance, height and cover
  push: number; // tiles of push, away from the ability's center
  // Charge ticks before it fires (FFT slow action, BMG 1.1); 0 = fires immediately. Fernando's decision of Nov 12 ("Like
  // FFT"): a physical hit fires immediately; only spells charge (Fire and Heal ticks, 4, BMG 3.3) and the Aimed Shot, in the role
  // of the Archer's Charge (Charge +1, 4 ticks, BMG 2.2). The old "delay" does not exist in the FFT turn rule.
  charge: number;
  panel?: true; // the charge aims at the tile and misses if the target leaves it (like the Archer's Charge, BMG 2.2); without this, it follows the unit
  magic?: true; // magic: does not get the +50% against whoever is charging (the bonus is for physical attacks, BMG 6, Charging status)
  ally?: true; // targets an ally (or the user, if the range starts at 0) and rolls no hit; the effect comes from Rules.after. Only the study uses it
  cost?: [counter: string, amount: number]; // spends from UnitState.vars on each use; without balance, it cannot be used. Only the study uses it
  pushChance?: number; // % of times the push happens; without the field, always (only the FFT study uses it: ~50%)
}

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

const LIST: AbilityDef[] = [
  // Warrior and melee
  A({ id: 'strike', name: 'Golpe', en: 'Strike', range: [1, 1], damage: [10, 16], accuracy: 90 }),
  A({ id: 'heavy_strike', name: 'Golpe pesado', en: 'Heavy strike', range: [1, 1], damage: [19, 26], accuracy: 75 }),
  A({ id: 'shield_bash', name: 'Escudada', en: 'Shield bash', range: [1, 1], damage: [4, 5], accuracy: 95, push: 2 }),
  A({ id: 'spin', name: 'Giro', en: 'Spin', range: [0, 0], radius: 1, damage: [7, 10], accuracy: 85 }),
  // Archer
  A({
    id: 'shot',
    name: 'Tiro',
    en: 'Shot',
    range: [2, 6],
    heightRange: true,
    needsSight: true,
    damage: [9, 14],
    accuracy: 85,
  }),
  A({
    id: 'aimed_shot',
    name: 'Tiro mirado',
    en: 'Aimed shot',
    range: [2, 6],
    heightRange: true,
    needsSight: true,
    damage: [16, 21],
    accuracy: 90,
    charge: 4,
    panel: true,
  }), // Carga +1
  A({
    id: 'knock_shot',
    name: 'Tiro de recuo',
    en: 'Knockback shot',
    range: [2, 4],
    heightRange: true,
    needsSight: true,
    damage: [5, 7],
    accuracy: 85,
    push: 1,
  }),
  A({ id: 'dagger', name: 'Adaga', en: 'Dagger', range: [1, 1], damage: [5, 7], accuracy: 90 }),
  // Mage
  A({
    id: 'firebolt',
    name: 'Raio de fogo',
    en: 'Firebolt',
    range: [2, 5],
    heightRange: true,
    needsSight: true,
    damage: [10, 16],
    accuracy: 90,
    magic: true,
  }),
  A({
    id: 'blast',
    name: 'Explosão',
    en: 'Blast',
    range: [2, 5],
    heightRange: true,
    needsSight: true,
    radius: 1,
    damage: [9, 14],
    accuracy: 85,
    charge: 4,
    magic: true,
  }), // like Fire
  A({
    id: 'gust',
    name: 'Rajada',
    en: 'Gust',
    range: [1, 4],
    needsSight: true,
    damage: [2, 4],
    accuracy: 85,
    push: 2,
    charge: 4,
    magic: true,
  }), // damage spell: like Fire
  A({
    id: 'heal',
    name: 'Cura',
    en: 'Heal',
    range: [1, 4],
    needsSight: true,
    heal: [12, 18],
    accuracy: 100,
    charge: 4,
    magic: true,
  }), // like Cure
  // Rogue
  A({ id: 'stab', name: 'Facada', en: 'Stab', range: [1, 1], damage: [9, 12], accuracy: 95 }),
  A({
    id: 'throwing_knife',
    name: 'Faca arremessada',
    en: 'Throwing knife',
    range: [2, 4],
    heightRange: true,
    needsSight: true,
    damage: [7, 10],
    accuracy: 85,
  }),
  A({ id: 'trip', name: 'Rasteira', en: 'Trip', range: [1, 1], damage: [4, 5], accuracy: 90, push: 1 }),
  A({ id: 'deathblow', name: 'Golpe mortal', en: 'Deathblow', range: [1, 1], damage: [21, 28], accuracy: 70 }),
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
    damage: [10, 16],
    accuracy: 85,
    charge: 6,
    magic: true,
  }),
  A({ id: 'cleave', name: 'Machadada', en: 'Cleave', range: [1, 1], damage: [18, 24], accuracy: 80 }),
  A({ id: 'slam', name: 'Pancada', en: 'Slam', range: [1, 1], damage: [7, 10], accuracy: 85, push: 2 }),
  // Lancer (Nov 13, 1st new class of the group design, docs/game-design/towns-party-equipment.md): the lance reaches 2
  // tiles; the Jump drops from above onto the aimed tile after the charge (like the FFT Dragoon's Jump, in general stats: a charge that
  // aims at the tile and misses if the target leaves). Initial numbers, unmeasured (Fernando's request: only implement the mechanics)
  A({ id: 'lance', name: 'Estocada longa', en: 'Long thrust', range: [1, 2], damage: [11, 16], accuracy: 90 }),
  A({ id: 'sweep', name: 'Derrubar', en: 'Sweep', range: [1, 2], damage: [5, 7], accuracy: 85, push: 1 }),
  A({
    id: 'lance_jump',
    name: 'Salto',
    en: 'Jump',
    range: [2, 4],
    damage: [19, 26],
    accuracy: 85,
    charge: 4,
    panel: true,
  }),
];

export const ABILITIES: Record<string, AbilityDef> = Object.fromEntries(LIST.map((a) => [a.id, a]));
