// "Agir primeiro" (Fernando's grill, Nov 19): Act opens the list of targets the unit can reach this turn by walking and
// then acting (enemies first, then allies, near to far; then the actions with no unit to aim at), then the actions that hit
// the picked target (the ones that cannot say why), then the tiles to stand on with the best one picked first. Pure: the
// screens draw it, act-turn.ts runs it. The only way to act since Fernando's "Apagar tudo" (Nov 19)
import { ABILITIES } from '../shared/battle/abilities.ts';
import { type ActionKind, abilityKind, slotFor, slotScale } from '../shared/battle/action-slots.ts';
import { type ItemOptions, type ItemReason, itemOptions } from '../shared/battle/bag.ts';
import type { Battle } from '../shared/battle/battle.ts';
import { type Preview, previewAbility } from '../shared/battle/combat.ts';
import { basicOf } from '../shared/battle/counter.ts';
import { dist, samePos } from '../shared/battle/grid.ts';
import { type AbilityOptions, actionOptions, type OptionReason } from '../shared/battle/options.ts';
import { footprint, gap, unitAt } from '../shared/battle/pathing.ts';
import type { Lock, Pos } from '../shared/battle/types.ts';

// A row of the target list: a unit (also the user itself, for a heal or an item), or a direct action (an area aimed at the
// ground or a self-centred one: decision 4, it picks its tile next), or the last row that swaps an action's list to the
// other side (Fernando, Nov 19: "Escolher aliados" under a strike's foes, "Escolher inimigos" under a heal's allies)
export type ActTarget =
  | { k: 'unit'; unit: string; pos: Pos }
  | { k: 'direct'; ability: string }
  | { k: 'side'; side: Side };
export type Side = 'foe' | 'ally';

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
  reach?: number; // on the Agir list: how many rows its target list shows
  spots: ActSpot[];
}

// The engine's options for the acting unit, worked out once per battle state: the Agir screens ask for them several times a
// key and once per target, which cost ~100 ms an Agir list on a PC (Nov 19 audit). Any move, act or edit of the state is
// a new key; the grid never changes inside a battle
let memo: { b: Battle; key: string; abilities: AbilityOptions[]; items: ItemOptions[] } | null = null;
function options(b: Battle) {
  const key = JSON.stringify(b.state);
  if (memo?.b !== b || memo.key !== key)
    memo = {
      b,
      key,
      abilities: actionOptions(b.grid, b.state, b.actor.id),
      items: itemOptions(b.grid, b.state, b.actor.id),
    };
  return memo;
}

// Main or secondary (Nov 19): an item is always secondary
export const actKind = (a: ActAction): ActionKind => (a.k === 'item' ? 'bonus' : abilityKind(ABILITIES[a.id]));

// The rows of the first screen. A unit is listed when any ability or item reaches it; the user only through what aims at
// itself (support, items)
export function actTargets(b: Battle, only?: ActRef, other = false): ActTarget[] {
  const all = allTargets(b);
  if (!only) return all;
  // a row picked on the Agir list keeps the targets that action can hit this turn (the same test as its action screen)
  const hit = all.filter((r) => actActions(b, r).some((a) => sameRef(only, a) && a.enabled));
  const side = sideOf(only);
  if (!side) return hit;
  // a strike lists its foes, a heal or an item its allies; the last row swaps to the other side when it has anyone
  // (Fernando, Nov 19); a direct action stays on its own side's list
  const own = (r: ActTarget, s: Side) => (r.k === 'unit' ? unitSide(b, r.unit) === s : r.k === 'direct' && s === side);
  // an action that hits no one on its own side (a fire bolt only an ally is in reach of) lists who it hits, no swap
  if (!hit.some((r) => own(r, side))) return hit;
  const want = other ? flip(side) : side;
  const rows = hit.filter((r) => own(r, want));
  return hit.some((r) => own(r, flip(want))) ? [...rows, { k: 'side', side: flip(want) }] : rows;
}
const flip = (s: Side): Side => (s === 'foe' ? 'ally' : 'foe');
const unitSide = (b: Battle, unit: string): Side =>
  b.state.units.find((u) => u.id === unit)?.team === b.actor.team ? 'ally' : 'foe';
