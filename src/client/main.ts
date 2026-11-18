// The Game of one battle: wires the battle (rules), the scene (Three), the HUD (DOM) and the input. Owns the turn loop: the player acts
// through the HUD; on the enemy turn the AI plays on its own, one unit at a time, with a pause so it can be read.

import { playAiTurn } from '../shared/battle/ai.ts';
import type { Battle } from '../shared/battle/battle.ts';
import { unitAt } from '../shared/battle/pathing.ts';
import type { BattleEvent, Lock, Pos, UnitState } from '../shared/battle/types.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';
import { battleFace, expressionAt, faceCues, type Mood } from './battle-face.ts';
import { battleInput } from './battle-input.ts';
import { abilityDetail } from './battle-text.ts';
import { beforeEvent } from './before-event.ts';
import { abilitiesOf, type Screen, startScreen } from './command.ts';
import { fpsCounter } from './fps.ts';
import { type BattleSelection, newBattle } from './game/boot.ts';
import { battleEndScreen, confetti } from './game/end-screens.ts';
import { optionsMenu } from './game/options.ts';
import { finishRoom } from './game/room-end.ts';
import { HeroTurn, type TurnHost } from './hero-turn.ts';
import { BattleHud, eventLog, type HudActions, unitStatus } from './hud.ts';
import type { HudSkin } from './hud-skin.ts';
import { abilityName, t, unitName } from './i18n.ts';
import { confirm, freshUi, type Ui } from './interaction.ts';
import type { KeyAction } from './keyboard.ts';
import { onMarkStyle } from './mark-style.ts';
import { reducedMotion } from './motion.ts';
import { nextSize, PIXEL_KEY, type PixelSettings } from './pixel-settings.ts';
import type { BattleScene } from './scene.ts';
import { jingle, sfx } from './sound.ts';
import { statusWindow } from './status-window.ts';
import { store } from './store.ts';
import { BEST_KEY, isSurvival, parseBest, SURVIVE_TURNS, survived, turnsLeft } from './survival.ts';
import { addEvents, emptyTally, endHeroes, type Roster, teamsOf } from './tally.ts';
import { pace, TIMING } from './timing.ts';
import { turnOrder } from './turn-list.ts';
import { turnMarks } from './turn-marks.ts';

// Test (localhost only): ?auto=1 makes the AI play the heroes too, to check the battle end and the way home without
// playing by hand (night of Nov 12). Nothing changes in production.
export const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const AUTO = LOCAL && new URLSearchParams(location.search).has('auto');

const FAST_KEY = 'dt:fast'; // fast-forward button on stays on in the next battle

export class Game implements TurnHost {
  private readonly turn: HeroTurn; // the hero's turn screens: screen, Ui and cursor (hero-turn.ts)
  busy = false;
  private behindTitle = false; // the title is open over this battle (pollPad)
  private log = '';
  private acting: string | null = null;
  private readonly hud: BattleHud;
  private readonly readPad: () => void;
  private readonly toggleFps: () => boolean;
  // battle tally (tally.ts) for the end-of-battle highlight; side and sheet of each unit stored at the start (dead units leave the state)
  private tally = emptyTally();
  private roster: Roster = {};

