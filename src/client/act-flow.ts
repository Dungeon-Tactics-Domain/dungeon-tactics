// "Agir primeiro" (Fernando's grill, Nov 19): Act opens the list of targets the unit can reach this turn by walking and
// then acting (enemies first, then allies, near to far; then the actions with no unit to aim at), then the actions that hit
// the picked target (the ones that cannot say why), then the tiles to stand on with the best one picked first. Pure: the
// screens draw it, act-turn.ts runs it. The only way to act since Fernando's "Apagar tudo" (Nov 19)
import { ABILITIES } from '../shared/battle/abilities.ts';
import { type ActionKind, abilityKind } from '../shared/battle/action-slots.ts';
import { type ItemReason, itemOptions } from '../shared/battle/bag.ts';
import type { Battle } from '../shared/battle/battle.ts';
import type { Preview } from '../shared/battle/combat.ts';
import { dist, samePos } from '../shared/battle/grid.ts';
import { actionOptions, type OptionReason } from '../shared/battle/options.ts';
import { unitAt } from '../shared/battle/pathing.ts';
import type { Lock, Pos } from '../shared/battle/types.ts';

// A row of the target list: a unit (also the user itself, for a heal or an item), or a direct action (an area aimed at the
// ground or a self-centred one: decision 4, it picks its tile next)
export type ActTarget = { k: 'unit'; unit: string; pos: Pos } | { k: 'direct'; ability: string };

export type ActReason = OptionReason | ItemReason;
// A tile the action may be taken from: the walk it costs and, for an ability, what it would do from there
export interface ActSpot {
  pos: Pos;
  cost: number;
  aim: Pos; // where the action is aimed from this tile (a direct action's ground tile; else the target's tile)
  preview?: Preview;
  heal?: number; // an item's numbers
  mana?: number;
}
// A row of the action list: an ability or an item, on when it can hit the target, else with the reason
export interface ActAction {
  k: 'ability' | 'item';
  id: string;
  enabled: boolean;
  reason?: ActReason;
  missing?: number; // 'spent': how much of `pool` is lacking
  pool?: string;
  count?: number; // an item's count in the bag
  spots: ActSpot[];
}

// Main or secondary (Nov 19): an item is always secondary
export const actKind = (a: ActAction): ActionKind => (a.k === 'item' ? 'bonus' : abilityKind(ABILITIES[a.id]));

// The rows of the first screen. A unit is listed when any ability or item reaches it; the user only through what aims at
// itself (support, items)
export function actTargets(b: Battle): ActTarget[] {
  const id = b.actor.id;
  const units = new Map<string, Pos>();
  const direct: ActTarget[] = [];
  for (const o of actionOptions(b.grid, b.state, id))
    for (const t of o.targets) {
      if (t.kind === 'unit' && t.unit) units.set(t.unit, t.pos);
      else if (t.kind === 'self' && ABILITIES[o.ability].range[1] > 0) units.set(id, t.pos);
      else if (!direct.some((d) => d.k === 'direct' && d.ability === o.ability))
        direct.push({ k: 'direct', ability: o.ability });
    }
  for (const o of itemOptions(b.grid, b.state, id)) for (const t of o.targets) units.set(t.unit, t.pos);
  const team = (u: string) => b.state.units.find((x) => x.id === u)!.team;
  const rank = (u: string) => (u === id ? 2 : team(u) === b.actor.team ? 1 : 0);
  const rows = [...units].map(([unit, pos]) => ({ k: 'unit' as const, unit, pos }));
  rows.sort((x, y) => rank(x.unit) - rank(y.unit) || dist(b.actor.pos, x.pos) - dist(b.actor.pos, y.pos));
  return [...rows, ...direct];
}

