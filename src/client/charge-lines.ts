// Charge lines (Nov 15, Fernando): while a unit charges, a line stays drawn from it to what it is locked on, for every
// charging unit, enemies included; and while the charging unit picks where to walk, the line from that destination shows
// where the shot would stop and whom it would hit. Pure (no Three): both come from the rule that fires the charge
// (previewAbility from where the caster stands, turn-queue.ts), so the drawing never disagrees with the shot.
import { ABILITIES } from '../shared/battle/abilities.ts';
import type { Battle } from '../shared/battle/battle.ts';
import { previewAbility } from '../shared/battle/combat.ts';
import { type Grid, posKey, samePos, subOf } from '../shared/battle/grid.ts';
import { aimTile, unitAt } from '../shared/battle/pathing.ts';
import { chargeAim } from '../shared/battle/turn-queue.ts';
import type { BattleState, Charge, Lock, Pos, Team, UnitState } from '../shared/battle/types.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';
import { abilityName, t, unitName } from './i18n.ts';

export interface Square {
  pos: Pos; // corner cell
  size: number; // cells per side
}
export interface ChargeLine {
  team: Team; // the caster's side, for the line's colour
  from: Square; // the caster
  to: Square; // the followed unit, or the locked whole tile
  stop: Square | null; // where the shot stops short: the unit or the whole tile in the way
  hits: { unit: string; friendly: boolean }[]; // who it would hit; `friendly`: hurt on the caster's own side, at half
  ok: boolean; // false: out of range from there, it would fizzle
}

const square = (u: UnitState): Square => ({ pos: u.pos, size: UNIT_DEFS[u.def].size ?? 1 });

export function chargeLine(grid: Grid, state: BattleState, c: Charge): ChargeLine {
  const caster = state.units.find((u) => u.id === c.unit)!;
  const followed = c.follow ? state.units.find((u) => u.id === c.follow) : undefined;
  const aim = aimTile(grid, state, chargeAim(state, c));
  const p = previewAbility(grid, state, c.unit, c.ability, aim, true);
  const short = p.ok && !samePos(p.center, aim);
  const blocker = short ? unitAt(state, p.center) : undefined;
  return {
    team: caster.team,
    from: square(caster),
    to: followed ? square(followed) : { pos: aim, size: subOf(grid) },
    stop: !short ? null : blocker ? square(blocker) : { pos: p.center, size: subOf(grid) },
    hits: p.targets.map((x) => ({
      unit: x.unit,
      friendly: x.dmgMax > 0 && state.units.find((u) => u.id === x.unit)!.team === caster.team,
    })),
    ok: p.ok,
  };
}

export const chargeLines = (grid: Grid, state: BattleState): ChargeLine[] =>
  state.charges.filter((c) => state.units.some((u) => u.id === c.unit)).map((c) => chargeLine(grid, state, c));

// The acting unit's own charge as it would fire if it ended its walk on `at`; null without a charge
export function chargeFrom(b: Battle, at: Pos): ChargeLine | null {
  const c = b.state.charges.find((x) => x.unit === b.actor.id);
  if (!c) return null;
  const moved = { ...b.state, units: b.state.units.map((u) => (u.id === b.actor.id ? { ...u, pos: at } : u)) };
  return chargeLine(b.grid, moved, c);
}

// The "Execute?" note of a charge: when it goes off and the movement it leaves; on the lock step, what each lock does
export function chargeNote(b: Battle, s: { ability: string; target: Pos; lock?: Lock }): string {
  const ticks = ABILITIES[s.ability].charge;
  const on = unitAt(b.state, s.target);
  if (s.lock === 'unit' && on)
    return t(
      `Segue ${unitName(on.def)} aonde for; o tiro sai de onde você estiver quando disparar.`,
      `Follows ${unitName(on.def)} wherever it goes; the shot leaves from where you stand when it goes off.`,
    );
  if (s.lock === 'tile')
    return t(
      'Acerta quem estiver nesta casa quando disparar; o tiro sai de onde você estiver.',
      'Hits whoever stands on this tile when it goes off; the shot leaves from where you stand.',
    );
  const left = Math.max(0, UNIT_DEFS[b.actor.def].move - (b.state.turn.spent ?? 0));
  return t(
    `Sai em ${ticks} tiques. Começar gasta metade do movimento que sobra: ainda anda ${Math.floor(left / 2)}.`,
    `Goes off in ${ticks} ticks. Starting it costs half the movement left: you can still walk ${Math.floor(left / 2)}.`,
  );
}

// The move help's sentence about that shot, so the line's colours are never the only signal
export function chargeFromText(b: Battle, at: Pos): string {
  const line = b.reach().has(posKey(at)) ? chargeFrom(b, at) : null;
  if (!line) return '';
  const name = abilityName(b.state.charges.find((x) => x.unit === b.actor.id)!.ability);
  if (!line.ok)
    return t(` Daqui, ${name} fica fora de alcance e se perde.`, ` From here, ${name} is out of range and fizzles.`);
  const who = line.hits.map((h) => {
    const n = unitName(b.state.units.find((u) => u.id === h.unit)!.def);
    return h.friendly ? t(`${n} (aliado: metade do dano)`, `${n} (ally: half damage)`) : n;
  });
  if (who.length) return t(` Daqui, ${name} acerta ${who.join(', ')}.`, ` From here, ${name} hits ${who.join(', ')}.`);
  return line.stop
    ? t(
        ` Daqui, ${name} para no caminho e não acerta ninguém.`,
        ` From here, ${name} stops on the way and hits no one.`,
      )
    : t(` Daqui, ${name} não acerta ninguém.`, ` From here, ${name} hits no one.`);
}
