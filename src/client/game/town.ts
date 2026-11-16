// The walkable town (Nov 15, Fernando's grill): the hub as a 3D map in Ash Wood's painted style, drawn by the battle's
// scene on the halved map of src/content/crawl/town.ts (rules in town-map.ts). The first of the party who goes to battle
// walks it (keyboard, gamepad, a click on the ground); the rest of the party waits at the Guild and the townsfolk stroll
// and tell rumours. A place's window opens at its door with Enter or A, by walking into it, or by clicking it. Nothing new
// is saved: the town starts the same on every visit.
import {
  CLASS_VOICE,
  GUILD_LINE,
  type Place,
  TOWN,
  TOWN_PLACES,
  TOWNSFOLK,
  type Townsfolk,
} from '../../content/crawl/town.ts';
import { dist, type Grid, posKey, samePos } from '../../shared/battle/grid.ts';
import { SUB } from '../../shared/battle/half.ts';
import { cellsOf, footprint, gap, reachable } from '../../shared/battle/pathing.ts';
import type { BattleState, Pos, UnitState } from '../../shared/battle/types.ts';
import { dialog, padDialog } from '../dialog.ts';
import { emptyMemory, padActions } from '../gamepad.ts';
import { GROUP_KEY, JOBS, parseGroup } from '../group.ts';
import { hint, KEYS } from '../hud.ts';
import { t } from '../i18n.ts';
import { button, el, iconButton } from '../icons.ts';
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
  ME,
  memberUnit,
  placeAt,
  REACH,
  route,
  townScenario,
  townState,
} from '../town-map.ts';
import { openBar, openParty, openSheet, openShop } from '../town-ui.ts';
import { homeScreen, questGate, townMenu } from './crawl.ts';

const STEP_MS = TIMING.step / SUB; // a cell at the battle's walking pace (Nov 13, Fernando: slow walking)
const STROLL_MS = STEP_MS * 1.6; // townsfolk amble
const STROLL = 4; // cells a townsperson strays from home
const DIRS: ScreenDir[] = ['up', 'down', 'left', 'right'];

const group = () => parseGroup(store.json(GROUP_KEY));
const windowOpen = () => !!document.querySelector('.overlay');

class Town {
  private keys: ScreenDir[] = []; // directions held on the keyboard, the last pressed last
  private readonly pad = emptyMemory();
  private padPrimed = false;
  private walking = false;
  private path: Pos[] = []; // what is left of a clicked route
  private arrive: (() => void) | null = null; // what the clicked route does on arrival (talk, go in)
  private facing: Pos = { x: 0, y: -1 }; // the walker's last step, for who stands in front
  private talking: string | null = null; // who listens now: they stop strolling
  private told = new Map<string, number>(); // the next rumour of each townsperson
  private wasOpen = false;
  // what Enter does here, at the top in the middle like the battle's help line
  private readonly prompt = el('div', { class: 'panel help town-prompt', role: 'status' });

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
        el(
          'div',
          { class: 'tools' },
          iconButton(
            el('span', { class: 'burger-bars', 'aria-hidden': 'true' }),
            t('Menu da cidade (Esc)', 'Town menu (Esc)'),
            () => townMenu(),
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
    if (!down || windowOpen()) return;
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
      this.path = [];
      this.arrive = null;
      return void this.walk();
    }
    if (a.k === 'confirm') return this.target()?.go();
    if (a.k === 'cancel' || a.k === 'help') return townMenu();
    if (a.k === 'rotate') return this.scene.rotate(a.dir);
    if (a.k === 'zoom') return this.scene.zoom(a.factor);
    if (a.k === 'recenter') return this.scene.resetView(); // F: the whole town, as in battle
  }

  // the direction held now: the last key pressed, else the gamepad's d-pad or stick
  private held(): ScreenDir | undefined {
    return this.keys.at(-1) ?? DIRS.find((d) => this.pad.held[`d${d}`] !== undefined);
  }

  // Walks while a direction is held, one cell at a time (a blocked cell ends it, going in if it is the place's door),
  // else along the clicked route, and does what the route was for on arrival
  private async walk() {
    if (this.walking) return;
    this.walking = true;
    for (;;) {
      if (windowOpen()) break;
      const dir = this.held();
      let next: Pos | undefined;
      if (dir) {
        this.path = [];
        this.arrive = null;
        const s = gridStep(dir, this.scene.heading);
        next = { x: this.me.pos.x + s.x, y: this.me.pos.y + s.y };
        this.facing = s;
        if (!reachable(this.grid, this.state, ME, 1).has(posKey(next))) {
          this.bump(next);
          break;
        }
      } else next = this.path.shift();
      if (!next) break;
      this.facing = { x: Math.sign(next.x - this.me.pos.x), y: Math.sign(next.y - this.me.pos.y) };
      this.me.pos = next;
      this.scene.focusOn(next);
      await this.scene.glide(ME, next, STEP_MS);
    }
    this.walking = false;
    this.scene.rest(ME);
    this.showPrompt();
    const arrive = this.arrive;
    this.arrive = null;
    if (arrive && !this.path.length && !windowOpen()) arrive();
  }

