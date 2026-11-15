// Game entry point: wires the battle (rules), the scene (Three), the HUD (DOM) and touch input. Owns the turn loop: the player acts
// through the HUD; on the enemy turn the AI plays on its own, one unit at a time, with a pause so it can be read.

import { ABILITIES, defaultLock } from '../shared/battle/abilities.ts';
import { playAiTurn } from '../shared/battle/ai.ts';
import { Battle } from '../shared/battle/battle.ts';
import { dist, facingTo, inBounds, posKey, samePos, subOf } from '../shared/battle/grid.ts';
import {
  cellsOf,
  farCells,
  footprint,
  nearestTile,
  shotStop,
  sightEnds,
  squareH,
  unitAt,
} from '../shared/battle/pathing.ts';
import type { BattleEvent, Lock, Pos, Team, UnitState } from '../shared/battle/types.ts';
import { isObjective, UNIT_DEFS } from '../shared/battle/units.ts';
import { battleFace, endExpression, expressionAt, faceCues, frameOf, type Mood } from './battle-face.ts';
import { chargeFrom, countersFrom, countersOwed } from './charge-lines.ts';
import {
  abilitiesOf,
  abilityEnabled,
  COMMANDS,
  canUndoMove,
  commandEnabled,
  longestRange,
  needsLock,
  type Screen,
  startScreen,
  stepIndex,
} from './command.ts';
import { dialog } from './dialog.ts';
import { lookOf } from './fx.ts';
import { type BattleSelection, newBattle, selectBattle } from './game/boot.ts';
import { finishRoom, homeScreen } from './game/crawl.ts';
import { battleEndScreen, confetti, heroCards, mvpCard } from './game/end-screens.ts';
import { optionsMenu } from './game/options.ts';
import { titleScreen } from './game/title.ts';
import { emptyMemory, padActions } from './gamepad.ts';
import { BattleHud, eventLog, unitStatus } from './hud.ts';
import { abilityName, t, unitName } from './i18n.ts';
import { el } from './icons.ts';
import {
  aimMark,
  aimStep,
  confirm,
  facingHighlights,
  freshUi,
  type Highlights,
  highlights,
  hoverTile,
  selectMode,
  tapTile,
  type Ui,
} from './interaction.ts';
import { cycleUnit, gridStep, type KeyAction, keyAction } from './keyboard.ts';
import { nextSize, PIXEL_KEY, type PixelSettings, parsePixel } from './pixel-settings.ts';
import { rampLink } from './scene/space.ts';
import { BattleScene } from './scene.ts';
import { jingle, type Sfx, sfx } from './sound.ts';
import { param, store } from './store.ts';
import { BEST_KEY, isSurvival, parseBest, SURVIVE_TURNS, survivalGoal, survived, turnsLeft } from './survival.ts';
import { faceSheet } from './talk.ts';
import { addEvents, emptyTally, mvp } from './tally.ts';
import { isJump, pace, stepMs, TIMING } from './timing.ts';
import { TouchInput } from './touch-input.ts';

// Test (localhost only): ?auto=1 makes the AI play the heroes too, to check the battle end and the way home without
// playing by hand (night of Nov 12). Nothing changes in production.
const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const AUTO = LOCAL && new URLSearchParams(location.search).has('auto');

const FPS_KEY = 'dt:fps'; // performance counter on (1) or off (0); starts on (Fernando's request, Nov 12)
const FAST_KEY = 'dt:fast'; // fast-forward button on stays on in the next battle

