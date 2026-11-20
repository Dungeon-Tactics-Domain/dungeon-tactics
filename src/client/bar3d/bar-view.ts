// Pure side of the 3D combat bar (bar3d.ts): what the acting unit's sheet, the strike preview plate and the target's
// sheet show, from the same units and the same forecast as the HTML panels (hud-pieces.ts unitPanel and strikes). No DOM
// or Three here; tested in tests/bar3d.test.ts.
import { COMBAT, poolOf } from '../../shared/battle/combat.ts';
import { TURN_THRESHOLD } from '../../shared/battle/turn-queue.ts';
import type { BattleState, UnitState } from '../../shared/battle/types.ts';
import { RESOURCES, type Resource, UNIT_DEFS } from '../../shared/battle/units.ts';
import { range } from '../battle-text.ts';
import { classOf } from '../dev-roster.ts';
import type { Forecast } from '../forecast.ts';
import { abilityName, t, unitName } from '../i18n.ts';
import { unitStats } from '../turn-list.ts';

export interface Gauge {
  label: string;
  value: number;
  max: number;
}
export interface SheetView {
  unit: UnitState;
  enemy: boolean;
  name: string;
  tag: string; // over the portrait's foot: the side, for an enemy only (the reference's "Enemy")
  hp: Gauge;
  // of the full life bar: what stays for sure and up to where an aimed strike (or a heal, `gain`) changes it; `sure`: where
  // the part it changes for certain (the least damage or heal, solid) meets the part it may change (blinking; Nov 19)
  change: { left: number; sure: number; upTo: number; gain: boolean };
  pools: Gauge[]; // mana and stamina, the ones its sheet has: the first beside the life, the second in the box under it
  ct: Gauge | null; // null for what never takes a turn
  // what the turn list's lines say after each number (turn-list.ts unitStats; Fernando, Nov 17): "+4", the life back at
  // each of its turns (empty without a piece that gives it), and "+8", the CT gained each tick (empty with no CT)
  hpRegen: string;
  ctGain: string;
  line: string; // the strip under the bars: the class (unless it is the name), then the aimed strike's small line or a charge in progress
}
export interface PlateView {
  chance: string; // "⊕ 85%"; empty for a support with no number
  amount: string; // the big number: "36", "9 ≈ 12", "+7 ≈ 10", or the ability's name for a support
  big: boolean; // `amount` is a number
  label: string; // what the number is
  name: string; // the ability, and how many more targets it reaches
  warn: boolean; // it strikes someone of the user's own side
}
export interface BarView {
  sheet: SheetView | null;
  plate: PlateView | null;
  target: SheetView | null;
}

const POOL_LABEL: Record<Resource, string> = { mana: 'MP', stamina: 'ST' };
const frac = (v: number, max: number) => Math.max(0, Math.min(1, v / max));

export function sheetView(state: BattleState, u: UnitState, f?: Forecast, ability?: string): SheetView {
  const def = UNIT_DEFS[u.def];
  const pools: Gauge[] = RESOURCES.filter((k) => def.vars?.[k]).map((k) => ({
    label: POOL_LABEL[k],
    value: poolOf(u, k),
    max: def.vars![k],
  }));
  // the study's own MP counter, as the HTML panel shows it
  if (u.vars?.mp !== undefined) pools.push({ label: 'MP', value: u.vars.mp, max: def.vars?.mp ?? u.vars.mp });
  const charge = state.charges.find((c) => c.unit === u.id);
  // the class leads the strip, as on the reference (Fernando, Nov 16), unless it is the name above it (a plain unit, a
  // hero with no name of its own): "Ladino" twice read as a mistake (Nov 18 review)
  const name = unitName(u.def);
  const cls = unitName(classOf(u.def) ?? u.def);
  const now = frac(u.hp, def.hp);
  const struck = f && !f.support && (f.heal || f.dmg);
  const st = unitStats(u);
  // the least and the most life the strike (or heal) changes, push and all
  const least = struck ? Math.abs(f.after[f.heal ? 0 : 1] - u.hp) : 0,
    most = struck ? Math.abs(f.after[f.heal ? 1 : 0] - u.hp) : 0,
    sign = f?.heal ? '+' : '−';
  return {
    hpRegen: st.hpRegen ? `+${st.hpRegen}` : '',
    ctGain: def.speed > 0 ? `+${st.ctGain}` : '',
    unit: u,
    enemy: u.team === 'enemy',
    name,
    tag: u.team === 'enemy' ? t('Inimigo', 'Enemy') : '',
    hp: { label: t('Vida', 'HP'), value: Math.max(0, u.hp), max: def.hp },
    change: !struck
      ? { left: now, sure: now, upTo: now, gain: false }
      : f.heal
        ? { left: now, sure: frac(f.after[0], def.hp), upTo: frac(f.after[1], def.hp), gain: true }
        : { left: frac(f.after[0], def.hp), sure: frac(f.after[1], def.hp), upTo: now, gain: false },
    pools: pools.slice(0, 2),
    ct: def.speed > 0 ? { label: 'CT', value: Math.min(u.ct, TURN_THRESHOLD), max: TURN_THRESHOLD } : null,
    line: [
      cls !== name && cls,
      // the strike's one label (Fernando, Nov 19 prototype: every option at once, he says which to drop)
      struck && ability
        ? `${sign}${least}${most > least ? ` ≈ ${sign}${most}` : ''}`
        : charge
          ? t(
              `Carregando ${abilityName(charge.ability)} (${charge.ticks} tiques)`,
              `Charging ${abilityName(charge.ability)} (${charge.ticks} ticks)`,
            )
          : '',
    ]
      .filter(Boolean)
      .join(' · '),
  };
}

