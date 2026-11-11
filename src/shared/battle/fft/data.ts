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
} satisfies Record<string, ClassDef>;

// BMG B.1: poder (WP) e evasão da arma
export const WEAPONS = {
  dagger: { kind: 'knife', wp: 3, wev: 0 },
  broad_sword: { kind: 'sword', wp: 4, wev: 5 },
  long_sword: { kind: 'sword', wp: 5, wev: 10 },
} satisfies Record<string, { kind: WeaponKind; wp: number; wev: number }>;

// BMG 7.1: todo recruta vem com Clothes (HP +5) e Leather Hat (HP +8)
export const STARTING_GEAR_HP = 13;

// BMG 3.3 (Basic Skill) e 2.5 (Item)
export const SKILLS = {
  dash: { range: 1, rolls: [1, 4], knockback: 50 }, // dano = PA * (1..4)
  throw_stone: { range: 4, rolls: [1, 2], knockback: 50 }, // dano = PA * (1..2), pode ser evitado
  potion: { range: 4, heal: 30 }, // alcance 4 com Throw Item, que todo Químico tem
} as const;
