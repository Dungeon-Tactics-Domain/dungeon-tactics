// The walkable town (Nov 15, Fernando's grill): the hub as a 3D map in Ash Wood's painted style, drawn by the battle's
// scene on the halved map of src/content/crawl/town.ts (rules in town-map.ts). The first of the party who goes to battle
// walks it (keyboard, gamepad, a click on the ground); the rest of the party waits at the Guild and the townsfolk stroll
// and tell rumours. Talking and a place's window only come with the action button (Nov 16, Fernando): Enter, A or a click
// on the balloon over what is in front; walking or clicking only walks there. Nothing new is saved: the town starts the
// same on every visit. The walker moves freely, not cell by cell (freeStep; Fernando, Nov 18: fluid always, no option).
import { type Place, TOWNSFOLK } from '../../content/crawl/town.ts';
import { type Grid, samePos } from '../../shared/battle/grid.ts';
import { SUB } from '../../shared/battle/half.ts';
import { footprint } from '../../shared/battle/pathing.ts';
import type { BattleState, Pos, UnitState } from '../../shared/battle/types.ts';
import { padDialog } from '../dialog.ts';
import { emptyMemory, padActions } from '../gamepad.ts';
import { type Act, hintLine } from '../glyphs.ts';
import { GROUP_KEY, JOBS, parseGroup } from '../group.ts';
import { hint } from '../hud.ts';
import { loadTownSkin } from '../hud-skin.ts';
import { t } from '../i18n.ts';
import { button, el, icon, tabbed, UI_ICON } from '../icons.ts';
import { liveText, padSeen } from '../key-hints.ts';
import { type KeyAction, keyAction, pageKeeps, type ScreenDir } from '../keyboard.ts';
import { type Cover, whenReady } from '../ready-gate.ts';
import { BattleScene } from '../scene.ts';
import { touchDevice } from '../screen-buttons.ts';
import { setTrack, sfx } from '../sound.ts';
import { store } from '../store.ts';
import { TIMING } from '../timing.ts';
import { TouchInput } from '../touch-input.ts';
import {
  atDoor,
  castParty,
  cell,
  cellUnder,
  centreOf,
  floorCells,
  freeTarget,
  GRID_KEY,
  groundDir,
  ME,
  near,
  parseTownGrid,
  placeAt,
  route,
  slide,
  stick,
  type TownTarget,
  townScenario,
  townSquares,
  townState,
} from '../town-map.ts';
import { homeScreen, townMenu } from './crawl.ts';
import { optionsMenu, townGridChoice } from './options.ts';
import { Folk, windowOpen } from './town-folk.ts';
import { openPlace, townHud, townPad } from './town-hud.ts';

const STEP_MS = TIMING.step / SUB; // a cell at the battle's walking pace (Nov 13, Fernando: slow walking)
// the help line with nothing in front of the walker: how to walk, act and open the menu
const PROMPT = (): [Act, string][] => [
  ['walk', t('andar', 'walk')],
  ['confirm', t('falar ou entrar', 'talk or go in')],
  ['cancel', 'menu'],
];

const group = () => parseGroup(store.json(GROUP_KEY));

class Town {
  private keys: ScreenDir[] = []; // directions held on the keyboard, the last pressed last
  private readonly pad = emptyMemory();
  private padPrimed = false;
  private goal: ((p: Pos) => boolean) | null = null; // where a click sends the walker
  private face: Pos | null = null; // what the click was on: the walker turns to it on arrival
  private facing: Pos = { x: 0, y: -1 }; // the walker's last step, for who stands in front
  private wasOpen = false;
  private readonly folk: Folk;
  private tg: TownTarget | null = null; // what the action button acts on now
  private showGrid = parseTownGrid(store.json(GRID_KEY));
  private dots?: Pos[]; // the debug grid's, worked out when it first shows
  private at: Pos; // the walker's centre, in cells; the unit's pos is the square snapped under it (cellUnder)
  private joy: Pos = { x: 0, y: 0 }; // the touch pad's stick, a screen vector of length up to 1
  private readonly touchPad = touchDevice()
    ? townPad(
        (v) => (this.joy = v),
        () => this.act(),
      )
    : undefined; // touch only
  private moving = false; // walked on the last frame
  private last = performance.now(); // the last frame, for the walk's pace
  // what Enter does here, at the top in the middle like the battle's help line
  private readonly prompt = el('div', { class: 'panel help town-prompt', role: 'status' });
  // the same, as a balloon over what it acts on (Nov 16, Fernando); a click on it acts too. Placed every frame (poll)
  private readonly balloon = button('panel town-act', [], () => this.act(), { hidden: true });

