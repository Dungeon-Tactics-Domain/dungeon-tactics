// What a unit can do this turn, worked out before it moves (Agir primeiro, Nov 19 grill): for each ability, the targets it can
// reach by walking and then acting inside the turn's movement budget, and for each target the tiles it may act from. Pure
// reading of the state: nothing here changes it, and the AI does not use it (it keeps chooseTurn).
import { ABILITIES } from './abilities.ts';
import { canPay, inDeep, type Preview, type PreviewReason, poolOf, previewAbility } from './combat.ts';
import { dist, type Grid, inBounds, posKey, standH, subOf } from './grid.ts';
import { aimTile, farCells, reachable, unitAt } from './pathing.ts';
import type { BattleState, Pos, UnitState } from './types.ts';
import { UNIT_DEFS } from './units.ts';

// why an ability is off: previewAbility's reasons ('spent' = mana or stamina), plus 'used' (the turn's action is gone)
export type OptionReason = Exclude<PreviewReason, 'unknown'> | 'used';

// a tile the action may be taken from, `cost` = the movement it takes to get there, and what it would do from there
export interface Spot {
  pos: Pos;
  cost: number;
  preview: Preview;
}
// 'unit': a unit aimed at; 'self': the user (centered or support abilities); 'tile': ground whose area hits someone
export interface ActionTarget {
  kind: 'unit' | 'tile' | 'self';
  unit?: string;
  pos: Pos; // where it stands now (a 'self' target: the user's tile now)
  spots: Spot[]; // from the current tile first, then by movement cost
}
export interface AbilityOptions {
  ability: string;
  enabled: boolean;
  reason?: OptionReason; // when not enabled
  missing?: number; // 'spent': how much of `pool` is lacking
  pool?: string;
  targets: ActionTarget[]; // enemies first, then allies, near to far; then self, then ground tiles
}

// `grid`, `state` and the unit `id` (the one whose turn it is; another unit reads its whole movement). One entry per ability, in
// the unit's order: the basic attack is the first. shortcut: an area's ground targets are the tiles around each unit, not
// every tile in range; the counters a walk would draw are not simulated
export function actionOptions(grid: Grid, state: BattleState, id: string): AbilityOptions[] {
  const actor = state.units.find((u) => u.id === id);
  if (!actor || state.outcome !== 'ongoing') return [];
  const def = UNIT_DEFS[actor.def];
  const spent = state.turn.actor === id ? (state.turn.spent ?? 0) : 0;
  const left = def.move - spent;
  const walk = left > 0 ? reachable(grid, state, id, left) : new Map();
  // in deep water you only walk or wait (previewAbility's 'water'): those tiles are no place to act from
  const origins: { pos: Pos; cost: number }[] = [
    { pos: actor.pos, cost: 0 },
    ...[...walk.values()]
      .sort((x, y) => x.cost - y.cost) // a leap is found out of cost order
      .map((s) => ({ pos: s.pos, cost: s.cost })),
  ].filter((o) => !inDeep(grid, { ...actor, pos: o.pos }));
  // the most cells between an origin's corner and an aimed cell that may still be in range: the two squares' own width, and
  // the whole map's height difference for an ability that reaches farther from above. Past it no preview is asked (it would
  // say 'range'): most of the time went there
  const heights = grid.tiles.map(standH);
  const span = Math.max(...heights) - Math.min(...heights);
  const slack = 2 * ((def.size ?? 1) - 1) + 2 * (subOf(grid) - 1);
  const used = state.turn.actor === id && !!state.turn.usedAbility;
  const others = state.units.filter((u) => u !== actor);
  return def.abilities.map((abilityId) => {
    const a = ABILITIES[abilityId];
    if (used) return { ability: abilityId, enabled: false, reason: 'used', targets: [] };
    if (!canPay(actor, a)) {
      const [pool, amount] = a.cost!;
      return {
        ability: abilityId,
        enabled: false,
        reason: 'spent',
        pool,
        missing: amount - poolOf(actor, pool),
        targets: [],
      };
    }
    if (!origins.length) return { ability: abilityId, enabled: false, reason: 'water', targets: [] };
    const far = farCells(grid, a.range[1] + (a.heightRange ? span : 0)) + slack;
    const found = new Map<string, ActionTarget>();
    let blocked = false;
    let unwanted = false;
    const add = (key: string, t: Omit<ActionTarget, 'spots'>, o: { pos: Pos; cost: number }, preview: Preview) => {
      if (!found.has(key)) found.set(key, { ...t, spots: [] });
      found.get(key)!.spots.push({ pos: o.pos, cost: o.cost, preview });
    };
    const centered = a.range[1] === 0;
    // the aim of a ground tile: the tiles around each unit that an area would cover (unit tiles are 'unit' targets); on the
    // split map the cells of one tile are one aim (aimTile)
    const ground = new Map<string, Pos>();
    const r = farCells(grid, a.radius);
    if (!centered && a.radius > 0)
      for (const u of state.units) {
        const end = r + (UNIT_DEFS[u.def].size ?? 1) - 1; // any cell of a tile that touches the unit's square stands for it
        for (let dx = -r; dx <= end; dx++)
          for (let dy = -r; dy <= end; dy++) {
            const p = { x: u.pos.x + dx, y: u.pos.y + dy };
            if (!inBounds(grid, p) || unitAt(state, p)) continue;
            const tile = aimTile(grid, state, p);
            ground.set(posKey(tile), tile);
          }
      }
    for (const o of origins) {
      if (centered || a.range[0] === 0) {
        const p = previewAbility(grid, state, id, abilityId, o.pos, false, o.pos);
        if (p.ok && p.targets.length) add('self', { kind: 'self', pos: actor.pos }, o, p);
      }
      if (centered) continue;
      for (const u of others) {
        if (dist(o.pos, u.pos) > far + 2 * ((UNIT_DEFS[u.def].size ?? 1) - 1)) continue;
        const p = previewAbility(grid, state, id, abilityId, u.pos, false, o.pos);
        if (!p.ok) continue;
        if (p.targets.some((t) => t.unit === u.id)) add(u.id, { kind: 'unit', unit: u.id, pos: u.pos }, o, p);
        else if (a.needsSight) blocked = true;
        else unwanted = true;
      }
      for (const [k, pos] of ground) {
        if (dist(o.pos, pos) > far) continue;
        const p = previewAbility(grid, state, id, abilityId, pos, false, o.pos);
        if (p.ok && p.targets.length) add(k, { kind: 'tile', pos }, o, p);
      }
    }
    const order = { unit: 0, self: 1, tile: 2 };
    const targets = [...found.values()].sort(
      (x, y) =>
        order[x.kind] - order[y.kind] ||
        rank(state, actor, x) - rank(state, actor, y) ||
        dist(actor.pos, x.pos) - dist(actor.pos, y.pos),
    );
    if (targets.length) return { ability: abilityId, enabled: true, targets };
    // 'sight' outranks 'range': something was in reach but the path was blocked
    const reason: OptionReason = blocked ? 'sight' : centered || unwanted || !others.length ? 'no-target' : 'range';
    return { ability: abilityId, enabled: false, reason, targets: [] };
  });
}

// enemies before allies
const rank = (state: BattleState, actor: UnitState, t: ActionTarget) =>
  t.kind !== 'unit' ? 0 : state.units.find((u) => u.id === t.unit)!.team === actor.team ? 1 : 0;
