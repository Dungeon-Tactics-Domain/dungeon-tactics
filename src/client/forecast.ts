// Strike preview numbers: what an ability does to each target (hit, damage or heal, push, life after) and its texts.
// Pure for the test; the strips in hud-pieces.ts and the "Execute?" window draw them.
import { ABILITIES } from '../shared/battle/abilities.ts';
import type { Battle } from '../shared/battle/battle.ts';
import { type Preview, simulatePush } from '../shared/battle/combat.ts';
import type { UnitState } from '../shared/battle/types.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';
import { abilityDetail, range } from './battle-text.ts';
import { t, unitName } from './i18n.ts';

// Preview of a strike on each target (the one in "Execute?" and the one in the target panel when aiming): same calculation in both places.
export interface Forecast {
  unit: UnitState;
  chance: number; // hit chance % (heal and support do not miss: 100)
  dmg: [number, number] | null;
  heal: [number, number] | null;
  push: number; // extra damage from the push (collision, fall, spikes)
  spikes: boolean;
  after: [number, number]; // life after, lowest and highest
  ally: boolean; // strike that hits someone on the same side as the user
  support: boolean; // support without heal: only the effect
  side: 'front' | 'side' | 'back'; // where the strike hits from (target's direction, Nov 13); "from behind" hits more
}
export function forecast(b: Battle, ability: string, p: Preview): Forecast[] {
  const a = ABILITIES[ability];
  return p.targets.map((tg) => {
    const u = b.state.units.find((x) => x.id === tg.unit)!;
    const max = UNIT_DEFS[u.def].hp;
    const heal: [number, number] | null = tg.healMax ? [tg.healMin, tg.healMax] : null;
    const support = !!a.ally && !heal;
    // push: the extra damage from collision, fall and spikes, to see the combo before confirming (night of Nov 12)
    const shove = a.push && !heal && !support ? simulatePush(b.grid, b.state, u, p.center, b.actor.pos, a.push) : null;
    const push = shove?.dmg ?? 0;
    // the push comes with every hit (without `pushChance`, which only the FFT study uses): it goes into the life after
    const sure = a.pushChance === undefined ? push : 0;
    const after: [number, number] = heal
      ? [Math.min(max, u.hp + heal[0]), Math.min(max, u.hp + heal[1])]
      : support
        ? [u.hp, u.hp]
        : [Math.max(0, u.hp - tg.dmgMax - sure), Math.max(0, u.hp - tg.dmgMin - sure)];
    return {
      unit: u,
      chance: tg.chance,
      dmg: heal || support ? null : [tg.dmgMin, tg.dmgMax],
      heal,
      push,
      spikes: !!shove?.events.some((e) => e.k === 'spike'),
      after,
      ally: !heal && !support && u.team === b.actor.team,
      support,
      side: heal || support ? 'front' : tg.side,
    };
  });
}
const pushText = (f: Forecast) =>
  t(`empurrão +${f.push}${f.spikes ? ' (espinhos!)' : ''}`, `push +${f.push}${f.spikes ? ' (spikes!)' : ''}`);
// "damage 9–12 · push +3", "hit 85% · damage 9–12 · push +3" or "heal 7–10"; and "life 25 → 10–13"
const dmgText = (f: Forecast) =>
  t(`dano ${range(f.dmg!)}`, `damage ${range(f.dmg!)}`) + (f.push ? ` · ${pushText(f)}` : '');
// a strike from the side or behind, spells too since Nov 15, says where the hit bonus comes from (combat.ts SIDE_BONUS/BACK_BONUS)
const fromText = (f: Forecast) =>
  f.side === 'back'
    ? t(' (pelas costas)', ' (from behind)')
    : f.side === 'side'
      ? t(' (de lado)', ' (from the side)')
      : '';
export const forecastText = (f: Forecast) =>
  f.heal
    ? t(`cura ${range(f.heal)}`, `heals ${range(f.heal)}`)
    : `${t(`acerto ${f.chance}%`, `hit ${f.chance}%`)}${fromText(f)} · ${dmgText(f)}`;
export const hpAfterText = (f: Forecast) => `${t('vida', 'HP')} ${f.unit.hp} → ${range(f.after)}`;

// small line of the strip: who, where the strike comes from, push and the life after. Pure for the test
export function strikeInfo(f: Forecast, ability: string): string[] {
  const out = [unitName(f.unit.def)];
  if (f.support) return [...out, abilityDetail(ability)];
  // ↶ and ⇥: the direction advantage (combat.ts SIDE_BONUS/BACK_BONUS), with the word alongside (never just the icon)
  if (f.side === 'back') out.push(t('↶ pelas costas', '↶ from behind'));
  else if (f.side === 'side') out.push(t('⇥ de lado', '⇥ from the side'));
  if (f.push) out.push(pushText(f));
  out.push(hpAfterText(f));
  if (f.ally) out.push(t('ALIADO!', 'ALLY!'));
  return out;
}
