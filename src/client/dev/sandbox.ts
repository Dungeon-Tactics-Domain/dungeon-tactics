// Sandbox (docs/sandbox.md): a battle staged from a scene spec, for screenshots and the UX lab, scripted through
// window.__sandbox. Loaded only on localhost with ?sandbox= (entry.ts), as its own chunk: the online game never fetches it.
// The map, the cast, the dice and the language are fixed when the page loads (`stage`); everything else changes live (`apply`).
import { Battle } from '../../shared/battle/battle.ts';
import { samePos, subOf } from '../../shared/battle/grid.ts';
import { HALF, halfDef, halve } from '../../shared/battle/half.ts';
import { unitAt } from '../../shared/battle/pathing.ts';
import { SCENARIOS, type Scenario } from '../../shared/battle/scenarios.ts';
import type { UnitState } from '../../shared/battle/types.ts';
import { UNIT_DEFS } from '../../shared/battle/units.ts';
import { type ActTarget, actActions, bestSpot } from '../act-flow.ts';
import { type Screen, startScreen } from '../command.ts';
import { freshUi, hoverTile, selectMode, type Ui } from '../interaction.ts';
import type { Game } from '../main.ts';
import { showMarkStyle } from '../mark-style.ts';
import type { BattleScene } from '../scene.ts';
import { param, store } from '../store.ts';
import { bench, TIMING } from '../timing.ts';
import { hidePieces, PIECE_NAMES } from '../ui-pieces.ts';
import { ARENA } from './arena.ts';
import { hideHtml } from './sandbox-html.ts';
import {
  castOf,
  giveTurn,
  offMap,
  patchUnits,
  placementProblems,
  playStep,
  rewind,
  sideAngle,
} from './sandbox-play.ts';
import {
  hiddenPieces,
  inCells,
  PANELS,
  parseSpec,
  readParam,
  type SceneSpec,
  type Step,
  specUrl,
  storageFor,
} from './sandbox-spec.ts';

interface SandboxApi {
  ready: boolean;
  spec: SceneSpec;
  problems: string[];
  apply(spec: SceneSpec): string[];
  load(spec: SceneSpec): string[];
  list(): unknown;
  idle(): Promise<void>;
  play(steps: Step | Step[]): Promise<string[]>;
  pause(): void;
  step(): Promise<void>; // one frame of the battle clock, then paused again
  resume(): void;
}
declare global {
  interface Window {
    __sandbox?: SandboxApi;
  }
}

// a hand-typed address may carry broken JSON: it becomes a problem, not a page that never boots. A spec file name is
// fetched from the dev server, which serves the project's files (in stage, not at the top: a top-level await here made the
// build split modules shared with the game into chunks of their own)
async function readSpec(): Promise<{ spec: SceneSpec; problems: string[] }> {
  try {
    const at = readParam(param('sandbox') || '{}');
    if ('json' in at) return parseSpec(JSON.parse(at.json));
    const file = await fetch(at.file);
    return file.ok ? parseSpec(await file.json()) : { spec: {}, problems: [`?sandbox=: no spec file ${at.file}`] };
  } catch {
    return { spec: {}, problems: ['?sandbox= is not JSON, base64url JSON or a spec file name ending in .json'] };
  }
}
let spec: SceneSpec = {};
const problems: string[] = [];
const asked = param('scenario');
const arena = asked === ARENA.id;
let battle: Battle;
let view: BattleScene;
let castFits = true;

