// Game entry point: wires the battle (rules), the scene (Three), the HUD (DOM) and touch input. Owns the turn loop: the player acts
// through the HUD; on the enemy turn the AI plays on its own, one unit at a time, with a pause so it can be read.

import { ABILITIES } from '../shared/battle/abilities.ts';
import { playAiTurn } from '../shared/battle/ai.ts';
import { Battle } from '../shared/battle/battle.ts';
import { ITEMS } from '../shared/battle/equipment.ts';
import { dist, facingTo, inBounds, neighbors, posKey, samePos, standH, tileAt } from '../shared/battle/grid.ts';
import { HALF_ID, registerHalf } from '../shared/battle/half.ts';
import { shotStop, unitAt } from '../shared/battle/pathing.ts';
import { FIRST_BATTLE, SCENARIOS } from '../shared/battle/scenarios.ts';
import type { BattleEvent, Pos, Team } from '../shared/battle/types.ts';
import { OBJECTIVE_DEF } from '../shared/battle/units.ts';
import {
  CAMPAIGN_KEY,
  CHAPTERS,
  chapterId,
  chapterScenario,
  learned,
  objectiveText,
  parseProgress,
} from './campaign.ts';
import { CHEST_KEY, EQUIP_KEY, parseChest, parseEquip, VICTORY_GOLD } from './chest.ts';
import {
  abilitiesOf,
  abilityEnabled,
  COMMANDS,
  canUndoMove,
  commandEnabled,
  longestRange,
  type Screen,
  startScreen,
  stepIndex,
} from './command.ts';
import { createHero } from './create-ui.ts';
import { openDevMenu } from './dev-menu.ts';
import { buildDevScenario, DEV_KEY, DEV_SCENARIO, parseSetup, problems } from './dev-roster.ts';
import { choice, dialog, slider } from './dialog.ts';
import { lookOf } from './fx.ts';
import { emptyMemory, padActions } from './gamepad.ts';
import { GROUP_KEY, parseGroup } from './group.ts';
import { HERO_KEY, parseHero } from './hero.ts';
import { BattleHud, eventLog, unitStatus } from './hud.ts';
import { abilityName, LANG, type Lang, setLang, t, unitName } from './i18n.ts';
import { el } from './icons.ts';
import {
  confirm,
  freshUi,
  type Highlights,
  highlights,
  hoverTile,
  selectMode,
  tapTile,
  type Ui,
} from './interaction.ts';
import { cycleUnit, gridStep, type KeyAction, keyAction, keyHelp } from './keyboard.ts';
import { MISSIONS, MISSIONS_KEY, type Mission, missionScenario, missionScenarioId, parseDone } from './missions.ts';
import { nextSize, PIXEL_KEY, type PixelSettings, type PixelSize, parsePixel } from './pixel-settings.ts';
import { BattleScene, rampLink } from './scene.ts';
import { jingle, type Sfx, setSound, setTrack, sfx, soundSettings } from './sound.ts';
import { store } from './store.ts';
import {
  BEST_KEY,
  parseBest,
  SURVIVAL_ID,
  SURVIVE_TURNS,
  survivalGoal,
  survivalScenario,
  survived,
  turnsLeft,
} from './survival.ts';
import { TEXT_KEY, type TextSpeed, talk, textSpeed } from './talk.ts';
import { addEvents, emptyTally, mvp } from './tally.ts';
import { isJump, pace, stepMs, TIMING } from './timing.ts';
import { TouchInput } from './touch-input.ts';
import { afterNode, INTRO, nodeOfChapter, parseWorld, partyFor, WORLD, WORLD_KEY } from './world.ts';
import { openParty, openWorld } from './world-ui.ts';

// the battle the game opens and where it is saved; the FFT study swaps both at boot (separate save)
let scenario = FIRST_BATTLE;
let mission: Mission | null = null; // bar mission in play (missions.ts)
let SAVE_KEY = 'dt:battle';
let chapter: number | null = null; // campaign stage in play (null = standalone battle)
// Test (localhost only): ?auto=1 makes the AI play the heroes too, to check stage end, victory and return to the
// map without playing by hand (night of Nov 12). Nothing changes in production.
const AUTO = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).has('auto');

const FPS_KEY = 'dt:fps'; // performance counter on (1) or off (0); starts on (Fernando's request, Nov 12)
// short turn list (next 4) by default: FFT does not leave the whole order on screen and the list covered the map (Nov 12)
const QUEUE_KEY = 'dt:turnos';
const FAST_KEY = 'dt:rapido'; // fast-forward button on stays on in the next battle
const newBattle = () => Battle.start(scenario, (Math.random() * 2 ** 31) | 0);

class Game {
  private ui: Ui;
  // hero turn screen in the FFT style (command.ts): menu -> submenu -> map -> "Execute?" -> menu; Wait -> direction
  private screen: Screen;
  private busy = false;
  private log = '';
  private acting: string | null = null;
  private cursor: Pos; // cursor tile (keyboard, mouse and gamepad move the same cursor)
  private readonly hud: BattleHud;
  private readonly pad = emptyMemory();
  private padPrimed = false;
  private readonly fps = el('div', { class: 'fps', 'aria-hidden': 'true' });
  // battle tally (tally.ts) for the end-of-battle highlight; side and sheet of each unit stored at the start (dead units leave the state)
  private tally = emptyTally();
  private roster: Record<string, { team: Team; def: string }> = {};
  private readonly teamOf = () => Object.fromEntries(Object.entries(this.roster).map(([id, u]) => [id, u.team]));

