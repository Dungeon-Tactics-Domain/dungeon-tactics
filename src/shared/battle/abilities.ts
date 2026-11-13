// Habilidades são dados com stats gerais (alcance, dano, empurrão, atraso, área); nenhuma tem regra própria contra outra
// (decisão de 21/10 herdada do Warlock). Números iniciais de 25/10: a decidir jogando e simulando. Dano e cura x1,75 em
// 13/11 (pedido do Fernando: "danos muito baixos deixando a batalha lenta"): um golpe comum tirava ~17% da vida (6 golpes
// para derrubar), no FFT tira ~37% (estudo de Gariland); agora ~30%
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
  // Tiques de carga antes de sair (ação lenta do FFT, BMG 1.1); 0 = sai na hora. Decisão do Fernando de 12/11 ("Como no
  // FFT"): golpe físico sai na hora; carregam só as magias (tiques do Fogo e da Cura, 4, BMG 3.3) e o Tiro mirado, no papel
  // da Carga do Arqueiro (Carga +1, 4 tiques, BMG 2.2). O "atraso" de antes não existe na regra de turno do FFT.
  charge: number;
  panel?: true; // a carga mira a casa e erra se o alvo sair dela (como a Carga do Arqueiro, BMG 2.2); sem isto, segue a unidade
  magic?: true; // mágica: não ganha o +50% contra quem está carregando (o bônus é de ataque físico, BMG 6, estado Charging)
  ally?: true; // mira aliado (ou quem usa, se o alcance começa em 0) e não sorteia acerto; o efeito vem de Rules.after. Só o estudo usa
  cost?: [counter: string, amount: number]; // gasta de UnitState.vars a cada uso; sem saldo, não dá para usar. Só o estudo usa
  pushChance?: number; // % de vezes em que o empurrão acontece; sem o campo, sempre (só o estudo do FFT usa: ~50%)
}

type Spec = Pick<AbilityDef, 'id' | 'name' | 'en' | 'range' | 'accuracy'> & Partial<AbilityDef>;
const A = (a: Spec): AbilityDef => ({
  radius: 0, heal: [0, 0], damage: [0, 0], push: 0, charge: 0, heightRange: false, needsSight: false, ...a,
});

const LIST: AbilityDef[] = [
  // Guerreiro e corpo a corpo
  A({ id: 'strike', name: 'Golpe', en: 'Strike', range: [1, 1], damage: [10, 16], accuracy: 90 }),
  A({ id: 'heavy_strike', name: 'Golpe pesado', en: 'Heavy strike', range: [1, 1], damage: [19, 26], accuracy: 75 }),
  A({ id: 'shield_bash', name: 'Escudada', en: 'Shield bash', range: [1, 1], damage: [4, 5], accuracy: 95, push: 2 }),
  A({ id: 'spin', name: 'Giro', en: 'Spin', range: [0, 0], radius: 1, damage: [7, 10], accuracy: 85 }),
  // Arqueiro
  A({ id: 'shot', name: 'Tiro', en: 'Shot', range: [2, 6], heightRange: true, needsSight: true, damage: [9, 14], accuracy: 85 }),
  A({ id: 'aimed_shot', name: 'Tiro mirado', en: 'Aimed shot', range: [2, 6], heightRange: true, needsSight: true, damage: [16, 21], accuracy: 90, charge: 4, panel: true }), // Carga +1
  A({ id: 'knock_shot', name: 'Tiro de recuo', en: 'Knockback shot', range: [2, 4], heightRange: true, needsSight: true, damage: [5, 7], accuracy: 85, push: 1 }),
  A({ id: 'dagger', name: 'Adaga', en: 'Dagger', range: [1, 1], damage: [5, 7], accuracy: 90 }),
  // Mago
  A({ id: 'firebolt', name: 'Raio de fogo', en: 'Firebolt', range: [2, 5], heightRange: true, needsSight: true, damage: [10, 16], accuracy: 90, magic: true }),
  A({ id: 'blast', name: 'Explosão', en: 'Blast', range: [2, 5], heightRange: true, needsSight: true, radius: 1, damage: [9, 14], accuracy: 85, charge: 4, magic: true }), // como o Fogo
  A({ id: 'gust', name: 'Rajada', en: 'Gust', range: [1, 4], needsSight: true, damage: [2, 4], accuracy: 85, push: 2, charge: 4, magic: true }), // magia de dano: como o Fogo
  A({ id: 'heal', name: 'Cura', en: 'Heal', range: [1, 4], needsSight: true, heal: [12, 18], accuracy: 100, charge: 4, magic: true }), // como a Cura
  // Ladino
  A({ id: 'stab', name: 'Facada', en: 'Stab', range: [1, 1], damage: [9, 12], accuracy: 95 }),
  A({ id: 'throwing_knife', name: 'Faca arremessada', en: 'Throwing knife', range: [2, 4], heightRange: true, needsSight: true, damage: [7, 10], accuracy: 85 }),
  A({ id: 'trip', name: 'Rasteira', en: 'Trip', range: [1, 1], damage: [4, 5], accuracy: 90, push: 1 }),
  A({ id: 'deathblow', name: 'Golpe mortal', en: 'Deathblow', range: [1, 1], damage: [21, 28], accuracy: 70 }),
  // Bruto
  // Onda sombria (12/11, magia de chefe do Vesper na fase final da campanha): área de raio 2 e carga longa (6 tiques),
  // para os heróis verem a área marcada e terem tempo de sair dela; números iniciais, medidos na fase 5
  A({ id: 'shadow_wave', name: 'Onda sombria', en: 'Shadow wave', range: [2, 5], heightRange: true, needsSight: true, radius: 2, damage: [10, 16], accuracy: 85, charge: 6, magic: true }),
  A({ id: 'cleave', name: 'Machadada', en: 'Cleave', range: [1, 1], damage: [18, 24], accuracy: 80 }),
  A({ id: 'slam', name: 'Pancada', en: 'Slam', range: [1, 1], damage: [7, 10], accuracy: 85, push: 2 }),
];

export const ABILITIES: Record<string, AbilityDef> = Object.fromEntries(LIST.map((a) => [a.id, a]));
