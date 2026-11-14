// Sandbox (docs/sandbox.md): a battle staged from a scene spec, for screenshots and the UX lab, scripted through
// window.__sandbox. Loaded only on localhost with ?sandbox= (main.ts), as its own chunk: the online game never fetches it.
// The map, the cast, the dice and the language are fixed when the page loads (`stage`); everything else changes live (`apply`).
import { Battle } from '../../shared/battle/battle.ts';
import { SCENARIOS, type Scenario } from '../../shared/battle/scenarios.ts';
import type { UnitState } from '../../shared/battle/types.ts';
import { UNIT_DEFS } from '../../shared/battle/units.ts';
import { CHAPTERS } from '../campaign.ts';
import { abilitiesOf, type Screen, startScreen } from '../command.ts';
import { freshUi, hoverTile, selectMode, type Ui } from '../interaction.ts';
import type { Game } from '../main.ts';
import { defaultPixel } from '../pixel-settings.ts';
import type { BattleScene } from '../scene.ts';
import { param, store } from '../store.ts';
import {
  castOf,
  PANELS,
  type Panel,
  parseSpec,
  patchUnits,
  placementProblems,
  type SceneSpec,
  specUrl,
  storageFor,
} from './sandbox-spec.ts';

interface SandboxApi {
  ready: boolean;
  spec: SceneSpec;
  problems: string[];
  apply(spec: SceneSpec): string[];
  load(spec: SceneSpec): void;
  list(): unknown;
  idle(): Promise<void>;
}
declare global {
  interface Window {
    __sandbox?: SandboxApi;
  }
}

// a hand-typed address may carry broken JSON: it becomes a problem, not a page that never boots
const read = (() => {
  try {
    return parseSpec(JSON.parse(param('sandbox') || '{}'));
  } catch {
    return { spec: {}, problems: ['?sandbox= is not valid JSON'] };
  }
})();
const spec = read.spec;
const problems = [...read.problems];
let battle: Battle;
let view: BattleScene;
let castFits = true;

// Before the scene exists: the spec's cast on the map, its dice, and a hero on the turn (otherwise the AI would play
// the opening enemy turn while the shot is taken). A cast that does not fit falls back to the map's own.
export function stage(base: Scenario): { scenario: Scenario; battle: Battle } {
  const cast = castOf(base.spawns, spec);
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
  return { scenario: castFits ? scenario : base, battle };
}

// a hero that plays: the Beacon is on the heroes' side but never has a turn
const acts = (u: UnitState) => u.team === 'hero' && UNIT_DEFS[u.def].speed > 0;
function takeTurn(id: string): string | null {
  const u = battle.state.units.find((x) => x.id === id);
  if (!u || !acts(u)) return `actor: "${id}" is not a hero that plays on this map`;
  battle.state.turn = { actor: u.id, moved: false, usedAbility: null };
  return null;
}

