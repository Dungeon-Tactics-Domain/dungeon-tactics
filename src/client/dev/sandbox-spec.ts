// Scene spec of the sandbox (docs/sandbox.md): what a scripted screenshot opens and shows. Pure, shared by the page
// (dev/sandbox.ts) and the Node CLI (scripts/sandbox.mjs), so no DOM or Three here. Every check returns readable
// problems instead of a silent default: a typo in a spec must fail the shot, not produce a different picture.
import { CRAWL_THEMES } from '../../content/crawl/rooms.ts';
import { ABILITIES } from '../../shared/battle/abilities.ts';
import type { Pos, Team } from '../../shared/battle/types.ts';
import { UNIT_DEFS } from '../../shared/battle/units.ts';
import { MARK_STYLES, type MarkStyle } from '../mark-style.ts';
import { TIMING } from '../timing.ts';
import { PIECE_NAMES, type PieceName } from '../ui-pieces.ts';
import { LAYOUT_MODES, type LayoutMode } from '../ui3d/layout.ts';

// What `hide` accepts beside a piece's own name (ui-pieces.ts): the names from before the interface was 3D, each with
// the pieces of the 3D layer it stands for. One with no piece yet names only HTML still on the page (sandbox-html.ts)
export const PANELS = {
  tile: [],
  queue: ['turn'],
  help: [],
  banner: ['banner'],
  tools: ['tools'],
  menu: ['menu'],
  units: ['bar'],
  strikes: [],
  numbers: [],
  fps: [],
  dialogs: ['result', 'status', 'options', 'title', 'sheets'],
} as const satisfies Record<string, readonly PieceName[]>;
export type Panel = keyof typeof PANELS;
// 'all' is every panel and piece; 'marks' is the board's tile marks, cursor, range ring and shot line
export type Hidden = Panel | PieceName | 'all' | 'marks';
// The pieces a `hide` list hides, by name. The drawing guides are no part of the interface: only their own name hides them
export function hiddenPieces(hide: readonly Hidden[]): PieceName[] {
  if (hide.includes('all')) return PIECE_NAMES.filter((n) => n !== 'guides' || hide.includes(n));
  const of = (h: Hidden): readonly PieceName[] =>
    h in PANELS ? PANELS[h as Panel] : PIECE_NAMES.includes(h as PieceName) ? [h as PieceName] : [];
  return [...new Set(hide.flatMap(of))];
}

export interface UnitPatch {
  x?: number;
  y?: number;
  facing?: number; // index in FACING (grid.ts): 0 +y, 1 +x, 2 -y, 3 -x
  hp?: number;
  ct?: number;
  hpRegen?: number; // boot only: life back each turn, set on the unit's sheet (every unit of that sheet gets it)
  remove?: true; // boot only: a unit removed on a live page would stay as a corpse
}
export interface NewUnit {
  id: string;
  def: string;
  team: Team;
  x: number;
  y: number;
}
// `{ aim, target }`: the Agir tile screen of that ability on the unit at `target` (or its ground tile), with its forecast
export type ScreenSpec = 'menu' | 'move' | 'facing' | { aim: string; target: Pos };
export interface CameraSpec {
  angle?: number; // 0-7, one of the 8 rotations (45° each); 0 is the opening view
  zoom?: number; // 1 = the whole map, 2 = twice as close
  focus?: Pos; // tile in the middle of the view
  action?: { from: string; to: Pos }; // the strike camera, from that unit to the tile
  fixed?: 'side' | 'three-quarter'; // bench: this tilt the whole time, no action camera and no slide to whoever acts
}
// One played step (gameplay clips): the unit gets the turn if it does not have it, then walks, acts or ends its turn
export type Step =
  | { move: { unit: string; to: Pos } }
  | { act: { unit: string; ability: string; target: Pos } }
  | { wait: { unit: string; facing?: number } }
  | { pause: number }; // ms of battle clock (slows down and stops with `speed` and pause)