  constructor(
    private battle: Battle,
    private readonly scene: BattleScene,
    host: HTMLElement,
    private pixel: PixelSettings,
  ) {
    this.resetTally();
    this.ui = freshUi(battle);
    this.screen = startScreen(battle);
    this.cursor = battle.actor.pos;
    this.hud = new BattleHud(host, {
      command: (i) => this.chooseCommand(i),
      ability: (i) => this.chooseAbility(i),
      answer: (yes) => void this.answer(yes),
      cancel: () => this.runKey({ k: 'cancel' }),
      rotate: (dir) => scene.rotate(dir),
      recenter: () => scene.resetView(),
      pixel: () => this.setPixel({ ...this.pixel, size: nextSize(this.pixel.size) }),
      fast: () => {
        pace.toggle = !pace.toggle;
        store.set(FAST_KEY, pace.toggle ? '1' : '');
        this.hud.setFast(pace.toggle);
      },
      menu: () => this.menu(),
      undo: () => this.runKey({ k: 'undo' }),
    });
    const canvas = host.querySelector('canvas')!;
    // TouchInput attaches its listeners to the canvas in the constructor; nothing else needs a reference
    new TouchInput(canvas, {
      tap: (x, y) => {
        const pos = this.scene.pick(x, y);
        if (!pos || this.busy || !this.heroTurn) return;
        if (this.screen.k === 'facing') return this.faceTo(pos);
        // on the map the tile is already chosen by mouse hover (or the 1st tap): clicking it confirms
        if (this.screen.k === 'map' && this.ui.pending && samePos(pos, this.ui.pending)) return void this.mapConfirm();
        this.cursor = pos;
        this.update(this.screen.k === 'map' ? tapTile(this.battle, this.ui, pos) : this.ui);
      },
      hover: (x, y) => {
        const pos = this.scene.pick(x, y);
        if (
          !pos ||
          this.busy ||
          !this.heroTurn ||
          this.screen.k === 'facing' ||
          this.screen.k === 'confirm' ||
          samePos(pos, this.cursor)
        )
          return;
        this.cursor = pos;
        sfx('cursor');
        this.update(this.screen.k === 'map' ? hoverTile(this.battle, this.ui, pos) : this.ui);
      },
      pan: (dx, dy) => scene.pan(dx, dy),
      zoom: (f) => scene.zoom(f),
    });
    // right button cancels, like FFT's "back"
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.runKey({ k: 'cancel' });
    });
    addEventListener('keydown', (e) => this.onKey(e));
    // holding Enter or Space fast-forwards the battle (timing.ts); switching tabs releases it, otherwise it stayed fast-forwarded with no key held
    const hold = (on: boolean) => (e: KeyboardEvent) =>
      e.key === 'Enter' || e.key === ' ' ? (pace.key = on) : undefined;
    addEventListener('keydown', hold(true));
    addEventListener('keyup', hold(false));
    addEventListener('blur', () => (pace.key = false));
    host.append(this.fps);
    this.fps.hidden = store.get(FPS_KEY) === '0';
    this.hud.setQueueFull(store.get(QUEUE_KEY) === 'all');
    pace.toggle = store.get(FAST_KEY) === '1';
    this.hud.setFast(pace.toggle);
    // performance counter: the text changes 2 times per second, not every frame (almost zero cost)
    setInterval(() => this.showFps(), 500);
    requestAnimationFrame(() => this.pollPad());
    this.update(this.ui);
    void this.runEnemies(); // the save may have stopped on the enemy turn
  }

  // Keyboard (Fernando's request, Oct 25): every action has a key. The key -> action translation is pure (keyboard.ts).
  // With a dialog open, the keys belong to it (Esc closes, Tab moves between buttons).
  private onKey(e: KeyboardEvent) {
    if (document.querySelector('.overlay')) return;
    const a = keyAction(e);
    if (!a) return;
    // confirm only on press: holding Enter to speed up the enemy must not pick the hero's 1st command by accident
    if (e.repeat && a.k === 'confirm') return void e.preventDefault();
    e.preventDefault(); // Tab does not jump between buttons, Space does not scroll, F3 does not open the browser search
    (document.activeElement as HTMLElement | null)?.blur();
    this.runKey(a);
  }

  // Gamepad (gamepad.ts): reads the first pad every frame and sends actions through the same path as the keyboard. With a
  // dialog open, the pad moves between its buttons (A presses, B closes).
  private pollPad() {
    requestAnimationFrame(() => this.pollPad());
    // the standalone battle is the backdrop of the title screen (and of the screens that leave it): it rotates while any is open
    this.scene.setSpin(
      !!document.querySelector('.title-overlay') && !matchMedia('(prefers-reduced-motion: reduce)').matches,
    );
    this.placeMenu();
    const gp = [...(navigator.getGamepads?.() ?? [])].find((g) => g?.connected);
    pace.pad = !!gp?.buttons[0]?.pressed; // holding A (or x) fast-forwards the battle
    if (!gp) return;
    const actions = padActions(
      { buttons: gp.buttons.map((b) => b.pressed), axes: [...gp.axes] },
      this.pad,
      performance.now(),
    );
    // 1st frame with a pad: only records what was already pressed (the A that entered the stage does not pick the 1st command)
    if (!this.padPrimed) return void (this.padPrimed = true);
    for (const a of actions) {
      const overlay = document.querySelector<HTMLElement>('.overlay');
      if (!overlay) {
        this.runKey(a);
        continue;
      }
      // only what is in view: the hidden Options section holds buttons that would take focus without showing
      const buttons = [...overlay.querySelectorAll<HTMLElement>('button:not([disabled]), input[type=range]')].filter(
        (e) => e.offsetParent,
      );
      const at = buttons.indexOf(document.activeElement as HTMLElement);
      const range =
        document.activeElement instanceof HTMLInputElement && document.activeElement.type === 'range'
          ? document.activeElement
          : null;
      if (a.k === 'cancel' || a.k === 'help')
        dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' }));
      else if (a.k === 'confirm') (document.activeElement as HTMLElement | null)?.click();
      else if (a.k === 'cursor' && range && (a.dir === 'left' || a.dir === 'right')) {
        // on the volume bar, left and right change the value (stepUp/Down do not fire 'input': it is dispatched by hand)
        if (a.dir === 'right') range.stepUp();
        else range.stepDown();
        range.dispatchEvent(new Event('input'));
      } else if (a.k === 'cursor')
        buttons[(at + (a.dir === 'up' || a.dir === 'left' ? -1 : 1) + buttons.length) % buttons.length]?.focus();
    }
  }

  private showFps() {
    if (this.fps.hidden) return;
    const s = this.scene.stats();
    const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    this.fps.textContent = [
      `${s.fps.toFixed(0)} fps · ${s.ms.toFixed(1)} ms`,
      t(
        `${s.calls} desenhos · ${(s.triangles / 1000).toFixed(1)} mil triângulos`,
        `${s.calls} draw calls · ${(s.triangles / 1000).toFixed(1)}k triangles`,
      ),
      t(`${s.geometries} geometrias · ${s.textures} texturas`, `${s.geometries} geometries · ${s.textures} textures`),
      ...(mem ? [`JS ${(mem.usedJSHeapSize / 1048576).toFixed(0)} MB`] : []),
    ].join('\n');
  }

  private runKey(a: KeyAction) {
    const b = this.battle;
    // camera, help, status and counter always work, including on the enemy turn
    if (a.k === 'rotate') return this.scene.rotate(a.dir);
    if (a.k === 'zoom') return this.scene.zoom(a.factor);
    if (a.k === 'recenter') return this.scene.resetView();
    if (a.k === 'help') return this.menu();
    if (a.k === 'pixel') return this.setPixel({ ...this.pixel, size: nextSize(this.pixel.size) });
    if (a.k === 'status') return this.status();
    if (a.k === 'turns') {
      const full = !this.hud.queueFull;
      store.set(QUEUE_KEY, full ? 'all' : '');
      return this.hud.setQueueFull(full);
    }
    if (a.k === 'fps') {
      this.fps.hidden = !this.fps.hidden;
      store.set(FPS_KEY, this.fps.hidden ? '0' : '1');
      return this.showFps();
    }
    if (this.busy || !this.heroTurn) return;
    if (a.k === 'undo') return this.undo();
    if (a.k === 'face') return this.face();
    const s = this.screen;
    if (a.k === 'slot') {
      // number shortcut: 1 = Move, 2 onwards = the abilities in submenu order
      if (a.index === 0) return this.chooseCommand(0);
      if (commandEnabled(b, 'act')) return this.chooseAbility(a.index - 1);
      return;
    }
    if (a.k === 'wait') return this.chooseCommand(2);
    if (s.k === 'menu' || s.k === 'abilities') {
      const list =
        s.k === 'menu' ? COMMANDS.map((c) => commandEnabled(b, c)) : abilitiesOf(b).map((id) => abilityEnabled(b, id));
      if (a.k === 'cursor' && (a.dir === 'up' || a.dir === 'down')) {
        sfx('cursor');
        this.screen = { ...s, index: stepIndex(s.index, a.dir === 'up' ? -1 : 1, list) };
        return this.update(this.ui);
      }
      if (a.k === 'confirm') return s.k === 'menu' ? this.chooseCommand(s.index) : this.chooseAbility(s.index);
      if (a.k === 'cancel' && s.k === 'abilities') return this.back({ k: 'menu', index: 1 });
      // Esc, B or right button on the menu after moving (without having acted): undoes the move, like Tactics Ogre
      if (a.k === 'cancel' && canUndoMove(b)) return this.undo();
      return;
    }
    if (s.k === 'confirm') {
      if (a.k === 'cursor') {
        sfx('cursor');
        this.screen = { ...s, yes: !s.yes };
        return this.update(this.ui);
      }
      if (a.k === 'confirm') return void this.answer(s.yes);
      if (a.k === 'cancel') return void this.answer(false);
      return;
    }
    if (s.k === 'facing') {
      if (a.k === 'cursor') {
        const st = gridStep(a.dir, this.scene.heading);
        this.faceTo({ x: b.actor.pos.x + st.x, y: b.actor.pos.y + st.y });
      } else if (a.k === 'confirm') void this.endTurn();
      else if (a.k === 'cancel') this.back({ k: 'menu', index: 2 });
      return;
    }
    // map: choose the tile
    if (a.k === 'cursor') {
      const step = gridStep(a.dir, this.scene.heading);
      const next = { x: this.cursor.x + step.x, y: this.cursor.y + step.y };
      if (inBounds(b.grid, next)) this.moveCursor(next);
    } else if (a.k === 'cycle') this.moveCursor(cycleUnit(b.state, this.cursor, a.dir));
    else if (a.k === 'confirm') void this.mapConfirm();
    else if (a.k === 'cancel') {
      // goes back to where it came from: Move -> menu; ability -> submenu, on the same ability
      const m = this.ui.mode;
      this.back(m.k === 'ability' ? { k: 'abilities', index: abilitiesOf(b).indexOf(m.id) } : { k: 'menu', index: 0 });
    }
  }

  private back(screen: Screen) {
    sfx('cancel');
    this.screen = screen;
    this.cursorToActor();
    this.update(freshUi(this.battle));
  }

  // menu command (click, Enter, pad A or shortcut)
  private chooseCommand(index: number) {
    const b = this.battle;
    const c = COMMANDS[index];
    if (this.busy || !this.heroTurn || !c || !commandEnabled(b, c)) return;
    if (c === 'move' && canUndoMove(b)) return this.undo(); // the Move row became "Undo move"
    sfx('confirm');
    if (c === 'status') return this.status();
    if (c === 'wait') return void this.endTurn();
    if (c === 'act') {
      const list = abilitiesOf(b).map((id) => abilityEnabled(b, id));
      this.screen = { k: 'abilities', index: Math.max(0, list.indexOf(true)) };
      return this.update(this.ui);
    }
    this.screen = { k: 'map', command: 'move' };
    this.cursorToActor();
    this.update(hoverTile(b, selectMode(b, this.ui, { k: 'move' }), this.cursor));
  }

  // submenu ability: goes to the map to choose the target; self-centered goes straight to "Execute?"
  private chooseAbility(index: number) {
    const b = this.battle;
    const id = abilitiesOf(b)[index];
    if (this.busy || !this.heroTurn || !id || !commandEnabled(b, 'act') || !abilityEnabled(b, id)) return;
    sfx('confirm');
    const ui = selectMode(b, this.ui, { k: 'ability', id });
    if (ABILITIES[id].range[1] === 0) {
      this.screen = { k: 'confirm', ability: id, target: b.actor.pos, yes: true };
      return this.update(ui);
    }
    this.screen = { k: 'map', command: 'act' };
    this.cursorToActor();
    this.update(hoverTile(b, ui, this.cursor));
  }

  // confirm on the map: Move walks at once (like FFT); Act opens "Execute?"
  private async mapConfirm() {
    const p = this.ui.pending;
    const m = this.ui.mode;
    if (!p) return sfx('cancel');
    if (m.k === 'ability') {
      if (!this.battle.preview(m.id, p).ok) return sfx('cancel');
      sfx('confirm');
      this.screen = { k: 'confirm', ability: m.id, target: p, yes: true };
      return this.update(this.ui);
    }
    sfx('confirm');
    await this.execute();
  }

  private async answer(yes: boolean) {
    const s = this.screen;
    if (s.k !== 'confirm' || this.busy) return;
    if (!yes) {
      sfx('cancel');
      if (ABILITIES[s.ability].range[1] === 0)
        return this.back({ k: 'abilities', index: abilitiesOf(this.battle).indexOf(s.ability) });
      this.screen = { k: 'map', command: 'act' };
      return this.update(this.ui);
    }
    sfx('confirm');
    await this.execute();
  }

  // runs what the Ui has marked (move or act) and returns to the menu, on the next command that applies
  private async execute() {
    const { events, ui } = confirm(this.battle, this.ui);
    if (!events.length) return;
    this.ui = ui;
    await this.animate(events);
    this.save();
    if (this.battle.over) return this.finish();
    // fell to a counterattack while retreating: the turn passes by itself
    if (!this.battle.state.units.some((u) => u.id === this.battle.state.turn.actor)) {
      const ev = this.battle.endTurn();
      if (ev.length) await this.animate(ev);
      this.save();
      if (this.battle.over) return this.finish();
      return this.runEnemies();
    }
    this.screen = startScreen(this.battle);
    this.cursorToActor();
    this.update(freshUi(this.battle));
  }

  private setPixel(p: PixelSettings) {
    this.pixel = p;
    store.set(PIXEL_KEY, JSON.stringify(p));
    this.scene.setPixel(p);
    this.log = t(
      `Pixel art: ${p.size ? `${p.size} px` : 'desligado'}`,
      `Pixel art: ${p.size ? `${p.size} px` : 'off'}`,
    );
    this.update(this.ui);
  }

  private moveCursor(p: Pos) {
    sfx('cursor');
    this.cursor = p;
    this.scene.focusOn(p); // the camera follows the cursor, like FFT
    this.update(hoverTile(this.battle, this.ui, p));
  }

  // cursor goes back to the acting unit (start of turn, after acting, undo)
  private cursorToActor() {
    this.cursor = this.battle.actor.pos;
  }

  private get heroTurn() {
    return !AUTO && !this.battle.over && this.battle.actor.team === 'hero';
  }

  private update(ui: Ui) {
    this.ui = ui;
    if (this.battle.state.scenario === SURVIVAL_ID)
      this.scene.setDaylight(1 - turnsLeft(this.battle.state) / SURVIVE_TURNS);
    const s = this.screen;
    // on the menu and submenu only the acting unit's tile is marked; the range shows when choosing (like FFT)
    const hl =
      !this.heroTurn || this.busy
        ? null
        : s.k === 'facing'
          ? this.facingMarks()
          : s.k === 'map' || s.k === 'confirm'
            ? highlights(this.battle, ui)
            : { tiles: [{ pos: this.battle.actor.pos, kind: 'actor' as const }], path: null, preview: null };
    this.scene.setHighlights(hl);
    this.scene.setCursor(hl ? this.cursor : null);
    // dotted outline of the longest range: on the menu around the acting unit; when aiming the move, around the tile under the cursor (if
    // it can be reached), to see where the strike reaches before moving
    const moving = s.k === 'map' && ui.mode.k === 'move';
    const ringAt =
      !hl || s.k === 'facing' || (s.k !== 'menu' && s.k !== 'abilities' && !moving)
        ? null
        : moving && this.battle.reach().has(posKey(this.cursor))
          ? this.cursor
          : this.battle.actor.pos;
    this.scene.setRangeRing(ringAt ? { center: ringAt, range: longestRange(this.battle) } : null);
    // trajectory preview (Nov 13, "like Tactics Ogre"): when aiming a shot or spell that needs line of sight, the line runs from
    // the attacker to the cursor tile and turns red from where it hits
    const aim =
      hl && (s.k === 'map' || s.k === 'confirm') && ui.mode.k === 'ability' && ABILITIES[ui.mode.id].needsSight
        ? this.cursor
        : null;
    const from = this.battle.actor.pos;
    const magic = ui.mode.k === 'ability' && !!ABILITIES[ui.mode.id].magic;
    this.scene.setTrajectory(
      aim && (aim.x !== from.x || aim.y !== from.y)
        ? {
            from,
            to: aim,
            block: shotStop(this.battle.grid, this.battle.state, from, aim, this.battle.actor.id, !magic)?.pos ?? null,
          }
        : null,
    );
    this.hud.render({
      battle: this.battle,
      screen: s,
      hl,
      busy: this.busy,
      log: this.log,
      acting: this.acting,
      cursor: this.cursor,
      ability: ui.mode.k === 'ability' ? ui.mode.id : null,
    });
    const { top, bottom } = this.hud.insets();
    this.scene.setInsets(top, bottom);
    this.placeMenu(); // already in place on open: waiting for the next frame showed the menu in the corner for 1 frame
  }

  // Command menu, submenu and "Execute?" beside the acting unit (Nov 13, Fernando's request: "beside the character like in
  // FFT"). Runs every frame (pollPad) because the camera slides and rotates with the menu open. "Execute?" does not cover the target.
  private placeMenu() {
    if (!this.hud.menuOpen) return;
    const b = this.battle,
      s = this.screen;
    const foe = s.k === 'confirm' ? unitAt(b.state, s.target) : undefined;
    this.hud.place(this.scene.screenOf(b.actor.id), foe && foe.id !== b.actor.id ? this.scene.screenOf(foe.id) : null);
  }

  private async animate(events: BattleEvent[], enemy = false) {
    addEvents(this.tally, events, this.teamOf());
    this.busy = true;
    this.update(this.ui);
    await this.scene.playEvents(events, this.battle.state, (e) => this.beforeEvent(e, enemy));
    this.hud.banner(null);
    this.log = eventLog(events, this.battle.state) || this.log;
    this.busy = false;
  }

  // FFT steps before each event: the enemy shows where it is going before moving, and every strike shows the ability name
  // in a banner at the top with the hit area marked (timings in timing.ts)
  // Sound for each event (before its animation): step by step, strike in the air, hit, miss, heal, charge, fall
  private sound(e: BattleEvent) {
    const MELEE = new Set(['slash', 'heavy', 'stab', 'impact', 'spin', 'dash', 'debuff']);
    const BY_EVENT: Partial<Record<BattleEvent['k'], Sfx>> = {
      hit: 'hit',
      bump: 'hit',
      fall: 'hit',
      spike: 'hit',
      miss: 'miss',
      heal: 'heal',
      charge: 'charge',
      fizzle: 'miss',
      die: 'die',
    };
    if (e.k === 'move') {
      // step at the start of each tile walked; on a jump, the sound goes on landing (same timings as the scene, stepMs)
      const h = (i: number) => standH(tileAt(this.battle.grid, e.path[i]));
      let at = 0;
      for (let i = 1; i < e.path.length; i++) {
        // ramp: walking, at the step pace (the same as scene.ts)
        const dh = rampLink(this.battle.grid, e.path[i - 1], e.path[i]) ? 0 : h(i) - h(i - 1),
          tiles = dist(e.path[i - 1], e.path[i]),
          ms = stepMs(dh, tiles);
        void this.scene.wait(at + (isJump(dh, tiles) ? ms - TIMING.jumpLand : 0)).then(() => sfx('step'));
        at += ms;
      }
    } else if (e.k === 'attack') {
      const fx = lookOf(e.ability).fx;
      sfx(
        MELEE.has(fx)
          ? 'swing'
          : fx === 'fire' || fx === 'blast'
            ? 'fire'
            : ['heal', 'buff', 'wind'].includes(fx)
              ? 'spell'
              : 'throw',
      );
    } else if (BY_EVENT[e.k]) sfx(BY_EVENT[e.k]!);
  }

  private async beforeEvent(e: BattleEvent, enemy: boolean) {
    // the enemy's steps play after the cursor shows the destination, along with the walk
    // the strike sound comes out with the gesture, after the name banner (Nov 13, review: it played ~0.9 s earlier)
    if (!(e.k === 'move' && enemy) && e.k !== 'attack') this.sound(e);
    const show = async (hl: Highlights, ms: number) => {
      this.scene.setHighlights(hl);
      await this.scene.wait(ms);
      this.scene.setHighlights(null);
    };
    if (e.k === 'move' && enemy) {
      const to = e.path.at(-1)!;
      this.scene.setCursor(to);
      await show(
        { tiles: [{ pos: to, kind: 'target' }], path: e.path.slice(1), preview: null },
        TIMING.enemyDestination,
      ); // without the dot under the walker
      this.scene.setCursor(null);
      this.sound(e);
    } else if (e.k === 'attack') {
      const a = ABILITIES[e.ability];
      const me = this.battle.state.units.find((u) => u.id === e.unit);
      if (me) this.scene.focusOn(me.pos, e.target);
      const area = [
        e.target,
        ...this.allTiles().filter((p) => a.radius > 0 && dist(p, e.target) <= a.radius && !samePos(p, e.target)),
      ];
      this.hud.banner(abilityName(e.ability));
      await show(
        { tiles: area.map((pos, i) => ({ pos, kind: i ? 'area' : 'target' })), path: null, preview: null },
        TIMING.banner,
      );
      this.sound(e);
    }
  }

  private allTiles(): Pos[] {
    const g = this.battle.grid;
    return Array.from({ length: g.width * g.height }, (_, i) => ({ x: i % g.width, y: Math.floor(i / g.width) }));
  }

  // tiles around the acting unit: the one it faces is highlighted (direction choice at the end of the turn)
  private facingMarks(): Highlights {
    const me = this.battle.actor;
    const tiles = neighbors(this.battle.grid, me.pos).map((pos) => ({
      pos,
      kind: facingTo(me.pos, pos) === me.facing ? ('target' as const) : ('range' as const),
    }));
    return { tiles: [...tiles, { pos: me.pos, kind: 'actor' }], path: null, preview: null };
  }

  private faceTo(p: Pos) {
    const me = this.battle.actor;
    // clicking the unit itself or the direction it already faces confirms and passes the turn (review of Nov 13: with only a mouse
    // there was no way to end the turn, the click only rotated)
    if (samePos(p, me.pos) || facingTo(me.pos, p) === me.facing) return void this.endTurn();
    sfx('cursor');
    this.battle.face(facingTo(me.pos, p));
    this.scene.sync(this.battle.state);
    this.update(this.ui);
  }

  // status window of the unit under the cursor (or of the acting unit), with dialog() like the other dialogs
  private status() {
    const s = this.battle.state;
    const id = unitAt(s, this.cursor)?.id ?? this.battle.actor?.id; // any tile of the large unit
    if (!id) return;
    const u = s.units.find((x) => x.id === id)!;
    dialog('status', unitName(u.def), [
      el('dl', { class: 'keys' }, ...unitStatus(s, id).flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)])),
    ]);
  }

  private save() {
    store.set(SAVE_KEY, this.battle.over ? '' : this.battle.save());
  }

  private async endTurn() {
    // map with direction: before passing the turn, choose where to look (like FFT)
    if (this.screen.k !== 'facing' && this.heroTurn && this.battle.actor.facing !== undefined) {
      this.screen = { k: 'facing' };
      this.cursorToActor();
      return this.update(this.ui);
    }
    // charges that fire before the next turn (heroes' or enemies') play here
    const events = this.battle.endTurn();
    if (events.length) await this.animate(events);
    this.save();
    await this.runEnemies();
  }

  private async runEnemies() {
    while (!this.battle.over && !this.heroTurn) {
      this.busy = true;
      this.acting = this.battle.actor.def;
      this.scene.focusOn(this.battle.actor.pos);
      this.scene.pop(this.battle.actor.id);
      this.update(this.ui);
      await this.scene.wait(TIMING.enemyStart);
      await this.animate(playAiTurn(this.battle), true);
      // the state has already passed the turn (maybe to a hero): stays locked during the pause, otherwise the tap or key of this
      // window counted and was erased right after by freshUi (found by the keyboard-only test, Oct 25)
      this.busy = true;
      this.update(this.ui); // shows the summary still with the name of who acted
      await this.scene.wait(TIMING.enemyAfter);
      this.save();
    }
    this.acting = null;
    this.busy = false;
    this.screen = startScreen(this.battle);
    if (this.heroTurn) {
      this.cursorToActor();
      this.scene.focusOn(this.battle.actor.pos);
      this.scene.pop(this.battle.actor.id);
    }
    this.update(freshUi(this.battle));
    if (this.battle.over) this.finish();
  }

  // rotates the acting unit 90 degrees clockwise: it is the choice of where to look before passing the turn (every map since Nov 13)
  private face() {
    const f = this.battle.actor.facing;
    if (this.busy || !this.heroTurn || f === undefined) return;
    this.battle.face((f + 1) % 4);
    this.scene.sync(this.battle.state);
    this.save();
    this.update(this.ui);
  }

  private undo() {
    if (!this.battle.undo()) return;
    sfx('cancel');
    this.log = ''; // the help line showed the undone action (review of Nov 13)
    this.screen = startScreen(this.battle);
    this.scene.sync(this.battle.state);
    this.save();
    this.cursorToActor();
    this.scene.focusOn(this.battle.actor.pos); // the camera had followed the cursor to the destination: goes back to the acting unit
    this.update(freshUi(this.battle));
  }

  private resetTally() {
    this.tally = emptyTally();
    this.roster = Object.fromEntries(this.battle.state.units.map((u) => [u.id, { team: u.team, def: u.def }]));
  }

  // "Highlight: Bran · 48 damage · 2 downed" (the hero who downed the most; tie broken by damage), like FFT's closing
  private mvpLine(): HTMLElement[] {
    const m = mvp(this.tally, this.teamOf(), 'hero');
    if (!m) return [];
    const [id, s] = m;
    const name = unitName(this.roster[id].def);
    return [
      el(
        'p',
        { class: 'mvp' },
        t(
          `Destaque: ${name} · ${s.dmg} de dano · ${s.kills} derrubado${s.kills === 1 ? '' : 's'}`,
          `MVP: ${name} · ${s.dmg} damage · ${s.kills} ${s.kills === 1 ? 'takedown' : 'takedowns'}`,
        ),
      ),
    ];
  }

  private restart() {
    this.battle = newBattle();
    this.resetTally();
    this.log = '';
    this.screen = startScreen(this.battle);
    this.scene.sync(this.battle.state);
    this.save();
    this.update(freshUi(this.battle));
    void this.runEnemies();
  }

  private async finish() {
    const won = this.battle.state.outcome === 'victory';
    jingle(won);
    this.scene.celebrate(won ? 'hero' : 'enemy', this.battle.state);
    if (won) confetti();
    if (chapter !== null) return this.finishChapter(chapter, won);
    // Until Dawn: how many turns it lasted and the record (a new record gets highlighted, like the stage grade)
    // winning by downing everyone before dawn also counts as surviving the whole night (it used to save "record 20" on a victory)
    const lasted = won ? SURVIVE_TURNS : survived(this.battle.state),
      best = parseBest(store.get(BEST_KEY));
    // bar mission won: gold and item in the chest, and it leaves the bar (missions.ts)
    if (mission && won && !parseDone(store.json(MISSIONS_KEY)).includes(mission.id)) {
      const chest = parseChest(store.json(CHEST_KEY));
      store.set(
        CHEST_KEY,
        JSON.stringify({
          gold: chest.gold + mission.gold,
          items: mission.item ? [...chest.items, mission.item] : chest.items,
        }),
      );
      store.set(MISSIONS_KEY, JSON.stringify([...parseDone(store.json(MISSIONS_KEY)), mission.id]));
    }
    if (scenario.id === SURVIVAL_ID && lasted > best) store.set(BEST_KEY, String(lasted));
    const d = dialog('result', won ? t('Vitória!', 'Victory!') : t('Derrota', 'Defeat'), [
      ...(scenario.id === SURVIVAL_ID
        ? [
            el(
              'p',
              { class: lasted > best ? 'learned' : '' },
              lasted > best
                ? t(
                    `Novo recorde: ${lasted} de ${SURVIVE_TURNS} turnos!`,
                    `New record: ${lasted} of ${SURVIVE_TURNS} turns!`,
                  )
                : t(
                    `Aguentaram ${lasted} de ${SURVIVE_TURNS} turnos (recorde: ${best}).`,
                    `Held out ${lasted} of ${SURVIVE_TURNS} turns (record: ${best}).`,
                  ),
            ),
          ]
        : []),
      ...this.mvpLine(),
      ...(mission && won
        ? [
            el(
              'p',
              { class: 'mvp' },
              t(
                `Recompensa: ${mission.gold} de ouro${mission.item ? ` e ${ITEMS[mission.item].name}` : ''} no baú.`,
                `Reward: ${mission.gold} gold${mission.item ? ` and ${ITEMS[mission.item].en}` : ''} in the chest.`,
              ),
            ),
          ]
        : []),
      el(
        'p',
        {},
        scenario.id === SURVIVAL_ID
          ? won
            ? t('O sol nasceu e os heróis ainda estavam de pé.', 'The sun rose and the heroes were still standing.')
            : t('Os heróis tombaram antes do amanhecer.', 'The heroes fell before dawn.')
          : won
            ? t('Todos os inimigos caíram e o Farol resistiu.', 'Every enemy fell and the Beacon held.')
            : t('O Farol caiu ou os heróis tombaram.', 'The Beacon fell or the heroes were defeated.'),
      ),
      // Title beside it: without it, leaving the standalone battle required reloading the page
      el(
        'div',
        { class: 'menu-actions' },
        mission && won
          ? el('button', { type: 'button', class: 'primary', onclick: toWorld }, t('Voltar ao mapa', 'Back to map'))
          : el(
              'button',
              {
                type: 'button',
                class: 'primary',
                onclick: () => {
                  d.close();
                  this.restart();
                },
              },
              t('Jogar de novo', 'Play again'),
            ),
        el(
          'button',
          {
            type: 'button',
            class: 'secondary',
            onclick: () => {
              location.search = '';
            },
          },
          t('Título', 'Title'),
        ),
      ),
    ]);
    // Enter plays again (focus went to the X, and closing left the finished battle with no key to restart)
    d.overlay.querySelector<HTMLButtonElement>('.primary')!.focus();
  }

  // Campaign stage end: victory unlocks the next and plays the exit conversation; defeat offers to try again
  private async finishChapter(n: number, won: boolean) {
    const last = n === CHAPTERS.length - 1;
    if (won) {
      store.set(CAMPAIGN_KEY, String(Math.max(parseProgress(store.get(CAMPAIGN_KEY)), n + 1)));
      store.set(WORLD_KEY, String(afterNode(nodeOfChapter(n), parseWorld(store.get(WORLD_KEY)))));
      // fixed gold per victory (party chest, chest.ts), for the shop; no stars since Nov 13 (Fernando's request: "remove
      // the stars mechanic... this will be the next Final Fantasy Tactics", no puzzle feel)
      const chest = parseChest(store.json(CHEST_KEY));
      store.set(CHEST_KEY, JSON.stringify({ ...chest, gold: chest.gold + VICTORY_GOLD }));
      await talk(CHAPTERS[n].outro, { hero: savedHero() });
    }
    const d = dialog(
      'result',
      won
        ? last
          ? t('Fim da campanha!', 'Campaign complete!')
          : t('Fase vencida!', 'Stage cleared!')
        : t('Derrota', 'Defeat'),
      [
        ...(won
          ? [
              ...this.mvpLine(),
              el(
                'p',
                { class: 'mvp' },
                t(`+${VICTORY_GOLD} de ouro no baú do grupo`, `+${VICTORY_GOLD} gold in the party chest`),
              ),
              ...learned(n, savedHero(), savedGroup()).map((x) =>
                el(
                  'p',
                  { class: 'learned' },
                  t(
                    `${x.name} aprendeu ${x.abilities.map(abilityName).join(' e ')}!`,
                    `${x.name} learned ${x.abilities.map(abilityName).join(' and ')}!`,
                  ),
                ),
              ),
            ]
          : []),
        // on the last stage there is no next battle: the map keeps only the epilogue, back to Vauclair
        el(
          'p',
          {},
          won
            ? last
              ? t('O epílogo espera em Vauclair, no mapa.', 'The epilogue awaits in Vauclair, on the map.')
              : t('O caminho seguinte se abriu no mapa.', 'The next path opened on the map.')
            : this.battle.state.units.some((u) => u.def === OBJECTIVE_DEF) ||
                !scenario.spawns.some((s) => s.def === OBJECTIVE_DEF)
              ? t('Os heróis caíram. A fase recomeça do início.', 'The heroes fell. The stage starts over.')
              : t('O Farol se apagou. A fase recomeça do início.', 'The Beacon went dark. The stage starts over.'),
        ),
        // victory returns to the world map (the next point is open); defeat retries right there or goes back to the map
        el(
          'div',
          { class: 'menu-actions' },
          won
            ? el(
                'button',
                {
                  type: 'button',
                  class: 'primary',
                  onclick: () => {
                    location.search = `?mundo&de=${nodeOfChapter(n)}`;
                  },
                },
                t('Voltar ao mapa', 'Back to the map'),
              )
            : el(
                'button',
                {
                  type: 'button',
                  class: 'primary',
                  onclick: () => {
                    d.close();
                    this.restart();
                  },
                },
                t('Tentar de novo', 'Try again'),
              ),
          ...(won ? [] : [el('button', { type: 'button', class: 'secondary', onclick: toWorld }, t('Mapa', 'Map'))]),
        ),
      ],
    );
    d.overlay.querySelector<HTMLButtonElement>('.primary')!.focus();
  }

  // Options (Nov 13, Fernando's request: "the menu could take up more of the screen width, with subsections"): wide window
  // with the sections in a left column (vertical choice()) and one section at a time on the right, so nothing scrolls far
  private menu() {
    const sections: [id: string, title: string, body: Node[]][] = [
      [
        'jogo',
        t('Jogo', 'Game'),
        [
          // in the campaign, the stage objective (no Beacon, boss); in the standalone battle, the usual one
          el(
            'p',
            {},
            chapter !== null
              ? t(`Objetivo: ${objectiveText(chapter, t)}`, `Goal: ${objectiveText(chapter, t)}`)
              : scenario.id === SURVIVAL_ID
                ? t(`Objetivo: ${survivalGoal(t)}`, `Goal: ${survivalGoal(t)}`)
                : t(
                    'Objetivo: derrote os inimigos e proteja o Farol (o cristal azul).',
                    'Goal: defeat the enemies and protect the Beacon (the blue crystal).',
                  ),
          ),
          el(
            'ul',
            { class: 'legend' },
            el(
              'li',
              {},
              el('i', { class: 'sw move' }),
              t('Azul, moldura lisa: onde o herói pode andar', 'Blue, plain frame: where the hero can move'),
            ),
            el(
              'li',
              {},
              el('i', { class: 'sw range' }),
              t('Laranja, listras: alcance da habilidade', 'Orange, stripes: ability range'),
            ),
            el(
              'li',
              {},
              el('i', { class: 'sw blocked' }),
              t('Roxo, xis: no alcance, mas sem visão', 'Purple, cross: in range, but no sight'),
            ),
            el(
              'li',
              {},
              el('i', { class: 'sw threat' }),
              t('Vermelho, listras: o que a unidade tocada alcança', 'Red, stripes: what the tapped unit can reach'),
            ),
          ),
          choice(
            t('Velocidade do texto das conversas', 'Dialogue text speed'),
            [
              ['normal', t('Normal', 'Normal')],
              ['fast', t('Rápida', 'Fast')],
              ['instant', t('Instantânea', 'Instant')],
            ] as [TextSpeed, string][],
            textSpeed(),
            (v) => store.set(TEXT_KEY, v),
          ),
        ],
      ],
      [
        'som',
        t('Som', 'Sound'),
        [
          slider(t('Música', 'Music'), soundSettings().music, (music) => setSound({ ...soundSettings(), music })),
          slider(t('Efeitos', 'Effects'), soundSettings().sfx, (v) => setSound({ ...soundSettings(), sfx: v })),
        ],
      ],
      [
        'video',
        t('Vídeo e efeitos', 'Video and effects'),
        [
          choice(
            t('Tamanho do pixel', 'Pixel size'),
            [
              [0, t('Desligado', 'Off')],
              [2, '2 px'],
              [3, '3 px'],
              [4, '4 px'],
            ] as [PixelSize, string][],
            this.pixel.size,
            (size) => this.setPixel({ ...this.pixel, size }),
          ),
          choice(
            t('Contorno', 'Outline'),
            [
              [true, t('Ligado', 'On')],
              [false, t('Desligado', 'Off')],
            ],
            this.pixel.outline,
            (outline) => this.setPixel({ ...this.pixel, outline }),
          ),
          choice(
            t('Paleta reduzida (16 bits)', 'Reduced palette (16-bit)'),
            [
              [false, t('Desligada', 'Off')],
              [true, t('Ligada', 'On')],
            ],
            this.pixel.palette,
            (palette) => this.setPixel({ ...this.pixel, palette }),
          ),
          choice(
            t('Câmera presa à grade de pixels', 'Camera locked to the pixel grid'),
            [
              [true, t('Ligada', 'On')],
              [false, t('Desligada', 'Off')],
            ],
            this.pixel.snap,
            (snap) => this.setPixel({ ...this.pixel, snap }),
          ),
        ],
      ],
      [
        'controles',
        t('Controles', 'Controls'),
        [
          el(
            'p',
            {},
            t(
              'Mouse: passe por cima para escolher, clique para confirmar, botão direito volta; arraste para mover a câmera e use a roda para o zoom. Controle: direcional ou analógico andam, A (×) confirma, B (○) volta, ombros giram a câmera, Start abre este menu.',
              'Mouse: hover to pick, click to confirm, right click goes back; drag to move the camera and use the wheel to zoom. Gamepad: d-pad or stick moves, A (×) confirms, B (○) goes back, shoulders rotate the camera, Start opens this menu.',
            ),
          ),
          el('dl', { class: 'keys' }, ...keyHelp().flatMap(([k, what]) => [el('dt', {}, k), el('dd', {}, what)])),
        ],
      ],
      [
        'idioma',
        t('Idioma', 'Language'),
        [
          choice(
            t('Idioma', 'Language'),
            [
              ['pt', 'Português'],
              ['en', 'English'],
            ] as [Lang, string][],
            LANG,
            setLang,
          ),
        ],
      ],
    ];
    const panels = sections.map(([id, title, body]) =>
      el('section', { class: 'menu-section', hidden: id !== 'jogo' }, el('h3', {}, title), ...body),
    );
    const nav = choice(
      t('Seções', 'Sections'),
      sections.map(([id, title]) => [id, title] as [string, string]),
      'jogo',
      (id) => panels.forEach((p, i) => (p.hidden = sections[i][0] !== id)),
    );
    nav.classList.add('menu-nav');
    const d = dialog('menu', t('Opções', 'Options'), [
      el('div', { class: 'menu-layout' }, nav, el('div', { class: 'menu-body' }, ...panels)),
      el(
        'div',
        { class: 'menu-actions' },
        // during the animation or the enemy turn the loop is still running the old battle
        // the 1st tap only asks: restart erases the saved battle and cannot be undone (mobile audit of Oct 25)
        el(
          'button',
          {
            type: 'button',
            class: 'secondary',
            disabled: this.busy,
            onclick: (e: Event) => {
              const btn = e.currentTarget as HTMLButtonElement;
              if (!btn.dataset.armed) {
                btn.dataset.armed = '1';
                btn.textContent = t('Toque de novo para reiniciar', 'Tap again to restart');
                return;
              }
              d.close();
              this.restart();
            },
          },
          t('Reiniciar batalha', 'Restart battle'),
        ),
        el('button', { type: 'button', class: 'secondary', onclick: toWorld }, t('Mapa da campanha', 'Campaign map')),
        // exit to the title (in the standalone battle the campaign map is not where the person came from)
        el(
          'button',
          {
            type: 'button',
            class: 'secondary',
            onclick: () => {
              location.search = '';
            },
          },
          t('Título', 'Title'),
        ),
        el(
          'button',
          {
            type: 'button',
            class: 'secondary',
            onclick: () => {
              d.close();
              void devMenu();
            },
          },
          t('Desenvolvedor', 'Developer'),
        ),
      ),
    ]);
  }
}

