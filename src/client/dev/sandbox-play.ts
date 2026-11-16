import { Battle } from '../../shared/battle/battle.ts';
import type { PreviewReason } from '../../shared/battle/combat.ts';
import { canStand, type Grid, inBounds, posKey, subOf, tileAt } from '../../shared/battle/grid.ts';
import { footprint, restsOn } from '../../shared/battle/pathing.ts';
import type { Spawn } from '../../shared/battle/scenarios.ts';
import type { BattleEvent, BattleState, Pos, UnitState } from '../../shared/battle/types.ts';
import { baseDef, UNIT_DEFS } from '../../shared/battle/units.ts';
import type { SceneSpec, Step, UnitPatch } from './sandbox-spec.ts';

// The cast the staged battle starts from: spawns removed, moved and added by the spec
export function castOf(spawns: Spawn[], spec: SceneSpec): { spawns: Spawn[]; problems: string[] } {
  const p: string[] = [];
  const units = spec.units ?? {};
  for (const id of Object.keys(units))
    if (!spawns.some((s) => s.id === id)) p.push(`units: no unit "${id}" on this map`);
  const out = spawns
    .filter((s) => !units[s.id]?.remove)
    .map((s) => {
      const u = units[s.id];
      return u?.x !== undefined && u.y !== undefined ? { ...s, x: u.x, y: u.y } : s;
    });
  for (const a of spec.add ?? []) {
    if (out.some((s) => s.id === a.id)) p.push(`add: id "${a.id}" is already on the map`);
    out.push({ id: a.id, def: a.def, team: a.team, x: a.x, y: a.y });
  }
  return { spawns: out, problems: p };
}

// The patch applied to live units (position, facing, HP, CT); removing or adding is boot only
export function patchUnits(
  units: UnitState[],
  patch: Record<string, UnitPatch>,
): { units: UnitState[]; problems: string[] } {
  const p: string[] = [];
  for (const [id, u] of Object.entries(patch)) {
    if (!units.some((x) => x.id === id)) p.push(`units: no unit "${id}" on this map`);
    if (u.remove) p.push(`units.${id}: remove only works when the scene loads`);
  }
  const out = units.map((u) => {
    const c = patch[u.id];
    if (!c) return u;
    return {
      ...u,
      ...(c.x !== undefined && c.y !== undefined && { pos: { x: c.x, y: c.y } }),
      ...(c.facing !== undefined && { facing: c.facing }),
      ...(c.hp !== undefined && { hp: c.hp }),
      ...(c.ct !== undefined && { ct: c.ct }),
    };
  });
  return { units: out, problems: p };
}

// Tiles the spec points at (cursor, focus, aim, action camera) inside the map: off the map the game would throw mid-boot.
// The spec is in whole tiles, so a split map is measured in whole tiles too
export function offMap(grid: Grid, spec: SceneSpec): string[] {
  const k = subOf(grid);
  const c = spec.screen;
  const at: [string, Pos | undefined][] = [
    ['cursor', spec.cursor],
    ...Object.entries(spec.units ?? {}).map(([id, u]): [string, Pos | undefined] => [
      `units.${id}`,
      u.x !== undefined && u.y !== undefined ? { x: u.x, y: u.y } : undefined,
    ]),
    ['camera.focus', spec.camera?.focus],
    ['camera.action.to', spec.camera?.action?.to],
    ['screen.target', typeof c === 'object' ? c.target : undefined],
    ...(spec.steps ?? []).map((st, i): [string, Pos | undefined] =>
      'move' in st
        ? [`steps[${i}].move.to`, st.move.to]
        : 'act' in st
          ? [`steps[${i}].act.target`, st.act.target]
          : ['', undefined],
    ),
  ];
  return at.flatMap(([name, p]) =>
    p && !inBounds(grid, { x: p.x * k, y: p.y * k })
      ? [`${name}: ${p.x},${p.y} is outside the ${grid.width / k}x${grid.height / k} map`]
      : p && !(Number.isInteger(p.x * k) && Number.isInteger(p.y * k))
        ? [`${name}: ${p.x},${p.y} is between tiles, and this map has no half tiles`]
        : [],
  );
}

