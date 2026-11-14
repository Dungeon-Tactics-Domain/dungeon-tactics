// Unit types (data). Initial numbers from Oct 25; speed 0 = never has a turn (the target to protect).
export interface UnitDef {
  id: string;
  name: string;
  en: string;
  hp: number;
  speed: number; // CT gained per tick; faster acts earlier and more often
  move: number; // tiles per turn
  // levels it climbs or descends in one step, like the FFT Jump (Nov 13, Fernando's request); without it, MAX_JUMP (1). The maps
  // have drops of 2 on purpose: only whoever jumps 2 takes shortcuts through them (the Rogue and the Minion, the agile ones, 1 more than the
  // others like the FFT Thief). Rogue 3 and archers 2 broke the campaign curve (stage 5 from 35% to 77%)
  jump?: number;
  abilities: string[]; // the first is the basic attack
  info?: Record<string, string | number>; // extra sheet for the status window (weapon, Brave, Faith…); only the study scenario has it
  vars?: Record<string, number>; // counters the unit is born with (see UnitState.vars); only the study scenario uses it
  model?: string; // model in public/models; only the study scenario sets it, the game units are in the scene map
  boss?: true; // stage boss (campaign): only the crown in the drawing; the victory rule comes from the scenario
  tint?: string; // the model's own glow color, drawing only: a unit that shares the model with another (the Acolyte uses the mage)
  size?: number;
  power?: number; // extra damage on every ability that hurts (equipment, equipment.ts); without it, 0
  hit?: number; // extra hit points (equipment); without it, 0 // side of the occupied square (2 = 2x2, pathing.ts footprint); without it, 1 tile. A large unit does not walk nor get pushed
}

const LIST: UnitDef[] = [
  { id: 'warrior', name: 'Guerreiro', en: 'Warrior', hp: 42, speed: 8, move: 4, abilities: ['strike', 'heavy_strike', 'shield_bash', 'spin'] },
  { id: 'archer', name: 'Arqueiro', en: 'Archer', hp: 28, speed: 10, move: 4, abilities: ['shot', 'aimed_shot', 'knock_shot', 'dagger'] },
  { id: 'mage', name: 'Mago', en: 'Mage', hp: 24, speed: 7, move: 3, abilities: ['firebolt', 'blast', 'gust', 'heal'] },
  { id: 'rogue', name: 'Ladino', en: 'Rogue', hp: 26, speed: 12, move: 5, jump: 2, abilities: ['stab', 'throwing_knife', 'trip', 'deathblow'] },
  { id: 'soldier', name: 'Soldado', en: 'Soldier', hp: 45, speed: 8, move: 4, abilities: ['strike', 'shield_bash'] },
  { id: 'skeleton_archer', name: 'Arqueiro esqueleto', en: 'Skeleton archer', hp: 33, speed: 10, move: 4, abilities: ['shot', 'dagger'] },
  { id: 'dark_mage', name: 'Mago sombrio', en: 'Dark mage', hp: 30, speed: 7, move: 3, abilities: ['firebolt', 'blast'] },
  // Lancer (Nov 13, new class to recruit and swap; outside the campaign's fixed cast): jumps 3 levels and reaches 2 tiles
  { id: 'lancer', name: 'Lanceiro', en: 'Lancer', hp: 38, speed: 9, move: 4, jump: 3, abilities: ['lance', 'sweep', 'lance_jump'] },
  { id: 'brute', name: 'Bruto', en: 'Brute', hp: 82, speed: 5, move: 3, abilities: ['cleave', 'slam'] },
  // Minion (Nov 12, campaign): little life and lots of speed, comes in a swarm and falls in one hit; initial numbers, measured in the
  // difficulty of the campaign stages (tests/campaign.test.ts)
  { id: 'minion', name: 'Lacaio esqueleto', en: 'Skeleton minion', hp: 24, speed: 11, move: 5, jump: 2, abilities: ['stab', 'trip'] },
  // Veil Acolyte (night of Nov 12, Act II): heals allies, so taking it down first is the choice the stage asks for (the
  // target-priority "puzzle"). Little life and a mage's attack; initial numbers, measured in the Frost Pass stage
  { id: 'acolyte', name: 'Acólito do Véu', en: 'Veil Acolyte', hp: 26, speed: 9, move: 3, abilities: ['firebolt', 'heal'], tint: '#8a5cff' },
  // Veil Knight (Nov 13, new content requested by Fernando): a knight taken by the Veil, the knight model with a
  // red glow (UnitDef.tint) so it is not confused with Bran. Heavy strike and little life (38); in stage 7 in place of the Soldier: 30% → 21% (with 55 life and shield bash it dropped to 5%)
  { id: 'veil_knight', name: 'Cavaleiro do Véu', en: 'Veil Knight', hp: 38, speed: 8, move: 4, abilities: ['strike', 'heavy_strike'], tint: '#ff4a2a' },
  // Bone Colossus (night of Nov 12, final boss of Act II): occupies 2x2 and does not walk; casts the Shadow Wave and the Blast.
  // Lots of life and low speed: the challenge is getting close under its spells. Initial numbers, measured in stage 7
  { id: 'colossus', name: 'Colosso de Ossos', en: 'Bone Colossus', hp: 160, speed: 6, move: 0, abilities: ['shadow_wave', 'blast'], size: 2 },
  // 50 life (was 35): with the enemy AI really advancing (Nov 11) the beacon fell early; 8x8 over 1,000 seeds: 33.7% → 62.8%
  { id: 'beacon', name: 'Farol', en: 'Beacon', hp: 50, speed: 0, move: 0, abilities: [] },
];

export const UNIT_DEFS: Record<string, UnitDef> = Object.fromEntries(LIST.map((u) => [u.id, u]));

// the target to protect in the 1st battle; defeat comes from its fall or from the death of all heroes
export const OBJECTIVE_DEF = 'beacon';
