// Battle HUD in the style of the FFT battle screen (Fernando's request, Nov 12: "discard the current interfaces and recreate
// the interface the same way as the original final fantasy tactics"). Only the layout and flow come from there; frames,
// colors and portraits are ours (CSS and KayKit characters). Pieces, top to bottom:
//   top left: the tile under the cursor (height and floor) and, below it, the list of upcoming turns (AT);
//   top middle: the help line for what to do now and, below it, the banner with the ability name;
//   beside the acting character: the command menu (Move · Abilities · Wait · Status) (Nov 13, Fernando's request:
//   "beside the character like in FFT"; `place` follows the camera every frame);
//   bottom left: the acting unit (portrait, HP, MP and CT bars); bottom right: the unit under the cursor; when aiming, the
//   strike forecast on the Agir tile screen (Tactics Ogre's idea, Nov 13; the lab kit's two-colour strip, Nov 15) takes its place beside the acting
//   panel: one strip per target with the big damage, the hit chance and the target's bar with the part that goes away.
// Redraws everything on each change (it is little DOM); the menu position changes only via left/top.
import type { Battle } from '../shared/battle/battle.ts';
import { unitAt } from '../shared/battle/pathing.ts';
import type { Pos, UnitState } from '../shared/battle/types.ts';
import { spotAim } from './act-marks.ts';
import { type Expression, frameOf } from './battle-face.ts';
import type { Screen } from './command.ts';
import { forecast } from './forecast.ts';
import { type Pieces3d, pieces3d } from './hud-3d-pieces.ts';
import { helpText, renderBack, renderCommands, undoShown } from './hud-menus.ts';
import { helpWidth, KEYS, sheetFace, shownRight, strikes, unitPanel } from './hud-pieces.ts';
import { queueItems, wireCards } from './hud-queue.ts';
import type { HudSkin } from './hud-skin.ts';
import { CornerButtons } from './hud-tools.ts';
import { t } from './i18n.ts';
import { el, iconButton } from './icons.ts';
import type { Highlights } from './interaction.ts';
import { menuUp } from './menu-state.ts';
import type { Menu3d } from './menu3d/menu3d.ts';
import { type Anchor, helpEnd, placeBeside } from './place-beside.ts';
import { portrait } from './portrait.ts';
import type { Face } from './talk.ts';
import { cursorInfo } from './tile-info.ts';
import { anchorScroll, pageStep, queueRows } from './turn-list.ts';
import type { Queue } from './turn3d/queue-view.ts';
import type { Turn3d } from './turn3d/turn3d.ts';
import type { Ui3dLayer } from './ui3d/layer.ts';
import { sheetBox } from './ui3d/layout.ts';

// main.ts and game/town.ts read these through hud.ts
export { eventLog } from './battle-text.ts';
export { hint, KEYS } from './hud-pieces.ts';

export interface HudActions {
  command(index: number): void; // click on a command menu item
  pick(index: number): void; // click on a row of the Agir primeiro lists (targets, actions, lock step)
  hover(list: 'menu' | 'abilities', index: number): void; // the mouse (or Tab) over a 3D menu row moves the focus there
  rotate(dir: 1 | -1): void; // the camera pair on the screen (R and Shift+R)
  undo(): void; // undoes the last step (same as the Z key): whoever plays with a mouse only had no way to
  menu(): void; // the gear: Options
  cancel(): void; // the Back button, the same as Esc, B and the right button (a finger has none of them)
  sheet(): void; // a tap on the acting unit's sheet: the closed menu shows again (menu-state.ts)
  card(unit: string): void; // a tap on a turn card: that unit's mini menu, or the menu for the hero acting now
}
export interface HudView {
  battle: Battle;
  screen: Screen;
  hl: Highlights | null;
  busy: boolean; // animation or enemy turn: nothing responds
  log: string; // summary of the last action (eventLog)
  acting: string | null; // def of the enemy playing now (the state has already passed the turn when the animation plays)
  cursor: Pos; // tile under the cursor (keyboard, mouse or gamepad)
  face: (u: UnitState) => Expression; // the painted face's expression now (battle-face.ts)
  closed?: boolean; // the menu hidden by a tap on an empty tile (menu-state.ts)
  range?: string | null; // the unit whose range the map paints (unit-peek.ts)
}

