// Tipos de unidade (dados). Números iniciais de 25/10; speed 0 = nunca tem turno (o alvo a proteger).
export interface UnitDef {
  id: string;
  name: string;
  en: string;
  hp: number;
  speed: number; // CT ganho por tique; mais veloz age antes e mais vezes
  move: number; // casas por turno
  abilities: string[]; // o primeiro é o ataque básico
}

const LIST: UnitDef[] = [
  { id: 'warrior', name: 'Guerreiro', en: 'Warrior', hp: 42, speed: 8, move: 4, abilities: ['strike', 'heavy_strike', 'shield_bash', 'spin'] },
  { id: 'archer', name: 'Arqueiro', en: 'Archer', hp: 28, speed: 10, move: 4, abilities: ['shot', 'aimed_shot', 'knock_shot', 'dagger'] },
  { id: 'mage', name: 'Mago', en: 'Mage', hp: 24, speed: 7, move: 3, abilities: ['firebolt', 'blast', 'gust', 'heal'] },
  { id: 'rogue', name: 'Ladino', en: 'Rogue', hp: 26, speed: 12, move: 5, abilities: ['stab', 'throwing_knife', 'trip', 'deathblow'] },
  { id: 'soldier', name: 'Soldado', en: 'Soldier', hp: 45, speed: 8, move: 4, abilities: ['strike', 'shield_bash'] },
  { id: 'skeleton_archer', name: 'Arqueiro esqueleto', en: 'Skeleton archer', hp: 33, speed: 10, move: 4, abilities: ['shot', 'dagger'] },
  { id: 'dark_mage', name: 'Mago sombrio', en: 'Dark mage', hp: 30, speed: 7, move: 3, abilities: ['firebolt', 'blast'] },
  { id: 'brute', name: 'Bruto', en: 'Brute', hp: 82, speed: 5, move: 3, abilities: ['cleave', 'slam'] },
  { id: 'beacon', name: 'Farol', en: 'Beacon', hp: 35, speed: 0, move: 0, abilities: [] },
];

export const UNIT_DEFS: Record<string, UnitDef> = Object.fromEntries(LIST.map((u) => [u.id, u]));

// o alvo a proteger da 1ª batalha; a derrota vem da queda dele ou da morte de todos os heróis
export const OBJECTIVE_DEF = 'beacon';