// Developer menu (Nov 12): loads the FFT study separately just to offer Gariland's terrain as a map. Starting
// saves the roster, erases the previous developer battle and reopens the game on it (boot builds the scenario).
async function devMenu(onBack?: () => void) {
  (await import('../shared/battle/fft/gariland.ts')).registerFftStudy();
  openDevMenu(() => {
    store.set(`dt:battle:${DEV_SCENARIO}`, '');
    location.search = `?cenario=${DEV_SCENARIO}`;
  }, onBack);
}

async function boot() {
  const host = document.getElementById('app')!;
  // FFT reference study (Nov 11): not game content. Only opens with the parameter and comes in a separate chunk of the
  // build (dynamic import), so none of it goes into the package the player downloads.
  const study = new URLSearchParams(location.search).get('cenario');
  const camp = new URLSearchParams(location.search).get('campanha');
  // bar mission (missions.ts): only the ones not yet won; unknown or won mission address goes back to the map
  const mis = new URLSearchParams(location.search).get('missao');
  if (mis !== null) {
    const m = MISSIONS.find((x) => x.id === mis);
    if (!m || parseDone(store.json(MISSIONS_KEY)).includes(m.id)) return toWorld();
    mission = m;
    setTrack('road');
    scenario = missionScenario(
      m,
      parseProgress(store.get(CAMPAIGN_KEY)),
      savedHero(),
      parseEquip(store.json(EQUIP_KEY)),
      savedGroup(),
    );
    SAVE_KEY = `dt:battle:${missionScenarioId(m.id)}`;
  }
  if (new URLSearchParams(location.search).has('mundo')) return void worldScreen(host); // world map: no battle assembled
  // stage that does not exist or is still locked (typed or saved address): goes back to the map instead of falling into a standalone battle
  const allowed =
    camp !== null &&
    camp !== '' &&
    CHAPTERS[Number(camp)] !== undefined &&
    Number(camp) <= parseProgress(store.get(CAMPAIGN_KEY));
  if (camp !== null && !allowed) return toWorld();
  if (mission) {
    // already assembled above
  } else if (camp !== null && CHAPTERS[Number(camp)] && Number(camp) <= parseProgress(store.get(CAMPAIGN_KEY))) {
    // campaign stage: only opens if already unlocked (beat the previous one); each stage has its own save
    chapter = Number(camp);
    setTrack(CHAPTERS[chapter].song);
    scenario = chapterScenario(chapter, savedHero(), parseEquip(store.json(EQUIP_KEY)), savedGroup());
    SAVE_KEY = `dt:battle:${chapterId(chapter)}`;
  } else if (study === 'fft-gariland' || study === 'fft-classes') {
    const fft = await import('../shared/battle/fft/gariland.ts');
    fft.registerFftStudy();
    scenario = SCENARIOS[study];
    SAVE_KEY = `dt:battle:${study}`;
  } else if (study === DEV_SCENARIO) {
    // battle from the developer menu: the saved roster becomes the scenario (no valid roster, goes back to the default battle)
    const setup = parseSetup(store.json(DEV_KEY));
    // roster with a problem (empty team, unit without ability) broke the battle (Nov 13, review): falls back to the default
    if (setup && !problems(setup, t).length) {
      if (setup.map.startsWith('fft-')) (await import('../shared/battle/fft/gariland.ts')).registerFftStudy();
      scenario = buildDevScenario(setup);
      SAVE_KEY = `dt:battle:${DEV_SCENARIO}`;
    }
  } else if (study === 'meia') {
    // half tile (Nov 13, test version: 2x2 characters walking 1 at a time, trees of 3 to 5; half.ts)
    scenario = registerHalf();
    SAVE_KEY = `dt:battle:${HALF_ID}`;
  } else if (study === SURVIVAL_ID) {
    // the own rule (wins at dawn) only exists after the scenario is assembled: assemble before loading the save
    scenario = survivalScenario();
    SAVE_KEY = `dt:battle:${SURVIVAL_ID}`;
  } else if (study && SCENARIOS[study]) {
    // other game maps through the same parameter (e.g. ?cenario=flooded_crypt), with their own save
    scenario = SCENARIOS[study];
    SAVE_KEY = `dt:battle:${study}`;
  }
  const saved = store.get(SAVE_KEY);
  const battle = (saved && Battle.load(saved)) || newBattle();
  const pixel = parsePixel(store.json(PIXEL_KEY), innerWidth < 600);
  const scene = await BattleScene.create(
    host,
    battle.grid,
    battle.state,
    pixel,
    scenario.spawns.map((s) => s.def),
  );
  new Game(battle, scene, host, pixel);
  // campaign stage mood (dark crypt, Hill under the Veil, ridge at night): the same light as Until Dawn mode
  const light = chapter !== null ? CHAPTERS[chapter].light : undefined;
  if (light !== undefined) scene.setDaylight(light);
  // stage starting from zero: the opening conversation over the already assembled map
  // stage from zero: opening conversation and, on closing, the objective banner (like FFT's objective announcement)
  const n = chapter;
  if (n !== null && !saved)
    void talk(CHAPTERS[n].intro, { title: chapterTitle(n), hero: savedHero() }).then(() =>
      announce(objectiveText(n, t)),
    );
  if (study === SURVIVAL_ID && !saved) announce(survivalGoal(t));
  // opening the game without a parameter shows the title screen over the standalone battle (which stays behind, already playable)
  if (camp === null && !study) titleScreen();
}