  // walking into a house from its door goes in
  private bump(to: Pos) {
    const pl = cellsOf(to, SUB).map(placeAt).find(Boolean);
    if (pl && atDoor(this.me.pos, pl)) this.enter(pl);
  }

  // A click: on someone, walk beside them and talk; on a house, walk to its door and go in; on the ground, walk there
  private tap(x: number, y: number) {
    const p = this.scene.pick(x, y, SUB);
    if (!p || windowOpen()) return;
    const who = this.state.units.find((u) => u.id !== ME && footprint(u).some((c) => samePos(c, p)));
    const pl = who ? undefined : placeAt(p);
    const [ok, then]: [(q: Pos) => boolean, (() => void) | null] = who
      ? [(q) => this.near(q, who), () => this.talkTo(who)]
      : pl
        ? [(q) => atDoor(q, pl), () => this.enter(pl)]
        : [(q) => samePos(q, p), null];
    const path = route(this.grid, this.state, ME, ok);
    if (!path) return sfx('cancel');
    this.path = path;
    this.arrive = then;
    void this.walk();
  }

  private near = (p: Pos, u: UnitState) => gap(cellsOf(p, SUB), footprint(u)) <= REACH;

  // What Enter or A does here, for the key and the prompt: whoever stands in front (the way the walker last stepped), else
  // the door the walker stands at, else whoever is beside
  private target(): { label: string; go: () => void } | null {
    const me = this.me;
    const centre = (p: Pos) => ({ x: p.x + SUB / 2, y: p.y + SUB / 2 });
    const ahead = (u: UnitState) =>
      (centre(u.pos).x - centre(me.pos).x) * this.facing.x + (centre(u.pos).y - centre(me.pos).y) * this.facing.y > 0;
    const near = this.state.units
      .filter((u) => u.id !== ME && this.near(me.pos, u))
      .sort((a, b) => dist(a.pos, me.pos) - dist(b.pos, me.pos));
    const talkTo = (u: UnitState) => ({
      label: t(`Falar com ${this.nameOf(u)}`, `Talk to ${this.nameOf(u)}`),
      go: () => this.talkTo(u),
    });
    const front = near.find(ahead);
    if (front) return talkTo(front);
    const pl = TOWN_PLACES.find((p) => atDoor(me.pos, p));
    if (pl) return { label: t(...pl.name), go: () => this.enter(pl) };
    return near[0] ? talkTo(near[0]) : null;
  }

  private showPrompt() {
    const tg = this.target();
    this.prompt.replaceChildren(
      ...(tg
        ? [tg.label, hint('Enter')]
        : [t('W A S D anda · Enter fala ou entra · Esc menu', 'W A S D walk · Enter talk or go in · Esc menu')]),
    );
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

  // A townsperson ambles to a free spot near home every few seconds (cosmetic, so Math.random), never onto the walker;
  // stays put while a window is open, while being talked to or while the walker stands beside them
  private async stroll(f: Townsfolk) {
    const id = `f-${f.id}`;
    const home = cell(f.home);
    for (;;) {
      await this.scene.wait(2500 + Math.random() * 4000);
      if (windowOpen() || this.talking === id) continue;
      const u = this.state.units.find((x) => x.id === id);
      if (!u) return;
      // beside the walker, wait to be talked to: they wandered off while the prompt still offered to talk to them
      if (this.near(this.me.pos, u)) continue;
      const stops = [...reachable(this.grid, this.state, id, STROLL).values()].filter(
        (s) => dist(s.pos, home) <= STROLL && gap(cellsOf(s.pos, SUB), footprint(this.me)) > REACH,
      );
      const pick = stops[Math.floor(Math.random() * stops.length)];
      for (const p of pick?.path ?? []) {
        if (windowOpen() || this.talking === id || gap(cellsOf(p, SUB), footprint(this.me)) <= 1) break;
        u.pos = p;
        await this.scene.glide(id, p, STROLL_MS);
      }
      this.scene.rest(id);
      if (!this.walking) this.showPrompt();
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
