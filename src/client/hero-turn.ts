// The hero's turn screens in the FFT style (command.ts): menu -> Move's map, or Act's Agir primeiro screens; Wait -> direction.
// Owns the screen, the Ui and the cursor, and turns keys, clicks and taps into the next screen; the Game runs what is confirmed.
import type { Battle } from '../shared/battle/battle.ts';
import { facingTo, inBounds, samePos } from '../shared/battle/grid.ts';
import { footprint, nearestTile } from '../shared/battle/pathing.ts';
import type { BattleEvent, Pos } from '../shared/battle/types.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';
import { actScreen } from './act-marks.ts';
import { type ActHost, actHover, actKey, actPick, actTap } from './act-turn.ts';
import { COMMANDS, cancelStep, commandEnabled, commandIndex, type Screen, startScreen, stepIndex } from './command.ts';
import { freshUi, hoverTile, selectMode, tapTile, type Ui } from './interaction.ts';
import { cycleUnit, gridStep, type KeyAction } from './keyboard.ts';
import { cardTap, type MenuTap, menuKey, menuScreen, menuTap } from './menu-state.ts';
import type { BattleScene } from './scene.ts';
import { sfx } from './sound.ts';
import { peekMenu } from './unit-peek.ts';

// What the turn screens read from and ask of the Game. `battle` changes on Restart, so it is read on every use.
export interface TurnHost {
  readonly battle: Battle;
  readonly busy: boolean; // animation or enemy turn: nothing responds
  readonly heroTurn: boolean;
  update(ui: Ui): void; // keeps the Ui and redraws the marks and the HUD
  execute(): Promise<void>; // runs the Move the Ui has marked
  runAct(run: (b: Battle) => BattleEvent[]): Promise<void>; // Agir primeiro: walks and acts in one go (act-turn.ts)
  endTurn(): Promise<void>;
  undo(): void;
  status(): void;
  save(): void;
}

export class HeroTurn {
  // the Game also sets these three when a turn starts over (after an action, the enemies, undo, Restart, the sandbox)
  ui: Ui;
  cursor: Pos; // cursor tile (keyboard, mouse and gamepad move the same cursor)
  // the menu's screens hidden by a tap on an empty tile (menu-state.ts); a new screen shows them again
  closed = false;
  range: string | null = null; // the unit whose walk and strike range the map paints (its mini menu's Show range)
  private now!: Screen;
  get screen() {
    return this.now;
  }
  set screen(s: Screen) {
    this.now = s;
    this.closed = false;
    this.range = null;
  }

  constructor(
    private readonly game: TurnHost,
    private readonly scene: BattleScene,
  ) {
    this.ui = freshUi(game.battle);
    this.screen = startScreen(game.battle);
    this.cursor = game.battle.actor.pos;
  }

  tap(x: number, y: number) {
    if (this.game.busy || !this.game.heroTurn) return;
    if (this.range) return this.paintRange(null); // the painted range takes the tap that closes it
    const pos = this.scene.pick(x, y, this.pickSize);
    const m = menuTap(this.game.battle, this.screen, pos);
    // the tap comes on pointerup and its click lands next, on the window just opened, as "a tap outside" that closed
    // it at once (measured in Chrome, touch and mouse): the mini menu opens after that click
    if (m?.k === 'peek') return void setTimeout(() => this.menu(m));
    if (m) return this.menu(m);
    if (!pos) return;
    if (actTap(this.actHost, pos)) return;
    if (this.screen.k === 'facing') return this.faceTo(pos);
    // on the map the tile is already chosen by mouse hover (or the 1st tap): clicking it confirms
    if (this.screen.k === 'map' && this.ui.pending && samePos(pos, this.ui.pending)) return void this.mapConfirm();
    this.cursor = pos;
    this.game.update(this.screen.k === 'map' ? tapTile(this.game.battle, this.ui, pos) : this.ui);
  }

  hover(x: number, y: number) {
    const pos = this.scene.pick(x, y, this.pickSize);
    if (!pos || this.game.busy || !this.game.heroTurn || this.screen.k === 'facing' || samePos(pos, this.cursor))
      return;
    this.cursor = pos; // no blip on tiles: it piled up and stuttered when sweeping the mouse or the stick (Fernando, Nov 15)
    this.game.update(this.screen.k === 'map' ? hoverTile(this.game.battle, this.ui, pos) : this.ui);
  }