// Large banner in the middle of the screen for 2 s (objective at the start of the stage); disappears by itself and does not take clicks
function announce(text: string) {
  sfx('confirm');
  const box = el('div', { class: 'announce', role: 'status' }, text);
  document.body.append(box);
  setTimeout(() => box.remove(), 2200);
}

// Victory: confetti falling for 2.5 s (DOM and CSS, no cost in the 3D frame); disappears by itself. With reduced motion, nothing.
function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#f2c14e', '#4aa3ff', '#ff6b6b', '#7dffa8', '#ffffff'];
  const box = el(
    'div',
    { class: 'confetti', 'aria-hidden': 'true' },
    ...Array.from({ length: 60 }, (_, i) =>
      el('i', {
        style: `left:${Math.random() * 100}%;background:${colors[i % colors.length]};animation-delay:${Math.random() * 0.8}s;animation-duration:${1.6 + Math.random()}s`,
      }),
    ),
  );
  document.body.append(box);
  setTimeout(() => box.remove(), 3000);
}

// Standalone battle: the maps with a Beacon (Ash Wood and Pass belong to the campaign). Every choice opens by URL, each with its own
// save: the Hill behind the title is just scenery since the fixed title screen (Nov 13), it is not played through it
// measured on Nov 13 (npm run sim, 300 seeds, AI x AI) with damage x1.75, direction and trees without passage: Hill 74%, Skirmish 85%, Crypt 79%, Crypt Heart 81% (before 61%, 40% and 60%; the Heart with the 2nd archer in place of the Brute, which with the gap dropped to 25%)
const QUICK_MAPS = ['beacon_hill', 'skirmish', 'flooded_crypt', 'crypt_heart'];
function quickBattle() {
  const d = dialog(
    'title',
    t('Batalha avulsa', 'Quick battle'),
    [
      el(
        'div',
        { class: 'menu-actions camp-list' },
        ...QUICK_MAPS.map((id) =>
          el(
            'button',
            {
              type: 'button',
              class: id === 'beacon_hill' ? 'primary' : 'secondary',
              onclick: () => {
                d.close();
                setTrack(null);
                location.search = `?cenario=${id}`;
              },
            },
            t(SCENARIOS[id].name, SCENARIOS[id].en),
          ),
        ),
        // mode with another rule: survive until dawn in Ash Wood (survival.ts)
        el(
          'button',
          {
            type: 'button',
            class: 'secondary',
            onclick: () => {
              d.close();
              location.search = `?cenario=${SURVIVAL_ID}`;
            },
          },
          t('Até o amanhecer: resistir no Bosque', 'Until Dawn: hold out in the Wood') +
            (parseBest(store.get(BEST_KEY))
              ? t(` (recorde ${parseBest(store.get(BEST_KEY))})`, ` (record ${parseBest(store.get(BEST_KEY))})`)
              : ''),
        ),
      ),
    ],
    { onBack: titleScreen },
  );
  d.overlay.querySelector<HTMLButtonElement>('.primary')!.focus();
}

