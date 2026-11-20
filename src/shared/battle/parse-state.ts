// Save trust boundary for the battle state (moved out of battle.ts, Nov 19, to keep it under 400 lines): every field read
// back from the browser is rebuilt and checked here; any doubt returns null.
import { ABILITIES } from './abilities.ts';
import { abilityKind } from './action-slots.ts';
import { CONSUMABLE_IDS, parseBag } from './bag.ts';
import { parseEffects } from './effects.ts';
import { canStand, FACING, faceNearest, inBounds, posKey, subOf, tileAt } from './grid.ts';
import { SCENARIOS } from './scenarios.ts';
import type { BattleState, Charge, Pos, UnitState } from './types.ts';
import { HALF, RESOURCES, UNIT_DEFS } from './units.ts';

export const MAX_UNITS = 64;
export const isObj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
export const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

// Save trust boundary: rebuilds the state only with known fields and checks limits (map, life, duplicates).
export function parseBattleState(raw: unknown): BattleState | null {
  if (!isObj(raw) || typeof raw.scenario !== 'string' || !Object.hasOwn(SCENARIOS, raw.scenario)) return null;
  const grid = SCENARIOS[raw.scenario].grid;
  if (!isInt(raw.rng) || !isInt(raw.turnsPlayed) || raw.turnsPlayed < 0) return null;
  if (raw.outcome !== 'ongoing' && raw.outcome !== 'victory' && raw.outcome !== 'defeat') return null;
  if (!Array.isArray(raw.units) || raw.units.length > MAX_UNITS) return null;
  const units: UnitState[] = [];
  const ids = new Set<string>();
  const cells = new Set<string>();
  for (const u of raw.units) {
    if (!isObj(u) || typeof u.id !== 'string' || typeof u.def !== 'string' || !Object.hasOwn(UNIT_DEFS, u.def))
      return null;
    // a split map holds only half-tile tokens and a whole map only whole sheets (Nov 14 review: an edited save put 1-cell
    // units on the split map)
    if (u.def.endsWith(HALF) !== subOf(grid) > 1) return null;
    if (u.team !== 'hero' && u.team !== 'enemy') return null;
    if (!isObj(u.pos) || !isInt(u.pos.x) || !isInt(u.pos.y)) return null;
    const pos = { x: u.pos.x, y: u.pos.y };
    // all the unit's tiles (a large one occupies 2x2 from `pos`): inside the map, walkable and empty (Nov 13,
    // review: only the corner tile was checked, and a Colossus covered the Beacon or left the map)
    const size = UNIT_DEFS[u.def].size ?? 1;
    const tiles = Array.from({ length: size * size }, (_, i) => ({
      x: pos.x + (i % size),
      y: pos.y + Math.floor(i / size),
    }));
    if (!tiles.every((p) => inBounds(grid, p) && canStand(tileAt(grid, p)) && !cells.has(`${p.x},${p.y}`))) return null;
    if (!isInt(u.hp) || u.hp < 1 || u.hp > UNIT_DEFS[u.def].hp || !isInt(u.ct) || Math.abs(u.ct) > 10000) return null;
    if (ids.has(u.id)) return null;
    ids.add(u.id);
    for (const p of tiles) cells.add(`${p.x},${p.y}`);
    // direction: every map has it since Nov 13; an older save (without it) opens facing the nearest enemy (filled in
    // after the loop). Counters only with the sheet's keys
    if (u.facing !== undefined && (!isInt(u.facing) || !FACING[u.facing])) return null;
    const defVars = UNIT_DEFS[u.def].vars;
    let vars: Record<string, number> | undefined;
    if (defVars) {
      if (u.vars !== undefined && !isObj(u.vars)) return null;
      vars = {};
      for (const k of Object.keys(defVars)) {
        const pool = (RESOURCES as readonly string[]).includes(k);
        // a save from before the mana and stamina pools (Nov 16) opens with them full; any other counter is required
        const v = isObj(u.vars) && u.vars[k] !== undefined ? u.vars[k] : pool ? defVars[k] : undefined;
        if (!isInt(v) || Math.abs(v) > 9999) return null;
        if (pool && (v < 0 || v > defVars[k])) return null;
        vars[k] = v;
      }
    } else if (u.vars !== undefined) return null;
    units.push({
      id: u.id,
      def: u.def,
      team: u.team,
      pos,
      hp: u.hp,
      ct: u.ct,
      ...(u.facing !== undefined && { facing: u.facing as number }),
      ...(vars && { vars }),
    });
  }
  for (const u of units)
    if (UNIT_DEFS[u.def].speed > 0)
      u.facing ??= faceNearest(
        u.pos,
        units.filter((o) => o.team !== u.team).map((o) => o.pos),
      );
  const t = raw.turn;
  if (!isObj(t) || typeof t.actor !== 'string' || typeof t.moved !== 'boolean') return null;
  const actor = units.find((u) => u.id === t.actor);
  if (!actor) return null;
  // each slot holds the actor's own ability or an item (bag.ts); an old save kept the one action in `usedAbility` (before Nov 19's
  // main and bonus slots): it was the main action. A damage ability never sits in the bonus slot
  const slot = (v: unknown, bonus: boolean): string | null | undefined => {
    if (v === undefined) return undefined;
    if (v === null) return null;
    const own = typeof v === 'string' && Object.hasOwn(ABILITIES, v) && UNIT_DEFS[actor.def].abilities.includes(v);
    const ok =
      typeof v === 'string' && ((own && (!bonus || abilityKind(ABILITIES[v]) === 'bonus')) || CONSUMABLE_IDS.has(v));
    return ok ? (v as string) : undefined;
  };
  const old = t.main === undefined && t.bonus === undefined;
  const main = slot(old ? t.usedAbility : t.main, false);
  const bonus = old ? null : slot(t.bonus, true);
  if (main === undefined || bonus === undefined) return null;
  if (!Array.isArray(raw.charges) || raw.charges.length > MAX_UNITS) return null;
  const charges: Charge[] = [];
  for (const c of raw.charges) {
    if (
      !isObj(c) ||
      typeof c.unit !== 'string' ||
      typeof c.ability !== 'string' ||
      !isInt(c.ticks) ||
      c.ticks < 1 ||
      c.ticks > 99
    )
      return null;
    const caster = units.find((u) => u.id === c.unit);
    if (!caster || !UNIT_DEFS[caster.def].abilities.includes(c.ability) || charges.some((x) => x.unit === c.unit))
      return null;
    if (
      !isObj(c.target) ||
      !isInt(c.target.x) ||
      !isInt(c.target.y) ||
      !inBounds(grid, { x: c.target.x, y: c.target.y })
    )
      return null;
    if (c.follow !== null && (typeof c.follow !== 'string' || !units.some((u) => u.id === c.follow))) return null;
    charges.push({
      unit: c.unit,
      ability: c.ability,
      target: { x: c.target.x, y: c.target.y },
      follow: c.follow,
      ticks: c.ticks,
    });
  }
  if (t.spent !== undefined && (!isInt(t.spent) || t.spent < 0 || t.spent > 99)) return null;
  // counters owed this turn: unit ids in the turn. Older saves kept them as objects in the turn (Nov 13) or, for a while on
  // Nov 15, in the state with the attacker and a 2-turn window, of which only the actor's strikes of this turn still count
  const engaged: string[] = [];
  const owed = (list: unknown, keep: (e: unknown) => boolean) => {
    if (list === undefined) return true;
    if (!Array.isArray(list) || list.length > MAX_UNITS * MAX_UNITS) return false;
    for (const e of list) {
      const u = units.find((x) => x.id === (isObj(e) ? e.unit : e));
      if (!u) continue; // a unit no longer here owes nothing (one that died mid-move stayed listed before Nov 15's fix)
      // an edited save: a repeated unit would counter twice, and the rule never owes one on the actor's own side
      if (keep(e) && u.team !== actor.team && !engaged.includes(u.id)) engaged.push(u.id);
    }
    return true;
  };
  const thisTurn = (e: unknown) => isObj(e) && e.by === actor.id && e.turns !== 1;
  if (!owed(t.engaged, () => true) || !owed(raw.engaged, thisTurn)) return null;
  const turn = {
    actor: actor.id,
    moved: t.moved,
    main,
    bonus,
    ...(t.spent !== undefined && { spent: t.spent as number }),
    ...(engaged.length > 0 && { engaged }),
  };
  // corpses (Nov 16): the rule never saves an empty list nor a cell twice (a repeat would count twice), and nobody stands
  // on a body, so a unit's cell there is an edited save
  let corpses: Pos[] | undefined;
  let corpseDefs: Record<string, string> | undefined;
  if (raw.corpses !== undefined) {
    if (!Array.isArray(raw.corpses) || raw.corpses.length > grid.width * grid.height) return null;
    const seen = new Set<string>();
    corpses = [];
    for (const c of raw.corpses) {
      if (!isObj(c) || !isInt(c.x) || !isInt(c.y)) return null;
      const p = { x: c.x, y: c.y };
      if (!inBounds(grid, p) || cells.has(posKey(p))) return null;
      if (!seen.has(posKey(p))) corpses.push(p);
      seen.add(posKey(p));
    }
    // what lay there (Nov 19): only a known unit on a kept cell; a bad entry is dropped, the save still loads
    if (isObj(raw.corpseDefs))
      corpseDefs = Object.fromEntries(
        Object.entries(raw.corpseDefs).filter(([k, d]) => seen.has(k) && typeof d === 'string' && d in UNIT_DEFS),
      ) as Record<string, string>;
  }
  const bag = parseBag(raw.bag);
  const effects = parseEffects(raw.effects, units);
  if (!bag || !effects) return null;
  return {
    scenario: raw.scenario,
    units,
    rng: raw.rng,
    turn,
    charges,
    outcome: raw.outcome,
    turnsPlayed: raw.turnsPlayed,
    ...(corpses?.length && { corpses }),
    ...(corpseDefs && Object.keys(corpseDefs).length > 0 && { corpseDefs }),
    ...(Object.keys(bag).length > 0 && { bag }),
    ...(effects.length > 0 && { effects }),
  };
}