  // a key or pad action on the hero's turn (the Game already took the ones that always work and checked it is not busy)
  key(a: KeyAction) {
    const b = this.game.battle;
    if (this.range) return this.paintRange(null);
    if (a.k === 'undo') return this.game.undo();
    if (a.k === 'face') return this.face();
    const s = this.screen;
    const shown = menuKey(b, s, this.closed, a);
    // shut, Confirm on another unit opens its mini menu, as a tap would: the keys reach it too
    const peek = shown === 'open' && a.k === 'confirm' ? menuTap(b, s, this.cursor) : null;
    if (peek?.k === 'peek') return this.menu(peek);
    if (shown) return this.menu(shown === 'open' ? { k: 'open' } : { k: 'close', at: this.cursor });
    if (this.closed && a.k === 'cursor') {
      // closed, the arrows look around the map: the cursor walks the tiles, the camera following
      const st = gridStep(a.dir, this.scene.heading),
        next = { x: this.cursor.x + st.x, y: this.cursor.y + st.y };
      if (inBounds(b.grid, next)) this.moveCursor(next, false);
      return;
    }
    if (a.k === 'slot') {
      return this.chooseCommand(commandIndex('move')); // the number shortcut: 1 = Move
    }
    if (a.k === 'wait') return this.chooseCommand(commandIndex('wait'));
    if (a.k === 'cancel') return this.cancel();
    if (actScreen(s)) return actKey(this.actHost, a);
    if (s.k === 'menu') {
      if (a.k === 'cursor' && (a.dir === 'up' || a.dir === 'down')) {
        sfx('cursor');
        const index = stepIndex(
          s.index,
          a.dir === 'up' ? -1 : 1,
          COMMANDS.map((c) => commandEnabled(b, c)),
        );
        this.screen = { ...s, index };
        return this.game.update(this.ui);
      }
      if (a.k === 'confirm') this.chooseCommand(s.index);
      return;
    }
    if (s.k === 'facing') {
      if (a.k === 'cursor') {
        // a tile on that side of the unit's square, `size` cells from its corner (right/down: just past the square; left/up:
        // one cell further out). faceTo only reads the direction from the nearest cell, so the distance does not matter
        const st = gridStep(a.dir, this.scene.heading),
          s = UNIT_DEFS[b.actor.def].size ?? 1;
        this.faceTo({ x: b.actor.pos.x + st.x * s, y: b.actor.pos.y + st.y * s });
      } else if (a.k === 'confirm') void this.game.endTurn();
      return;
    }
    // Move's map: choose the tile
    if (a.k === 'cursor') {
      const step = gridStep(a.dir, this.scene.heading);
      // choosing where a token stops, its whole square stays on the map, as with the mouse (squareUnder): clamped, not
      // refused, so a cursor left nearer the edge (the cycle key on a smaller unit's corner) can still step back
      const size = this.pickSize;
      const next = {
        x: Math.min(this.cursor.x + step.x, b.grid.width - size),
        y: Math.min(this.cursor.y + step.y, b.grid.height - size),
      };
      if (inBounds(b.grid, next) && !samePos(next, this.cursor)) this.moveCursor(next);
    } else if (a.k === 'cycle') this.moveCursor(cycleUnit(b.state, this.cursor, a.dir));
    else if (a.k === 'confirm') void this.mapConfirm();
  }

  // the menu shown or closed, or another unit's mini menu (menu-state.ts)
  menu(m: MenuTap) {
    if (this.game.busy || !this.game.heroTurn) return;
    if (this.range) return this.paintRange(null);
    if (m.k === 'peek') {
      sfx('confirm');
      return peekMenu(this.game.battle.state, m.unit, () => this.paintRange(m.unit));
    }
    if (m.k === 'open' && (!this.closed || !menuScreen(this.screen))) return;
    sfx(m.k === 'open' ? 'confirm' : 'cancel');
    this.closed = m.k === 'close';
    if (m.k === 'close') this.cursor = m.at;
    this.game.update(this.ui);
  }
  // a card of the turn list (hud-queue.ts): the hero acting now, or another unit
  card(unit: string) {
    this.menu(cardTap(this.game.battle, unit));
  }
  private paintRange(unit: string | null) {
    this.range = unit;
    if (!unit) sfx('cancel');
    this.game.update(this.ui);
  }

  // Cancel (Esc, B, right button, the Back button): one step back (cancelStep)
  private cancel() {
    const to = cancelStep(this.game.battle, this.screen);
    if (!to) return;
    // on the menu after moving (without having acted): undoes the move, like Tactics Ogre
    if (to === 'undo') return this.game.undo();
    this.back(to);
  }

