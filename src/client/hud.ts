// Battle HUD in the style of the FFT battle screen (Fernando's request, Nov 12: "discard the current interfaces and recreate
// the interface the same way as the original final fantasy tactics"). Only the layout and flow come from there; frames,
// colors and portraits are ours (CSS and KayKit characters). Pieces, top to bottom:
//   top left: the tile under the cursor (height and floor) and, below it, the list of upcoming turns (AT);
//   top middle: the help line for what to do now and, below it, the banner with the ability name;
//   beside the acting character: the command menu (Move · Abilities · Wait · Status), the abilities submenu and the
//   "Execute?" (Nov 13, Fernando's request: "beside the character like in FFT"; `place` follows the camera every frame);
//   bottom left: the acting unit (portrait, HP, MP and CT bars); bottom right: the unit under the cursor; when aiming, the
//   strike preview (Tactics Ogre's idea, Nov 13; the lab kit's two-colour strip, Nov 15) takes its place beside the acting
//   panel: one strip per target with the big damage, the hit chance and the target's bar with the part that goes away.
// Redraws everything on each change (it is little DOM); the menu position changes only via left/top.
import type { Battle } from '../shared/battle/battle.ts';
import { unitAt } from '../shared/battle/pathing.ts';
import type { Lock, Pos, UnitState } from '../shared/battle/types.ts';
import { type Expression, frameOf } from './battle-face.ts';
import type { Screen } from './command.ts';
import { forecast } from './forecast.ts';
import { type Pieces3d, pieces3d } from './hud-3d-pieces.ts';
import { helpText, renderAbilities, renderBack, renderCommands, renderConfirm, undoShown } from './hud-menus.ts';
import { helpWidth, hint, KEYS, queueEnd, sheetFace, shownRight, strikes, unitPanel } from './hud-pieces.ts';
import type { HudSkin } from './hud-skin.ts';
import { ToolsMenu } from './hud-tools.ts';
import { abilityName, t, unitName } from './i18n.ts';
import { abilityIcon, el, iconButton } from './icons.ts';
import type { Highlights } from './interaction.ts';
import type { Menu3d } from './menu3d/menu3d.ts';
import { type Anchor, helpEnd, placeBeside } from './place-beside.ts';
import { portrait } from './portrait.ts';
import { isSurvival, turnsLeft } from './survival.ts';
import type { Face } from './talk.ts';
import { cursorInfo } from './tile-info.ts';
import { anchorScroll, pageStep, queueRows } from './turn-list.ts';
import type { Queue } from './turn3d/queue-view.ts';
import type { Turn3d } from './turn3d/turn3d.ts';
import type { Ui3dLayer } from './ui3d/layer.ts';
import { sheetBox } from './ui3d/layout.ts';

// main.ts and game/town.ts read these through hud.ts
export { eventLog, unitStatus } from './battle-text.ts';
export { hint, KEYS } from './hud-pieces.ts';

export interface HudActions {
  command(index: number): void; // click on a command menu item
  ability(index: number): void; // click on a submenu ability
  answer(yes: boolean): void; // the "Execute?" preview: Confirm or Back
  lock(on: Lock): void; // a charge's lock step: on the character or on the tile (Nov 15)
  page(dir: 1 | -1): void; // the ability sheet's arrows (menu3d/)
  hover(list: 'menu' | 'abilities', index: number): void; // the mouse (or Tab) over a 3D menu row moves the focus there
  rotate(dir: 1 | -1): void;
  recenter(): void;
  pixel(): void;
  fast(): void; // toggles the 3x faster battle (the touch way; on the keyboard, hold Enter)
  undo(): void; // undoes the last step (same as the Z key): whoever plays with a mouse only had no way to
  menu(): void;
  fps(): void; // the menu's performance counter switch (the F3 key on a keyboard)
  cancel(): void; // the Back button, the same as Esc, B and the right button (a finger has none of them)
}
export interface HudView {
  battle: Battle;
  screen: Screen;
  hl: Highlights | null;
  busy: boolean; // animation or enemy turn: nothing responds
  log: string; // summary of the last action (eventLog)
  acting: string | null; // def of the enemy playing now (the state has already passed the turn when the animation plays)
  cursor: Pos; // tile under the cursor (keyboard, mouse or gamepad)
  ability: string | null; // ability being aimed on the map (the strike preview on the target panel)
  face: (u: UnitState) => Expression; // the painted face's expression now (battle-face.ts)
}

