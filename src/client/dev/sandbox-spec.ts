// Scene spec of the sandbox (docs/sandbox.md): what a scripted screenshot opens and shows. Pure, shared by the page
// (dev/sandbox.ts) and the Node CLI (scripts/sandbox.mjs), so no DOM or Three here. Every check returns readable
// problems instead of a silent default: a typo in a spec must fail the shot, not produce a different picture.
import { canStand, type Grid, inBounds, posKey, tileAt } from '../../shared/battle/grid.ts';
import { footprint } from '../../shared/battle/pathing.ts';
import type { Spawn } from '../../shared/battle/scenarios.ts';
import type { Pos, Team, UnitState } from '../../shared/battle/types.ts';
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
  return { spec: p.length ? {} : (r as SceneSpec), problems: p };
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

// Tiles the spec points at (cursor, focus, aim, action camera) inside the map: off the map the game would throw mid-boot
export function offMap(grid: Grid, spec: SceneSpec): string[] {
  const c = spec.screen;
  const at: [string, Pos | undefined][] = [
    ['cursor', spec.cursor],
    ['camera.focus', spec.camera?.focus],
    ['camera.action.to', spec.camera?.action?.to],
    ['screen.target', typeof c === 'object' ? c.target : undefined],
  ];
  return at.flatMap(([k, p]) =>
    p && !inBounds(grid, p) ? [`${k}: ${p.x},${p.y} is outside the ${grid.width}x${grid.height} map`] : [],
  );
}

// Where a unit may stand: every tile of its footprint inside the map, walkable, not a pass-through tile, and nobody
// else on it (deep water is allowed: the rules let a unit stand there)
export function placementProblems(grid: Grid, units: UnitState[]): string[] {
  const p: string[] = [];
  const taken = new Map<string, string>();
  for (const u of units)
    for (const f of footprint(u)) {
      if (!inBounds(grid, f)) {
        p.push(`${u.id}: tile ${f.x},${f.y} is outside the ${grid.width}x${grid.height} map`);
        continue;
      }
      const t = tileAt(grid, f);
      if (!canStand(t) || t.noStop) p.push(`${u.id}: cannot stand on ${f.x},${f.y} (${t.terrain})`);
      const other = taken.get(posKey(f));
      if (other) p.push(`${u.id}: tile ${f.x},${f.y} is taken by ${other}`);
      taken.set(posKey(f), u.id);
    }
  return p;
}