  private back(screen: Screen) {
    sfx('cancel');
    this.screen = screen;
    this.cursorToActor();
    this.game.update(freshUi(this.game.battle));
  }

  // menu command (click, Enter, pad A or shortcut)
  chooseCommand(index: number) {
    const b = this.game.battle;
    const c = COMMANDS[index];
    if (this.game.busy || !this.game.heroTurn || !c || !commandEnabled(b, c)) return;
    if (c === 'undo') return this.game.undo(); // the "Undo move" row
    sfx('confirm');
    if (c === 'status') return this.game.status();
    if (c === 'wait') return void this.game.endTurn();
    if (c === 'act') {
      this.screen = { k: 'targets', index: 0 };
      return this.game.update(this.ui);
    }
    this.screen = { k: 'map', command: 'move' };
    this.cursorToActor();
    this.game.update(hoverTile(b, selectMode(b, this.ui, { k: 'move' }), this.cursor));
  }

  // the mouse (or Tab) on a 3D menu row moves the focus there, as the arrows would (never onto a greyed row); 'abilities' is
  // the column beside the menu, which holds the Agir primeiro lists
  hoverRow(list: 'menu' | 'abilities', index: number) {
    const b = this.game.battle,
      s = this.screen;
    if (list === 'abilities') return actScreen(s) && !this.game.busy && actHover(this.actHost, index);
    if (this.game.busy || !this.game.heroTurn || s.k !== 'menu' || s.index === index) return;
    if (!commandEnabled(b, COMMANDS[index])) return;
    sfx('cursor');
    this.screen = { k: 'menu', index };
    this.game.update(this.ui);
  }

  // a row of the Agir primeiro lists (click): picks it, as Confirm would (act-turn.ts)
  pick(index: number) {
    if (actScreen(this.screen) && !this.game.busy) void actPick(this.actHost, index);
  }

  // confirm on the Move map: walks at once (the reference's "Move Here")
  private async mapConfirm() {
    if (!this.ui.pending) return sfx('cancel');
    sfx('confirm');
    await this.game.execute();
  }

  // what the Agir primeiro screens read and change (act-turn.ts)
  private get actHost(): ActHost {
    const turn = this;
    return {
      get battle() {
        return turn.game.battle;
      },
      get screen() {
        return turn.screen;
      },
      set screen(s: Screen) {
        turn.screen = s;
      },
      update: () => turn.game.update(turn.ui),
      focus: (p) => {
        turn.cursor = p;
        turn.scene.focusOn(p);
      },
      runAct: (run) => turn.game.runAct(run),
    };
  }

  private moveCursor(p: Pos, aim = true) {
    this.cursor = p;
    this.scene.focusOn(p); // the camera follows the cursor, like FFT
    this.game.update(aim ? hoverTile(this.game.battle, this.ui, p) : this.ui);
  }

  // cursor goes back to the acting unit (start of turn, after acting, undo)
  cursorToActor() {
    this.cursor = this.game.battle.actor.pos;
  }

  // choosing where to move: the mouse picks the square of the acting unit's size centred under it, not the cell under it
  private get pickSize() {
    return this.screen.k === 'map' && this.ui.mode.k === 'move' ? (UNIT_DEFS[this.game.battle.actor.def].size ?? 1) : 1;
  }

  private faceTo(p: Pos) {
    const me = this.game.battle.actor;
    // clicking the unit itself or the direction it already faces confirms and passes the turn (review of Nov 13: with only a mouse
    // there was no way to end the turn, the click only rotated)
    // measured from the unit's cell nearest the tile: from a 2x2 token's corner, a tile beside it read as a diagonal
    const dir = facingTo(nearestTile(me, p), p);
    if (footprint(me).some((c) => samePos(c, p)) || dir === me.facing) return void this.game.endTurn();
    sfx('cursor');
    this.game.battle.face(dir);
    this.scene.sync(this.game.battle.state);
    this.game.update(this.ui);
  }

  // rotates the acting unit 90 degrees clockwise: it is the choice of where to look before passing the turn (every map since Nov 13)
  private face() {
    const f = this.game.battle.actor.facing;
    if (this.game.busy || !this.game.heroTurn || f === undefined) return;
    this.game.battle.face((f + 1) % 4);
    this.scene.sync(this.game.battle.state);
    this.game.save();
    this.game.update(this.ui);
  }
}