// Credits (summary; the full list, with each file's license, is public/CREDITS.txt). Back opens `back` (the title,
// or nothing at the end of the campaign, where the map is already underneath).
function credits(back: () => void = titleScreen) {
  const d = dialog(
    'title',
    t('Créditos', 'Credits'),
    [
      el(
        'ul',
        { class: 'legend' },
        el('li', {}, t('Modelos 3D: KayKit, de Kay Lousberg (CC0)', '3D models: KayKit, by Kay Lousberg (CC0)')),
        el(
          'li',
          {},
          t(
            'Efeitos sonoros: Kenney, artisticdude, JaggedStone, Julien Matthey e outros do OpenGameArt (CC0)',
            'Sound effects: Kenney, artisticdude, JaggedStone, Julien Matthey and others from OpenGameArt (CC0)',
          ),
        ),
        el(
          'li',
          {},
          t(
            'Músicas (CC0, OpenGameArt): CodeManu, TAD, cynicmusic, nene, FAINOD e Emma_MA. Vozes da campanha: compostas para o jogo',
            'Music (CC0, OpenGameArt): CodeManu, TAD, cynicmusic, nene, FAINOD and Emma_MA. Campaign voices: composed for the game',
          ),
        ),
        el(
          'li',
          {},
          t(
            'Fontes: Tiny5 e Alegreya Sans (SIL Open Font License 1.1)',
            'Fonts: Tiny5 and Alegreya Sans (SIL Open Font License 1.1)',
          ),
        ),
        el('li', {}, t('História, mapas e regras: Dungeon Tactics', 'Story, maps and rules: Dungeon Tactics')),
      ),
      el(
        'p',
        {},
        el(
          'a',
          { href: '/CREDITS.txt', target: '_blank', rel: 'noopener' },
          t('Lista completa, com a licença de cada arquivo', "Full list, with each file's license"),
        ),
      ),
      el(
        'button',
        {
          type: 'button',
          class: 'primary',
          onclick: () => {
            d.close();
            back();
          },
        },
        t('Voltar', 'Back'),
      ),
    ],
    { onBack: back },
  );
  d.overlay.querySelector<HTMLButtonElement>('.primary')!.focus();
}

