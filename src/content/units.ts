// Classes and enemies of the game (data; the type and the registry live in src/shared/battle/units.ts). Initial numbers from
// Oct 25; speed 0 = never has a turn (the target to protect).
import type { UnitDef } from '../shared/battle/units.ts';

export const UNIT_LIST: UnitDef[] = [
  {
    id: 'warrior',
    name: 'Guerreiro',
    en: 'Warrior',
    hp: 210,
    speed: 8,
    move: 4,
    abilities: ['strike', 'heavy_strike', 'shield_bash', 'spin'],
  },
  {
    id: 'archer',
    name: 'Arqueiro',
    en: 'Archer',
    hp: 140,
    speed: 10,
    move: 4,
    abilities: ['shot', 'aimed_shot', 'knock_shot', 'dagger'],
  },
  { id: 'mage', name: 'Mago', en: 'Mage', hp: 120, speed: 7, move: 3, abilities: ['firebolt', 'blast', 'gust', 'heal'] },
  {
    id: 'rogue',
    name: 'Ladino',
    en: 'Rogue',
    hp: 130,
    speed: 12,
    move: 5,
    jump: 2,
    abilities: ['stab', 'throwing_knife', 'trip', 'deathblow'],
  },
  { id: 'soldier', name: 'Soldado', en: 'Soldier', hp: 225, speed: 8, move: 4, abilities: ['strike', 'shield_bash'] },
  {
    id: 'skeleton_archer',
    name: 'Arqueiro esqueleto',
    en: 'Skeleton archer',
    hp: 165,
    speed: 10,
    move: 4,
    abilities: ['shot', 'dagger'],
    undead: true,
  },
  {
    id: 'dark_mage',
    name: 'Mago sombrio',
    en: 'Dark mage',
    hp: 150,
    speed: 7,
    move: 3,
    abilities: ['firebolt', 'blast'],
  },
  // Lancer (Nov 13, new class to recruit and swap; outside the campaign's fixed cast): jumps 3 levels and reaches 2 tiles
  {
    id: 'lancer',
    name: 'Lanceiro',
    en: 'Lancer',
    hp: 190,
    speed: 9,
    move: 4,
    jump: 3,
    abilities: ['lance', 'sweep', 'lance_jump'],
  },
  { id: 'brute', name: 'Bruto', en: 'Brute', hp: 410, speed: 5, move: 3, abilities: ['cleave', 'slam'] },
  // Minion (Nov 12, campaign): little life and lots of speed, comes in a swarm and falls in one hit; initial numbers, measured in the
  // difficulty of the campaign stages (Nov 12)
  {
    id: 'minion',
    name: 'Lacaio esqueleto',
    en: 'Skeleton minion',
    hp: 120,
    speed: 11,
    move: 5,
    jump: 2,
    abilities: ['stab', 'trip'],
    undead: true,
  },
  // Veil Acolyte (night of Nov 12, Act II): heals allies, so taking it down first is the choice the stage asks for (the
  // target-priority "puzzle"). Little life and a mage's attack; initial numbers, measured in the Frost Pass stage
  {
    id: 'acolyte',
    name: 'Acólito do Véu',
    en: 'Veil Acolyte',
    hp: 130,
    speed: 9,
    move: 3,
    abilities: ['firebolt', 'heal'],
    tint: '#8a5cff',
  },
  // Veil Knight (Nov 13, new content requested by Fernando): a knight taken by the Veil, the knight model with a
  // red glow (UnitDef.tint) so it is not confused with Bran. Heavy strike and little life (38, 190 since the x5); in stage 7 in place of the Soldier: 30% → 21% (with 55 life and shield bash it dropped to 5%)
  {
    id: 'veil_knight',
    name: 'Cavaleiro do Véu',
    en: 'Veil Knight',
    hp: 190,
    speed: 8,
    move: 4,
    abilities: ['strike', 'heavy_strike'],
    tint: '#ff4a2a',
  },
  // Bone Colossus (night of Nov 12, final boss of Act II): occupies 2x2 and does not walk; casts the Shadow Wave and the Blast.
  // Lots of life and low speed: the challenge is getting close under its spells. Initial numbers, measured in stage 7
  {
    id: 'colossus',
    name: 'Colosso de Ossos',
    en: 'Bone Colossus',
    hp: 800,
    speed: 6,
    move: 0,
    abilities: ['shadow_wave', 'blast'],
    size: 2,
    undead: true,
  },
  // 50 life (was 35; 250 since the x5): with the enemy AI really advancing (Nov 11) the beacon fell early; 8x8 over 1,000 seeds: 33.7% → 62.8%
  { id: 'beacon', name: 'Farol', en: 'Beacon', hp: 250, speed: 0, move: 0, abilities: [] },
];