export class Game {
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
    private readonly sel: BattleSelection,
  ) {
    this.resetTally();
    // every painted face of the battle starts loading with it, so the HUD's redraws find them decoded (like talk())
    for (const u of battle.state.units) {
      const f = battleFace(u.def);
      if (f) new Image().src = `/chars/${f.sheet}`;
    }
    this.ui = freshUi(battle);
    this.screen = startScreen(battle);
    this.cursor = battle.actor.pos;
    this.hud = new BattleHud(host, {
      command: (i) => this.chooseCommand(i),
      ability: (i) => this.chooseAbility(i),
      answer: (yes) => void this.answer(yes),
      lock: (on) => void this.pickLock(on),
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
        const pos = this.scene.pick(x, y, this.pickSize);
        if (!pos || this.busy || !this.heroTurn) return;
        if (this.screen.k === 'facing') return this.faceTo(pos);
        // on the map the tile is already chosen by mouse hover (or the 1st tap): clicking it confirms
        if (this.screen.k === 'map' && this.ui.pending && samePos(pos, this.ui.pending)) return void this.mapConfirm();
        this.cursor = pos;
        this.update(this.screen.k === 'map' ? tapTile(this.battle, this.ui, pos) : this.ui);
      },
      hover: (x, y) => {
        const pos = this.scene.pick(x, y, this.pickSize);
        if (
          !pos ||
          this.busy ||
          !this.heroTurn ||
          this.screen.k === 'facing' ||
          this.screen.k === 'confirm' ||
          samePos(pos, this.cursor)
        )
          return;
        this.cursor = pos; // no blip on tiles: it piled up and stuttered when sweeping the mouse or the stick (Fernando, Nov 15)
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
    pace.toggle = store.get(FAST_KEY) === '1';
    this.hud.setFast(pace.toggle);
    // performance counter: the text changes 2 times per second, not every frame (almost zero cost)
    setInterval(() => this.showFps(), 500);
    requestAnimationFrame(() => this.pollPad());
    this.update(this.ui);
    void this.runEnemies(); // the save may have stopped on the enemy turn
  }

  // Keyboard (Fernando's request, Oct 25): every action has a key. The key -> action translation is pure (keyboard.ts).
  // With a dialog open, the keys belong to it (Esc closes, Tab moves between buttons, up and down walk its list: dialog.ts).
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
    this.hud.showFaces();
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
    if (a.k === 'turns') return this.hud.scrollQueue(a.dir);
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
        this.screen = s.lock ? { ...s, lock: s.lock === 'unit' ? 'tile' : 'unit' } : { ...s, yes: !s.yes };
        return this.update(this.ui);
      }
      if (a.k === 'confirm') return void (s.lock ? this.pickLock(s.lock) : this.answer(s.yes));
      if (a.k === 'cancel') return void this.answer(false);
      return;
    }
    if (s.k === 'facing') {
      if (a.k === 'cursor') {
        // a tile on that side of the unit's square, `size` cells from its corner (right/down: just past the square; left/up:
        // one cell further out). faceTo only reads the direction from the nearest cell, so the distance does not matter
        const st = gridStep(a.dir, this.scene.heading),
          s = UNIT_DEFS[b.actor.def].size ?? 1;
        this.faceTo({ x: b.actor.pos.x + st.x * s, y: b.actor.pos.y + st.y * s });
      } else if (a.k === 'confirm') void this.endTurn();
      else if (a.k === 'cancel') this.back({ k: 'menu', index: 2 });
      return;
    }
    // map: choose the tile
    if (a.k === 'cursor') {
      const step = gridStep(a.dir, this.scene.heading);
      // choosing where a token stops, its whole square stays on the map, as with the mouse (squareUnder): clamped, not
      // refused, so a cursor left nearer the edge (the cycle key on a smaller unit's corner) can still step back
      const size = this.pickSize;
      const next =
        this.ui.mode.k === 'ability'
          ? aimStep(b.grid, b.state, this.cursor, step)
          : {
              x: Math.min(this.cursor.x + step.x, b.grid.width - size),
              y: Math.min(this.cursor.y + step.y, b.grid.height - size),
            };
      if (next && inBounds(b.grid, next) && !samePos(next, this.cursor)) this.moveCursor(next);
    } else if (a.k === 'cycle') this.moveCursor(cycleUnit(b.state, this.cursor, a.dir));
    else if (a.k === 'confirm') void this.mapConfirm();
    else if (a.k === 'cancel') {
      // goes back to where it came from: Move -> menu; ability -> submenu, on the same ability
      const m = this.ui.mode;
      this.back(m.k === 'ability' ? { k: 'abilities', index: abilitiesOf(b).indexOf(m.id) } : { k: 'menu', index: 0 });
    }
  }

  // sandbox (dev/sandbox.ts): a turn screen, cursor and marks put straight in, the way a key would leave them
  showScreen(screen: Screen, cursor: Pos, ui: Ui) {
    this.screen = screen;
    this.cursor = cursor;
    this.update(ui);
  }

  // sandbox: a scripted step's events played like a confirmed command, then the turn menu of whoever plays now
  async playStep(events: BattleEvent[], enemy: boolean) {
    await this.animate(events, enemy);
    // the step ended the battle with its mover down: no actor to show a menu for (the sandbox shows no end screen)
    if (!this.battle.state.units.some((u) => u.id === this.battle.state.turn.actor)) return;
    this.screen = startScreen(this.battle);
    this.cursorToActor();
    this.update(freshUi(this.battle));
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
    // No on the lock step goes back to "Execute?"
    if (!yes && s.lock) {
      sfx('cancel');
      this.screen = { ...s, lock: undefined };
      return this.update(this.ui);
    }
    // a charge aimed at someone: one more step, where to lock it (Nov 15), starting on the ability's usual lock
    if (yes && needsLock(this.battle, s.ability, s.target)) {
      sfx('confirm');
      this.screen = { ...s, lock: s.lock ?? defaultLock(ABILITIES[s.ability]) };
      return this.update(this.ui);
    }
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

  // the lock step's choice (click, or Enter on the focused one): the charge starts locked there
  private async pickLock(on: Lock) {
    if (this.screen.k !== 'confirm' || !this.screen.lock || this.busy) return;
    sfx('confirm');
    await this.execute(on);
  }

  // runs what the Ui has marked (move or act) and returns to the menu, on the next command that applies
  private async execute(lock?: Lock) {
    const { events, ui } = confirm(this.battle, this.ui, lock);
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
    this.cursor = p;
    this.scene.focusOn(p); // the camera follows the cursor, like FFT
    this.update(hoverTile(this.battle, this.ui, p));
  }

  // cursor goes back to the acting unit (start of turn, after acting, undo)
  private cursorToActor() {
    this.cursor = this.battle.actor.pos;
  }

  // choosing where to move: the mouse picks the square of the acting unit's size centred under it, not the cell under it
  private get pickSize() {
    return this.screen.k === 'map' && this.ui.mode.k === 'move' ? (UNIT_DEFS[this.battle.actor.def].size ?? 1) : 1;
  }

  private get heroTurn() {
    return !AUTO && !this.battle.over && this.battle.actor.team === 'hero';
  }

  private update(ui: Ui) {
    this.ui = ui;
    if (isSurvival(this.battle.state.scenario))
      this.scene.setDaylight(1 - turnsLeft(this.battle.state) / SURVIVE_TURNS);
    const s = this.screen;
    // on the menu and submenu only the acting unit's tile is marked; the range shows when choosing (like FFT)
    const hl =
      !this.heroTurn || this.busy
        ? null
        : s.k === 'facing'
          ? facingHighlights(this.battle)
          : s.k === 'map' || s.k === 'confirm'
            ? highlights(this.battle, ui, this.cursor)
            : {
                tiles: footprint(this.battle.actor).map((pos) => ({ pos, kind: 'actor' as const })),
                path: null,
                preview: null,
              };
    const moving = s.k === 'map' && ui.mode.k === 'move';
    this.scene.setHighlights(hl);
    // a charging unit picking where to walk sees its shot as it would fire from there (Nov 15, Fernando: "so the player
    // knows where to stand"): the destination's square must fit, like the move itself
    this.scene.setChargePreview(
      hl && moving && this.battle.reach().has(posKey(this.cursor)) ? chargeFrom(this.battle, this.cursor) : null,
    );
    // counters (Nov 15, Fernando): aiming, who the strike would leave owed a counter; walking, what that destination draws
    const aimed =
      (s.k === 'map' || s.k === 'confirm') && ui.mode.k === 'ability' && hl?.preview?.ok ? ui.mode.id : null;
    this.scene.setCounters(
      aimed && hl?.preview
        ? countersOwed(this.battle, aimed, hl.preview)
        : hl && moving && this.battle.reach().has(posKey(this.cursor))
          ? countersFrom(this.battle, this.cursor)
          : null,
    );
    // choosing where to move, or resting on the acting unit (menu, facing), the cursor frames the unit's whole square; aiming,
    // it frames what the target mark covers (one cell, or the body of the unit there)
    const framed =
      (s.k === 'map' || s.k === 'confirm') && ui.mode.k === 'ability'
        ? aimMark(this.battle.grid, this.battle.state, this.cursor)
        : {
            pos: this.cursor,
            size:
              moving || samePos(this.cursor, this.battle.actor.pos) ? (UNIT_DEFS[this.battle.actor.def].size ?? 1) : 1,
          };
    this.scene.setCursor(hl ? framed.pos : null, framed.size, !hl?.tiles.some((m) => m.kind === 'nogo'));
    // dotted outline of the longest range: on the menu around the acting unit; when aiming the move, around the tile under the cursor (if
    // it can be reached), to see where the strike reaches before moving
    const ringAt =
      !hl || s.k === 'facing' || (s.k !== 'menu' && s.k !== 'abilities' && !moving)
        ? null
        : moving && this.battle.reach().has(posKey(this.cursor))
          ? this.cursor
          : this.battle.actor.pos;
    this.scene.setRangeRing(
      ringAt
        ? {
            from: cellsOf(ringAt, UNIT_DEFS[this.battle.actor.def].size ?? 1),
            range: farCells(this.battle.grid, longestRange(this.battle)),
          }
        : null,
    );
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
            block:
              shotStop(
                this.battle.grid,
                this.battle.state,
                ...sightEnds(this.battle.grid, this.battle.state, this.battle.actor, aim),
                this.battle.actor.id,
                !magic,
              )?.pos ?? null,
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
      face: (u) => this.expression(u),
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

  // the face of each unit in the HUD: a mood that events started (battle-face.ts), else wounded or neutral by its life
  private moods = new Map<string, Mood[]>();
  private expression(u: UnitState) {
    return expressionAt(this.moods.get(u.id) ?? [], this.scene.now, u.hp, UNIT_DEFS[u.def].hp);
  }

  private async animate(events: BattleEvent[], enemy = false) {
    addEvents(this.tally, events, this.teamOf());
    this.busy = true;
    this.update(this.ui);
    // the faces react as each event plays, after its banner: a unit's new moods replace the ones it had
    // the roster keeps the fallen; the state, whoever was born mid-battle (Until Dawn)
    const defOf = (id: string) => this.battle.state.units.find((u) => u.id === id)?.def ?? this.roster[id]?.def ?? '';
    const cues = faceCues(events, (id) => UNIT_DEFS[defOf(id)]?.hp ?? 0);
    await this.scene.playEvents(events, this.battle.state, async (e) => {
      await this.beforeEvent(e, enemy);
      const now = this.scene.now;
      for (const [id, m] of cues[events.indexOf(e)])
        this.moods.set(id, [
          ...(m.from ? (this.moods.get(id) ?? []) : []),
          { ...m, from: now + m.from, until: now + m.until },
        ]);
    });
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
      const size = UNIT_DEFS[this.battle.state.units.find((u) => u.id === e.unit)?.def ?? '']?.size ?? 1;
      const h = (i: number) => squareH(this.battle.grid, e.path[i], size);
      let at = 0;
      for (let i = 1; i < e.path.length; i++) {
        // ramp: walking, at the step pace (the same as scene/units.ts)
        const dh = rampLink(this.battle.grid, e.path[i - 1], e.path[i]) ? 0 : h(i) - h(i - 1),
          tiles = dist(e.path[i - 1], e.path[i]) / subOf(this.battle.grid),
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
      const size = UNIT_DEFS[this.battle.state.units.find((u) => u.id === e.unit)?.def ?? '']?.size ?? 1;
      this.scene.setCursor(to, size);
      await show(
        {
          tiles: cellsOf(to, size).map((pos) => ({ pos, kind: 'target' as const })),
          path: e.path.slice(1),
          preview: null,
          size,
        },
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

  private faceTo(p: Pos) {
    const me = this.battle.actor;
    // clicking the unit itself or the direction it already faces confirms and passes the turn (review of Nov 13: with only a mouse
    // there was no way to end the turn, the click only rotated)
    // measured from the unit's cell nearest the tile: from a 2x2 token's corner, a tile beside it read as a diagonal
    const dir = facingTo(nearestTile(me, p), p);
    if (footprint(me).some((c) => samePos(c, p)) || dir === me.facing) return void this.endTurn();
    sfx('cursor');
    this.battle.face(dir);
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
    store.set(this.sel.saveKey, this.battle.over ? '' : this.battle.save());
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

  // the highlight card (mvpCard): the hero who downed the most, tie broken by damage, like FFT's closing
  private mvpLine(): HTMLElement[] {
    const m = mvp(this.tally, this.teamOf(), 'hero');
    if (!m) return [];
    const [id, s] = m;
    const { def } = this.roster[id];
    const card = mvpCard(def, unitName(def), s.dmg, s.kills);
    // on a victory the highlight hero shows its painted face as on its hero card (endExpression); the card is the face left on screen
    const f = battleFace(def);
    const u = this.battle.state.units.find((x) => x.id === id);
    if (f && this.battle.state.outcome === 'victory') {
      const { node, show } = faceSheet(def, f, 'battle-face portrait');
      show(frameOf(f, endExpression(u?.hp ?? 0, UNIT_DEFS[def].hp, true)));
      card.querySelector('.portrait')?.replaceWith(node);
    }
    return [card];
  }

  // the result window's top: a card per hero who fought, then the highlight. The roster, not the state: the state drops
  // the fallen, who get a card too (hp 0)
  private resultCards(): HTMLElement[] {
    const heroes = Object.entries(this.roster)
      .filter(([, r]) => r.team === 'hero' && !isObjective(r.def))
      .map(([id, { def }]) => ({
        def,
        hp: this.battle.state.units.find((u) => u.id === id)?.hp ?? 0,
        max: UNIT_DEFS[def].hp,
      }));
    return [heroCards(heroes, this.battle.state.outcome === 'victory'), ...this.mvpLine()];
  }

  private restart() {
    this.battle = newBattle(this.sel.scenario, this.sel.room);
    this.resetTally();
    this.moods.clear();
    this.log = '';
    this.screen = startScreen(this.battle);
    this.scene.sync(this.battle.state);
    this.save();
    this.update(freshUi(this.battle));
    void this.runEnemies();
  }

  private async finish() {
    const { scenario } = this.sel;
    const won = this.battle.state.outcome === 'victory';
    jingle(won);
    this.scene.celebrate(won ? 'hero' : 'enemy', this.battle.state);
    if (won) confetti();
    if (this.sel.room) return finishRoom(this.sel.room, won, this.battle.state, this.resultCards());
    // Until Dawn: how many turns it lasted and the record (a new record gets highlighted, like the stage grade)
    // winning by downing everyone before dawn also counts as surviving the whole night (it used to save "record 20" on a victory)
    const lasted = won ? SURVIVE_TURNS : survived(this.battle.state),
      best = parseBest(store.get(BEST_KEY));
    if (isSurvival(scenario.id) && lasted > best) store.set(BEST_KEY, String(lasted));
    battleEndScreen({
      won,
      survival: isSurvival(scenario.id),
      lasted,
      best,
      mvp: this.resultCards(),
      restart: () => this.restart(),
    });
  }

  // the Options window (game/options.ts), with what it shows and changes of this battle
  private menu() {
    optionsMenu({
      room: this.sel.room !== null,
      scenario: this.sel.scenario,
      busy: this.busy,
      pixel: () => this.pixel,
      setPixel: (p) => this.setPixel(p),
      restart: () => this.restart(),
    });
  }
}

async function boot() {
  const host = document.getElementById('app')!;
  const sel = await selectBattle();
  if (!sel) return; // went home instead
  // localhost ?sandbox=<spec>: a battle staged for screenshots (docs/sandbox.md); its own chunk, never fetched online
  const sandbox = LOCAL && param('sandbox') !== null ? await import('./dev/sandbox.ts') : null;
  const staged = await sandbox?.stage(sel.scenario);
  // its own save key: acting in a staged battle must not overwrite the real one
  const run = staged ? { ...sel, scenario: staged.scenario, saveKey: 'dt:battle:sandbox' } : sel;
  const { scenario } = run;
  // a save of another scenario (a whole-tile one, from before the half tiles of Nov 14) starts the battle over
  const loaded = staged ? null : Battle.load(store.get(sel.saveKey) ?? '');
  const saved = loaded?.state.scenario === scenario.id;
  const battle = staged?.battle ?? (saved ? loaded : newBattle(scenario, run.room));
  // a room is saved from its first frame, so leaving it before any action still counts as leaving (crawl.ts leftRoom)
  if (run.room && !saved) store.set(run.saveKey, battle.save());
  const pixel = parsePixel(store.json(PIXEL_KEY), innerWidth < 600);
  const scene = await BattleScene.create(
    host,
    battle.grid,
    battle.state,
    pixel,
    scenario.spawns.map((s) => s.def),
  );
  const game = new Game(battle, scene, host, pixel, run);
  sandbox?.install(game, scene);
  // by the battle in play, not the address: a crawl room opened with ?scenario=survival is not one
  if (isSurvival(scenario.id) && !saved && !sandbox) announce(survivalGoal(t));
  // without a battle parameter the title (or, with ?home, the town; ?home=expedition, the expedition map) opens over
  // the standalone battle, which stays behind as spinning scenery (Nov 15, Fernando: the game opens in the town)
  if (sel.title) (param('home') !== null ? homeScreen : titleScreen)();
}

// Large banner in the middle of the screen for 2 s (Until Dawn's goal at the start); disappears by itself and does not take clicks
function announce(text: string) {
  sfx('confirm');
  const box = el('div', { class: 'announce', role: 'status' }, text);
  document.body.append(box);
  setTimeout(() => box.remove(), 2200);
}

void boot();
