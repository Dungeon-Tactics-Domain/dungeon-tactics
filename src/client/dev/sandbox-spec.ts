// Scene spec of the sandbox (docs/sandbox.md): what a scripted screenshot opens and shows. Pure, shared by the page
// (dev/sandbox.ts) and the Node CLI (scripts/sandbox.mjs), so no DOM or Three here. Every check returns readable
// problems instead of a silent default: a typo in a spec must fail the shot, not produce a different picture.
import { ABILITIES } from '../../shared/battle/abilities.ts';
import type { Battle } from '../../shared/battle/battle.ts';
import type { PreviewReason } from '../../shared/battle/combat.ts';
import { canStand, type Grid, inBounds, posKey, subOf, tileAt } from '../../shared/battle/grid.ts';
import { footprint } from '../../shared/battle/pathing.ts';
import type { Spawn } from '../../shared/battle/scenarios.ts';
import type { BattleEvent, Pos, Team, UnitState } from '../../shared/battle/types.ts';
import { UNIT_DEFS } from '../../shared/battle/units.ts';

// HUD parts that `hide` accepts, by the class the HUD gives them (hud.ts, talk.ts, dialog.ts, main.ts)
export const PANELS = {
  tile: '.panel.tile-info',
  queue: '.panel.queue',
  help: '.panel.help',
  banner: '.panel.banner, .announce',
  tools: '.hud .tools',
  menu: '.panel.commands, .panel.abilities, .panel.confirm',
  units: '.active-slot, .target-slot',
  strikes: '.strikes',
  numbers: '.floats',
  fps: '.fps',
  dialogs: '.overlay',
} as const;
export type Panel = keyof typeof PANELS;
// 'all' is every panel; 'marks' is the 3D tile marks, cursor, range ring and shot line (not DOM)
export type Hidden = Panel | 'all' | 'marks';

export interface UnitPatch {
  x?: number;
  y?: number;
  facing?: number; // index in FACING (grid.ts): 0 +y, 1 +x, 2 -y, 3 -x
  hp?: number;
  ct?: number;
  remove?: true; // boot only: a unit removed on a live page would stay as a corpse
}
export interface NewUnit {
  id: string;
  def: string;
  team: Team;
  x: number;
  y: number;
}
export type ScreenSpec = 'menu' | 'abilities' | 'move' | 'facing' | { aim: string; target: Pos; confirm?: boolean };
export interface CameraSpec {
  angle?: number; // 0-7, one of the 8 rotations (45° each); 0 is the opening view
  zoom?: number; // 1 = the whole map, 2 = twice as close
  focus?: Pos; // tile in the middle of the view
  action?: { from: string; to: Pos }; // the strike camera, from that unit to the tile
}
// One played step (gameplay clips): the unit gets the turn if it does not have it, then walks, acts or ends its turn
export type Step =
  | { move: { unit: string; to: Pos } }
  | { act: { unit: string; ability: string; target: Pos } }
  | { wait: { unit: string; facing?: number } };
export interface SceneSpec {
  name?: string; // CLI: output file name (default: the spec file name)
  scenario?: string; // map or study id (?scenario=)
  stage?: number; // campaign stage (?stage=), unlocked for the shot
  path?: string; // any other page (world map, title) with no staged battle, e.g. "/?world"
  seed?: number; // battle dice; default 1
  lang?: 'pt' | 'en';
  viewport?: { width: number; height: number }; // CLI only
  format?: 'png' | 'webp'; // CLI only
  units?: Record<string, UnitPatch>;
  add?: NewUnit[]; // boot only: models load with the map
  actor?: string; // hero whose turn it is (default: the first hero)
  screen?: ScreenSpec;
  cursor?: Pos;
  camera?: CameraSpec;
  hide?: Hidden[];
  pixel?: 0 | 2 | 3 | 4;
  daylight?: number; // 0 night to 1 day (the light the Until Dawn mode and dark stages use)
  steps?: Step[]; // played in order by __sandbox.play (the CLI plays them after the scene settles)
}

const KEYS = [
  'name',
  'scenario',
  'stage',
  'path',
  'seed',
  'lang',
  'viewport',
  'format',
  'units',
  'add',
  'actor',
  'screen',
  'cursor',
  'camera',
  'hide',
  'pixel',
  'daylight',
  'steps',
];
const HIDDEN = new Set<string>([...Object.keys(PANELS), 'all', 'marks']);

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isInt = (v: unknown, min = -Infinity, max = Infinity): v is number =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const isPos = (v: unknown): v is Pos => isObj(v) && isInt(v.x, 0) && isInt(v.y, 0);

