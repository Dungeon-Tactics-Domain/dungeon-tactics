// Classes and enemies of the game (data; the type and the registry live in src/shared/battle/units.ts). Initial numbers from
// Oct 25; speed 0 = never has a turn (the target to protect). Life x5 on Nov 15 (Fernando's grill: "aumente todos os números
// de vida e dano em 5x"), with damage and heals in abilities.ts; not measured. Resistances and dodge in % from the Mechanics
// lab's equipamento.json of Nov 15, a starting point Fernando tunes by playing; the hit and damage formulas (combat.ts) read them.
// The mana or stamina pool (`vars`, start and max) and its regen per turn come from the same sheet (Nov 16)
// Every unit has both pools since Nov 20 (Fernando: "quero ver como o jogo fica com todos tendo todas as barras"): a
// mana unit got the Dagger (stamina 30), a stamina unit the Gust (mana 30); a test to tune by playing. That second pool
// comes back 3 a turn (Nov 20, Fernando's pick "Regenerar as barras novas"): a Gust every 5 turns, a Dagger every 2
import type { UnitDef } from '../shared/battle/units.ts';

export const UNIT_LIST: UnitDef[] = [
  {
    id: 'warrior',
    name: 'Guerreiro',
    en: 'Warrior',
    hp: 210,
    speed: 8,
    move: 4,
    abilities: ['strike', 'heavy_strike', 'shield_bash', 'spin', 'gust'],
    vars: { stamina: 50, mana: 30 },
    regen: { stamina: 5, mana: 3 },
    resist: { phys: 10 },
    dodge: 5,
  },
  {
    id: 'archer',
    name: 'Arqueiro',
    en: 'Archer',
    hp: 140,
    speed: 10,
    move: 4,
    abilities: ['shot', 'aimed_shot', 'knock_shot', 'dagger', 'gust'],
    vars: { stamina: 40, mana: 30 },
    regen: { stamina: 5, mana: 3 },
    dodge: 10,
  },
  {
    id: 'mage',
    name: 'Mago',
    en: 'Mage',
    hp: 120,
    speed: 7,
    move: 3,
    abilities: ['firebolt', 'blast', 'gust', 'heal', 'dagger'],
    vars: { mana: 30, stamina: 30 }, // was 60: a spell is a choice, not free (Fernando, Nov 16),
    regen: { mana: 8, stamina: 3 },
    resist: { phys: -10, mag: 20 },
  },
  {
    id: 'rogue',
    name: 'Ladino',
    en: 'Rogue',
    hp: 130,
    speed: 12,
    move: 5,
    jump: 2,
    abilities: ['stab', 'throwing_knife', 'trip', 'deathblow', 'gust'],
    vars: { stamina: 50, mana: 30 },
    regen: { stamina: 5, mana: 3 },
    dodge: 20,
    flankDamage: { front: -25, back: 50 }, // Fernando, Nov 20: weaker head-on, normal from the side, strong from behind
  },
  {
    id: 'soldier',
    name: 'Soldado',
    en: 'Soldier',
    hp: 225,
    speed: 8,
    move: 4,
    abilities: ['strike', 'shield_bash', 'gust'],
    vars: { stamina: 40, mana: 30 },
    regen: { stamina: 5, mana: 3 },
    resist: { phys: 25 },
    dodge: 5,
  },
  {
    id: 'skeleton_archer',
    name: 'Arqueiro esqueleto',
    en: 'Skeleton archer',
    hp: 165,
    speed: 10,
    move: 4,
    abilities: ['shot', 'dagger', 'gust'],
    vars: { stamina: 40, mana: 30 },
    regen: { stamina: 5, mana: 3 },
    undead: true,
    resist: { light: -50, shadow: 50 },
    dodge: 5,
  },
  {
    id: 'dark_mage',
    name: 'Mago sombrio',
    en: 'Dark mage',
    hp: 150,
    speed: 7,
    move: 3,
    abilities: ['firebolt', 'blast', 'dagger'],
    vars: { mana: 60, stamina: 30 },
    regen: { mana: 8, stamina: 3 },
    resist: { phys: -10, mag: 30, shadow: 50, light: -25 },
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
    abilities: ['lance', 'sweep', 'lance_jump', 'gust'],
    vars: { stamina: 50, mana: 30 },
    regen: { stamina: 5, mana: 3 },
    resist: { phys: 10 },
    dodge: 5,
  },
  {
    id: 'brute',
    name: 'Bruto',
    en: 'Brute',
    hp: 410,
    speed: 5,
    move: 3,
    abilities: ['cleave', 'slam', 'gust'],
    vars: { stamina: 50, mana: 30 },
    regen: { stamina: 5, mana: 3 },
    resist: { phys: 20, mag: -10 },
  },
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
    abilities: ['stab', 'trip', 'gust'],
    vars: { stamina: 30, mana: 30 },
    regen: { stamina: 5, mana: 3 },
    undead: true,
    resist: { light: -50, shadow: 50 },
    dodge: 10,
  },
  // Mini skeleton (Nov 20, Fernando: "um monstro 1x1 ... ou então um mini esqueleto"): the minion shrunk to one half
  // tile, so the 2x2 cursor and a strike's area meet a body smaller than a tile. Less life than the minion (100: two of
  // them and a minion are the 320 a room needs at least, content.test.ts), a little faster; tune by playing
  {
    id: 'mini_skeleton',
    name: 'Mini esqueleto',
    en: 'Mini skeleton',
    hp: 100,
    speed: 12,
    move: 5,
    jump: 2,
    halfSize: 1,
    abilities: ['stab', 'trip', 'gust'],
    vars: { stamina: 30, mana: 30 },
    regen: { stamina: 5, mana: 3 },
    undead: true,
    resist: { light: -50, shadow: 50 },
    dodge: 20,
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
    abilities: ['firebolt', 'heal', 'dagger'],
    vars: { mana: 60, stamina: 30 },
    regen: { mana: 8, stamina: 3 },
    tint: '#8a5cff',
    resist: { mag: 20, shadow: 50, light: -25 },
  },
  // Veil Knight (Nov 13, new content requested by Fernando): a knight taken by the Veil, the knight model with a
  // red glow (UnitDef.tint) so it is not confused with Bran. Heavy strike and little life (38, 190 since the x5); in stage 7 in
  // place of the Soldier: 30% → 21% (with 55 life and shield bash it dropped to 5%)
  {
    id: 'veil_knight',
    name: 'Cavaleiro do Véu',
    en: 'Veil Knight',
    hp: 190,
    speed: 8,
    move: 4,
    abilities: ['strike', 'heavy_strike', 'gust'],
    vars: { stamina: 50, mana: 30 },
    regen: { stamina: 5, mana: 3 },
    tint: '#ff4a2a',
    resist: { phys: 30, shadow: 25, light: -25 },
  },
  // Bone Colossus (night of Nov 12, final boss of Act II): occupies 2x2 and does not walk; casts the Shadow Wave and the Blast.
  // Lots of life and low speed: the challenge is getting close under its spells. Initial numbers, measured in stage 7
  {
    id: 'colossus',
    name: 'Colosso de Ossos',
    en: 'Bone Colossus',
    hp: 680, // was 800: 680 / 0.725 resistances + the minion = 1,058 effective life, 14.7 to 20.3 turns (Fernando, Nov 16)
    speed: 6,
    move: 0,
    abilities: ['shadow_wave', 'blast', 'dagger'],
    vars: { mana: 50, stamina: 30 }, // two Blasts, then the free Shadow wave (was 120; Fernando, Nov 16)
    regen: { mana: 10, stamina: 3 },
    size: 2,
    undead: true,
    // the lab's sheet gives shadow +75, above its own 60 cap (RESIST_RANGE): written at the cap until Fernando decides
    resist: { phys: 30, mag: 20, shadow: 60, light: -50 },
  },
  // 50 life (was 35; 250 since the x5): with the enemy AI really advancing (Nov 11) the beacon fell early; 8x8 over 1,000
  // seeds: 33.7% → 62.8%
  { id: 'beacon', name: 'Farol', en: 'Beacon', hp: 250, speed: 0, move: 0, abilities: [] },
];