export function install(game: Game, scene: BattleScene) {
  view = scene;
  // marks off survive the game's own redraws: the scene's setters pass null while hidden and keep the last value
  let marks = true;
  const keep = <T>(set: (v: T | null) => void) => {
    let last: T | null = null;
    return [
      (v: T | null) => {
        last = v;
        set(marks ? v : null);
      },
      () => set(marks ? last : null),
    ] as const;
  };
  const marked = [
    keep(scene.setHighlights.bind(scene)),
    keep(scene.setCursor.bind(scene)),
    keep(scene.setRangeRing.bind(scene)),
    keep(scene.setTrajectory.bind(scene)),
  ] as const;
  [scene.setHighlights, scene.setCursor, scene.setRangeRing, scene.setTrajectory] = [
    marked[0][0],
    marked[1][0],
    marked[2][0],
    marked[3][0],
  ];
  // visibility, not display: the panels keep their size, so the camera frames the map the same with or without the HUD
  const style = document.head.appendChild(document.createElement('style'));

  const show = (screen: Screen, cursor = battle.actor.pos, ui: Ui = freshUi(battle)) =>
    game.showScreen(screen, cursor, ui);

  function apply(s: SceneSpec): string[] {
    const p: string[] = [];
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
    else if (sc === 'abilities') show({ k: 'abilities', index: 0 }, s.cursor);
    else if (sc === 'facing') show({ k: 'facing' });
    else if (sc === 'move') {
      const at = s.cursor ?? battle.actor.pos;
      show(
        { k: 'map', command: 'move' },
        at,
        hoverTile(battle, selectMode(battle, freshUi(battle), { k: 'move' }), at),
      );
    } else if (sc) {
      if (!abilitiesOf(battle).includes(sc.aim)) p.push(`screen.aim: ${battle.actor.id} has no ability "${sc.aim}"`);
      else if (!battle.preview(sc.aim, sc.target).ok)
        p.push(`screen.aim: ${sc.aim} cannot reach ${sc.target.x},${sc.target.y}`);
      else {
        const ui = hoverTile(battle, selectMode(battle, freshUi(battle), { k: 'ability', id: sc.aim }), sc.target);
        show(
          sc.confirm ? { k: 'confirm', ability: sc.aim, target: sc.target, yes: true } : { k: 'map', command: 'act' },
          sc.target,
          ui,
        );
      }
    }
    const c = s.camera;
    if (c?.angle !== undefined) {
      const at = Math.round((scene.heading - Math.PI / 4) / (Math.PI / 4));
      for (let i = at; i !== c.angle; i += Math.sign(c.angle - at)) scene.rotate(Math.sign(c.angle - at) as 1 | -1);
    }
    if (c?.zoom !== undefined) {
      scene.resetView(); // whole map, then closer: the same number gives the same framing on any page
      scene.zoom(1 / c.zoom);
    }
    if (c?.focus) scene.focusOn(c.focus);
    if (c?.action) {
      const from = battle.state.units.find((u) => u.id === c.action!.from);
      if (from) void scene.actionCam(from.pos, c.action.to, from.team === 'enemy');
      else p.push(`camera.action: no unit "${c.action.from}"`);
    }
    if (s.hide) {
      marks = !s.hide.includes('marks') && !s.hide.includes('all');
      const panels = s.hide.includes('all') ? Object.keys(PANELS) : s.hide.filter((h) => h in PANELS);
      style.textContent = panels.length
        ? `${panels.map((h) => PANELS[h as Panel]).join(', ')} { visibility: hidden !important; }`
        : '';
      for (const [, redo] of marked) redo();
    }
    if (s.pixel !== undefined) scene.setPixel({ ...defaultPixel(false), size: s.pixel });
    if (s.daylight !== undefined) scene.setDaylight(s.daylight);
    return p;
  }

  const api: SandboxApi = {
    ready: false,
    spec,
    problems,
    apply,
    // map, cast, seed and language only change on load: the page reopens with the new spec
    load(next) {
      for (const [k, v] of Object.entries(storageFor(next))) store.set(k, v);
      location.href = specUrl(next);
    },
    list: () => ({
      scenarios: Object.keys(SCENARIOS),
      stages: CHAPTERS.length,
      defs: Object.keys(UNIT_DEFS),
      panels: Object.keys(PANELS),
      actor: battle.actor.id,
      units: battle.state.units.map((u) => ({
        id: u.id,
        def: u.def,
        team: u.team,
        ...u.pos,
        hp: u.hp,
        ct: u.ct,
        facing: u.facing,
      })),
      map: { width: battle.grid.width, height: battle.grid.height },
    }),
    idle,
  };
  window.__sandbox = api;
  // the cast was already placed when the scene loaded; a cast that did not fit is not tried again
  problems.push(...apply(castFits ? spec : { ...spec, units: undefined }));
  api.ready = true;
  if (problems.length) console.error(`sandbox: ${problems.join('; ')}`);
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