  constructor(
    public battle: Battle,
    private readonly scene: BattleScene,
    host: HTMLElement,
    private pixel: PixelSettings,
    private readonly sel: BattleSelection,
    skin: HudSkin, // the 3D pieces (hud-skin.ts)
  ) {
    this.resetTally();
    // every painted face of the battle starts loading with it, so the HUD's redraws find them decoded (like talk())
    for (const u of battle.state.units) {
      const f = battleFace(u.def);
      if (f) new Image().src = `/chars/${f.sheet}`;
    }
    this.turn = new HeroTurn(this, scene, true);
    const act: HudActions = {
      command: (i) => this.turn.chooseCommand(i),
      ability: (i) => this.turn.chooseAbility(i),
      answer: (yes) => void this.turn.answer(yes),
      lock: (on) => void this.turn.pickLock(on),
      page: (dir) => this.turn.turnPage(dir),
      hover: (list, i) => this.turn.hoverRow(list, i),
      rotate: (dir) => scene.rotate(dir),
      recenter: () => scene.resetView(),
      pixel: () => this.setPixel({ ...this.pixel, size: nextSize(this.pixel.size) }),
      fast: () => {
        pace.toggle = !pace.toggle;
        store.set(FAST_KEY, pace.toggle ? '1' : '');
        this.hud.setFast(pace.toggle);
      },
      menu: () => this.menu(),
      fps: () => this.hud.setFps(this.toggleFps()),
      undo: () => this.runKey({ k: 'undo' }),
      cancel: () => this.runKey({ k: 'cancel' }),
    };
    this.hud = new BattleHud(host, act, skin);
    this.readPad = battleInput(host.querySelector('canvas')!, scene, {
      key: (a) => this.runKey(a),
      tap: (x, y) => this.turn.tap(x, y),
      hover: (x, y) => this.turn.hover(x, y),
    });
    this.toggleFps = fpsCounter(host, scene, () => this.hud.stats3d());
    pace.toggle = store.get(FAST_KEY) === '1';
    this.hud.setFast(pace.toggle);
    requestAnimationFrame(() => this.pollPad());
    // Options changed the mark style: the scene builds its marks again and the turn's marks go back on them
    onMarkStyle(() => {
      scene.restyle(this.battle.state);
      this.update(this.turn.ui);
    });
    this.update(this.turn.ui);
    void this.runEnemies(); // the save may have stopped on the enemy turn
  }

  // every frame; the gamepad goes through the same path as the keyboard (battle-input.ts)
  private pollPad() {
    requestAnimationFrame(() => this.pollPad());
    // the standalone battle is the backdrop of the title screen (and of the screens that leave it): it rotates while any is open
    const title = !!document.querySelector('.title-overlay');
    this.scene.setSpin(title && !reducedMotion());
    // and it is scenery: no tile marks, cursor, rings, bars or turn numbers behind the title (Nov 18 review)
    if (title !== this.behindTitle) {
      this.behindTitle = title;
      this.scene.hideMarkers(title);
      this.update(this.turn.ui);
    }
    this.placeMenu();
    this.hud.showFaces(this.scene.now);
    if (!document.querySelector('.loading-cover')) this.readPad(); // the pad waits for the cover, like the keys
  }

  private runKey(a: KeyAction) {
    // camera, help, status and counter always work, including on the enemy turn
    if (a.k === 'rotate') return this.scene.rotate(a.dir);
    if (a.k === 'zoom') return this.scene.zoom(a.factor);
    if (a.k === 'recenter') return this.scene.resetView();
    if (a.k === 'help') return this.menu();
    if (a.k === 'pixel') return this.setPixel({ ...this.pixel, size: nextSize(this.pixel.size) });
    if (a.k === 'status') return this.status();
    if (a.k === 'info') return this.abilitySheet();
    if (a.k === 'turns') return this.hud.scrollQueue(a.dir);
    if (a.k === 'fps') return this.hud.setFps(this.toggleFps());
    if (this.busy || !this.heroTurn) return;
    this.turn.key(a);
  }

  // sandbox (dev/sandbox.ts): a turn screen, cursor and marks put straight in, the way a key would leave them
  showScreen(screen: Screen, cursor: Pos, ui: Ui) {
    this.turn.screen = screen;
    this.turn.cursor = cursor;
    this.update(ui);
  }

  // sandbox: a scripted step's events played like a confirmed command, then the turn menu of whoever plays now
  async playStep(events: BattleEvent[], enemy: boolean) {
    await this.animate(events, enemy);
    if (this.battle.over) return this.finish(); // the step ended the battle (bench/result3d-*.json)
    // the step left its mover down: no actor to show a menu for
    if (!this.battle.state.units.some((u) => u.id === this.battle.state.turn.actor)) return;
    this.turn.screen = startScreen(this.battle);
    this.turn.cursorToActor();
    this.update(freshUi(this.battle));
  }