// Shape check of a spec read from JSON or a URL. The spec comes back as given (typed) when there is no problem.
export function parseSpec(raw: unknown): { spec: SceneSpec; problems: string[] } {
  const p: string[] = [];
  if (!isObj(raw)) return { spec: {}, problems: ['spec must be an object'] };
  const r = raw;
  for (const k of Object.keys(r)) if (!KEYS.includes(k)) p.push(`unknown key "${k}"`);
  const opened = ['scenario', 'stage', 'path'].filter((k) => r[k] !== undefined);
  if (opened.length > 1) p.push(`use only one of scenario, stage and path (got ${opened.join(', ')})`);
  if (r.name !== undefined && (typeof r.name !== 'string' || !/^[\w.-]+$/.test(r.name)))
    p.push('name: letters, digits, "-", "_" and "." only');
  if (r.scenario !== undefined && typeof r.scenario !== 'string') p.push('scenario must be a string');
  if (r.stage !== undefined && !isInt(r.stage, 0)) p.push('stage must be an integer ≥ 0');
  if (r.path !== undefined && (typeof r.path !== 'string' || !r.path.startsWith('/'))) p.push('path must start with /');
  if (r.seed !== undefined && !isInt(r.seed, 0)) p.push('seed must be an integer ≥ 0');
  if (r.lang !== undefined && r.lang !== 'pt' && r.lang !== 'en') p.push('lang must be "pt" or "en"');
  if (r.viewport !== undefined && !(isObj(r.viewport) && isInt(r.viewport.width, 200) && isInt(r.viewport.height, 200)))
    p.push('viewport must be { width, height } of at least 200 px');
  if (r.format !== undefined && r.format !== 'png' && r.format !== 'webp') p.push('format must be "png" or "webp"');
  if (r.units !== undefined) {
    if (!isObj(r.units)) p.push('units must map unit id to a patch');
    else
      for (const [id, u] of Object.entries(r.units)) {
        if (!isObj(u)) {
          p.push(`units.${id} must be an object`);
          continue;
        }
        for (const k of Object.keys(u))
          if (!['x', 'y', 'facing', 'hp', 'ct', 'remove'].includes(k)) p.push(`units.${id}: unknown key "${k}"`);
        if ((u.x !== undefined) !== (u.y !== undefined)) p.push(`units.${id}: give x and y together`);
        if (u.x !== undefined && u.y !== undefined && !(isInt(u.x, 0) && isInt(u.y, 0)))
          p.push(`units.${id}: x and y must be integers ≥ 0`);
        if (u.facing !== undefined && !isInt(u.facing, 0, 3)) p.push(`units.${id}: facing must be 0-3`);
        if (u.hp !== undefined && !isInt(u.hp, 1)) p.push(`units.${id}: hp must be an integer ≥ 1`);
        if (u.ct !== undefined && !isInt(u.ct, 0)) p.push(`units.${id}: ct must be an integer ≥ 0`);
        if (u.remove !== undefined && u.remove !== true) p.push(`units.${id}: remove must be true`);
      }
  }
  if (r.add !== undefined) {
    if (!Array.isArray(r.add)) p.push('add must be a list');
    else
      r.add.forEach((u, i) => {
        if (!isObj(u) || typeof u.id !== 'string' || !isInt(u.x, 0) || !isInt(u.y, 0))
          return p.push(`add[${i}] needs id, def, team, x and y`);
        if (typeof u.def !== 'string' || !UNIT_DEFS[u.def]) p.push(`add[${i}]: unknown def "${String(u.def)}"`);
        if (u.team !== 'hero' && u.team !== 'enemy') p.push(`add[${i}]: team must be "hero" or "enemy"`);
      });
  }
  if (r.actor !== undefined && typeof r.actor !== 'string') p.push('actor must be a unit id');
  const s = r.screen;
  if (
    s !== undefined &&
    !['menu', 'abilities', 'move', 'facing'].includes(s as string) &&
    !(
      isObj(s) &&
      typeof s.aim === 'string' &&
      isPos(s.target) &&
      (s.confirm === undefined || typeof s.confirm === 'boolean')
    )
  )
    p.push('screen must be menu, abilities, move, facing or { aim, target, confirm? }');
  if (r.cursor !== undefined && !isPos(r.cursor)) p.push('cursor must be { x, y }');
  const c = r.camera;
  if (c !== undefined) {
    if (!isObj(c)) p.push('camera must be an object');
    else {
      for (const k of Object.keys(c))
        if (!['angle', 'zoom', 'focus', 'action'].includes(k)) p.push(`camera: unknown key "${k}"`);
      if (c.angle !== undefined && !isInt(c.angle, 0, 7)) p.push('camera.angle must be 0-7');
      if (c.zoom !== undefined && !(typeof c.zoom === 'number' && c.zoom > 0)) p.push('camera.zoom must be > 0');
      if (c.focus !== undefined && !isPos(c.focus)) p.push('camera.focus must be { x, y }');
      if (c.action !== undefined && !(isObj(c.action) && typeof c.action.from === 'string' && isPos(c.action.to)))
        p.push('camera.action must be { from: unit id, to: { x, y } }');
    }
  }
  if (r.hide !== undefined && !(Array.isArray(r.hide) && r.hide.every((h) => HIDDEN.has(h))))
    p.push(`hide entries must be among ${[...HIDDEN].join(', ')}`);
  if (r.pixel !== undefined && ![0, 2, 3, 4].includes(r.pixel as number)) p.push('pixel must be 0, 2, 3 or 4');
  if (r.daylight !== undefined && !(typeof r.daylight === 'number' && r.daylight >= 0 && r.daylight <= 1))
    p.push('daylight must be between 0 and 1');
  if (r.steps !== undefined) {
    if (!Array.isArray(r.steps)) p.push('steps must be a list');
    else r.steps.forEach((st, i) => p.push(...stepShape(st, `steps[${i}]`)));
  }
  return { spec: p.length ? {} : (r as SceneSpec), problems: p };
}

