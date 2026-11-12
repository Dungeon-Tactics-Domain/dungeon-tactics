// Dados do Final Fantasy Tactics (PS1, 1997) usados no estudo de balanceamento. Fonte: Battle Mechanics Handbook v6.1
// (seções 7.4, 2.5, 3.3 e apêndice B); link e o que ficou sem confirmar em docs/game-design/referencia-fft.md.
import type { WeaponKind } from './formulas.ts';

export interface ClassDef {
  hpm: number; // multiplicadores de classe
  mpm: number;
  spm: number;
  pam: number;
  mam: number;
  move: number;
  jump: number;
  cev: number; // evasão de classe, em %
}

// BMG 7.4: Escudeiro genérico (4A), Químico (4B) e o Escudeiro do Ramza no capítulo 1 (01)
export const CLASSES = {
  squire: { hpm: 100, mpm: 75, spm: 100, pam: 90, mam: 80, move: 4, jump: 3, cev: 5 },
  chemist: { hpm: 80, mpm: 75, spm: 100, pam: 75, mam: 80, move: 3, jump: 3, cev: 5 },
  ramza_squire: { hpm: 125, mpm: 105, spm: 107, pam: 111, mam: 102, move: 4, jump: 3, cev: 10 },
  // BMG 7.4: Cavaleiro (4C), Arqueiro (4D), Mago Branco (4F, Priest) e Mago Negro (50, Wizard)
  knight: { hpm: 120, mpm: 80, spm: 100, pam: 120, mam: 80, move: 3, jump: 3, cev: 10 },
  archer: { hpm: 100, mpm: 65, spm: 100, pam: 110, mam: 80, move: 3, jump: 3, cev: 10 },
  priest: { hpm: 80, mpm: 120, spm: 110, pam: 90, mam: 110, move: 3, jump: 3, cev: 5 },
  wizard: { hpm: 75, mpm: 120, spm: 100, pam: 60, mam: 150, move: 3, jump: 3, cev: 5 },
} satisfies Record<string, ClassDef>;

// BMG B.1: poder (WP) e evasão da arma
export const WEAPONS = {
  dagger: { kind: 'knife', wp: 3, wev: 0 },
  broad_sword: { kind: 'sword', wp: 4, wev: 5 },
  long_sword: { kind: 'sword', wp: 5, wev: 10 },
  long_bow: { kind: 'longbow', wp: 4, wev: 0 }, // alcance 3 a 5 + [diferença de altura / 2]
  oak_staff: { kind: 'staff', wp: 3, wev: 15 },
  rod: { kind: 'rod', wp: 3, wev: 20 },
} satisfies Record<string, { kind: WeaponKind; wp: number; wev: number }>;

// BMG 7.1: todo recruta vem com Clothes (HP +5) e Leather Hat (HP +8)
export const STARTING_GEAR_HP = 13;

// BMG B.2: armadura de nível 1 do Cavaleiro, Leather Helmet (HP +10) e Leather Armor (HP +10), e o escudo Escutcheon
// (evasão física 10%, mágica 3%). Que cada classe use exatamente isto é suposição do estudo.
export const KNIGHT_GEAR_HP = 20;
export const ESCUTCHEON = { physical: 10, magical: 3 };
// BMG 7.1: Brave e Fé de unidade sorteada vão de 45 a 74; o estudo usa 60 para todos
export const BRAVE = 60;
export const FAITH = 60;

// BMG 3.3 (Basic Skill, Guts, White Magic, Black Magic), 2.2 (Charge), 2.5 (Item) e 3.6 (Battle Skill)
export const SKILLS = {
  dash: { range: 1, rolls: [1, 4], knockback: 50 }, // dano = PA * (1..4)
  throw_stone: { range: 4, rolls: [1, 2], knockback: 50 }, // dano = PA * (1..2), pode ser evitado
  potion: { range: 4, heal: 30 }, // alcance 4 com Throw Item, que todo Químico tem
  accumulate: { pa: 1 }, // PA +1 em quem usa, 100%
  yell: { range: 3, speed: 1 }, // Speed +1 no alvo, 100%
  wish: { range: 1 }, // cura RU{MaxHP * 2/5} e custa RU{MaxHP * 1/5} a quem usa
  speed_break: { speed: -2 }, // acerto (PA + 50)% antes da evasão
  power_break: { pa: -3 },
  charge: [[1, 4], [2, 5]], // Charge +K: soma K ao PA e ao Speed na conta da arma; carga de 4 e 5 tiques (BMG 2.2 e A.2)
  fire: { range: 4, q: 14, mp: 6, ctr: 4 }, // dano [CFa/100 * TFa/100 * MA * 14], área de 2 (alvo e vizinhas), carga de 4 tiques
  cure: { range: 4, q: 14, mp: 6, ctr: 4 }, // cura com a mesma conta e a mesma carga
} as const;