  // runs what the Ui has marked (move or act) and returns to the menu, on the next command that applies
  async execute(lock?: Lock) {
    const { events, ui } = confirm(this.battle, this.turn.ui, lock);
    if (!events.length) return;
    this.turn.ui = ui;
    // fell to a counterattack while retreating: the turn passes by itself before the animation, as the AI's does, since
    // update's heroTurn reads the one acting (it threw on the dead one) and Battle.load refuses a save that still names it
    const fell = !this.battle.over && !this.battle.state.units.some((u) => u.id === this.battle.state.turn.actor);
    if (fell) events.push(...this.battle.endTurn());
    await this.animate(events);
    this.save();
    if (this.battle.over) return this.finish();
    if (fell) return this.runEnemies();
    this.turn.screen = startScreen(this.battle);
    this.turn.cursorToActor();
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
    this.update(this.turn.ui);
  }

  get heroTurn() {
    return !AUTO && !this.battle.over && this.battle.actor.team === 'hero';
  }

  update(ui: Ui) {
    this.turn.ui = ui;
    if (isSurvival(this.battle.state.scenario))
      this.scene.setDaylight(1 - turnsLeft(this.battle.state) / SURVIVE_TURNS);
    const s = this.turn.screen;
    const live = this.heroTurn && !this.busy && !this.behindTitle;
    const { hl, ...m } = turnMarks(this.battle, s, ui, this.turn.cursor, live);
    this.scene.setHighlights(hl);
    this.scene.setChargePreview(m.charge);
    this.scene.setCounters(m.counters);
    this.scene.setCursorNote(m.note);
    this.scene.setCursor(m.cursor, m.size, m.fits);
    this.scene.setRangeRing(m.ring);
    this.scene.setTrajectory(m.trajectory);
    this.hud.render({
      battle: this.battle,
      screen: s,
      hl,
      busy: this.busy,
      log: this.log,
      acting: this.acting,
      cursor: this.turn.cursor,
      ability: ui.mode.k === 'ability' ? ui.mode.id : null,
      face: (u) => this.expression(u),
    });
    // every unit's place in the turn list beside its health bar, from the rows the list itself shows (Nov 17, Fernando)
    const rows = this.hud.queued?.rows ?? [];
    const { bottom, left } = this.hud.insets(); // `left`: the turn list's right edge, which would cover a number
    const now = rows[0] && !rows[0].charge ? rows[0].unit : null;
    this.scene.setTurnOrder(turnOrder(rows), now, (left / innerWidth) * 2 - 1);
    this.scene.setInsets(0, bottom);
    this.placeMenu(); // already in place on open: waiting for the next frame showed the menu in the corner for 1 frame
  }

  // Command menu, submenu and "Execute?" beside the acting unit (Nov 13, Fernando's request: "beside the character like in
  // FFT"). Runs every frame (pollPad) because the camera slides and rotates with the menu open. "Execute?" does not cover the target.
  private placeMenu() {
    if (!this.hud.menuOpen) return;
    const b = this.battle,
      s = this.turn.screen;
    const foe = s.k === 'confirm' ? unitAt(b.state, s.target) : undefined;
    this.hud.place(this.scene.screenOf(b.actor.id), foe && foe.id !== b.actor.id ? this.scene.screenOf(foe.id) : null);
  }

  // the face of each unit in the HUD: a mood that events started (battle-face.ts), else wounded or neutral by its life
  private moods = new Map<string, Mood[]>();
  private expression(u: UnitState) {
    return expressionAt(this.moods.get(u.id) ?? [], this.scene.now, u.hp, UNIT_DEFS[u.def].hp);
  }

