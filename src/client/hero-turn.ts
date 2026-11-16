// The hero's turn screens in the FFT style (command.ts): menu -> submenu -> map -> "Execute?" -> menu; Wait -> direction.
// Owns the screen, the Ui and the cursor, and turns keys, clicks and taps into the next screen; the Game runs what is confirmed.
import { ABILITIES, defaultLock } from '../shared/battle/abilities.ts';
import type { Battle } from '../shared/battle/battle.ts';
import { facingTo, inBounds, samePos } from '../shared/battle/grid.ts';
import { footprint, nearestTile } from '../shared/battle/pathing.ts';
import type { Lock, Pos } from '../shared/battle/types.ts';
import { UNIT_DEFS } from '../shared/battle/units.ts';
import {
  abilitiesOf,
  abilityEnabled,
  COMMANDS,
  canUndoMove,
  commandEnabled,
  needsLock,
  type Screen,
  startScreen,
  stepIndex,
} from './command.ts';
import { aimStep, freshUi, hoverTile, selectMode, tapTile, type Ui } from './interaction.ts';
import { cycleUnit, gridStep, type KeyAction } from './keyboard.ts';
import type { BattleScene } from './scene.ts';
import { sfx } from './sound.ts';

// What the turn screens read from and ask of the Game. `battle` changes on Restart, so it is read on every use.
export interface TurnHost {
  readonly battle: Battle;
  readonly busy: boolean; // animation or enemy turn: nothing responds
  readonly heroTurn: boolean;
  update(ui: Ui): void; // keeps the Ui and redraws the marks and the HUD
  execute(lock?: Lock): Promise<void>; // runs what the Ui has marked
  endTurn(): Promise<void>;
  undo(): void;
  status(): void;
  save(): void;
}

export class HeroTurn {
  // the Game also sets these three when a turn starts over (after an action, the enemies, undo, Restart, the sandbox)
  ui: Ui;
  screen: Screen;
  cursor: Pos; // cursor tile (keyboard, mouse and gamepad move the same cursor)

  constructor(
    private readonly game: TurnHost,
    private readonly scene: BattleScene,
  ) {
    this.ui = freshUi(game.battle);
    this.screen = startScreen(game.battle);
    this.cursor = game.battle.actor.pos;
  }

  tap(x: number, y: number) {
    const pos = this.scene.pick(x, y, this.pickSize);
    if (!pos || this.game.busy || !this.game.heroTurn) return;
    if (this.screen.k === 'facing') return this.faceTo(pos);
    // on the map the tile is already chosen by mouse hover (or the 1st tap): clicking it confirms
    if (this.screen.k === 'map' && this.ui.pending && samePos(pos, this.ui.pending)) return void this.mapConfirm();
    this.cursor = pos;
    this.game.update(this.screen.k === 'map' ? tapTile(this.game.battle, this.ui, pos) : this.ui);
  }

  hover(x: number, y: number) {
    const pos = this.scene.pick(x, y, this.pickSize);
    if (
      !pos ||
      this.game.busy ||
      !this.game.heroTurn ||
      this.screen.k === 'facing' ||
      this.screen.k === 'confirm' ||
      samePos(pos, this.cursor)
    )
      return;
    this.cursor = pos; // no blip on tiles: it piled up and stuttered when sweeping the mouse or the stick (Fernando, Nov 15)
    this.game.update(this.screen.k === 'map' ? hoverTile(this.game.battle, this.ui, pos) : this.ui);
  }