export class BattleHud {
  private readonly tile = el('div', { class: 'panel tile-info', 'aria-live': 'off' });
  private readonly queue = el('ol', {
    class: 'panel queue',
    'aria-label': t('Ordem dos turnos', 'Turn order'),
    tabIndex: -1, // a scroller is a Tab stop of its own in Chrome; PgUp and PgDn scroll it, the 3D list draws no focus
  });
  private readonly tools: CornerButtons;
  scrollQueue(dir: 1 | -1) {
    const row = this.queue.querySelector<HTMLElement>('.queue-row')?.offsetHeight ?? 0;
    this.queue.scrollBy({ top: dir * pageStep(this.queue.clientHeight, row) });
  }
  // where the list was scrolled before the redraw, and the turn it showed: a new turn scrolls back to NOW on top
  private queueScroll = 0;
  private queueTurn = '';
  private readonly help = el('div', { class: 'panel help', 'aria-live': 'polite' });
  // Back beside Undo and the gear (Nov 16, Fernando): the only way out of the Move and Act maps without Esc, B or a right button
  private readonly back = iconButton('↩', t('Voltar', 'Back'), () => this.act.cancel(), {
    class: 'icon back',
    hidden: true,
  });
  private readonly bannerEl = el('div', { class: 'panel banner', role: 'status', hidden: true });
  private readonly commands = el('div', {
    class: 'panel commands',
    role: 'menu',
    'aria-label': t('Comandos', 'Commands'),
  });
  private readonly active = el('div', { class: 'active-slot' });
  private readonly target = el('div', { class: 'target-slot' });
  private readonly strikesEl = el('div', { class: 'strikes' });
  private readonly root: HTMLElement;
  // the 3D pieces (hud-skin.ts) draw on one layer over the HUD; the HTML they stand for stays in place unseen
  private layer?: Ui3dLayer;
  private menu3d?: Menu3d;
  private turn3d?: Turn3d;
  private p3d: Pieces3d = {}; // the bar, the banner, Height and hints (hud-3d-pieces.ts)
  queued: Queue | null = null; // the rows the turn list shows now

  constructor(
    host: HTMLElement,
    private readonly act: HudActions,
    skin: HudSkin,
  ) {
    this.tools = new CornerButtons(act);
    this.tools.root.prepend(this.back);
    this.root = el(
      'div',
      { class: `hud${KEYS ? ' kbd' : ''}` },
      this.tile,
      this.queue,
      this.help,
      this.bannerEl,
      this.tools.root,
      this.commands,
      this.active,
      this.strikesEl,
      this.target,
    );
    host.append(this.root);
    this.active.addEventListener('click', () => act.sheet()); // takes taps only while the menu is shut (style.css)
    wireCards(this.queue, () => this.queued, act.card);
    this.layer = skin.layer(this.root, () => this.drop3d());
    if (!this.layer) return;
    this.menu3d = skin.menu3d(this.layer, act);
    this.turn3d = skin.turn3d(this.layer, this.queue);
    this.p3d = pieces3d(skin, this.layer, this.active, this.tools.root);
  }
  private drop3d() {
    this.layer?.dispose(); // with its screens
    this.layer = this.menu3d = this.turn3d = undefined;
    this.p3d = {};
  }
  // the layout picked in Options changed (layout-mode.ts): the CSS already follows, the 3D layer fits again
  relayout() {
    this.layer?.fit();
  }
  // the 3D layer's cost for the F3 counter (fps.ts)
  stats3d() {
    return this.layer?.stats();
  }