// How to play (night of Nov 12): the rules that change the decision, one line each, for whoever arrives without a tutorial (stage
// 1 hints only cover move and act). Text checked against the engine rules (turn-queue, combat, grid).
function howToPlay() {
  const d = dialog(
    'title',
    t('Como jogar', 'How to play'),
    [
      el(
        'ul',
        { class: 'legend' },
        el(
          'li',
          {},
          t(
            'A lista de turnos (canto de cima) mostra quem joga. Quem é mais rápido joga mais vezes.',
            'The turn list (top corner) shows who acts. Faster units act more often.',
          ),
        ),
        el(
          'li',
          {},
          t(
            'Na sua vez: Mover e Agir, em qualquer ordem. Fazer menos traz a próxima vez mais cedo.',
            'On your turn: Move and Act, in any order. Doing less brings your next turn sooner.',
          ),
        ),
        el(
          'li',
          {},
          t(
            'Do alto se acerta mais e se alcança mais longe; entulho protege de ataques de longe e árvore não se atravessa. No fim do turno, escolha para onde olhar: golpe pelo lado acerta mais, pelas costas mais ainda. O Salto diz quantos níveis cada um sobe ou desce por passo: o Ladino e o Lacaio 2, os outros 1. Com Salto 2 também se voa 1 casa de água funda ou de buraco.',
            'From high ground you hit more and reach farther; rubble covers you from ranged attacks and trees block the way. At turn end, pick where to face: hits from the side land more often, from behind even more. Jump says how many levels each unit climbs or drops per step: the Rogue and the Minion 2, the rest 1. Jump 2 also clears 1 tile of deep water or a gap.',
          ),
        ),
        el(
          'li',
          {},
          t(
            'Empurrar contra muro ou alguém fere; empurrar do alto para baixo também; espinhos ferem quem é jogado neles ou termina a vez em cima (passar por cima não fere).',
            'Pushing into a wall or someone hurts; pushing someone off high ground too; spikes hurt whoever is pushed onto them or ends a turn on them (walking over is safe).',
          ),
        ),
        el('li', {}, t('Na água funda só se anda ou espera.', 'In deep water you can only move or wait.')),
        // a charge aimed at someone follows the unit (battle.ts follow): "get out of it" was wrong for the target (review of Nov 13)
        el(
          'li',
          {},
          t(
            'Habilidade com carga sai depois: a área roxa mostra onde vai cair, e a lista de turnos mostra quando. Se mirou alguém, a área anda junto: os vizinhos saem dela; o alvo só escapa saindo do alcance ou da vista de quem lança.',
            'Charged abilities land later: the purple area shows where and the turn list shows when. If it targeted someone, the area moves with them: neighbours step out; the target only escapes by leaving the caster’s range or sight.',
          ),
        ),
        el(
          'li',
          {},
          t(
            'Proteja o Farol (o cristal azul) quando houver um. Inimigo de coroa é o chefe: derrubá-lo vence a fase.',
            'Protect the Beacon (the blue crystal) when there is one. A crowned enemy is the boss: bringing it down wins the stage.',
          ),
        ),
      ),
      el(
        'button',
        {
          type: 'button',
          class: 'primary',
          onclick: () => {
            d.close();
            titleScreen();
          },
        },
        t('Voltar', 'Back'),
      ),
    ],
    { onBack: titleScreen },
  );
  d.overlay.querySelector<HTMLButtonElement>('.primary')!.focus();
}