// Where a unit may stand: every tile of its footprint inside the map, walkable, not a pass-through tile, nobody
// else on it and, for a token, even ground (deep water is allowed: the rules let a unit stand there). Named in whole tiles like the spec, once per tile
export function placementProblems(grid: Grid, units: UnitState[]): string[] {
  const p: string[] = [];
  const k = subOf(grid),
    W = grid.width / k,
    H = grid.height / k;
  const taken = new Map<string, string>();
  for (const u of units)
    for (const f of footprint(u)) {
      const at = `${Math.floor(f.x / k)},${Math.floor(f.y / k)}`;
      if (!inBounds(grid, f)) {
        p.push(`${u.id}: tile ${at} is outside the ${W}x${H} map`);
        continue;
      }
      const t = tileAt(grid, f);
      if (!canStand(t) || t.noStop) p.push(`${u.id}: cannot stand on ${at} (${t.terrain})`);
      const other = taken.get(posKey(f));
      if (other) p.push(`${u.id}: tile ${at} is taken by ${other}`);
      taken.set(posKey(f), u.id);
    }
  // a token stops only on even ground (restsOn), so a spec cannot start one where the game never leaves it
  for (const u of units)
    if (
      k > 1 &&
      (UNIT_DEFS[baseDef(u.def)].size ?? 1) === 1 &&
      footprint(u).every((f) => inBounds(grid, f)) &&
      !restsOn(grid, u.pos, k)
    )
      p.push(`${u.id}: ${u.pos.x / k},${u.pos.y / k} is not on even ground`);
  return [...new Set(p)];
}

// Puts the unit on the turn as if the queue had reached it. Only units that play (the Beacon never has a turn); the
// scene's actor must be a hero (`heroes`), so the AI never plays the opening turn, while a step may move an enemy
export function giveTurn(b: Battle, id: string, heroes = false): string | null {
  const u = b.state.units.find((x) => x.id === id);
  if (!u || UNIT_DEFS[u.def].speed <= 0 || (heroes && u.team !== 'hero'))
    return `"${id}" is not a ${heroes ? 'hero' : 'unit'} that plays on this map`;
  b.state.turn = { actor: u.id, moved: false, usedAbility: null };
  return null;
}

// every reason Battle.preview may give, so a new one is a type error here instead of a raw code in the message
const WHY: Record<PreviewReason, string> = {
  unknown: 'not one of its abilities',
  range: 'out of range',
  sight: 'no line of sight',
  'no-target': 'nobody to hit there',
  spent: 'cannot pay its cost',
  water: 'it stands in deep water',
};

// One step through the same Battle calls the turn screen makes (interaction.ts `confirm` for move and act; `face` and
// `endTurn` for wait, without the AI turns that follow in the game). A step that would do nothing is a named problem:
// a clip must not record a step that silently failed. Its tiles are whole like the rest of the spec: on a split map they
// become the corner cell of their square (as `inCells` does), and the problems name them as written
export function playStep(b: Battle, step: Step): { events: BattleEvent[]; problem: string | null } {
  const fail = (problem: string) => ({ events: [], problem });
  if ('pause' in step) return { events: [], problem: null }; // the page waits it out on the battle clock
  const k = subOf(b.grid),
    cell = (p: Pos) => ({ x: p.x * k, y: p.y * k });
  const s = 'move' in step ? step.move : 'act' in step ? step.act : step.wait;
  if (b.over) return fail('the battle is already over');
  const turn = b.state.turn.actor === s.unit ? null : giveTurn(b, s.unit);
  if (turn) return fail(turn);
  if ('move' in step) {
    const events = b.move(cell(step.move.to));
    if (!events.length) return fail(`${s.unit} cannot reach ${step.move.to.x},${step.move.to.y}`);
    // fell to a counter-attack on the way: the turn passes by itself, as in Game.execute
    if (!b.state.units.some((u) => u.id === s.unit)) events.push(...b.endTurn());
    return { events, problem: null };
  }
  if ('act' in step) {
    const { ability, target } = step.act;
    if (b.state.turn.usedAbility) return fail(`${s.unit} already acted this turn`);
    const { ok, reason = 'unknown' } = b.preview(ability, cell(target));
    if (!ok) return fail(`${s.unit} cannot use ${ability} on ${target.x},${target.y}: ${WHY[reason]}`);
    return { events: b.act(ability, cell(target)), problem: null };
  }
  if (step.wait.facing !== undefined) b.face(step.wait.facing);
  return { events: b.endTurn(), problem: null };
}

// Loop: the battle back where it started (positions, HP, facing, the dead alive again, the same dice), as a fresh Battle on
// that state, so no undo history carries over from the round before
export const rewind = (b: Battle, start: BattleState) => Object.assign(b, new Battle(b.grid, structuredClone(start)));

// camera.fixed "side" with no angle: the view across the first step's line, so the body is seen in profile
// (angle 7 looks along the columns, for a move along a row; angle 1 the other way)
export const sideAngle = (from: Pos, to: Pos) => (Math.abs(to.x - from.x) >= Math.abs(to.y - from.y) ? 7 : 1);