  private async animate(events: BattleEvent[], enemy = false) {
    addEvents(this.tally, events, teamsOf(this.roster));
    this.busy = true;
    this.update(this.turn.ui);
    // the faces react as each event plays, after its banner: a unit's new moods replace the ones it had
    // the roster keeps the fallen; the state, whoever was born mid-battle (Until Dawn)
    const defOf = (id: string) => this.battle.state.units.find((u) => u.id === id)?.def ?? this.roster[id]?.def ?? '';
    const cues = faceCues(events, (id) => UNIT_DEFS[defOf(id)]?.hp ?? 0);
    await this.scene.playEvents(events, this.battle.state, async (e) => {
      await beforeEvent(e, enemy, this.battle, this.scene, this.hud);
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

  // status window of the unit under the cursor (or of the acting unit), a window of status-window.ts
  // the sheet of the ability in focus in the Act submenu (the I key, the pad's 4th button): name, numbers and its notes
  abilitySheet() {
    const s = this.turn.screen;
    if (s.k !== 'abilities') return;
    const id = abilitiesOf(this.battle)[s.index];
    if (id) statusWindow({ title: abilityName(id), rows: [], text: abilityDetail(id) });
  }

  status() {
    const s = this.battle.state;
    const id = unitAt(s, this.turn.cursor)?.id ?? this.battle.actor?.id; // any tile of the large unit
    if (!id) return;
    const u = s.units.find((x) => x.id === id)!;
    statusWindow({ title: unitName(u.def), rows: unitStatus(s, id) });
  }

  save() {
    store.set(this.sel.saveKey, this.battle.over ? '' : this.battle.save());
  }

  async endTurn() {
    // map with direction: before passing the turn, choose where to look (like FFT)
    if (this.turn.screen.k !== 'facing' && this.heroTurn && this.battle.actor.facing !== undefined) {
      this.turn.screen = { k: 'facing' };
      this.turn.cursorToActor();
      return this.update(this.turn.ui);
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
      this.update(this.turn.ui);
      await this.scene.wait(TIMING.enemyStart);
      await this.animate(playAiTurn(this.battle), true);
      // the state has already passed the turn (maybe to a hero): stays locked during the pause, otherwise the tap or key of this
      // window counted and was erased right after by freshUi (found by the keyboard-only test, Oct 25)
      this.busy = true;
      this.update(this.turn.ui); // shows the summary still with the name of who acted
      await this.scene.wait(TIMING.enemyAfter);
      this.save();
    }
    this.acting = null;
    this.busy = false;
    // ended (maybe on the actor's death, with no actor left to read): straight to the end, before the turn menu
    if (this.battle.over) return this.finish();
    this.turn.screen = startScreen(this.battle);
    if (this.heroTurn) {
      this.turn.cursorToActor();
      this.scene.focusOn(this.battle.actor.pos);
      this.scene.pop(this.battle.actor.id);
    }
    this.update(freshUi(this.battle));
  }

  undo() {
    if (!this.battle.undo()) return;
    sfx('cancel');
    this.log = ''; // the help line showed the undone action (review of Nov 13)
    this.turn.screen = startScreen(this.battle);
    this.scene.sync(this.battle.state);
    this.save();
    this.turn.cursorToActor();
    this.scene.focusOn(this.battle.actor.pos); // the camera had followed the cursor to the destination: goes back to the acting unit
    this.update(freshUi(this.battle));
  }

  private resetTally() {
    this.tally = emptyTally();
    this.roster = Object.fromEntries(this.battle.state.units.map((u) => [u.id, { team: u.team, def: u.def }]));
  }

  private restart() {
    this.battle = newBattle(this.sel.scenario, this.sel.room);
    this.resetTally();
    this.moods.clear();
    this.log = '';
    this.turn.screen = startScreen(this.battle);
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
    const heroes = endHeroes(this.tally, this.roster, this.battle.state.units);
    if (this.sel.room) return finishRoom(this.sel.room, won, this.battle.state, heroes);
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
      heroes,
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
      relayout: () => this.hud.relayout(),
      restart: () => this.restart(),
    });
  }
}
