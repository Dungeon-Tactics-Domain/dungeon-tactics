// Final Fantasy Tactics (PS1, 1997) formulas, only for the balance study (Fernando's request, Nov 11).
// Source of all: Battle Mechanics Handbook v6.1, by Aerostar; the section is on each function and the link in
// docs/game-design/referencia-fft.md. Pure functions, no state: the game uses nothing from here outside the study scenario.

import type { Side } from '../grid.ts';
export { sideOf, type Side } from '../grid.ts'; // the side calculation lives in grid.ts since the game uses direction (Nov 13)

// [x]: the guide always discards the remainder of the division (BMG 1.2)
const trunc = Math.trunc;
// RU{x / y}: division rounded up (BMG 1.2)
const roundUp = (x: number, y: number) => trunc((x + y - 1) / y);

// Raw values at level 1 (BMG 7.1). HP and MP are rolled within the range when the unit spawns.
export const RAW = {
  male: { sp: 98304, pa: 81920, ma: 65536, hp: [491520, 524287], mp: [229376, 245759] },
  female: { sp: 98304, pa: 65536, ma: 81920, hp: [458752, 491519], mp: [245760, 262143] },
} as const;

// stat = [raw * class multiplier / 1,638,400], minimum 1 (BMG 7.1)
export const stat = (raw: number, multiplier: number) => Math.max(1, trunc((raw * multiplier) / 1638400));

export interface Attacker {
  pa: number;
  ma: number;
  sp: number;
  brave: number;
}
export type WeaponKind = 'fist' | 'sword' | 'knife' | 'axe' | 'staff' | 'rod' | 'spear' | 'crossbow' | 'longbow' | 'knight_sword' | 'katana';

// Damage of the ATTACK command by weapon type, as [minimum, maximum] (BMG 2.1). Only axe, flail and bag roll.
export function weaponDamage(kind: WeaponKind, u: Attacker, wp: number): [number, number] {
  const fixed = (xa: number): [number, number] => [xa * wp, xa * wp];
  switch (kind) {
    case 'fist': { const d = trunc((u.pa * u.brave) / 100) * u.pa; return [d, d]; }
    case 'sword': case 'rod': case 'spear': case 'crossbow': return fixed(u.pa);
    case 'knife': case 'longbow': return fixed(trunc((u.pa + u.sp) / 2));
    case 'knight_sword': case 'katana': return fixed(trunc((u.pa * u.brave) / 100));
    case 'staff': return fixed(u.ma);
    case 'axe': return [wp, u.pa * wp];
  }
}

// Critical (~5% of ATTACKs): XA becomes XA + (1..XA) - 1, before multiplying by the weapon (BMG 2.1 and 3.2, MOD 2)
export const CRIT_CHANCE = 5;
export const critXa = (xa: number, roll: number) => xa + roll - 1;

export interface Evasion {
  c: number; // class
  s: number; // shield
  a: number; // accessory (mantle)
  w: number; // weapon, only with the Weapon Guard reaction
}

// Physical attack hit chance in % (BMG 1.4): from the front all four evasions count, from the side the class one drops out, from behind only the accessory
export function hitPercent(base: number, ev: Evasion, side: Side): number {
  if (side === 'back') return trunc((base * (100 - ev.a)) / 100);
  const rest = (100 - ev.s) * (100 - ev.a) * (100 - ev.w);
  return side === 'side' ? trunc((base * rest) / 1e6) : trunc((base * (100 - ev.c) * rest) / 1e8);
}


// Spell hit chance in % (BMG 1.4): only the magical shield and accessory count, from any side
export const magicHitPercent = (base: number, shield: number, accessory: number) => trunc((base * (100 - shield) * (100 - accessory)) / 10000);

// Damage or healing spell by faith (BMG 3.4): [(MA * caster's faith * target's faith * Q) / 10000]
export const faithMagic = (ma: number, casterFaith: number, targetFaith: number, q: number) => trunc((ma * casterFaith * targetFaith * q) / 10000);

// Wish (BMG 3.3): heals the target RU{user's MaxHP * 2/5} and takes RU{MaxHP * 1/5} from the user
export const wish = (casterMaxHp: number): [heal: number, cost: number] => [roundUp(casterMaxHp * 2, 5), roundUp(casterMaxHp, 5)];

// The Knight's stat breaks (BMG 3.6): base hit = PA + 50, before evasion
export const statBreakBase = (pa: number) => pa + 50;

// CT at the end of the turn (BMG 1.1): since Nov 12 it is the rule on every map and lives in the turn queue
export { turnCt } from '../turn-queue.ts';

// Fall from a push: it only hurts what exceeds the Jump, RU{(fall - Jump) * MaxHP / 10} (BMG 6.5)
export const fallDamage = (fall: number, jump: number, maxHp: number) => (fall > jump ? roundUp((fall - jump) * maxHp, 10) : 0);

// Longbow: max range 5 + [(shooter height - target height) / 2] (BMG 6.9)
export const longbowMaxRange = (shooterH: number, targetH: number) => 5 + trunc((shooterH - targetH) / 2);