  render(v: HudView) {
    const b = v.battle;
    const heroTurn = !b.over && b.actor.team === 'hero';
    const open = heroTurn && !v.busy;
    const menu = menuUp(open, v); // the menu and its Back wait while the map is looked at
    this.root.classList.toggle('menu-shut', open && !menu);
    // `size` is set only while choosing where to move: the square the unit would stand on
    this.tile.textContent = b.over ? '' : cursorInfo(b.grid, b.state, v.cursor, v.hl?.size ?? 1);
    this.faces = [];
    this.expression = v.face;
    // the ability aimed on the Agir tile screen and where: the turn list projects it, the strips preview it
    const aim = spotAim(b, v.screen);
    this.renderQueue(b, aim);
    this.help.textContent = helpText(v, heroTurn);
    this.p3d.hints?.update(v, open, this.help.textContent);
    renderBack(this.back, v, menu);
    this.tools.setUndo(undoShown(b, open));
    renderCommands(this.commands, v, menu, this.act);
    this.menu3d?.update(v, menu);
    // acting unit: the enemy that is playing (the state may have already passed the turn during the animation)
    const actingUnit = v.acting ? b.state.units.find((u) => u.def === v.acting && u.team === 'enemy') : undefined;
    const me = b.over ? undefined : (actingUnit ?? b.actor);
    this.active.replaceChildren(...(me ? [unitPanel(b.state, me, this.face(me))] : []));
    const head = this.queued?.rows[0]; // the sheet shows the list's head (the 3D bar takes its card: queue-view.ts)
    this.root.classList.toggle('head-on-sheet', !!me && !head?.charge && head?.unit === me.id);
    // the HTML turn list ends a gap above the acting panel (56px + the top safe area is its own top in style.css). The
    // 3D list lays itself out (turn3d/queue-layout.ts) and seats this one: it only asks the room of an HTML acting panel
    const room = this.sheet ? undefined : this.root.clientHeight - this.active.offsetTop;
    if (this.turn3d) this.turn3d.seat(this.queued, me?.id, room);
    else
      this.queue.style.maxHeight = `calc(100% - 56px - env(safe-area-inset-top, 0px) - var(--inset) - var(--inset-b) - ${this.active.offsetHeight}px)`;
    this.anchorQueue(b);
    // unit under the cursor; unitAt: any tile of the large unit shows its panel
    const found = unitAt(b.state, v.cursor);
    // aiming (the Agir tile screen): the strips beside the acting panel take the target panel's place, the one for the target
    // under the cursor first. It applies even to someone healing themself (outside aiming, their own panel is not repeated)
    const ability = aim?.ability ?? null;
    const fs = open && ability && v.hl?.preview?.ok ? forecast(b, ability, v.hl.preview) : [];
    const main = fs.find((f) => f.unit.id === found?.id) ?? fs[0];
    const other = main ? undefined : found?.id !== me?.id ? found : undefined;
    this.target.replaceChildren(...(other ? [unitPanel(b.state, other, this.face(other))] : []));
    this.strikesEl.replaceChildren(...(main ? strikes([main, ...fs.filter((f) => f !== main)], ability!) : []));
    this.turn3d?.update(b, this.queued, fs, v.face, me?.id);
    this.p3d.bar?.update(b.state, me, other, main ? [main, ...fs.filter((f) => f !== main)] : [], ability, v.face);
    // size of the panels that move with the character, once per draw (each frame's `place` only reads the cache); the
    // strips enter the bottom height so the menu does not land on them
    const box = (e: HTMLElement) => ({ w: e.offsetWidth, h: e.offsetHeight });
    const { layer, sheet, help } = this;
    const end = layer
      ? helpEnd(help.textContent ?? '', layer.w, layer.inset.top, helpWidth)
      : help.getBoundingClientRect().bottom;
    this.sizes = {
      commands: box(this.commands),
      bottom: Math.round(
        sheet?.h ?? Math.max(this.active.offsetHeight, this.target.offsetHeight, this.strikesEl.offsetHeight),
      ),
      top: Math.max(72, end + 8), // the menus start below the help line, which wraps on a narrow screen
    };
  }
  // the 3D bar's sheet on the page, from the layout alone; null with the HTML panels, which are measured
  private get sheet() {
    return this.layer && this.p3d.bar ? sheetBox(this.layer.small, this.layer.h) : null;
  }