// Before the scene exists: the spec's cast on the map, its dice, and a hero on the turn (otherwise the AI would play
// the opening enemy turn while the shot is taken). A cast that does not fit falls back to the map's own. On a split map
// the spec's whole tiles become cells and an added sheet becomes its token, as `halve` does for the map's own spawns.
export async function stage(selected: Scenario): Promise<{ scenario: Scenario; battle: Battle; spec: SceneSpec }> {
  const read = await readSpec();
  spec = read.spec;
  problems.push(...read.problems);
  // the page's map comes from the address (boot.ts), so a spec that names another one is an error, not a different map
  if (spec.scenario && spec.scenario !== asked)
    problems.push(`scenario: the address opens "${asked ?? '(none)'}", the spec says "${spec.scenario}"`);
  // the arena is for the body only: no turn list
  if (arena) spec.hide = [...new Set([...(spec.hide ?? []), 'queue' as const])];
  // the board's marks in the spec's style, before the scene builds them; the address's ?marks= wins
  if (spec.marks && param('marks') === null) showMarkStyle(spec.marks);
  // this page's pace (bench): the TIMING the scene and the game read, and the battle clock's rate
  Object.assign(TIMING, spec.timing);
  bench.scale = spec.speed ?? 1;
  // the arena is registered whole too: the scene finds a split map's mood through it (ambience.ts kindOf)
  if (arena) SCENARIOS[ARENA.id] = ARENA;
  const base = arena ? halve(ARENA) : selected;
  const k = subOf(base.grid);
  const cells = inCells(spec, k);
  // a token sheet copied from list() (soldier½) stays as it is
  if (k > 1) cells.add = cells.add?.map((a) => ({ ...a, def: a.def.endsWith(HALF) ? a.def : halfDef(a.def) }));
  // a unit off the map falls back to the map's own cast (every battle is split since Nov 15, so x.5 always fits)
  const off = offMap(base.grid, { units: spec.units });
  const cast = off.length ? { spawns: base.spawns, problems: off } : castOf(base.spawns, cells);
  const scenario = { ...base, spawns: cast.spawns };
  battle = Battle.start(scenario, spec.seed ?? 1);
  const bad = [...cast.problems, ...placementProblems(battle.grid, battle.state.units)];
  if (bad.length) {
    problems.push(...bad);
    castFits = false;
    battle = Battle.start(base, spec.seed ?? 1);
  }
  const turn = takeTurn(spec.actor ?? battle.state.units.find(acts)?.id ?? '');
  if (turn) problems.push(turn);
  // life regen comes only from pieces, which a spec does not dress: it goes on the unit's sheet (the split copy the battle
  // reads), after the turn opened so the opening regen does not move the spec's `hp`
  for (const u of battle.state.units) {
    const hpRegen = spec.units?.[u.id]?.hpRegen;
    if (hpRegen !== undefined) UNIT_DEFS[u.def] = { ...UNIT_DEFS[u.def], hpRegen };
  }
  return { scenario: castFits ? scenario : base, battle, spec };
}

// a hero that plays: the Beacon is on the heroes' side but never has a turn
const acts = (u: UnitState) => u.team === 'hero' && UNIT_DEFS[u.def].speed > 0;
function takeTurn(id: string): string | null {
  const p = giveTurn(battle, id, true);
  return p && `actor: ${p}`;
}