// the side an action is aimed at: what deals damage at foes, what heals (and every item) at allies, the rest at both
export function sideOf(r: ActRef): Side | null {
  if (r.k === 'item') return 'ally';
  const a = ABILITIES[r.id];
  return a.heal[1] > 0 || a.ally ? 'ally' : a.damage[1] > 0 ? 'foe' : null;
}
function allTargets(b: Battle): ActTarget[] {
  const id = b.actor.id;
  const units = new Map<string, Pos>();
  const direct: ActTarget[] = [];
  for (const o of options(b).abilities)
    for (const t of o.targets) {
      if (t.kind === 'unit' && t.unit) units.set(t.unit, t.pos);
      else if (t.kind === 'self' && ABILITIES[o.ability].range[1] > 0) units.set(id, t.pos);
      else if (!direct.some((d) => d.k === 'direct' && d.ability === o.ability))
        direct.push({ k: 'direct', ability: o.ability });
    }
  for (const o of options(b).items) for (const t of o.targets) units.set(t.unit, t.pos);
  const team = (u: string) => b.state.units.find((x) => x.id === u)!.team;
  const rank = (u: string) => (u === id ? 2 : team(u) === b.actor.team ? 1 : 0);
  const rows = [...units].map(([unit, pos]) => ({ k: 'unit' as const, unit, pos }));
  rows.sort((x, y) => rank(x.unit) - rank(y.unit) || dist(b.actor.pos, x.pos) - dist(b.actor.pos, y.pos));
  return [...rows, ...direct];
}

// How far a unit is from the actor where it stands now, in cells (half tiles on the halved map: the unit Move is shown in)
export const distanceTo = (b: Battle, unit: string) =>
  gap(footprint(b.actor), footprint(b.state.units.find((u) => u.id === unit)!));