export interface SceneSpec {
  name?: string; // CLI: output file name (default: the spec file name)
  scenario?: string; // map or study id (?scenario=)
  crawl?: { seed: number; depth?: number; boss?: boolean; theme?: string }; // a dungeon crawl room (?crawl=)
  path?: string; // any other page (title, town) with no staged battle, e.g. "/?home"
  seed?: number; // battle dice; default 1
  lang?: 'pt' | 'en';
  viewport?: { width: number; height: number }; // CLI only
  touch?: boolean; // CLI only: a finger points ((pointer: coarse)), the phone and tablet layout
  format?: 'png' | 'webp'; // CLI only
  units?: Record<string, UnitPatch>;
  add?: NewUnit[]; // boot only: models load with the map
  actor?: string; // hero whose turn it is (default: the first hero)
  screen?: ScreenSpec;
  cursor?: Pos;
  camera?: CameraSpec;
  hide?: Hidden[];
  daylight?: number; // 0 night to 1 day (the light the Until Dawn mode uses)
  steps?: Step[]; // played in order by __sandbox.play (the CLI plays them after the scene settles)
  loop?: boolean; // bench: the page plays the steps by itself, then rewinds the scene and plays them again, forever
  timing?: Partial<Record<keyof typeof TIMING, number>>; // bench: TIMING values for this page only
  speed?: number; // bench: battle clock rate, 0.25 is slow motion
  layout?: LayoutMode; // edges or frame (ui3d/layout.ts), as ?layout= in the address
  marks?: MarkStyle; // how the board's marks are drawn (mark-style.ts), as ?marks= in the address
}

const KEYS = [
  'name',
  'scenario',
  'path',
  'crawl',
  'seed',
  'lang',
  'viewport',
  'touch',
  'format',
  'units',
  'add',
  'actor',
  'screen',
  'cursor',
  'camera',
  'hide',
  'daylight',
  'steps',
  'loop',
  'timing',
  'speed',
  'layout',
  'marks',
];
const HIDDEN = new Set<string>([...Object.keys(PANELS), ...PIECE_NAMES, 'all', 'marks']);

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isInt = (v: unknown, min = -Infinity, max = Infinity): v is number =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const isPos = (v: unknown): v is Pos => isObj(v) && isInt(v.x, 0) && isInt(v.y, 0);
// the cursor may stand between tiles (x.5), where a 2x2 token can stop on the split map: the Move preview of its square
const isHalfPos = (v: unknown): v is Pos => isObj(v) && isInt(2 * (v.x as number), 0) && isInt(2 * (v.y as number), 0);