const STEP_KEYS: Record<string, string[]> = {
  move: ['unit', 'to'],
  act: ['unit', 'ability', 'target'],
  wait: ['unit', 'facing'],
};
function stepShape(st: unknown, at: string): string[] {
  const kinds = isObj(st) ? Object.keys(st) : [];
  if (kinds.length !== 1 || !STEP_KEYS[kinds[0]]) return [`${at} must be one of { move }, { act } or { wait }`];
  const k = kinds[0];
  const v = (st as Record<string, unknown>)[k];
  if (!isObj(v)) return [`${at}.${k} must be an object`];
  const p: string[] = [];
  for (const key of Object.keys(v)) if (!STEP_KEYS[k].includes(key)) p.push(`${at}.${k}: unknown key "${key}"`);
  if (typeof v.unit !== 'string') p.push(`${at}.${k}.unit must be a unit id`);
  if (k === 'move' && !isPos(v.to)) p.push(`${at}.move.to must be { x, y }`);
  if (k === 'act' && !(typeof v.ability === 'string' && ABILITIES[v.ability]))
    p.push(`${at}.act: unknown ability "${String(v.ability)}"`);
  if (k === 'act' && !isPos(v.target)) p.push(`${at}.act.target must be { x, y }`);
  if (k === 'wait' && v.facing !== undefined && !isInt(v.facing, 0, 3)) p.push(`${at}.wait.facing must be 0-3`);
  return p;
}

// Address of the page a spec opens; the spec rides along in ?sandbox= so a reload shows the same scene
export function specUrl(spec: SceneSpec): string {
  if (spec.path) return spec.path;
  const q = new URLSearchParams();
  if (spec.stage !== undefined) q.set('stage', String(spec.stage));
  else if (spec.scenario) q.set('scenario', spec.scenario);
  q.set('sandbox', JSON.stringify(spec));
  return `/?${q}`;
}

// Saves the page must find before it loads: the language (read once at import) and the stage unlocked (a locked stage
// sends the page back to the world map); a world map path needs a hero, otherwise the new-game intro opens
export function storageFor(spec: SceneSpec): Record<string, string> {
  const out: Record<string, string> = {};
  if (spec.lang) out['dt:lang'] = spec.lang;
  if (spec.stage !== undefined) out['dt:campaign'] = String(spec.stage);
  if (spec.path?.includes('world')) out['dt:hero'] = JSON.stringify({ name: 'Sandbox', cls: 'warrior' });
  return out;
}

// Specs are written in whole tiles (docs/sandbox.md), but every game battle runs split since Nov 14 (half.ts): there a
// tile is k x k cells and its spot is the corner cell of its square, where `halve` puts the spawns (Nov 14 review)
export function inCells(spec: SceneSpec, k: number): SceneSpec {
  if (k === 1) return spec;
  const c = (p: Pos) => ({ x: p.x * k, y: p.y * k });
  const { units, add, screen, cursor, camera } = spec;
  return {
    ...spec,
    ...(units && {
      units: Object.fromEntries(
        Object.entries(units).map(([id, u]) => [
          id,
          u.x !== undefined && u.y !== undefined ? { ...u, ...c({ x: u.x, y: u.y }) } : u,
        ]),
      ),
    }),
    ...(add && { add: add.map((a) => ({ ...a, ...c(a) })) }),
    ...(typeof screen === 'object' && { screen: { ...screen, target: c(screen.target) } }),
    ...(cursor && { cursor: c(cursor) }),
    ...(camera && {
      camera: {
        ...camera,
        ...(camera.focus && { focus: c(camera.focus) }),
        ...(camera.action && { action: { ...camera.action, to: c(camera.action.to) } }),
      },
    }),
  };
}

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
      : [],
  );
}

// Where a unit may stand: every tile of its footprint inside the map, walkable, not a pass-through tile, and nobody
// else on it (deep water is allowed: the rules let a unit stand there). Named in whole tiles like the spec, once per tile
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