  constructor(
    private readonly scene: BattleScene,
    private readonly grid: Grid,
    private readonly state: BattleState,
    host: HTMLElement,
    skin: (hud: HTMLElement) => void, // the 3D look, already downloaded (hud-skin.ts loadTownSkin)
  ) {
    // the battle HUD's pieces: the name in the tile info's corner, the prompt as the help line, the gear (Options, which
    // has no battle rows here) and ↺ ↻ in the top right corner; as a .hud it hides while someone talks (style.css)
    const hud = townHud(
      this.prompt,
      this.balloon,
      () => optionsMenu({ relayout: () => {} }),
      (dir) => scene.rotate(dir),
      this.touchPad?.root,
    );
    host.append(hud);
    skin(hud); // on the page already: the layer reads its tokens and its size there
    const canvas = host.querySelector('canvas')!;
    new TouchInput(canvas, {
      tap: (x, y) => this.tap(x, y),
      // the square the walker would stop on, under the pointer
      hover: (x, y) => this.scene.setCursor(this.scene.pick(x, y, SUB), SUB),
      pan: (dx, dy) => scene.pan(dx, dy),
      zoom: (f) => scene.zoom(f),
      rotate: (dir) => scene.rotate(dir),
    });
    // right button: back, like the battle's; in town that is the menu
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('contextmenu', () => this.run({ k: 'cancel' }));
    addEventListener('keydown', (e) => this.onKey(e, true));
    addEventListener('keyup', (e) => this.onKey(e, false));
    addEventListener('blur', () => (this.keys = []));
    this.folk = new Folk({ scene, grid, state, me: () => this.me, showPrompt: () => this.showPrompt() });
    scene.hideMarkers();
    this.at = centreOf(this.me.pos);
    scene.focusOn(this.me.pos);
    for (const f of TOWNSFOLK) void this.folk.stroll(f);
    this.showPrompt();
    requestAnimationFrame(() => this.poll());
  }

  private get me(): UnitState {
    return this.state.units.find((u) => u.id === ME)!;
  }

  // Keyboard: the battle's keys (keyboard.ts); a held direction keeps walking, so key-up matters too. A window takes the keys
  private onKey(e: KeyboardEvent, down: boolean) {
    const a = keyAction(e);
    if (!a) return;
    if (a.k === 'cursor' && !down) return void (this.keys = this.keys.filter((d) => d !== a.dir));
    if (!down) return;
    // the Enter held into a door would click the window's focused ✕ on its first repeat and close what it just opened
    if (windowOpen()) return void (e.repeat && a.k === 'confirm' && e.preventDefault());
    if (pageKeeps(a, true, tabbed())) return; // no units to cycle here: Tab walks the menu button and the balloon
    e.preventDefault();
    (document.activeElement as HTMLElement | null)?.blur(); // the next Enter acts on the street, as in battle
    if (a.k === 'cursor') {
      if (!this.keys.includes(a.dir)) this.keys.push(a.dir);
    } else if (e.repeat) return;
    this.run(a);
  }

  // Every frame: the gamepad (in a window, the shared dialog handling; else the same actions as the keyboard), and a
  // window that closed sends the party back to its places (a recruit, a class change, a new leader)
  private poll() {
    requestAnimationFrame(() => this.poll());
    const open = windowOpen();
    if (this.wasOpen && !open) {
      this.refresh();
      this.showGrid = parseTownGrid(store.json(GRID_KEY)); // Options may have turned the grid
    }
    this.wasOpen = open;
    if (open) this.touchPad?.release(); // a window under the thumb: the stick lets go
    this.place(open);
    this.scene.setDebugGrid(
      this.showGrid
        ? { dots: (this.dots ??= floorCells(this.grid)), squares: townSquares(this.state), size: SUB }
        : null,
    );
    const gp = [...(navigator.getGamepads?.() ?? [])].find((g) => g?.connected);
    const now = performance.now();
    // a frame after a hidden tab counts as 50 ms, not as the whole absence; under a window (0) the walker stands
    this.freeStep(open ? 0 : Math.min(50, now - this.last), gp);
    this.last = now;
    if (!gp || document.querySelector('.loading-cover')) return; // the pad waits for the cover, like the keys
    padSeen(gp);
    const actions = padActions(
      { buttons: gp.buttons.map((b) => b.pressed), axes: [...gp.axes] },
      this.pad,
      performance.now(),
    );
    // 1st frame with a pad: only records what was already pressed
    if (!this.padPrimed) return void (this.padPrimed = true);
    for (const a of actions) if (!padDialog(a)) this.run(a);
  }