  // Painted faces (battle-face.ts) in the unit panels and the turn list, drawn with the dialogue box's sheet at the size
  // .battle-face gives; a unit without a sheet keeps its portrait. The expression changes on the battle clock without a
  // redraw: Game calls showFaces every frame, and only a face whose frame changed is moved
  private faces: { u: UnitState; f: Face; show: (n: number) => void; n: number }[] = [];
  private expression: HudView['face'] = () => 'neutral';
  private face(u: UnitState) {
    const s = sheetFace(u.def, 'battle-face portrait', this.expression(u));
    if (!s) return portrait(u.def);
    this.faces.push({ u, f: s.f, show: s.show, n: s.n });
    return s.node;
  }
  showFaces(now: number) {
    this.layer?.frame(now); // the 3D screens run on the battle clock, like the faces' moods
    for (const face of this.faces) {
      const n = frameOf(face.f, this.expression(face.u));
      if (n !== face.n) face.show((face.n = n));
    }
  }

  private sizes = { commands: { w: 0, h: 0 }, bottom: 0, top: 72 };
  get menuOpen() {
    return !this.commands.hidden;
  }

  // Places the command menu beside the acting character (`a`, in screen px). Called every frame while the menu is open (the
  // camera slides and rotates): only left/top change, and only when the px changes
  place(a: Anchor | null) {
    if (!a || !this.menuOpen) return;
    // the 3D menu keeps its columns bottom right
    if (this.menu3d) return;
    // free: below the help line and the menu button (which stay at the top), above the bottom unit panels
    const area = {
      left: 12,
      top: this.sizes.top,
      right: this.root.clientWidth - 12,
      bottom: this.root.clientHeight - 24 - this.sizes.bottom,
    };
    const q = this.turn3d?.box ?? this.queue.getBoundingClientRect();
    const { w, h } = this.sizes.commands;
    const p = placeBeside(a, w, h, area, 'right', [{ left: q.left, top: q.top, right: q.right, bottom: q.bottom }]);
    const l = `${Math.round(p.left)}px`,
      tp = `${Math.round(p.top)}px`;
    if (this.commands.style.left !== l) this.commands.style.left = l;
    if (this.commands.style.top !== tp) this.commands.style.top = tp;
  }

  private renderQueue(b: Battle, aim: { ability: string; target: Pos } | null) {
    this.queued = b.over ? null : queueRows(b, aim);
    this.queueScroll = this.queue.scrollTop;
    this.queue.replaceChildren(...queueItems(b, this.queued, (u) => this.face(u)));
  }

  private anchorQueue(b: Battle) {
    const q = this.queue;
    const turn = `${b.state.turnsPlayed}:${b.state.turn.actor}`;
    const p = q.querySelector<HTMLElement>('.pending');
    const pending = p ? { top: p.offsetTop, height: p.offsetHeight } : null;
    q.scrollTop = anchorScroll(this.queueScroll, q.clientHeight, turn !== this.queueTurn, pending);
    this.queueTurn = turn;
  }

  banner(text: string | null) {
    this.bannerEl.hidden = !text;
    this.bannerEl.textContent = text ?? '';
    this.p3d.hints?.announce(text);
  }

  // height the HUD covers at the bottom (acting unit panel), so the scene centers the map on what is left. Only the acting one: the
  // target's grows with the strike preview and the map jumped each time the cursor passed over a target
  insets() {
    // a piece the sandbox hides keeps its box but covers nothing (the 3D layer hides its host: ui3d/layer.ts veil)
    const list = this.turn3d && (this.queue.style.visibility === 'hidden' ? 0 : this.turn3d.box.right);
    return {
      bottom: this.sheet?.h ?? this.active.getBoundingClientRect().height,
      left: list ?? shownRight(this.queue),
    };
  }

  dispose() {
    this.drop3d();
    this.root.remove();
  }
}
