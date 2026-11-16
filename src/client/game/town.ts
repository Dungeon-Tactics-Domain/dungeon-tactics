// The walkable town (Nov 15, Fernando's grill): the hub as a 3D map in Ash Wood's painted style, drawn by the battle's
// scene on the halved map of src/content/crawl/town.ts (rules in town-map.ts). The first of the party who goes to battle
// walks it (keyboard, gamepad, a click on the ground); the rest of the party waits at the Guild and the townsfolk stroll
// and tell rumours. Talking and a place's window only come with the action button (Nov 16, Fernando): Enter, A or a click
// on the balloon over what is in front; walking or clicking only walks there. Nothing new is saved: the town starts the
// same on every visit.
import { CLASS_VOICE, GUILD_LINE, type Place, TOWN, TOWNSFOLK, type Townsfolk } from '../../content/crawl/town.ts';
import { type Grid, posKey, samePos } from '../../shared/battle/grid.ts';
import { SUB } from '../../shared/battle/half.ts';
import { footprint, reachable } from '../../shared/battle/pathing.ts';
import type { BattleState, Pos, UnitState } from '../../shared/battle/types.ts';
import { dialog, padDialog } from '../dialog.ts';
import { emptyMemory, padActions } from '../gamepad.ts';
import { GROUP_KEY, JOBS, parseGroup } from '../group.ts';
import { hint, KEYS } from '../hud.ts';
import { t } from '../i18n.ts';
import { button, el, icon, iconButton, UI_ICON } from '../icons.ts';
import { gridStep, type KeyAction, keyAction, type ScreenDir } from '../keyboard.ts';
import { PIXEL_KEY, parsePixel } from '../pixel-settings.ts';
import { BattleScene } from '../scene.ts';
import { setTrack, sfx } from '../sound.ts';
import { store } from '../store.ts';
import { talk } from '../talk.ts';
import { TIMING } from '../timing.ts';
import { TouchInput } from '../touch-input.ts';
import {
  atDoor,
  castParty,
  cell,
  clear,
  floorCells,
  GRID_KEY,
  ME,
  memberUnit,
  near,
  parseTownGrid,
  placeAt,
  route,
  strollPath,
  type TownTarget,
  townScenario,
  townSquares,
  townState,
  townTarget,
} from '../town-map.ts';
import { openBar, openParty, openSheet, openShop } from '../town-ui.ts';
import { homeScreen, questGate, townMenu } from './crawl.ts';
import { townGridChoice } from './options.ts';

const STEP_MS = TIMING.step / SUB; // a cell at the battle's walking pace (Nov 13, Fernando: slow walking)
const STROLL_MS = STEP_MS * 1.6; // townsfolk amble
const DIRS: ScreenDir[] = ['up', 'down', 'left', 'right'];

const group = () => parseGroup(store.json(GROUP_KEY));
const windowOpen = () => !!document.querySelector('.overlay');

class Town {
  private keys: ScreenDir[] = []; // directions held on the keyboard, the last pressed last
  private readonly pad = emptyMemory();
  private padPrimed = false;
  private walking = false;
  private goal: ((p: Pos) => boolean) | null = null; // where a click sends the walker
  private face: Pos | null = null; // what the click was on: the walker turns to it on arrival
  private facing: Pos = { x: 0, y: -1 }; // the walker's last step, for who stands in front
  private talking: string | null = null; // who listens now: they stop strolling
  private told = new Map<string, number>(); // the next rumour of each townsperson
  private wasOpen = false;
  private tg: TownTarget | null = null; // what the action button acts on now
  private showGrid = parseTownGrid(store.json(GRID_KEY));
  private dots?: Pos[]; // the debug grid's, worked out when it first shows
  // what Enter does here, at the top in the middle like the battle's help line
  private readonly prompt = el('div', { class: 'panel help town-prompt', role: 'status' });
  // the same, as a balloon over what it acts on (Nov 16, Fernando); a click on it acts too. Placed every frame (poll)
  private readonly balloon = button('panel town-act', [], () => this.act(), { hidden: true });