export class BattleHud {
  private readonly tile = el('div', { class: 'panel tile-info', 'aria-live': 'off' });
  private readonly queue = el('ol', { class: 'panel queue', 'aria-label': t('Ordem dos turnos', 'Turn order') });
  private readonly tools: ToolsMenu;
  setFast(on: boolean) {
    this.tools.setFast(on);
  }
  setFps(on: boolean) {
    this.tools.setFps(on);
  }
  setPixel(size: number) {
    this.tools.setPixel(size);
  }
  scrollQueue(dir: 1 | -1) {
    const row = this.queue.querySelector<HTMLElement>('.queue-row')?.offsetHeight ?? 0;
    this.queue.scrollBy({ top: dir * pageStep(this.queue.clientHeight, row) });
  }
  // where the list was scrolled before the redraw, and the turn it showed: a new turn scrolls back to NOW on top
  private queueScroll = 0;
  private queueTurn = '';
  private readonly help = el('div', { class: 'panel help', 'aria-live': 'polite' });
  // Back beside the menu button (Nov 16, Fernando): the only way out of the Move and Act maps without Esc, B or a right button
  private readonly back = iconButton(
    '↩',
    t('Voltar', 'Back'),
    () => {
      this.tools.close(); // the open corner list counts a tap anywhere in .tools as inside
      this.act.cancel();
    },
    { class: 'icon back', hidden: true },
  );
  private readonly bannerEl = el('div', { class: 'panel banner', role: 'status', hidden: true });
  private readonly commands = el('div', {
    class: 'panel commands',
    role: 'menu',
    'aria-label': t('Comandos', 'Commands'),
  });
  private readonly abilities = el('div', {
    class: 'panel abilities',
    role: 'menu',
    'aria-label': t('Habilidades', 'Abilities'),
  });
  private readonly confirmBox = el('div', { class: 'panel confirm', role: 'dialog' });
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
    this.tools = new ToolsMenu(act);
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
      this.abilities,
      this.confirmBox,
      this.active,
      this.strikesEl,
      this.target,
    );
    host.append(this.root);
    this.layer = skin.layer(this.root, () => this.drop3d());
    if (!this.layer) return;
    this.menu3d = skin.menu3d(this.layer, act);
    this.turn3d = skin.turn3d(this.layer, this.queue);
    this.p3d = pieces3d(skin, this.layer, this.active, this.confirmBox, this.tools.root);
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
    // `size` is set only while choosing where to move: the square the unit would stand on
    this.tile.textContent = b.over ? '' : cursorInfo(b.grid, b.state, v.cursor, v.hl?.size ?? 1);
    this.faces = [];
    this.expression = v.face;
    // the ability being aimed (Act map or "Execute?") and where: the turn list projects it, the strips preview it
    const s = v.screen;
    const aim = s.k === 'confirm' ? s : s.k === 'map' && v.ability ? { ability: v.ability, target: v.cursor } : null;
    this.renderQueue(b, aim);
    this.help.textContent = helpText(v, heroTurn);
    this.p3d.hints?.update(v, open, this.help.textContent);
    renderBack(this.back, v, open);
    this.tools.setUndo(undoShown(b, open));
    renderCommands(this.commands, v, open, this.act);
    renderAbilities(this.abilities, v, open, this.act);
    this.menu3d?.update(v, open);
    renderConfirm(this.confirmBox, v, open, this.act);
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
    // unit under the cursor (or the "Execute?" target)
    const at = v.screen.k === 'confirm' ? v.screen.target : v.cursor;
    // unitAt: any tile of the large unit shows its panel
    const found = unitAt(b.state, at);
    // aiming (Act map or "Execute?"): the strips beside the acting panel take the target panel's place, the one for the target
    // under the cursor first. It applies even to someone healing themself (outside aiming, their own panel is not repeated)
    const ability = aim?.ability ?? null;
    const fs = open && ability && v.hl?.preview?.ok ? forecast(b, ability, v.hl.preview) : [];
    const main = fs.find((f) => f.unit.id === found?.id) ?? fs[0];
    const other = main ? undefined : found?.id !== me?.id ? found : undefined;
    this.target.replaceChildren(...(other ? [unitPanel(b.state, other, this.face(other))] : []));
    this.strikesEl.replaceChildren(...(main ? strikes([main, ...fs.filter((f) => f !== main)], ability!) : []));
    this.turn3d?.update(b, this.queued, fs, v.face, me?.id);
    this.p3d.bar?.update(b.state, me, other, main ? [main, ...fs.filter((f) => f !== main)] : [], ability, v.face);
    this.p3d.confirm?.update(v, open);
    // size of the panels that move with the character, once per draw (each frame's `place` only reads the cache); the
    // strips enter the bottom height so "Execute?" does not land on them. A 3D piece's size is its own layout's (Nov 18)
    const box = (e: HTMLElement) => ({ w: e.offsetWidth, h: e.offsetHeight });
    const { layer, sheet, help } = this;
    const end = layer
      ? helpEnd(help.textContent ?? '', layer.w, layer.inset.top, helpWidth)
      : help.getBoundingClientRect().bottom;
    this.sizes = {
      commands: box(this.commands),
      abilities: box(this.abilities),
      confirm: this.p3d.confirm?.size ?? box(this.confirmBox),
      bottom: Math.round(
        sheet?.h ?? Math.max(this.active.offsetHeight, this.target.offsetHeight, this.strikesEl.offsetHeight),
      ),
      top: Math.max(72, end + 8), // the menus start below the help line, which wraps on a narrow screen
    };
  }
  // the 3D bar's sheet on the page, from the layout alone; null with the HTML panels, which are measured
  private get sheet() {
    return this.layer && this.p3d.bar ? sheetBox(this.layer.stage, this.layer.h) : null;
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

  private sizes = { commands: { w: 0, h: 0 }, abilities: { w: 0, h: 0 }, confirm: { w: 0, h: 0 }, bottom: 0, top: 72 };
  get menuOpen() {
    return !this.commands.hidden || !this.confirmBox.hidden;
  }

  // Places the menu, submenu or "Execute?" beside the acting character (`a`, in screen px). Called every frame while
  // the menu is open (the camera slides and rotates): only left/top change, and only when the px changes. `target`: the target of
  // "Execute?", which the window does not cover (nor the turn list, which shows where the charge fires)
  place(a: Anchor | null, target: Anchor | null = null) {
    if (!a || !this.menuOpen) return;
    // the 3D menu keeps the menu and the submenu bottom right; only "Execute?" follows the character
    if (this.menu3d && this.confirmBox.hidden) return;
    // free: below the help line and the menu button (which stay at the top), above the bottom unit panels
    const area = {
      left: 12,
      top: this.sizes.top,
      right: this.root.clientWidth - 12,
      bottom: this.root.clientHeight - 24 - this.sizes.bottom,
    };
    const q = this.turn3d?.box ?? this.queue.getBoundingClientRect();
    // the character on screen goes from ~1.5 half widths above the middle (health bar) to ~1.5 below (ring on the ground)
    const avoid = [
      { left: q.left, top: q.top, right: q.right, bottom: q.bottom },
      ...(target
        ? [
            {
              left: target.x - target.r,
              top: target.y - 1.5 * target.r,
              right: target.x + target.r,
              bottom: target.y + 1.5 * target.r,
            },
          ]
        : []),
    ];
    const prefer = target && target.x > a.x ? 'left' : 'right';
    const put = (e: HTMLElement, left: number, top: number) => {
      const l = `${Math.round(left)}px`,
        tp = `${Math.round(top)}px`;
      if (e.style.left !== l) e.style.left = l;
      if (e.style.top !== tp) e.style.top = tp;
    };
    const { commands: c, abilities: s, confirm: f } = this.sizes;
    if (!this.confirmBox.hidden) {
      let p = placeBeside(a, f.w, f.h, area, prefer, avoid);
      // no room clear of both (three strips at 1280x720): keep the turn list clear, the strips already show the target's numbers
      if (!p.free) p = placeBeside(a, f.w, f.h, area, prefer, avoid.slice(0, 1));
      return put(this.confirmBox, p.left, p.top);
    }
    const sub = !this.abilities.hidden;
    const gap = 8;
    // a phone has no room for both side by side (164 + 8 + 320 px on a 375 px screen): the submenu takes the menu's place
    const over = sub && c.w + gap + s.w > area.right - area.left;
    this.commands.classList.toggle('covered', over);
    if (over) {
      const o = placeBeside(a, s.w, s.h, area, 'right', avoid);
      return put(this.abilities, o.left, o.top);
    }
    // with the submenu open, both decide the side together (otherwise the submenu fell on top of the character); the menu stays on its side
    const p = placeBeside(a, sub ? c.w + gap + s.w : c.w, Math.max(c.h, sub ? s.h : 0), area, 'right', avoid);
    const right = p.side === 'right';
    put(this.commands, right || !sub ? p.left : p.left + s.w + gap, p.top);
    if (!sub) return;
    put(this.abilities, right ? p.left + c.w + gap : p.left, p.top);
    // the submenu opens coming out of the menu: from the left when it is on its right, and vice versa
    this.abilities.classList.toggle('from-right', !right);
  }

  private renderQueue(b: Battle, aim: { ability: string; target: Pos } | null) {
    this.queued = b.over ? null : queueRows(b, aim);
    const { rows, targets, at } = this.queued ?? { rows: [], targets: new Set<string>(), at: -1 };
    // in Until Dawn mode, the title counts the turns left: the same number the rule uses (all turns)
    const left = isSurvival(b.state.scenario) ? turnsLeft(b.state) : null;
    this.queueScroll = this.queue.scrollTop;
    this.queue.replaceChildren(
      el(
        'li',
        { class: 'queue-title', 'aria-hidden': left === null ? 'true' : undefined },
        left === null ? t('Turnos', 'Turns') : t(`Turnos · faltam ${left}`, `Turns · ${left} to dawn`),
        hint('turns'),
      ),
      // a charge row: the caster's face, the ability's icon and name, and the ticks until it goes off
      ...rows.map(({ unit, charge, ticks, round }, i) => {
        const u = b.state.units.find((x) => x.id === unit)!;
        const mark =
          !charge && i > 0 && targets.has(unit) ? el('span', { class: 'queue-target' }, t('◎ alvo', '◎ target')) : null;
        return el(
          'li',
          {
            class: `queue-row ${u.team}${i === 0 ? ' now' : ''}${charge ? ' charge' : ''}${i === at ? ' pending' : ''}`,
          },
          this.face(u),
          charge ? abilityIcon(charge) : null,
          el(
            'span',
            { class: 'queue-text' },
            el(
              'span',
              { class: 'queue-n' },
              charge ? t(`resolve em ${ticks}`, `resolves in ${ticks}`) : i === 0 ? t('AGORA', 'NOW') : String(i),
              mark,
            ),
            el('span', { class: 'queue-name' }, charge ? abilityName(charge) : unitName(u.def)),
          ),
          ...queueEnd(u, !!charge, round),
        );
      }),
    );
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
    this.tools.close();
    this.root.remove();
  }
}