// The actions of the second screen for a target: every ability of the unit in its own order, then the items in the bag.
// One that cannot hit this target is off: its own reason when it works nowhere, else 'range'
export function actActions(b: Battle, target: ActTarget): ActAction[] {
  const id = b.actor.id;
  const abilities = actionOptions(b.grid, b.state, id)
    .filter((o) => target.k === 'unit' || o.ability === target.ability)
    .map((o): ActAction => {
      const base = { k: 'ability' as const, id: o.ability };
      if (!o.enabled) return { ...base, enabled: false, reason: o.reason, missing: o.missing, pool: o.pool, spots: [] };
      const area = ABILITIES[o.ability].radius > 0;
      const spots = o.targets.flatMap((t) => {
        const all = t.spots.map((s) => ({
          pos: s.pos,
          cost: s.cost,
          aim: t.kind === 'self' ? s.pos : t.pos,
          preview: s.preview,
        }));
        if (target.k === 'direct') return t.kind !== 'unit' ? all : [];
        if (t.kind === 'self' && target.unit === id) return all;
        if (t.kind === 'unit' && t.unit === target.unit) return all;
        // an area aimed at the ground, another unit next to the target or the user itself also hits it (Fernando, Nov 19:
        // "choose where in the area first, then only the tiles that can use it there")
        return area ? all.filter((s) => s.preview.targets.some((x) => x.unit === target.unit)) : [];
      });
      return spots.length ? { ...base, enabled: true, spots } : { ...base, enabled: false, reason: 'range', spots: [] };
    });
  if (target.k === 'direct') return abilities;
  const items = itemOptions(b.grid, b.state, id).map((o): ActAction => {
    const base = { k: 'item' as const, id: o.item, count: o.count };
    if (!o.enabled) return { ...base, enabled: false, reason: o.reason, spots: [] };
    const t = o.targets.find((x) => x.unit === target.unit);
    if (!t) return { ...base, enabled: false, reason: 'no-target', spots: [] };
    const spots = t.spots.map((s) => ({
      pos: s.pos,
      cost: s.cost,
      aim: t.pos,
      heal: s.effect.heal,
      mana: s.effect.mana,
    }));
    return { ...base, enabled: true, spots };
  });
  return [...abilities, ...items];
}

// The Agir list (Fernando, Nov 19: Agir is the first row of the turn menu): "Escolher alvo" (the target list above), then
// every ability in order with the basic attack first, then the items; an ability or item with no target reachable this
// turn is off with its reason. Prototype: the variant (a: flat; b: the basic attack as a row named Ataque) only changes names
// shortcut: prototype flag, remove when Fernando picks a variant
export const AGIR_LIST: 'a' | 'b' =
  typeof location !== 'undefined' && new URLSearchParams(location.search).get('agirlist') === 'b' ? 'b' : 'a';
export type ActRow = { k: 'pick' } | ActAction;
export function actList(b: Battle): ActRow[] {
  const id = b.actor.id;
  const abilities = actionOptions(b.grid, b.state, id).map((o): ActRow => {
    const base = { k: 'ability' as const, id: o.ability, spots: [] };
    if (!o.enabled) return { ...base, enabled: false, reason: o.reason, missing: o.missing, pool: o.pool };
    return o.targets.length ? { ...base, enabled: true } : { ...base, enabled: false, reason: 'range' };
  });
  const items = itemOptions(b.grid, b.state, id).map((o): ActRow => {
    const base = { k: 'item' as const, id: o.item, count: o.count, spots: [] };
    if (!o.enabled) return { ...base, enabled: false, reason: o.reason };
    return o.targets.length ? { ...base, enabled: true } : { ...base, enabled: false, reason: 'no-target' };
  });
  return [{ k: 'pick' }, ...abilities, ...items];
}