  private run(a: KeyAction) {
    if (a.k === 'cursor') {
      this.goal = null;
      return; // freeStep reads what is held, every frame
    }
    if (a.k === 'confirm') return this.act();
    if (a.k === 'cancel' || a.k === 'help') {
      // a fragment: the switch lands as a row of the menu's own list
      const foot = document.createDocumentFragment();
      foot.append(townGridChoice((on) => (this.showGrid = on)));
      return townMenu(foot);
    }
    if (a.k === 'rotate') return this.scene.rotate(a.dir);
    if (a.k === 'zoom') return this.scene.zoom(a.factor);
    if (a.k === 'recenter') return this.scene.resetView(); // F: the whole town, as in battle
  }

  // where the keys, the d-pad and the stick point, on screen (x right, y down): the stick by how far it tilts, the rest
  // at full pace, diagonals included
  private steer(gp?: Gamepad | null): Pos {
    const s = gp ? stick(gp.axes[0] ?? 0, gp.axes[1] ?? 0) : { x: 0, y: 0 };
    if (s.x || s.y) return s;
    if (this.joy.x || this.joy.y) return stick(this.joy.x, this.joy.y);
    const on = (d: ScreenDir) => Number(this.keys.includes(d) || this.pad.held[`d${d}`] !== undefined);
    const x = on('right') - on('left'),
      y = on('down') - on('up');
    const m = Math.hypot(x, y) || 1;
    return { x: x / m, y: y / m };
  }

  // The walk, every frame: the way held (screen directions turned with the camera), else toward the clicked goal through
  // the middles of route's cells, worked out again every frame (a townsperson may have stepped into the old one). A cell
  // per STEP_MS at full pace, the battle's walking pace. No easing of its own: the camera's slide is the only smoothing
  // (nothing more to switch off under prefers-reduced-motion)
  private freeStep(dt: number, gp?: Gamepad | null) {
    if (!dt) this.goal = this.face = null;
    let v = dt ? groundDir(this.steer(gp), this.scene.heading) : { x: 0, y: 0 };
    let reach = Number.POSITIVE_INFINITY; // how far the goal's next stop is
    let face: Pos | null = null;
    if (v.x || v.y) this.goal = this.face = null;
    else if (this.goal) {
      const way = route(this.grid, this.state, this.goal);
      const to = way && centreOf(way[0] ?? this.me.pos);
      if (!to) sfx('cancel');
      else {
        reach = Math.hypot(to.x - this.at.x, to.y - this.at.y);
        if (reach > 1e-6) v = { x: (to.x - this.at.x) / reach, y: (to.y - this.at.y) / reach };
        else if (!way.length) face = this.face; // there: turn to what was clicked
      }
      if (!(v.x || v.y)) this.goal = this.face = null;
    }
    const pace = Math.hypot(v.x, v.y);
    if (!pace) {
      if (!this.moving && !face) return;
      this.moving = false;
      if (face) this.facing = { x: centreOf(face).x - this.at.x, y: centreOf(face).y - this.at.y };
      this.scene.rest(ME, face ?? undefined);
      return this.showPrompt();
    }
    const step = Math.min((dt / STEP_MS) * pace, reach) / pace;
    this.at = slide(this.grid, this.state, this.at, { x: v.x * step, y: v.y * step });
    this.facing = { x: v.x / pace, y: v.y / pace };
    this.me.pos = cellUnder(this.at);
    this.moving = true;
    this.scene.slide(ME, { x: this.at.x - SUB / 2, y: this.at.y - SUB / 2 }, this.facing);
    this.showPrompt();
  }

  // A click only walks (Nov 16, Fernando: nothing opens by itself): on someone, beside them; on a house, to its door; on
  // the ground, there
  private tap(x: number, y: number) {
    const p = this.scene.pick(x, y, SUB);
    if (!p || windowOpen()) return;
    const who = this.state.units.find((u) => u.id !== ME && footprint(u).some((c) => samePos(c, p)));
    const pl = who ? undefined : placeAt(p);
    const [ok, face]: [(q: Pos) => boolean, Pos | null] = who
      ? [(q) => near(q, who), who.pos]
      : pl
        ? [(q) => atDoor(q, pl), cell(pl.at)]
        : [(q) => samePos(q, p), null];
    // no way there: the click also cancels the one walked now
    if (!route(this.grid, this.state, ok)) {
      this.goal = null;
      this.face = null;
      return sfx('cancel');
    }
    this.goal = ok;
    this.face = face;
  }

