// Habilidades são dados com stats gerais (alcance, dano, empurrão, atraso, área); nenhuma tem regra própria contra outra
// (decisão de 21/10 herdada do Warlock). Números iniciais de 25/10: a decidir jogando e simulando.
export interface AbilityDef {
  id: string;
  name: string;
  en: string;
  range: [min: number, max: number]; // em casas; [0, 0] = centrada em quem usa
  heightRange: boolean; // +1 de alcance máximo por nível acima do alvo (só quem atira de longe)
  needsSight: boolean; // exige linha de visão até o alvo
  radius: number; // 0 = só a casa do alvo; 1 = a casa e as 4 vizinhas (a área nunca atinge quem usa)
  damage: [min: number, max: number]; // [0, 0] = não causa dano
  heal: [min: number, max: number]; // [0, 0] = não cura; cura mira aliado e não erra
  accuracy: number; // % base antes de distância, altura e cobertura
  push: number; // casas de empurrão, afastando do centro da habilidade
  delay: number; // CT a mais no custo do turno (habilidade forte atrasa o próximo turno)
  pushChance?: number; // % de vezes em que o empurrão acontece; sem o campo, sempre (só o estudo do FFT usa: ~50%)
}

type Spec = Pick<AbilityDef, 'id' | 'name' | 'en' | 'range' | 'accuracy'> & Partial<AbilityDef>;
const A = (a: Spec): AbilityDef => ({
  radius: 0, heal: [0, 0], damage: [0, 0], push: 0, delay: 0, heightRange: false, needsSight: false, ...a,
});

const LIST: AbilityDef[] = [
  // Guerreiro e corpo a corpo
  A({ id: 'strike', name: 'Golpe', en: 'Strike', range: [1, 1], damage: [6, 9], accuracy: 90 }),
  A({ id: 'heavy_strike', name: 'Golpe pesado', en: 'Heavy strike', range: [1, 1], damage: [11, 15], accuracy: 75, delay: 40 }),
  A({ id: 'shield_bash', name: 'Escudada', en: 'Shield bash', range: [1, 1], damage: [2, 3], accuracy: 95, push: 2, delay: 10 }),
  A({ id: 'spin', name: 'Giro', en: 'Spin', range: [0, 0], radius: 1, damage: [4, 6], accuracy: 85, delay: 20 }),
  // Arqueiro
  A({ id: 'shot', name: 'Tiro', en: 'Shot', range: [2, 6], heightRange: true, needsSight: true, damage: [5, 8], accuracy: 85 }),
  A({ id: 'aimed_shot', name: 'Tiro mirado', en: 'Aimed shot', range: [2, 6], heightRange: true, needsSight: true, damage: [9, 12], accuracy: 90, delay: 40 }),
  A({ id: 'knock_shot', name: 'Tiro de recuo', en: 'Knockback shot', range: [2, 4], heightRange: true, needsSight: true, damage: [3, 4], accuracy: 85, push: 1, delay: 10 }),
  A({ id: 'dagger', name: 'Adaga', en: 'Dagger', range: [1, 1], damage: [3, 4], accuracy: 90 }),
  // Mago
  A({ id: 'firebolt', name: 'Raio de fogo', en: 'Firebolt', range: [2, 5], heightRange: true, needsSight: true, damage: [6, 9], accuracy: 90 }),
  A({ id: 'blast', name: 'Explosão', en: 'Blast', range: [2, 5], heightRange: true, needsSight: true, radius: 1, damage: [5, 8], accuracy: 85, delay: 40 }),
  A({ id: 'gust', name: 'Rajada', en: 'Gust', range: [1, 4], needsSight: true, damage: [1, 2], accuracy: 85, push: 2, delay: 10 }),
  A({ id: 'heal', name: 'Cura', en: 'Heal', range: [1, 4], needsSight: true, heal: [7, 10], accuracy: 100, delay: 20 }),
  // Ladino
  A({ id: 'stab', name: 'Facada', en: 'Stab', range: [1, 1], damage: [5, 7], accuracy: 95 }),
  A({ id: 'throwing_knife', name: 'Faca arremessada', en: 'Throwing knife', range: [2, 4], heightRange: true, needsSight: true, damage: [4, 6], accuracy: 85 }),
  A({ id: 'trip', name: 'Rasteira', en: 'Trip', range: [1, 1], damage: [2, 3], accuracy: 90, push: 1, delay: 10 }),
  A({ id: 'deathblow', name: 'Golpe mortal', en: 'Deathblow', range: [1, 1], damage: [12, 16], accuracy: 70, delay: 50 }),
  // Bruto
  A({ id: 'cleave', name: 'Machadada', en: 'Cleave', range: [1, 1], damage: [10, 14], accuracy: 80, delay: 30 }),
  A({ id: 'slam', name: 'Pancada', en: 'Slam', range: [1, 1], damage: [4, 6], accuracy: 85, push: 2, delay: 20 }),
];

export const ABILITIES: Record<string, AbilityDef> = Object.fromEntries(LIST.map((a) => [a.id, a]));