// Shape check of a spec read from JSON or a URL. The spec comes back as given (typed) when there is no problem.
export function parseSpec(raw: unknown): { spec: SceneSpec; problems: string[] } {
  const p: string[] = [];
  if (!isObj(raw)) return { spec: {}, problems: ['spec must be an object'] };
  const r = raw;
  for (const k of Object.keys(r)) if (!KEYS.includes(k)) p.push(`unknown key "${k}"`);
  const opened = ['scenario', 'crawl', 'path'].filter((k) => r[k] !== undefined);
  if (opened.length > 1) p.push(`use only one of scenario, crawl and path (got ${opened.join(', ')})`);
  if (r.name !== undefined && (typeof r.name !== 'string' || !/^[\w.-]+$/.test(r.name)))
    p.push('name: letters, digits, "-", "_" and "." only');
  if (r.scenario !== undefined && typeof r.scenario !== 'string') p.push('scenario must be a string');
  if (r.path !== undefined && (typeof r.path !== 'string' || !r.path.startsWith('/'))) p.push('path must start with /');
  const room = r.crawl;
  if (
    room !== undefined &&
    !(
      isObj(room) &&
      Object.keys(room).every((k) => ['seed', 'depth', 'boss', 'theme'].includes(k)) &&
      isInt(room.seed, 0) &&
      (room.depth === undefined || isInt(room.depth, 1)) &&
      (room.boss === undefined || typeof room.boss === 'boolean') &&
      (room.theme === undefined || (typeof room.theme === 'string' && Object.hasOwn(CRAWL_THEMES, room.theme)))
    )
  )
    p.push(`crawl must be { seed, depth?, boss?, theme? } with theme among ${Object.keys(CRAWL_THEMES).join(', ')}`);
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
          if (!['x', 'y', 'facing', 'hp', 'ct', 'hpRegen', 'remove'].includes(k))
            p.push(`units.${id}: unknown key "${k}"`);
        if ((u.x !== undefined) !== (u.y !== undefined)) p.push(`units.${id}: give x and y together`);
        // x.5 too: a token stands between tiles on the split map, as the AI and a push leave it
        if (u.x !== undefined && u.y !== undefined && !isHalfPos(u))
          p.push(`units.${id}: x and y must be whole or x.5, ≥ 0`);
        if (u.facing !== undefined && !isInt(u.facing, 0, 3)) p.push(`units.${id}: facing must be 0-3`);
        if (u.hp !== undefined && !isInt(u.hp, 1)) p.push(`units.${id}: hp must be an integer ≥ 1`);
        if (u.ct !== undefined && !isInt(u.ct, 0)) p.push(`units.${id}: ct must be an integer ≥ 0`);
        if (u.hpRegen !== undefined && !isInt(u.hpRegen, 0)) p.push(`units.${id}: hpRegen must be an integer ≥ 0`);
        if (u.remove !== undefined && u.remove !== true) p.push(`units.${id}: remove must be true`);
      }
  }
  if (r.add !== undefined) {
    if (!Array.isArray(r.add)) p.push('add must be a list');
    else
      r.add.forEach((u, i) => {
        if (!isObj(u) || typeof u.id !== 'string' || !isInt(u.x, 0) || !isInt(u.y, 0))
          return p.push(`add[${i}] needs id, def, team, x and y`);
        if (typeof u.def !== 'string' || !Object.hasOwn(UNIT_DEFS, u.def))
          p.push(`add[${i}]: unknown def "${String(u.def)}"`);
        if (u.team !== 'hero' && u.team !== 'enemy') p.push(`add[${i}]: team must be "hero" or "enemy"`);
      });
  }
  if (r.actor !== undefined && typeof r.actor !== 'string') p.push('actor must be a unit id');
  const s = r.screen;
  if (
    s !== undefined &&
    !['menu', 'move', 'facing'].includes(s as string) &&
    !(isObj(s) && typeof s.aim === 'string' && isPos(s.target))
  )
    p.push('screen must be menu, move, facing or { aim, target }');
  if (r.cursor !== undefined && !isHalfPos(r.cursor)) p.push('cursor must be { x, y } (whole or x.5)');
  const c = r.camera;
  if (c !== undefined) {
    if (!isObj(c)) p.push('camera must be an object');
    else {
      for (const k of Object.keys(c))
        if (!['angle', 'zoom', 'focus', 'action', 'fixed'].includes(k)) p.push(`camera: unknown key "${k}"`);
      if (c.angle !== undefined && !isInt(c.angle, 0, 7)) p.push('camera.angle must be 0-7');
      if (c.zoom !== undefined && !(typeof c.zoom === 'number' && c.zoom > 0)) p.push('camera.zoom must be > 0');
      if (c.focus !== undefined && !isPos(c.focus)) p.push('camera.focus must be { x, y }');
      if (c.action !== undefined && !(isObj(c.action) && typeof c.action.from === 'string' && isPos(c.action.to)))
        p.push('camera.action must be { from: unit id, to: { x, y } }');
      if (c.fixed !== undefined && c.fixed !== 'side' && c.fixed !== 'three-quarter')
        p.push('camera.fixed must be "side" or "three-quarter"');
      if (c.fixed !== undefined && c.action !== undefined)
        p.push('camera.fixed turns the action camera off: drop action');
    }
  }
  if (r.hide !== undefined && !(Array.isArray(r.hide) && r.hide.every((h) => HIDDEN.has(h))))
    p.push(`hide entries must be among ${[...HIDDEN].join(', ')}`);
  if (r.daylight !== undefined && !(typeof r.daylight === 'number' && r.daylight >= 0 && r.daylight <= 1))
    p.push('daylight must be between 0 and 1');
  if (r.steps !== undefined) {
    if (!Array.isArray(r.steps)) p.push('steps must be a list');
    else r.steps.forEach((st, i) => p.push(...stepShape(st, `steps[${i}]`)));
  }
  if (r.loop !== undefined && typeof r.loop !== 'boolean') p.push('loop must be true or false');
  if (r.loop && !(Array.isArray(r.steps) && r.steps.length)) p.push('loop needs steps to play');
  if (r.timing !== undefined) {
    if (!isObj(r.timing)) p.push('timing must map a TIMING name to ms');
    else
      for (const [k, v] of Object.entries(r.timing)) {
        if (!Object.hasOwn(TIMING, k)) p.push(`timing: unknown key "${k}" (one of ${Object.keys(TIMING).join(', ')})`);
        // > 0: shake, jumpCrouch and jumpLand divide
        else if (!(typeof v === 'number' && v > 0 && v <= 10000)) p.push(`timing.${k} must be ms above 0, up to 10000`);
      }
  }
  if (r.speed !== undefined && !(typeof r.speed === 'number' && r.speed > 0 && r.speed <= 4))
    p.push('speed must be above 0, up to 4 (pause with __sandbox.pause)');
  if (r.layout !== undefined && !LAYOUT_MODES.includes(r.layout as LayoutMode))
    p.push(`layout must be one of ${LAYOUT_MODES.join(', ')}`);
  if (r.marks !== undefined && !MARK_STYLES.includes(r.marks as MarkStyle))
    p.push(`marks must be one of ${MARK_STYLES.join(', ')}`);
  return { spec: p.length ? {} : (r as SceneSpec), problems: p };
}