// Title screen (night of Nov 12): the game opened straight into a battle without saying what it was or that there was a campaign
function titleScreen() {
  setTrack('title');
  const go = (fn: () => void) => () => {
    d.close();
    fn();
  };
  const d = dialog(
    'title',
    'Dungeon Tactics',
    [
      el(
        'p',
        { class: 'title-sub' },
        t('Táticas por turnos com bonecos de pixel', 'Turn-based tactics with pixel heroes'),
      ),
      el(
        'div',
        { class: 'menu-actions camp-list' },
        // Continue only shows with saved progress; New game erases campaign progress (the 2nd tap confirms)
        // Continue says who and where (like FFT's save summary): whoever returns after days knows what will open
        ...(parseWorld(store.get(WORLD_KEY)) > 0
          ? [
              el(
                'button',
                { type: 'button', class: 'primary', onclick: go(toWorld) },
                t('Continuar', 'Continue'),
                el('small', { class: 'continue-where' }, continueWhere()),
              ),
            ]
          : []),
        el(
          'button',
          {
            type: 'button',
            class: parseWorld(store.get(WORLD_KEY)) > 0 ? 'secondary' : 'primary',
            onclick: (e: Event) => {
              const btn = e.currentTarget as HTMLButtonElement;
              // asks for the 2nd tap even with only the hero created (review of Nov 13: it erased the hero without asking)
              if ((parseWorld(store.get(WORLD_KEY)) > 0 || savedHero()) && !btn.dataset.armed) {
                btn.dataset.armed = '1';
                btn.textContent = t('Toque de novo: apaga o progresso', 'Tap again: erases progress');
                return;
              }
              for (const k of [
                WORLD_KEY,
                CAMPAIGN_KEY,
                'dt:estrelas',
                HERO_KEY,
                GROUP_KEY,
                ...CHAPTERS.map((_, n) => `dt:battle:${chapterId(n)}`),
              ])
                store.set(k, '');
              d.close();
              toWorld();
            },
          },
          t('Novo jogo', 'New game'),
        ),
        el(
          'button',
          { type: 'button', class: 'secondary', onclick: go(quickBattle) },
          t('Batalha avulsa', 'Quick battle'),
        ),
        el('button', { type: 'button', class: 'secondary', onclick: go(howToPlay) }, t('Como jogar', 'How to play')),
        el(
          'button',
          { type: 'button', class: 'secondary', onclick: go(() => void devMenu(titleScreen)) },
          t('Desenvolvedor: montar heróis e mapa', 'Developer: build heroes and map'),
        ),
        el('button', { type: 'button', class: 'secondary', onclick: go(credits) }, t('Créditos', 'Credits')),
      ),
      el(
        'p',
        { class: 'title-foot' },
        t('Setas escolhem · Enter confirma', 'Arrows choose · Enter confirms'),
        ' · ',
        // language right on the title (review of Nov 13: it was only reachable from the menu inside the battle)
        el(
          'button',
          { type: 'button', class: 'title-lang', onclick: () => setLang(LANG === 'pt' ? 'en' : 'pt') },
          LANG === 'pt' ? 'English' : 'Português',
        ),
      ),
    ],
    { fixed: true },
  ); // real title screen (Nov 13): does not close, and the map behind it is just scenery
  d.overlay.classList.add('main-title');
  d.overlay.querySelector<HTMLButtonElement>('.primary')!.focus();
}

