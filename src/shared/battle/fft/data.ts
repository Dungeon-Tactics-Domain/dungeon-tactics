// Final Fantasy Tactics (PS1, 1997) data used in the balance study. Source: Battle Mechanics Handbook v6.1
// (sections 7.4, 2.5, 3.3 and appendix B); link and what was left unconfirmed in docs/game-design/referencia-fft.md.
import type { WeaponKind } from './formulas.ts';

export interface ClassDef {
  hpm: number; // class multipliers
  mpm: number;
  spm: number;
  pam: number;
  mam: number;
  move: number;
  jump: number;
  cev: number; // class evasion, in %
}

// BMG 7.4: generic Squire (4A), Chemist (4B) and Ramza's Squire in chapter 1 (01)
export const CLASSES = {
  squire: { hpm: 100, mpm: 75, spm: 100, pam: 90, mam: 80, move: 4, jump: 3, cev: 5 },
  chemist: { hpm: 80, mpm: 75, spm: 100, pam: 75, mam: 80, move: 3, jump: 3, cev: 5 },
  ramza_squire: { hpm: 125, mpm: 105, spm: 107, pam: 111, mam: 102, move: 4, jump: 3, cev: 10 },
  // BMG 7.4: Knight (4C), Archer (4D), White Mage (4F, Priest) and Black Mage (50, Wizard)
  knight: { hpm: 120, mpm: 80, spm: 100, pam: 120, mam: 80, move: 3, jump: 3, cev: 10 },
  archer: { hpm: 100, mpm: 65, spm: 100, pam: 110, mam: 80, move: 3, jump: 3, cev: 10 },
  priest: { hpm: 80, mpm: 120, spm: 110, pam: 90, mam: 110, move: 3, jump: 3, cev: 5 },
  wizard: { hpm: 75, mpm: 120, spm: 100, pam: 60, mam: 150, move: 3, jump: 3, cev: 5 },
} satisfies Record<string, ClassDef>;

// BMG B.1: weapon power (WP) and evasion
export const WEAPONS = {
  dagger: { kind: 'knife', wp: 3, wev: 0 },
  broad_sword: { kind: 'sword', wp: 4, wev: 5 },
  long_sword: { kind: 'sword', wp: 5, wev: 10 },
  long_bow: { kind: 'longbow', wp: 4, wev: 0 }, // range 3 to 5 + [height difference / 2]
  oak_staff: { kind: 'staff', wp: 3, wev: 15 },
  rod: { kind: 'rod', wp: 3, wev: 20 },
} satisfies Record<string, { kind: WeaponKind; wp: number; wev: number }>;

// BMG 7.1: every recruit comes with Clothes (HP +5) and Leather Hat (HP +8)
export const STARTING_GEAR_HP = 13;

// BMG B.2: the Knight's level 1 armor, Leather Helmet (HP +10) and Leather Armor (HP +10), and the Escutcheon shield
// (physical evasion 10%, magical 3%). That each class uses exactly this is an assumption of the study.
export const KNIGHT_GEAR_HP = 20;
export const ESCUTCHEON = { physical: 10, magical: 3 };
// BMG 7.1: Brave and Faith of a random unit range from 45 to 74; the study uses 60 for everyone
export const BRAVE = 60;
export const FAITH = 60;

// BMG 3.3 (Basic Skill, Guts, White Magic, Black Magic), 2.2 (Charge), 2.5 (Item) and 3.6 (Battle Skill)
export const SKILLS = {
  dash: { range: 1, rolls: [1, 4], knockback: 50 }, // damage = PA * (1..4)
  throw_stone: { range: 4, rolls: [1, 2], knockback: 50 }, // damage = PA * (1..2), can be evaded
  potion: { range: 4, heal: 30 }, // range 4 with Throw Item, which every Chemist has
  accumulate: { pa: 1 }, // PA +1 on the user, 100%
  yell: { range: 3, speed: 1 }, // Speed +1 on the target, 100%
  wish: { range: 1 }, // heals RU{MaxHP * 2/5} and costs the user RU{MaxHP * 1/5}
  speed_break: { speed: -2 }, // hit (PA + 50)% before evasion
  power_break: { pa: -3 },
  charge: [
    [1, 4],
    [2, 5],
  ], // Charge +K: adds K to PA and Speed in the weapon formula; charge of 4 and 5 ticks (BMG 2.2 and A.2)
  fire: { range: 4, q: 14, mp: 6, ctr: 4 }, // damage [CFa/100 * TFa/100 * MA * 14], area of 2 (target and neighbors), charge of 4 ticks
  cure: { range: 4, q: 14, mp: 6, ctr: 4 }, // healing with the same formula and the same charge
} as const;