const STEP_KEYS: Record<string, string[]> = {
  move: ['unit', 'to'],
  act: ['unit', 'ability', 'target'],
  wait: ['unit', 'facing'],
};
function stepShape(st: unknown, at: string): string[] {
  const kinds = isObj(st) ? Object.keys(st) : [];
  if (kinds.length === 1 && kinds[0] === 'pause')
    return isInt((st as { pause: unknown }).pause, 0, 60000) ? [] : [`${at}.pause must be ms from 0 to 60000`];
  if (kinds.length !== 1 || !STEP_KEYS[kinds[0]])
    return [`${at} must be one of { move }, { act }, { wait } or { pause }`];
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
  if (spec.scenario) q.set('scenario', spec.scenario);
  else if (spec.crawl) {
    q.set('crawl', String(spec.crawl.seed));
    if (spec.crawl.depth) q.set('depth', String(spec.crawl.depth));
    if (spec.crawl.boss) q.set('boss', '1');
    if (spec.crawl.theme) q.set('theme', spec.crawl.theme);
  }
  q.set('sandbox', JSON.stringify(spec));
  return `/?${q}`;
}

// Saves the page must find before it loads: the language (read once at import)
export function storageFor(spec: SceneSpec): Record<string, string> {
  const out: Record<string, string> = {};
  if (spec.lang) out['dt:lang'] = spec.lang;
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

// ?sandbox= holds the spec in one of three forms (docs/sandbox.md): JSON as is (percent-encoded), the name of a spec file
// under scripts/sandbox/ ending in .json (base64url has no "."), or base64url JSON
export function readParam(v: string): { json: string } | { file: string } {
  if (v.trimStart().startsWith('{')) return { json: v };
  if (/^[\w-]+(\/[\w-]+)*\.json$/.test(v)) return { file: `/scripts/sandbox/${v}` };
  const bytes = Uint8Array.from(atob(v.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0));
  return { json: new TextDecoder().decode(bytes) };
}
// the base64url form of a spec, for an address that needs no escaping
export const specParam = (spec: SceneSpec) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(spec))))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
