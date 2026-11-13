// Tipos de unidade (dados). Números iniciais de 25/10; speed 0 = nunca tem turno (o alvo a proteger).
export interface UnitDef {
  id: string;
  name: string;
  en: string;
  hp: number;
  speed: number; // CT ganho por tique; mais veloz age antes e mais vezes
  move: number; // casas por turno
  abilities: string[]; // o primeiro é o ataque básico
  info?: Record<string, string | number>; // ficha extra para a janela de status (arma, Brave, Fé…); só o cenário de estudo tem
  vars?: Record<string, number>; // contadores com que a unidade nasce (ver UnitState.vars); só o cenário de estudo usa
  model?: string; // modelo em public/models; só o cenário de estudo informa, as unidades do jogo estão no mapa da cena
  boss?: true; // chefe da fase (campanha): só a coroa no desenho; a regra de vitória vem do cenário
  tint?: string; // cor do brilho próprio do boneco, só no desenho: unidade que divide o boneco com outra (o Acólito usa o mago)
  size?: number; // lado do quadrado ocupado (2 = 2x2, pathing.ts footprint); sem isto, 1 casa. Unidade grande não anda nem é empurrada
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
  // Lacaio (12/11, campanha): pouca vida e muita velocidade, vem em bando e cai num golpe; números iniciais, medidos na
  // dificuldade das fases da campanha (tests/campaign.test.ts)
  { id: 'minion', name: 'Lacaio esqueleto', en: 'Skeleton minion', hp: 24, speed: 11, move: 5, abilities: ['stab', 'trip'] },
  // Acólito do Véu (noite de 12/11, Ato II): cura os aliados, então derrubá-lo primeiro é a escolha que a fase pede (o
  // "puzzle" de prioridade de alvo). Pouca vida e ataque de mago; números iniciais, medidos na fase do Passo Gelado
  { id: 'acolyte', name: 'Acólito do Véu', en: 'Veil Acolyte', hp: 26, speed: 9, move: 3, abilities: ['firebolt', 'heal'], tint: '#8a5cff' },
  // Colosso de Ossos (noite de 12/11, chefe final do Ato II): ocupa 2x2 e não anda; lança a Onda sombria e a Explosão.
  // Muita vida e velocidade baixa: o desafio é chegar perto sob as magias dele. Números iniciais, medidos na fase 7
  { id: 'colossus', name: 'Colosso de Ossos', en: 'Bone Colossus', hp: 160, speed: 6, move: 0, abilities: ['shadow_wave', 'blast'], size: 2 },
  // 50 de vida (era 35): com a IA inimiga avançando de verdade (11/11) o farol caía cedo; 8x8 em 1 000 sementes: 33,7% → 62,8%
  { id: 'beacon', name: 'Farol', en: 'Beacon', hp: 50, speed: 0, move: 0, abilities: [] },
];

export const UNIT_DEFS: Record<string, UnitDef> = Object.fromEntries(LIST.map((u) => [u.id, u]));

// o alvo a proteger da 1ª batalha; a derrota vem da queda dele ou da morte de todos os heróis
export const OBJECTIVE_DEF = 'beacon';
