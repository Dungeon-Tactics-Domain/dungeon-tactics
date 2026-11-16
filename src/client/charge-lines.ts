// Charge lines (Nov 15, Fernando): while a unit charges, a line stays drawn from it to what it is locked on, for every
// charging unit, enemies included; and while the charging unit picks where to walk, the line from that destination shows
// where the shot would stop and whom it would hit. Pure (no Three): both come from the rule that fires the charge
// (previewAbility from where the caster stands, turn-queue.ts), so the drawing never disagrees with the shot.
import { ABILITIES } from '../shared/battle/abilities.ts';
import type { Battle } from '../shared/battle/battle.ts';
import {
  basicOf,
  COMBAT,
  canCounter,
  inContact,
  isRanged,
  type Preview,
  pendingCounters,
  previewAbility,
} from '../shared/battle/combat.ts';
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

// A shot as its rule's preview lands it: from the caster to `to`, stopping where the preview's centre falls short of the aim
function lineOf(grid: Grid, state: BattleState, casterId: string, p: Preview, aim: Pos, to: Square): ChargeLine {
  const caster = state.units.find((u) => u.id === casterId)!;
  const short = p.ok && !samePos(p.center, aimTile(grid, state, aim));
  const blocker = short ? unitAt(state, p.center) : undefined;
  return {
    team: caster.team,
    from: square(caster),
    to,
    stop: !short ? null : blocker ? square(blocker) : { pos: p.center, size: subOf(grid) },
    hits: p.targets.map((x) => ({
      unit: x.unit,
      friendly: x.dmgMax > 0 && state.units.find((u) => u.id === x.unit)!.team === caster.team,
    })),
    ok: p.ok,
  };
}

export function chargeLine(grid: Grid, state: BattleState, c: Charge): ChargeLine {
  const followed = c.follow ? state.units.find((u) => u.id === c.follow) : undefined;
  const aim = aimTile(grid, state, chargeAim(state, c));
  const p = previewAbility(grid, state, c.unit, c.ability, aim, true);
  return lineOf(grid, state, c.unit, p, aim, followed ? square(followed) : { pos: aim, size: subOf(grid) });
}

// Counters on screen (Nov 15, Fernando): a ranged one is the shot's line from whoever strikes back to the attacker, a melee
// one a mark on whoever strikes back, pointing at the attacker
export interface Counters {
  lines: ChargeLine[];
  melee: { from: Square; to: Square }[];
}

// A counter from `u` that finds the actor at `at` (where it stands, or the stop for a shooter it leaves in contact): a ranged
// basic attack as its shot's line, traced with the actor there, a melee one as the mark
function counterOf(b: Battle, out: Counters, u: UnitState, p: Preview, at: Pos) {
  const me = b.actor;
  const there = { ...b.state, units: b.state.units.map((x) => (x.id === me.id ? { ...x, pos: at } : x)) };
  if (isRanged(basicOf(u.def))) out.lines.push(lineOf(b.grid, there, u.id, p, at, { pos: at, size: square(me).size }));
  else out.melee.push({ from: square(u), to: square(me) });
}

// Choosing where to walk: the counters that destination would draw, from the rule's own reading (pendingCounters)
export function countersFrom(b: Battle, at: Pos): Counters {
  const out: Counters = { lines: [], melee: [] };
  for (const c of pendingCounters(b.grid, b.state, b.actor.id, at))
    counterOf(b, out, b.state.units.find((u) => u.id === c.unit)!, c.preview, c.at);
  return out;
}

// What the counters a destination draws would take from the actor, at half like the rule (null: none there, or every shot
// caught by someone else first, which read as "−0")
export function counterDamage(b: Battle, at: Pos): [number, number] | null {
  const pending = pendingCounters(b.grid, b.state, b.actor.id, at);
  const half = (d: number) => (d > 0 ? Math.max(1, Math.floor(d * COMBAT.COUNTER)) : 0);
  const mine = pending.flatMap((c) => c.preview.targets.filter((x) => x.unit === b.actor.id));
  if (!mine.length) return null;
  return [mine.reduce((s, x) => s + half(x.dmgMin), 0), mine.reduce((s, x) => s + half(x.dmgMax), 0)];
}

// Aiming: who would be owed a counter by this strike: whoever could strike the actor where it stands now (walking out of
// its reach this turn draws it), and a shooter it stands too close to (walking out of that contact draws its shot), as the
// mark over its head
export function countersOwed(b: Battle, ability: string, p: Preview): Counters {
  const out: Counters = { lines: [], melee: [] };
  for (const t of p.targets) {
    const u = b.state.units.find((x) => x.id === t.unit)!;
    if (!canCounter(b.actor, ability, u)) continue;
    const back = previewAbility(b.grid, b.state, u.id, basicOf(u.def), b.actor.pos, true);
    if (back.ok) counterOf(b, out, u, back, b.actor.pos);
    else if (inContact(b.grid, b.state, u, b.actor.pos)) out.melee.push({ from: square(u), to: square(b.actor) });
  }
  return out;
}

const whose = (b: Battle, c: Counters) =>
  [...c.lines.map((l) => l.from), ...c.melee.map((m) => m.from)].map((s) => unitName(unitAt(b.state, s.pos)!.def));

// The move help's sentence about the counters a destination draws
export function counterFromText(b: Battle, at: Pos): string {
  if (!b.reach().has(posKey(at))) return '';
  const names = whose(b, countersFrom(b, at));
  return names.length
    ? t(
        ` Ao parar aqui, ${names.join(', ')} contra-ataca (metade do dano).`,
        ` Stopping here draws a counter from ${names.join(', ')} (half damage).`,
      )
    : '';
}

// The "Execute?" note about the counters a strike earns: only if the actor walks away this turn (out of a reach, or out of a
// shooter's contact)
export function counterNote(b: Battle, ability: string, p: Preview): string {
  const names = whose(b, countersOwed(b, ability, p));
  return names.length
    ? t(
        `${names.join(', ')} contra-ataca se você se afastar dele neste turno (metade do dano).`,
        `${names.join(', ')} strikes back if you walk away from it this turn (half damage).`,
      )
    : '';
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