export function install(game: Game, scene: BattleScene) {
  view = scene;
  // marks off survive the game's own redraws: the scene's setters pass null while hidden and keep the last value
  let marks = true;
  // `rest`: what goes with the value (the cursor's square size), passed along as it came
  const keep = <T, R extends unknown[]>(set: (v: T | null, ...rest: R) => void) => {
    let last: T | null = null;
    let more = [] as unknown as R;
    return [
      (v: T | null, ...rest: R) => {
        last = v;
        more = rest;
        set(marks ? v : null, ...rest);
      },
      () => set(marks ? last : null, ...more),
    ] as const;
  };
  const marked = [
    keep(scene.setHighlights.bind(scene)),
    keep(scene.setCursor.bind(scene)),
    keep(scene.setRangeRing.bind(scene)),
    keep(scene.setTrajectory.bind(scene)),
    keep(scene.setChargeLines.bind(scene)),
    keep(scene.setChargePreview.bind(scene)),
    keep(scene.setCounters.bind(scene)),
    keep(scene.setCursorNote.bind(scene)),
  ] as const;
  [
    scene.setHighlights,
    scene.setCursor,
    scene.setRangeRing,
    scene.setTrajectory,
    scene.setChargeLines,
    scene.setChargePreview,
    scene.setCounters,
    scene.setCursorNote,
  ] = [marked[0][0], marked[1][0], marked[2][0], marked[3][0], marked[4][0], marked[5][0], marked[6][0], marked[7][0]];
  // a fixed camera (bench) stays where the spec put it: the game's slides to whoever acts are dropped
  const focus = scene.focusOn.bind(scene);
  let fixed = false;
  scene.focusOn = (p, also) => {
    if (!fixed) focus(p, also);
  };
  // and frames the focus in the middle of the page, not of the space the (hidden) HUD leaves
  const insets = scene.setInsets.bind(scene);
  scene.setInsets = (top, bottom, left, right) => (fixed ? insets(0, 0) : insets(top, bottom, left, right));
  if (arena) scene.bare();
  const style = document.head.appendChild(document.createElement('style'));

  const show = (screen: Screen, cursor = battle.actor.pos, ui: Ui = freshUi(battle)) =>
    game.showScreen(screen, cursor, ui);

  function apply(raw: SceneSpec): string[] {
    // the live call skips the CLI's check: a typo or an angle of 2.5 (the rotation would never stop) is refused here
    const { spec: whole, problems: shape } = parseSpec(raw);
    const p = [...shape, ...offMap(battle.grid, whole)];
    if (p.length) return p;
    const k = subOf(battle.grid);
    const s = inCells(whole, k);
    if (s.units) {
      const next = patchUnits(battle.state.units, s.units);
      p.push(...next.problems, ...placementProblems(battle.grid, next.units));
      if (!p.length) battle.state.units = next.units;
      scene.sync(battle.state);
    }
    const turn = s.actor ? takeTurn(s.actor) : null;
    if (turn) p.push(turn);
    const sc = s.screen ?? (s.units || s.actor || s.cursor ? 'menu' : undefined);
    if (sc === 'menu') show(startScreen(battle), s.cursor);
    else if (sc === 'facing') show({ k: 'facing' });
    else if (sc === 'move') {
      const at = s.cursor ?? battle.actor.pos;
      show(
        { k: 'map', command: 'move' },
        at,
        hoverTile(battle, selectMode(battle, freshUi(battle), { k: 'move' }), at),
      );
    } else if (sc) {
      // the Agir tile screen of that ability on whoever stands at `target` (a ground tile: the direct action)
      const on = unitAt(battle.state, sc.target);
      const at: ActTarget = on ? { k: 'unit', unit: on.id, pos: on.pos } : { k: 'direct', ability: sc.aim };
      const actions = actActions(battle, at);
      const action = actions.findIndex((a) => a.k === 'ability' && a.id === sc.aim && a.enabled);
      if (action < 0) p.push(`screen.aim: ${sc.aim} cannot reach ${sc.target.x / k},${sc.target.y / k}`);
      else {
        const { spots } = actions[action];
        const found = spots.findIndex((x) => samePos(x.aim, sc.target));
        const index = found < 0 ? bestSpot(actions[action], battle) : found;
        show({ k: 'spot', target: at, action, index }, spots[index].pos);
      }
    }
    const c = s.camera;
    const angle = c?.angle ?? (c?.fixed === 'side' ? profile() : undefined);
    if (angle !== undefined) {
      const at = Math.round((scene.heading - Math.PI / 4) / (Math.PI / 4));
      for (let i = at; i !== angle; i += Math.sign(angle - at)) scene.rotate(Math.sign(angle - at) as 1 | -1);
    }
    if (c?.zoom !== undefined) {
      scene.resetView(); // whole map, then closer: the same number gives the same framing on any page
      scene.zoom(1 / c.zoom);
    }
    // side: low, cutting what stands more than 4 tiles in front (trees, cliffs); three-quarter: the game's own 32°. Held
    // before the focus, which then aims at the ground's height
    if (c?.fixed) {
      scene.hold(c.fixed === 'side' ? 12 : 32, c.fixed === 'side' ? 4 : undefined);
      fixed = true;
      scene.setInsets(0, 0);
    }
    // a split tile's middle lies between its corner cells
    if (c?.focus) focus(c.focus, k > 1 ? { x: c.focus.x + k - 1, y: c.focus.y + k - 1 } : undefined);
    if (c?.action) {
      const from = battle.state.units.find((u) => u.id === c.action!.from);
      if (from) void scene.actionCam(from.pos, c.action.to, from.team === 'enemy');
      else p.push(`camera.action: no unit "${c.action.from}"`);
    }
    if (s.hide) {
      marks = !s.hide.includes('marks') && !s.hide.includes('all');
      hidePieces(hiddenPieces(s.hide)); // the 3D layer's, by name
      hideHtml(style, s.hide); // the HTML still on the page, until it is deleted
      for (const [, redo] of marked) redo();
    }
    if (s.daylight !== undefined) scene.setDaylight(s.daylight);
    return p;
  }

  // the line of the spec's first move or act, from where its unit stands now, so a side view sees it in profile
  function profile(): number {
    const st = spec.steps?.find((x) => 'move' in x || 'act' in x);
    const go = st && ('move' in st ? { unit: st.move.unit, to: st.move.to } : 'act' in st ? st.act : null);
    const u = go && battle.state.units.find((x) => x.id === go.unit);
    if (!go || !u) return 7;
    const k = subOf(battle.grid);
    return sideAngle({ x: u.pos.x / k, y: u.pos.y / k }, 'to' in go ? go.to : go.target);
  }

  const api: SandboxApi = {
    ready: false,
    spec,
    problems,
    apply,
    // map, cast, seed and language only change on load: the page reopens with the new spec
    load(next) {
      const bad = parseSpec(next).problems;
      if (bad.length) return bad;
      for (const [k, v] of Object.entries(storageFor(next))) store.set(k, v);
      location.href = specUrl(next);
      return [];
    },
    list: () => ({
      scenarios: Object.keys(SCENARIOS),
      defs: Object.keys(UNIT_DEFS),
      panels: Object.keys(PANELS),
      pieces: PIECE_NAMES,
      actor: battle.actor.id,
      // in whole tiles like the spec (x.5 is a token standing between tiles)
      units: battle.state.units.map((u) => ({
        id: u.id,
        def: u.def,
        team: u.team,
        x: u.pos.x / subOf(battle.grid),
        y: u.pos.y / subOf(battle.grid),
        hp: u.hp,
        ct: u.ct,
        facing: u.facing,
      })),
      map: { width: battle.grid.width / subOf(battle.grid), height: battle.grid.height / subOf(battle.grid) },
    }),
    idle,
    // Gameplay clips: each step goes through the Battle call the turn screen makes and the game's own animation (action
    // camera, numbers, shake), then waits for the scene to settle. Stops at the first step that cannot be played
    async play(steps) {
      const list = Array.isArray(steps) ? steps : [steps];
      const { problems: shape } = parseSpec({ steps: list });
      const bad = [...shape, ...offMap(battle.grid, { steps: list })];
      if (bad.length) return bad;
      for (const [i, step] of list.entries()) {
        if ('pause' in step) {
          await view.wait(step.pause);
          continue;
        }
        const id = 'move' in step ? step.move.unit : 'act' in step ? step.act.unit : step.wait.unit;
        // an enemy's walk shows its destination first, as on the AI turn
        const enemy = battle.state.units.find((u) => u.id === id)?.team === 'enemy';
        const { events, problem } = playStep(battle, step);
        if (problem) return [`steps[${i}]: ${problem}`];
        await game.playStep(events, enemy);
        await idle();
      }
      return [];
    },
    // bench: the battle clock stops (walks, strikes, waits, water); the camera's easing and the damage numbers' CSS do not
    pause: () => void (bench.paused = true),
    resume: () => void (bench.paused = false),
    // the scene's frame was requested before this call, so it runs first in the next frame, and then the clock stops again
    async step() {
      bench.paused = false;
      await new Promise((r) => requestAnimationFrame(r));
      bench.paused = true;
    },
  };
  window.__sandbox = api;
  // the cast was already placed when the scene loaded; a cast that did not fit is not tried again, and a unit the spec
  // removed is already gone, so the live patch only touches the ones left
  const kept = spec.units && Object.fromEntries(Object.entries(spec.units).filter(([, u]) => !u.remove));
  const again = { ...spec, units: castFits ? kept : undefined };
  problems.push(...apply(again));
  const start = structuredClone(battle.state);
  api.ready = true;
  if (problems.length) console.error(`sandbox: ${problems.join('; ')}`);
  // the lab embeds the page from another port, so it cannot reach __sandbox: it hears the problems and posts the controls
  const tell = () => parent !== window && parent.postMessage({ sandbox: 'problems', problems }, '*');
  tell();
  addEventListener('message', (e) => {
    if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(e.origin)) return;
    const m = (e.data as { sandbox?: unknown } | null)?.sandbox;
    if (m === 'pause' || m === 'step' || m === 'resume') void api[m]();
  });
  // loop (bench): the page plays the steps by itself, waits 1.5 s of battle clock, rewinds to the scene as it loaded and
  // plays again. The CLI drops `loop` and plays the steps itself
  if (spec.loop && !problems.length)
    void (async () => {
      for (;;) {
        await idle();
        const bad = await api.play(spec.steps ?? []);
        if (bad.length) {
          problems.push(...bad);
          console.error(`sandbox: ${bad.join('; ')}`);
          return tell();
        }
        if (battle.over) return; // the steps ended the battle: its end screen stays
        await view.wait(1500);
        rewind(battle, start);
        scene.sync(battle.state);
        apply({ ...again, units: undefined, screen: again.screen ?? 'menu' });
      }
    })();
}

// Settled: every unit holds the same place on screen for 10 frames in a row (the camera eases toward its goal and never
// lands exactly), then the menus' 90-120 ms opening has time to end
async function idle() {
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const where = () =>
    battle.state.units
      .map((u) => view.screenOf(u.id))
      .map((s) => (s ? `${s.x.toFixed(0)},${s.y.toFixed(0)}` : '-'))
      .join(' ');
  let still = 0,
    last = '';
  for (let i = 0; i < 600 && still < 10; i++) {
    await frame();
    const now = where();
    still = now === last ? still + 1 : 0;
    last = now;
  }
  await document.fonts.ready;
  await new Promise((r) => setTimeout(r, 300));
}