// "Ayla · Beacon Hill": the saved protagonist and the next open point on the map
function continueWhere(): string {
  const w = WORLD[Math.min(parseWorld(store.get(WORLD_KEY)), WORLD.length - 1)];
  const hero = savedHero();
  return `${hero ? `${hero.name} · ` : ''}${t(w.name[0], w.name[1])}`;
}

const chapterTitle = (n: number) =>
  t(`Capítulo ${n + 1} · ${CHAPTERS[n].title[0]}`, `Chapter ${n + 1} · ${CHAPTERS[n].title[1]}`);
const toWorld = () => {
  location.search = '?mundo';
};
const savedHero = () => parseHero(store.json(HERO_KEY));
const savedGroup = () => parseGroup(store.json(GROUP_KEY)); // player's group (group.ts): who goes, class and recruits

// Gamepad on the intro and creation (before the map, which has its own): A presses the focused button or becomes Enter, the
// d-pad becomes arrows and B becomes Esc, through the same translator as the battle. Returns the function that stops the loop.
function padToKeys(): () => void {
  let on = true;
  const mem = emptyMemory();
  const key = (k: string) => dispatchEvent(new KeyboardEvent('keydown', { key: k, code: k }));
  const ARROW = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' } as const;
  const poll = () => {
    if (!on) return;
    requestAnimationFrame(poll);
    const gp = [...(navigator.getGamepads?.() ?? [])].find((g) => g?.connected);
    if (!gp) return;
    for (const a of padActions(
      { buttons: gp.buttons.map((b) => b.pressed), axes: [...gp.axes] },
      mem,
      performance.now(),
    )) {
      const focused = document.activeElement;
      if (a.k === 'confirm') focused instanceof HTMLButtonElement ? focused.click() : key('Enter');
      else if (a.k === 'cancel') key('Escape');
      else if (a.k === 'cursor') key(ARROW[a.dir]);
    }
  };
  requestAnimationFrame(poll);
  return () => {
    on = false;
  };
}

// World map (world.ts and world-ui.ts): a battle point opens the stage (replaying starts from zero); a story point plays the
// conversation right there and unlocks the next. The stage only opens by URL if already unlocked (boot), hence the map unlocks first.
async function worldScreen(host: HTMLElement) {
  // new game (no saved hero): the story intro and the protagonist creation before the map
  let hero = savedHero();
  if (!hero) {
    setTrack('title');
    const stopPad = padToKeys();
    await talk(INTRO, { dark: true });
    hero = await createHero(host);
    stopPad();
    store.set(HERO_KEY, JSON.stringify(hero));
  }
  setTrack('world');
  let done = parseWorld(store.get(WORLD_KEY));
  const enter = async (i: number) => {
    const node = WORLD[i];
    if (node.chapter !== undefined) {
      store.set(CAMPAIGN_KEY, String(Math.max(parseProgress(store.get(CAMPAIGN_KEY)), node.chapter)));
      if (i < done) store.set(`dt:battle:${chapterId(node.chapter)}`, '');
      location.search = `?campanha=${node.chapter}`;
      return;
    }
    await talk(node.scene!, { title: t(node.name[0], node.name[1]), hero });
    // 1st time on the epilogue: the journey is over, the credits close the campaign (revisiting the epilogue later does not repeat)
    const finale = i === WORLD.length - 1 && i >= done;
    done = afterNode(i, done);
    // on the end credits, Back only closes: the map is already open underneath (the title on top of it had no battle behind)
    store.set(WORLD_KEY, String(done));
    view = view.refresh(done, i);
    // credits after refreshing the map (Nov 13, review): before, the refresh pulled focus to Enter behind the credits and
    // an Enter reopened the epilogue on top
    if (finale) credits(() => undefined);
  };
  let view = openWorld(host, {
    done,
    hero: hero.cls,
    enter,
    back: () => {
      location.search = '';
    },
    party: () => openParty(partyFor(done, hero, savedGroup()).chapter, hero),
    from: Number(new URLSearchParams(location.search).get('de') ?? -1),
  });
}

void boot();