  constructor(
    private readonly scene: BattleScene,
    private readonly grid: Grid,
    private readonly state: BattleState,
    host: HTMLElement,
  ) {
    // the battle HUD's pieces: the name in the tile info's corner, the prompt as the help line, the menu button in the
    // top right corner; as a .hud it hides while someone talks (style.css)
    host.append(
      el(
        'div',
        { class: `hud${KEYS ? ' kbd' : ''}` },
        el('div', { class: 'panel tile-info' }, t(TOWN.name, TOWN.en)),
        this.prompt,
        this.balloon,
        el(
          'div',
          { class: 'tools' },
          iconButton(
            el('span', { class: 'burger-bars', 'aria-hidden': 'true' }),
            t('Menu da cidade (Esc)', 'Town menu (Esc)'),
            () => this.run({ k: 'cancel' }),
            { class: 'icon burger' },
          ),
        ),
      ),
    );
    const canvas = host.querySelector('canvas')!;
    new TouchInput(canvas, {
      tap: (x, y) => this.tap(x, y),
      // the square the walker would stop on, under the pointer
      hover: (x, y) => this.scene.setCursor(this.scene.pick(x, y, SUB), SUB),
      pan: (dx, dy) => scene.pan(dx, dy),
      zoom: (f) => scene.zoom(f),
    });
    // right button: back, like the battle's; in town that is the menu
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.run({ k: 'cancel' });
    });
    addEventListener('keydown', (e) => this.onKey(e, true));
    addEventListener('keyup', (e) => this.onKey(e, false));
    addEventListener('blur', () => (this.keys = []));
    scene.hideMarkers();
    scene.focusOn(this.me.pos);
    for (const f of TOWNSFOLK) void this.stroll(f);
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
    e.preventDefault();
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
    if (this.wasOpen && !open) this.refresh();
    this.wasOpen = open;
    this.place(open);
    this.scene.setDebugGrid(
      this.showGrid
        ? { dots: (this.dots ??= floorCells(this.grid)), squares: townSquares(this.state), size: SUB }
        : null,
    );
    const gp = [...(navigator.getGamepads?.() ?? [])].find((g) => g?.connected);
    if (!gp) return;
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
      return void this.walk();
    }
    if (a.k === 'confirm') return this.act();
    if (a.k === 'cancel' || a.k === 'help') return townMenu(townGridChoice((on) => (this.showGrid = on)));
    if (a.k === 'rotate') return this.scene.rotate(a.dir);
    if (a.k === 'zoom') return this.scene.zoom(a.factor);
    if (a.k === 'recenter') return this.scene.resetView(); // F: the whole town, as in battle
  }

  // the direction held now: the last key pressed, else the gamepad's d-pad or stick
  private held(): ScreenDir | undefined {
    return this.keys.at(-1) ?? DIRS.find((d) => this.pad.held[`d${d}`] !== undefined);
  }

  // Walks while a direction is held, one cell at a time (a blocked cell ends it), else toward the clicked goal; on arrival
  // from a click it turns to what was clicked, so the balloon offers that
  private async walk() {
    if (this.walking) return;
    this.walking = true;
    let arrived = false;
    for (;;) {
      if (windowOpen()) break;
      const dir = this.held();
      let next: Pos | undefined;
      if (dir) {
        this.goal = null;
        this.face = null;
        const s = gridStep(dir, this.scene.heading);
        next = { x: this.me.pos.x + s.x, y: this.me.pos.y + s.y };
        this.facing = s;
        if (!reachable(this.grid, this.state, ME, 1).has(posKey(next))) break;
      } else if (this.goal) {
        // the way again from every cell: a townsperson may have stepped into the old one (review of Nov 15)
        const way = route(this.grid, this.state, this.goal);
        if (!way) sfx('cancel');
        arrived = way?.length === 0;
        next = way?.[0];
      }
      if (!next) break;
      this.facing = { x: Math.sign(next.x - this.me.pos.x), y: Math.sign(next.y - this.me.pos.y) };
      this.me.pos = next;
      this.showPrompt(); // the balloon follows each step, not only the walk's end
      this.scene.focusOn(next);
      await this.scene.glide(ME, next, STEP_MS);
    }
    this.walking = false;
    const face = arrived ? this.face : null;
    if (face) this.facing = { x: Math.sign(face.x - this.me.pos.x), y: Math.sign(face.y - this.me.pos.y) };
    this.scene.rest(ME, face ?? undefined);
    this.showPrompt();
    this.goal = null;
    this.face = null;
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
    void this.walk();
  }

  // the action button (Enter, A, a click on the balloon): talk, or open the place's window
  private act() {
    const tg = this.tg;
    if (!tg || windowOpen()) return;
    if ('unit' in tg) void this.talkTo(tg.unit);
    else this.enter(tg.place);
  }

  // what the action button does here, in the help line and the balloon; their content changes only with the target
  private showPrompt() {
    const tg = townTarget(this.state, this.facing);
    const label = !tg
      ? null
      : 'unit' in tg
        ? t(`Falar com ${this.nameOf(tg.unit)}`, `Talk to ${this.nameOf(tg.unit)}`)
        : t(...tg.place.name);
    const same = tg && this.tg && tg.act === this.tg.act && label === this.balloon.title;
    this.tg = tg;
    if (same) return;
    this.prompt.replaceChildren(
      ...(label
        ? [label, hint('Enter')]
        : [t('W A S D anda · Enter fala ou entra · Esc menu', 'W A S D walk · Enter talk or go in · Esc menu')]),
    );
    this.balloon.title = label ?? '';
    this.balloon.setAttribute('aria-label', label ?? '');
    this.balloon.replaceChildren(...(tg ? [icon(UI_ICON[tg.act]), hint('Enter')] : []));
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

  private nameOf(u: UnitState) {
    return u.id.startsWith('f-')
      ? (this.folkOf(u)?.name ?? '')
      : (group().members.find((m) => memberUnit(m.id) === u.id)?.name ?? '');
  }
  private folkOf = (u: UnitState) => TOWNSFOLK.find((f) => `f-${f.id}` === u.id);

  // A townsperson tells the next rumour; a party member greets and opens their sheet (Fernando: talking opens it). Both
  // turn to each other first
  private async talkTo(u: UnitState) {
    this.scene.rest(ME, u.pos);
    this.scene.rest(u.id, this.me.pos);
    this.talking = u.id;
    const folk = this.folkOf(u);
    if (folk) {
      const i = this.told.get(folk.id) ?? 0;
      this.told.set(folk.id, i + 1);
      const [pt, en] = folk.lines[i % folk.lines.length];
      await talk([{ who: { name: folk.name, def: folk.def, pitch: folk.pitch }, pt, en }]);
    } else {
      const m = group().members.find((x) => memberUnit(x.id) === u.id);
      if (m) {
        await talk([
          { who: { name: m.name, def: m.cls, pitch: CLASS_VOICE[m.cls] ?? 330 }, pt: GUILD_LINE[0], en: GUILD_LINE[1] },
        ]);
        openSheet(m, () => {});
      }
    }
    this.talking = null;
  }

  // a place's window: the existing ones (Fernando, Nov 15), the gate's quest rows, or what a place without one yet says
  private enter(pl: Place) {
    sfx('confirm');
    this.keys = []; // a key held into the door must not walk on once the window closes
    const name = t(...pl.name);
    if (pl.id === 'gate') return questGate(name);
    if (pl.id === 'guild') return openParty();
    if (pl.id === 'shop') return openShop();
    if (pl.id === 'tavern') return openBar(() => {});
    const d = dialog('title', name, [
      el('p', {}, pl.soon ? t(...pl.soon) : ''),
      button('primary', t('Voltar à rua', 'Back to the street'), () => d.close()),
    ]);
    d.overlay.querySelector<HTMLButtonElement>('.primary')!.focus();
  }

  // a window closed: the party as the save has it now
  private refresh() {
    for (const id of castParty(this.state, group())) this.scene.drop(id);
    this.scene.sync(this.state);
    this.showPrompt();
  }

  // A townsperson ambles to a spot near home every few seconds (cosmetic, so Math.random) along a way that never blocks a
  // door or anyone (town-map.ts clear); stays put while a window is open, while being talked to or while the walker
  // stands beside them
  private async stroll(f: Townsfolk) {
    const id = `f-${f.id}`;
    const home = cell(f.home);
    for (;;) {
      await this.scene.wait(2500 + Math.random() * 4000);
      if (windowOpen() || this.talking === id) continue;
      const u = this.state.units.find((x) => x.id === id);
      if (!u) return;
      // beside the walker, wait to be talked to: they wandered off while the prompt still offered to talk to them
      if (near(this.me.pos, u)) continue;
      for (const p of strollPath(this.grid, this.state, id, home, Math.random)) {
        // checked again at every cell: the walker and the others moved since (never onto the walker's next cell)
        if (windowOpen() || this.talking === id || !clear(this.grid, this.state, id, p)) break;
        u.pos = p;
        this.showPrompt(); // they may stroll into or out of the walker's reach
        await this.scene.glide(id, p, STROLL_MS);
      }
      this.scene.rest(id);
    }
  }
}

// ?home: the town instead of a battle (main.ts boot), then what home opens over it (crawl.ts homeScreen)
export async function bootTown(host: HTMLElement) {
  setTrack('world'); // Pastoral D, the town's music (Fernando, Nov 15)
  const sc = townScenario();
  const state = townState(sc);
  castParty(state, group());
  const pixel = parsePixel(store.json(PIXEL_KEY), innerWidth < 600);
  // every class's model loads, so a recruit or a class change in town finds theirs
  const scene = await BattleScene.create(host, sc.grid, state, pixel, [...JOBS, ...TOWNSFOLK.map((f) => f.def)]);
  new Town(scene, sc.grid, state, host);
  homeScreen();
}