// The actions of the second screen for a target: every ability of the unit in its own order, then the items in the bag.
// One that cannot hit this target is off: its own reason when it works nowhere, else 'range'
export function actActions(b: Battle, target: ActTarget): ActAction[] {
  if (target.k === 'side') return [];
  const id = b.actor.id;
  const abilities = options(b)
    .abilities.filter((o) => target.k === 'unit' || o.ability === target.ability)
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
  const items = options(b).items.map((o): ActAction => {
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

// The Agir list (Fernando, Nov 19: Agir is the first row of the turn menu; variant A of his grill; the third column of
// his later grill): "Escolher alvo" (the target list above), the basic attack straight to its targets, then Técnicas,
// Magias and Itens, each opening its actions in a column of its own; an empty one is left out. An action is on when it
// can hit someone reachable this turn (walk, then act) and its slot is free (options.ts: 'used'); else it is off with the
// reason. "Escolher alvo" is off with no one to reach this turn, a group with none of its actions on
export type ActGroup = 'skills' | 'magic' | 'items';
export const GROUPS: ActGroup[] = ['skills', 'magic', 'items'];
export type ActRow =
  | { k: 'pick'; enabled: boolean }
  | { k: 'group'; group: ActGroup; enabled: boolean; reach: number }
  | ActAction;
// an ability or an item picked straight on the Agir list: the target list then shows only who it can hit
export interface ActRef {
  k: 'ability' | 'item';
  id: string;
}
export const sameRef = (a: ActRef, r: ActRow) => (r.k === 'ability' || r.k === 'item') && r.k === a.k && r.id === a.id;
// the group an action is listed under: null for the basic attack (the unit's first ability), which has a row of its own
export const groupOf = (b: Battle, r: ActRef): ActGroup | null =>
  r.k === 'item' ? 'items' : r.id === basicOf(b.actor.def) ? null : ABILITIES[r.id].magic ? 'magic' : 'skills';

export function actList(b: Battle): ActRow[] {
  const rows = actRows(b);
  const basic = rows.find((r) => groupOf(b, r) === null);
  const groups = GROUPS.flatMap((group): ActRow[] => {
    const own = rows.filter((r) => groupOf(b, r) === group);
    if (!own.length) return [];
    // the targets any of its actions hits on its own side, each once
    const seen = new Set<string>();
    for (const r of own)
      if (r.enabled) for (const t of actTargets(b, r)) if (t.k !== 'side') seen.add(JSON.stringify(t));
    return [{ k: 'group', group, enabled: own.some((r) => r.enabled), reach: seen.size }];
  });
  return [{ k: 'pick', enabled: allTargets(b).length > 0 }, ...(basic ? [basic] : []), ...groups];
}
// a group's column: its actions in the unit's order (the items in the bag's)
export const actGroup = (b: Battle, g: ActGroup) => actRows(b).filter((r) => groupOf(b, r) === g);

// every ability and item as a row of the Agir lists, with how many targets its list shows on its own side
function actRows(b: Battle): ActAction[] {
  // each target's actions once, so a row's count is what its target list will show (Fernando's grill, Nov 19)
  const hits = allTargets(b).map((t) => ({ t, acts: actActions(b, t) }));
  const reach = (r: ActRef) => {
    const side = sideOf(r);
    return hits.filter(
      ({ t, acts }) =>
        acts.some((a) => sameRef(r, a) && a.enabled) && (!side || t.k !== 'unit' || unitSide(b, t.unit) === side),
    ).length;
  };
  const abilities = options(b).abilities.map((o): ActAction => {
    const base = { k: 'ability' as const, id: o.ability, spots: [] };
    if (!o.enabled) return { ...base, enabled: false, reason: o.reason, missing: o.missing, pool: o.pool };
    return o.targets.length
      ? { ...base, enabled: true, reach: reach(base) }
      : { ...base, enabled: false, reason: 'range' };
  });
  const items = options(b).items.map((o): ActAction => {
    const base = { k: 'item' as const, id: o.item, count: o.count, spots: [] };
    if (!o.enabled) return { ...base, enabled: false, reason: o.reason };
    return o.targets.length
      ? { ...base, enabled: true, reach: reach(base) }
      : { ...base, enabled: false, reason: 'no-target' };
  });
  return [...abilities, ...items];
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
      last?.k === 'unit'
        ? r.k === 'unit' && r.unit === last.unit
        : last?.k === 'direct' && r.k === 'direct' && r.ability === last.ability,
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
// `as`: the slot the slot step picked for a dual action (slotFor)
export function runSpot(b: Battle, a: ActAction, s: ActSpot, lock?: Lock, as?: ActionKind) {
  const id = b.actor.id;
  const walk = samePos(s.pos, b.actor.pos) ? [] : b.move(s.pos);
  const me = b.state.units.find((u) => u.id === id);
  if (b.over || !me || b.state.turn.actor !== id || !samePos(me.pos, s.pos)) return { walk, act: null };
  return { walk, act: a.k === 'item' ? b.useItem(a.id, s.aim) : b.act(a.id, s.aim, lock, as) };
}

// The slot step (Fernando, Nov 20, "Escolha no fim"): a dual action (bonusShare) asks main or secondary on the tile
// choice only while both slots are free; with one free it takes that one
export const needsSlot = (b: Battle, a: ActAction) =>
  a.k === 'ability' && ABILITIES[a.id].bonusShare !== undefined && !b.state.turn.main && !b.state.turn.bonus;

// what acting from `s` would do with the action in `as` (else the slot it takes by itself): a dual action in the
// secondary slot at its share of the damage, so the map and the strips show the half
export function spotPreview(b: Battle, a: ActAction, s: ActSpot, as?: ActionKind): Preview | undefined {
  if (a.k !== 'ability' || !s.preview) return s.preview;
  const ability = ABILITIES[a.id];
  const scale = slotScale(ability, slotFor(b.state.turn, ability, as));
  return scale === 1 ? s.preview : previewAbility(b.grid, b.state, b.actor.id, a.id, s.aim, false, s.pos, scale);
}
