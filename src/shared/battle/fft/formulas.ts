// Fórmulas do Final Fantasy Tactics (PS1, 1997), só para o estudo de balanceamento (pedido do Fernando, 11/11).
// Fonte de todas: Battle Mechanics Handbook v6.1, de Aerostar; a seção vai em cada função e o link em
// docs/game-design/referencia-fft.md. Funções puras, sem estado: o jogo não usa nada daqui fora do cenário de estudo.

// [x]: o guia sempre descarta o resto da divisão (BMG 1.2)
const trunc = Math.trunc;
// RU{x / y}: divisão arredondada para cima (BMG 1.2)
const roundUp = (x: number, y: number) => trunc((x + y - 1) / y);

// Valores brutos no nível 1 (BMG 7.1). HP e MP são sorteados dentro da faixa quando a unidade nasce.
export const RAW = {
  male: { sp: 98304, pa: 81920, ma: 65536, hp: [491520, 524287], mp: [229376, 245759] },
  female: { sp: 98304, pa: 65536, ma: 81920, hp: [458752, 491519], mp: [245760, 262143] },
} as const;

// stat = [bruto * multiplicador da classe / 1 638 400], mínimo 1 (BMG 7.1)
export const stat = (raw: number, multiplier: number) => Math.max(1, trunc((raw * multiplier) / 1638400));

export interface Attacker {
  pa: number;
  ma: number;
  sp: number;
  brave: number;
}
export type WeaponKind = 'fist' | 'sword' | 'knife' | 'axe' | 'staff' | 'rod' | 'spear' | 'crossbow' | 'longbow' | 'knight_sword' | 'katana';

// Dano do comando ATTACK por tipo de arma, como [mínimo, máximo] (BMG 2.1). Só machado, mangual e saco sorteiam.
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

// Crítico (~5% dos ATTACKs): XA vira XA + (1..XA) - 1, antes de multiplicar pela arma (BMG 2.1 e 3.2, MOD 2)
export const CRIT_CHANCE = 5;
export const critXa = (xa: number, roll: number) => xa + roll - 1;

export interface Evasion {
  c: number; // classe
  s: number; // escudo
  a: number; // acessório (manto)
  w: number; // arma, só com a reação Weapon Guard
}
export type Side = 'front' | 'side' | 'back';

// Acerto de ataque físico em % (BMG 1.4): de frente contam as quatro evasões, de lado sai a de classe, pelas costas só o acessório
export function hitPercent(base: number, ev: Evasion, side: Side): number {
  if (side === 'back') return trunc((base * (100 - ev.a)) / 100);
  const rest = (100 - ev.s) * (100 - ev.a) * (100 - ev.w);
  return side === 'side' ? trunc((base * rest) / 1e6) : trunc((base * (100 - ev.c) * rest) / 1e8);
}

// De onde o ataque vem (BMG 1.4, diagrama): vale a maior entre as distâncias à frente, de lado e atrás do alvo; no empate
// ganha a mais à frente (frente sobre lado, lado sobre costas). A altura das casas não conta.
export function sideOf(target: { x: number; y: number }, facing: { x: number; y: number }, attacker: { x: number; y: number }): Side {
  const dx = attacker.x - target.x, dy = attacker.y - target.y;
  const ahead = dx * facing.x + dy * facing.y;
  const lateral = Math.abs(dx * facing.y - dy * facing.x);
  if (ahead > 0 && ahead >= lateral) return 'front';
  return ahead < 0 && -ahead > lateral ? 'back' : 'side';
}

// Acerto de magia em % (BMG 1.4): só escudo e acessório mágicos contam, de qualquer lado
export const magicHitPercent = (base: number, shield: number, accessory: number) => trunc((base * (100 - shield) * (100 - accessory)) / 10000);

// Magia de dano ou cura pela fé (BMG 3.4): [(MA * fé de quem lança * fé do alvo * Q) / 10000]
export const faithMagic = (ma: number, casterFaith: number, targetFaith: number, q: number) => trunc((ma * casterFaith * targetFaith * q) / 10000);

// Desejo (BMG 3.3, Wish): cura RU{MaxHP de quem usa * 2/5} no alvo e tira RU{MaxHP * 1/5} de quem usa
export const wish = (casterMaxHp: number): [heal: number, cost: number] => [roundUp(casterMaxHp * 2, 5), roundUp(casterMaxHp, 5)];

// Quebras de atributo do Cavaleiro (BMG 3.6): acerto base = PA + 50, antes da evasão
export const statBreakBase = (pa: number) => pa + 50;

// CT ao fim do turno (BMG 1.1): desde 12/11 é a regra de todos os mapas e mora na fila de turnos
export { turnCt } from '../turn-queue.ts';

// Queda por empurrão: só machuca o que passa do Jump, RU{(queda - Jump) * MaxHP / 10} (BMG 6.5)
export const fallDamage = (fall: number, jump: number, maxHp: number) => (fall > jump ? roundUp((fall - jump) * maxHp, 10) : 0);

// Arco longo: alcance máximo 5 + [(altura do atirador - altura do alvo) / 2] (BMG 6.9)
export const longbowMaxRange = (shooterH: number, targetH: number) => 5 + trunc((shooterH - targetH) / 2);