// `more`: how many targets the strike reaches besides this one
// the hit bonus a strike from the side or behind gets (combat.ts), shown by the chance it explains (Fernando, Nov 19)
const flank = (f: Forecast) =>
  f.side === 'back' ? `↶+${COMBAT.BACK_BONUS}` : f.side === 'side' ? `⇥+${COMBAT.SIDE_BONUS}` : '';
const flankLine = (f: Forecast) =>
  f.side === 'back'
    ? t(`↶ pelas costas +${COMBAT.BACK_BONUS}%`, `↶ from behind +${COMBAT.BACK_BONUS}%`)
    : f.side === 'side'
      ? t(`⇥ de lado +${COMBAT.SIDE_BONUS}%`, `⇥ from the side +${COMBAT.SIDE_BONUS}%`)
      : '';

export function plateView(f: Forecast, ability: string, more: number): PlateView {
  // "25 ≈ 40": somewhere between the two, not a fixed span (Fernando, Nov 20: the approximately sign for the dash)
  const about = (r: [number, number]) => range(r).replace('–', ' ≈ ');
  const amount = f.heal ? `+${about(f.heal)}` : f.dmg ? about(f.dmg) : '';
  const others = more ? ` · +${more} ${t(more === 1 ? 'alvo' : 'alvos', more === 1 ? 'target' : 'targets')}` : '';
  const hits = amount && !f.heal;
  return {
    // the flank beside the chance and on a line of its own, push and ALLY by the label: every option of Fernando's
    // Nov 19 grill at once, he says which to drop (the strip under the target's bars left)
    chance: amount ? [`⊕ ${f.chance}%`, hits && flank(f)].filter(Boolean).join(' ') : '',
    amount: amount || abilityName(ability),
    big: !!amount,
    label:
      (f.heal ? t('Cura', 'Heal') : f.dmg ? t('Dano', 'Damage') : t('Apoio', 'Support')) +
      (f.push && hits ? ` · ${t(`empurrão +${f.push}`, `push +${f.push}`)}${f.spikes ? '!' : ''}` : '') +
      (f.ally ? ` · ${t('ALIADO!', 'ALLY!')}` : ''),
    name: [(amount ? abilityName(ability) : '') + others, hits && flankLine(f)].filter(Boolean).join(' · '),
    warn: f.ally,
  };
}

// What the HUD shows at the bottom (hud.ts render): `me` acts; `fs` is the aimed strike on each target, the one under
// the cursor first; without a strike, `other` is the unit under the cursor
export function barView(
  state: BattleState,
  me: UnitState | undefined,
  other: UnitState | undefined,
  fs: Forecast[],
  ability: string | null,
): BarView {
  const main = ability ? fs[0] : undefined;
  return {
    sheet: me ? sheetView(state, me) : null,
    plate: main ? plateView(main, ability!, fs.length - 1) : null,
    target: main ? sheetView(state, main.unit, main, ability!) : other ? sheetView(state, other) : null,
  };
}