  // the action button (Enter, A, a click on the balloon): talk, or open the place's window
  private act() {
    const tg = this.tg;
    if (!tg || windowOpen()) return;
    if ('unit' in tg) void this.folk.talkTo(tg.unit);
    else this.enter(tg.place);
  }

  // what the action button does here, in the help line and the balloon; their content changes only with the target
  private showPrompt() {
    const tg = freeTarget(this.state, this.at, this.facing);
    const label = !tg
      ? null
      : 'unit' in tg
        ? t(`Falar com ${this.folk.nameOf(tg.unit)}`, `Talk to ${this.folk.nameOf(tg.unit)}`)
        : t(...tg.place.name);
    const same = tg && this.tg && tg.act === this.tg.act && label === this.balloon.dataset.say;
    this.tg = tg;
    if (same) return;
    this.prompt.replaceChildren(
      ...(label ? [label, hint('confirm')] : [liveText('', (s) => hintLine(s, PROMPT(), ' · '))]),
    );
    // what the 3D balloon writes (town3d/hud3d.ts); not `title`, whose browser tooltip would show over the drawing
    this.balloon.dataset.say = label ?? '';
    this.balloon.setAttribute('aria-label', label ?? '');
    this.balloon.replaceChildren(...(tg ? [icon(UI_ICON[tg.act]), hint('confirm')] : []));
    this.padUse(tg);
  }

  // the touch pad's button: lit with something in reach, its word says what it does (town3d/pad3d.ts draws both)
  private padUse(tg: TownTarget | null) {
    const b = this.touchPad?.use;
    if (!b) return;
    b.setAttribute('aria-disabled', String(!tg));
    b.dataset.word = !tg ? t('Agir', 'Act') : 'unit' in tg ? t('Falar', 'Talk') : t('Entrar', 'Enter');
    b.setAttribute('aria-label', this.balloon.dataset.say || t('Falar ou entrar', 'Talk or go in'));
  }

  // The balloon over what the action button acts on, every frame (the camera slides and turns, people walk); only its
  // position changes here. Hidden with nothing in reach or a window open
  private place(open: boolean) {
    const tg = this.tg;
    const at =
      !tg || open ? null : 'unit' in tg ? this.scene.screenOf(tg.unit.id) : this.scene.screenAt(cell(tg.place.at), SUB);
    this.balloon.hidden = !at;
    if (!at) return;
    // over a person's head (screenOf is the body's middle, r its half height and more); at a door, on the building's
    // middle, since over the doorstep it covered the walker standing there
    this.balloon.style.left = `${at.x}px`;
    this.balloon.style.top = `${at.y - at.r}px`;
  }

  // a place's window (town-hud.ts openPlace)
  private enter(pl: Place) {
    this.keys = []; // a key held into the door must not walk on once the window closes
    openPlace(pl);
  }

  // a window closed: the party as the save has it now
  private refresh() {
    for (const id of castParty(this.state, group())) this.scene.drop(id);
    this.scene.sync(this.state);
    // sync stood the walker on its cell: back to where it is
    this.scene.slide(ME, { x: this.at.x - SUB / 2, y: this.at.y - SUB / 2 });
    this.showPrompt();
  }
}

// ?home: the town instead of a battle (entry.ts boot), then what home opens over it (crawl.ts homeScreen). All of it
// is built under the loading cover, once the models and the 3D look landed, so a window opens in its final look
export async function bootTown(host: HTMLElement, cover: Cover) {
  setTrack('world'); // Pastoral D, the town's music (Fernando, Nov 15)
  const sc = townScenario();
  const state = townState(sc);
  castParty(state, group());
  // every class's model loads, so a recruit or a class change in town finds theirs
  const models = [...JOBS, ...TOWNSFOLK.map((f) => f.def)];
  await whenReady(cover, [BattleScene.create(host, sc.grid, state, models), loadTownSkin()], ([scene, skin]) => {
    new Town(scene, sc.grid, state, host, skin);
    homeScreen();
  });
}
