import type { Battle } from '../shared/battle/battle.ts';
import { COMBAT, type Preview, previewAbility } from '../shared/battle/combat.ts';
import { basicOf, canCounter, inContact, isRanged, pendingCounters } from '../shared/battle/counter.ts';
import { type Grid, posKey, subOf } from '../shared/battle/grid.ts';
import { aimTile, unitAt } from '../shared/battle/pathing.ts';
import { chargeAim } from '../shared/battle/turn-queue.ts';
import type { BattleState, Charge, Pos, Shot, Team, UnitState } from '../shared/battle/types.ts';
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
  shot: Shot | null; // a flying ability's path, which the line follows (a spell cast on the target has none)
}

const square = (u: UnitState): Square => ({ pos: u.pos, size: UNIT_DEFS[u.def].size ?? 1 });

// A shot as its rule's preview lands it: from the caster to `to`, stopping where the preview's path stops
function lineOf(grid: Grid, state: BattleState, casterId: string, p: Preview, to: Square): ChargeLine {
  const caster = state.units.find((u) => u.id === casterId)!;
  const stop = p.shot?.stop;
  const blocker = stop?.unit ? state.units.find((u) => u.id === stop.unit) : undefined;
  return {
    team: caster.team,
    from: square(caster),
    to,
    stop: !stop ? null : blocker ? square(blocker) : { pos: stop.pos, size: subOf(grid) },
    shot: p.shot ?? null,
    hits: p.targets.map((x) => ({
      unit: x.unit,
      friendly: x.dmgMax > 0 && state.units.find((u) => u.id === x.unit)!.team === caster.team,
    })),
    ok: p.ok,
  };
}

// where a charge would land if it fired now (a unit lock follows the unit, a tile lock stays) and what it would do there
export function chargeNow(grid: Grid, state: BattleState, c: Charge) {
  const aim = aimTile(grid, state, chargeAim(state, c));
  return { aim, p: previewAbility(grid, state, c.unit, c.ability, aim, true) };
}

export function chargeLine(grid: Grid, state: BattleState, c: Charge): ChargeLine {
  const followed = c.follow ? state.units.find((u) => u.id === c.follow) : undefined;
  const { aim, p } = chargeNow(grid, state, c);
  return lineOf(grid, state, c.unit, p, followed ? square(followed) : { pos: aim, size: subOf(grid) });
}

// What a queued charge's card in the turn list says (Fernando, Nov 22: "nessa turn order deve dizer q magia ela vai usar
// e em quais alvos"): the spell and how many it would hit now, then who (two names, else the first and how many more)
// or, with nobody in the area, its tile as the Height corner writes it (tile-info.ts). `hit`: the units, in that order
export function chargeCard(grid: Grid, state: BattleState, c: Charge): { lines: [string, string]; hit: UnitState[] } {
  const { aim, p } = chargeNow(grid, state, c);
  // out of range from where the caster stands it fizzles: nobody is hit
  const hit = p.ok ? p.targets.map((x) => state.units.find((u) => u.id === x.unit)!) : [];
  const n = hit.length,
    names = hit.map((u) => unitName(u.def));
  const count = !n
    ? t('nenhum alvo', 'no target')
    : n === 1
      ? t('1 alvo', '1 target')
      : t(`${n} alvos`, `${n} targets`);
  const who = !n
    ? t(`na casa X ${aim.x} · Y ${aim.y}`, `on tile X ${aim.x} · Y ${aim.y}`)
    : n > 2
      ? `${names[0]} +${n - 1}`
      : names.join(', ');
  return { lines: [`${abilityName(c.ability)} · ${count}`, who], hit };
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
  if (isRanged(basicOf(u.def))) out.lines.push(lineOf(b.grid, there, u.id, p, { pos: at, size: square(me).size }));
  else out.melee.push({ from: square(u), to: square(me) });
}

// Aiming (Nov 15; from the picked tile since Nov 19): who this strike would leave owed a counter, whoever could strike the
// actor where it will stand (rom; walking out of that reach draws it) and a shooter it stands too close to (walking out of
// that contact draws its shot), as the line or the mark over its head
export function countersOwed(b: Battle, ability: string, p: Preview, from: Pos = b.actor.pos): Counters {
  const out: Counters = { lines: [], melee: [] };
  const moved = { ...b.state, units: b.state.units.map((x) => (x.id === b.actor.id ? { ...x, pos: from } : x)) };
  for (const t of p.targets) {
    const u = b.state.units.find((x) => x.id === t.unit)!;
    if (!canCounter(b.actor, ability, u)) continue;
    const back = previewAbility(b.grid, moved, u.id, basicOf(u.def), from, true);
    if (back.ok) counterOf(b, out, u, back, from);
    else if (inContact(b.grid, moved, u, from)) out.melee.push({ from: square(u), to: square(b.actor) });
  }
  // a melee mark points at the tile the actor will stand on, not the one it leaves
  out.melee = out.melee.map((m) => ({ ...m, to: { pos: from, size: square(b.actor).size } }));
  return out;
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

export const chargeLines = (grid: Grid, state: BattleState): ChargeLine[] =>
  state.charges.filter((c) => state.units.some((u) => u.id === c.unit)).map((c) => chargeLine(grid, state, c));

// The acting unit's own charge as it would fire if it ended its walk on `at`; null without a charge
export function chargeFrom(b: Battle, at: Pos): ChargeLine | null {
  const c = b.state.charges.find((x) => x.unit === b.actor.id);
  if (!c) return null;
  const moved = { ...b.state, units: b.state.units.map((u) => (u.id === b.actor.id ? { ...u, pos: at } : u)) };
  return chargeLine(b.grid, moved, c);
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