// The aim step (Fernando, Nov 19): an ability aimed at more than one place (an area that can be centred on the target or
// next to it) first picks where it lands, then the tiles that can aim there. Its aims, in the order the engine ranks them
export function actAims(a: ActAction): Pos[] {
  if (a.k !== 'ability' || ABILITIES[a.id].range[1] === 0) return [];
  const out: Pos[] = [];
  for (const s of a.spots) if (!out.some((p) => samePos(p, s.aim))) out.push(s.aim);
  return out.length > 1 ? out : [];
}
// the action with only the tiles aiming at `aim`
export const withAim = (a: ActAction, aim: Pos): ActAction => ({
  ...a,
  spots: a.spots.filter((s) => samePos(s.aim, aim)),
});

// The spot picked first (decision 3): one that keeps allies out of the damage when there is one (Fernando, Nov 19: the
// Explosion's first tile hit the Archer), then staying put when it works, else the best expected result, then the
// shortest walk. Expected: chance x mean damage on foes and heal on allies, minus the same on the wrong side; an item's
// heal and mana
export function bestSpot(a: ActAction, b: Battle): number {
  if (!a.spots.length) return -1;
  const own = (unit: string) => b.state.units.find((u) => u.id === unit)?.team === b.actor.team;
  const hurtsOwn = (s: ActSpot) => !!s.preview?.targets.some((t) => own(t.unit) && t.dmgMax > 0);
  const score = (s: ActSpot) =>
    s.preview
      ? s.preview.targets.reduce((sum, t) => {
          const dmg = (t.chance * (t.dmgMin + t.dmgMax)) / 200,
            heal = (t.healMin + t.healMax) / 2;
          return sum + (own(t.unit) ? heal - dmg : dmg - heal);
        }, 0)
      : (s.heal ?? 0) + (s.mana ?? 0);
  const better = (s: ActSpot, o: ActSpot) =>
    hurtsOwn(s) !== hurtsOwn(o)
      ? !hurtsOwn(s)
      : (s.cost === 0) !== (o.cost === 0)
        ? s.cost === 0
        : score(s) > score(o) || (score(s) === score(o) && s.cost < o.cost);
  let best = 0;
  a.spots.forEach((s, i) => {
    if (better(s, a.spots[best])) best = i;
  });
  return best;
}

// Where the cursor of the target list starts: the unit last picked when it is still listed, else the first row
export const targetIndex = (rows: ActTarget[], last: ActTarget | null) =>
  Math.max(
    0,
    rows.findIndex((r) =>
      last?.k === 'unit' ? r.k === 'unit' && r.unit === last.unit : r.k === 'direct' && r.ability === last?.ability,
    ),
  );

// The target row a tap on the map picks (tapping the unit = choosing it in the list): the row of the unit on that tile
export function targetAt(rows: ActTarget[], b: Battle, p: Pos): number {
  const on = unitAt(b.state, p);
  return on ? rows.findIndex((r) => r.k === 'unit' && r.unit === on.id) : -1;
}

// The spot a tap on the map picks on the third screen: the one whose tile (a token's 2x2 square) holds the cell
export const spotAt = (a: ActAction, p: Pos, size: number) =>
  a.spots.findIndex((s) => p.x >= s.pos.x && p.y >= s.pos.y && p.x < s.pos.x + size && p.y < s.pos.y + size);

// Runs the picked action: walk to the spot (when it is not where the unit stands), then act or use the item. Returns the
// events in order for the scene; `act` null when the walk was cut short (a counter-attack downed it or ended the battle).
// `lock`: where a charge stays aimed (the tile choice's lock step); without it, the ability's default
export function runSpot(b: Battle, a: ActAction, s: ActSpot, lock?: Lock) {
  const id = b.actor.id;
  const walk = samePos(s.pos, b.actor.pos) ? [] : b.move(s.pos);
  const me = b.state.units.find((u) => u.id === id);
  if (b.over || !me || b.state.turn.actor !== id || !samePos(me.pos, s.pos)) return { walk, act: null };
  return { walk, act: a.k === 'item' ? b.useItem(a.id, s.aim) : b.act(a.id, s.aim, lock) };
}