  // a key or pad action on the hero's turn (the Game already took the ones that always work and checked it is not busy)
  key(a: KeyAction) {
    const b = this.game.battle;
    if (a.k === 'undo') return this.game.undo();
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
        return this.game.update(this.ui);
      }
      if (a.k === 'confirm') return s.k === 'menu' ? this.chooseCommand(s.index) : this.chooseAbility(s.index);
      if (a.k === 'cancel' && s.k === 'abilities') return this.back({ k: 'menu', index: 1 });
      // Esc, B or right button on the menu after moving (without having acted): undoes the move, like Tactics Ogre
      if (a.k === 'cancel' && canUndoMove(b)) return this.game.undo();
      return;
    }
    if (s.k === 'confirm') {
      if (a.k === 'cursor') {
        sfx('cursor');
        this.screen = s.lock ? { ...s, lock: s.lock === 'unit' ? 'tile' : 'unit' } : { ...s, yes: !s.yes };
        return this.game.update(this.ui);
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
      } else if (a.k === 'confirm') void this.game.endTurn();
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
    if (c === 'move' && canUndoMove(b)) return this.game.undo(); // the Move row became "Undo move"
    sfx('confirm');
    if (c === 'status') return this.game.status();
    if (c === 'wait') return void this.game.endTurn();
    if (c === 'act') {
      const list = abilitiesOf(b).map((id) => abilityEnabled(b, id));
      this.screen = { k: 'abilities', index: Math.max(0, list.indexOf(true)) };
      return this.game.update(this.ui);
    }
    this.screen = { k: 'map', command: 'move' };
    this.cursorToActor();
    this.game.update(hoverTile(b, selectMode(b, this.ui, { k: 'move' }), this.cursor));
  }

  // submenu ability: goes to the map to choose the target; self-centered goes straight to "Execute?"
  chooseAbility(index: number) {
    const b = this.game.battle;
    const id = abilitiesOf(b)[index];
    if (this.game.busy || !this.game.heroTurn || !id || !commandEnabled(b, 'act') || !abilityEnabled(b, id)) return;
    sfx('confirm');
    const ui = selectMode(b, this.ui, { k: 'ability', id });
    if (ABILITIES[id].range[1] === 0) {
      this.screen = { k: 'confirm', ability: id, target: b.actor.pos, yes: true };
      return this.game.update(ui);
    }
    this.screen = { k: 'map', command: 'act' };
    this.cursorToActor();
    this.game.update(hoverTile(b, ui, this.cursor));
  }

  // confirm on the map: Move walks at once (like FFT); Act opens "Execute?"
  private async mapConfirm() {
    const p = this.ui.pending;
    const m = this.ui.mode;
    if (!p) return sfx('cancel');
    if (m.k === 'ability') {
      if (!this.game.battle.preview(m.id, p).ok) return sfx('cancel');
      sfx('confirm');
      this.screen = { k: 'confirm', ability: m.id, target: p, yes: true };
      return this.game.update(this.ui);
    }
    sfx('confirm');
    await this.game.execute();
  }

  async answer(yes: boolean) {
    const s = this.screen;
    if (s.k !== 'confirm' || this.game.busy) return;
    // No on the lock step goes back to "Execute?"
    if (!yes && s.lock) {
      sfx('cancel');
      this.screen = { ...s, lock: undefined };
      return this.game.update(this.ui);
    }
    // a charge aimed at someone: one more step, where to lock it (Nov 15), starting on the ability's usual lock
    if (yes && needsLock(this.game.battle, s.ability, s.target)) {
      sfx('confirm');
      this.screen = { ...s, lock: s.lock ?? defaultLock(ABILITIES[s.ability]) };
      return this.game.update(this.ui);
    }
    if (!yes) {
      sfx('cancel');
      if (ABILITIES[s.ability].range[1] === 0)
        return this.back({ k: 'abilities', index: abilitiesOf(this.game.battle).indexOf(s.ability) });
      this.screen = { k: 'map', command: 'act' };
      return this.game.update(this.ui);
    }
    sfx('confirm');
    await this.game.execute();
  }

  // the lock step's choice (click, or Enter on the focused one): the charge starts locked there
  async pickLock(on: Lock) {
    if (this.screen.k !== 'confirm' || !this.screen.lock || this.game.busy) return;
    sfx('confirm');
    await this.game.execute(on);
  }

  private moveCursor(p: Pos) {
    this.cursor = p;
    this.scene.focusOn(p); // the camera follows the cursor, like FFT
    this.game.update(hoverTile(this.game.battle, this.ui, p));
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
