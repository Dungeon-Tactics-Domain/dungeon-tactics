// Battle HUD in the style of the FFT battle screen (Fernando's request, Nov 12: "discard the current interfaces and recreate
// the interface the same way as the original final fantasy tactics"). Only the layout and flow come from there; frames,
// colors and portraits are ours (CSS and KayKit characters). Pieces, top to bottom:
//   top left: the tile under the cursor (height and floor) and, below it, the list of upcoming turns (AT);
//   top middle: the help line for what to do now and, below it, the banner with the ability name;
//   beside the acting character: the command menu (Move · Act · Wait · Status), the abilities submenu and the
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
import { helpText, renderAbilities, renderCommands, renderConfirm } from './hud-menus.ts';
import { hint, KEYS, sheetFace, strikes, unitPanel } from './hud-pieces.ts';
import { ToolsMenu } from './hud-tools.ts';
import { abilityName, t, unitName } from './i18n.ts';
import { abilityIcon, el } from './icons.ts';
import type { Highlights } from './interaction.ts';
import { type Anchor, placeBeside } from './place-beside.ts';
import { portrait } from './portrait.ts';
import { isSurvival, turnsLeft } from './survival.ts';
import type { Face } from './talk.ts';
import { cursorInfo } from './tile-info.ts';
import { anchorScroll, pageStep, queueRows } from './turn-list.ts';

// main.ts and game/town.ts read these through hud.ts
export { eventLog, unitStatus } from './battle-text.ts';
export { hint, KEYS } from './hud-pieces.ts';

export interface HudActions {
  command(index: number): void; // click on a command menu item
  ability(index: number): void; // click on a submenu ability
  answer(yes: boolean): void; // "Execute?" Yes or No
  lock(on: Lock): void; // a charge's lock step: on the character or on the tile (Nov 15)
  cancel(): void;
  rotate(dir: 1 | -1): void;
  recenter(): void;
  pixel(): void;
  fast(): void; // toggles the 3x faster battle (the touch way; on the keyboard, hold Enter)
  undo(): void; // undoes the last step (same as the Z key): whoever plays with a mouse only had no way to
  menu(): void;
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
  scrollQueue(dir: 1 | -1) {
    const row = this.queue.querySelector<HTMLElement>('.queue-row')?.offsetHeight ?? 0;
    this.queue.scrollBy({ top: dir * pageStep(this.queue.clientHeight, row) });
  }
  // where the list was scrolled before the redraw, and the turn it showed: a new turn scrolls back to NOW on top
  private queueScroll = 0;
  private queueTurn = '';
  private readonly help = el('div', { class: 'panel help', 'aria-live': 'polite' });
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

  constructor(
    host: HTMLElement,
    private readonly act: HudActions,
  ) {
    this.tools = new ToolsMenu(act);
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
    renderCommands(this.commands, v, open, this.act);
    renderAbilities(this.abilities, v, open, this.act);
    renderConfirm(this.confirmBox, v, open, this.act);
    // acting unit: the enemy that is playing (the state may have already passed the turn during the animation)
    const actingUnit = v.acting ? b.state.units.find((u) => u.def === v.acting && u.team === 'enemy') : undefined;
    const me = b.over ? undefined : (actingUnit ?? b.actor);
    this.active.replaceChildren(...(me ? [unitPanel(b.state, me, this.face(me))] : []));
    // the turn list ends a gap above the acting panel, whose height changes with the screen width
    this.queue.style.maxHeight = `calc(100% - 56px - 2 * var(--inset) - ${this.active.offsetHeight}px)`;
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
    // size of the panels that move with the character, measured once per draw (each frame's `place` only reads the cache);
    // the strips enter the bottom height so "Execute?" does not land on top of them
    const box = (e: HTMLElement) => ({ w: e.offsetWidth, h: e.offsetHeight });
    this.sizes = {
      commands: box(this.commands),
      abilities: box(this.abilities),
      confirm: box(this.confirmBox),
      bottom: Math.max(this.active.offsetHeight, this.target.offsetHeight, this.strikesEl.offsetHeight),
    };
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
  showFaces() {
    for (const face of this.faces) {
      const n = frameOf(face.f, this.expression(face.u));
      if (n !== face.n) face.show((face.n = n));
    }
  }

  private sizes = { commands: { w: 0, h: 0 }, abilities: { w: 0, h: 0 }, confirm: { w: 0, h: 0 }, bottom: 0 };
  get menuOpen() {
    return !this.commands.hidden || !this.confirmBox.hidden;
  }

  // Places the menu, submenu or "Execute?" beside the acting character (`a`, in screen px). Called every frame while
  // the menu is open (the camera slides and rotates): only left/top change, and only when the px changes. `target`: the target of
  // "Execute?", which the window does not cover (nor the turn list, which shows where the charge fires)
  place(a: Anchor | null, target: Anchor | null = null) {
    if (!a || !this.menuOpen) return;
    // free: below the help line and the menu button (which stay at the top), above the bottom unit panels
    const area = {
      left: 12,
      top: 72,
      right: this.root.clientWidth - 12,
      bottom: this.root.clientHeight - 24 - this.sizes.bottom,
    };
    const q = this.queue.getBoundingClientRect();
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
    // with the submenu open, both decide the side together (otherwise the submenu fell on top of the character); the menu stays on its side
    const gap = 8;
    const p = placeBeside(a, sub ? c.w + gap + s.w : c.w, Math.max(c.h, sub ? s.h : 0), area, 'right', avoid);
    const right = p.side === 'right';
    put(this.commands, right || !sub ? p.left : p.left + s.w + gap, p.top);
    if (!sub) return;
    put(this.abilities, right ? p.left + c.w + gap : p.left, p.top);
    // the submenu opens coming out of the menu: from the left when it is on its right, and vice versa
    this.abilities.classList.toggle('from-right', !right);
  }

  private renderQueue(b: Battle, aim: { ability: string; target: Pos } | null) {
    const { rows, targets, at } = b.over ? { rows: [], targets: new Set<string>(), at: -1 } : queueRows(b, aim);
    // in Until Dawn mode, the title counts the turns left: the same number the rule uses (all turns)
    const left = isSurvival(b.state.scenario) ? turnsLeft(b.state) : null;
    this.queueScroll = this.queue.scrollTop;
    this.queue.replaceChildren(
      el(
        'li',
        { class: 'queue-title', 'aria-hidden': left === null ? 'true' : undefined },
        left === null ? t('Turnos', 'Turns') : t(`Turnos · faltam ${left}`, `Turns · ${left} to dawn`),
        hint('PgUp PgDn'),
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
          el('span', { class: 'queue-round', title: t(`Rodada ${round}`, `Round ${round}`) }, String(round)),
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
  }

  // height the HUD covers at the bottom (acting unit panel), so the scene centers the map on what is left. Only the acting one: the
  // target's grows with the strike preview and the map jumped each time the cursor passed over a target
  insets() {
    return { top: 0, bottom: this.active.getBoundingClientRect().height };
  }

  dispose() {
    this.tools.close();
    this.root.remove();
  }
}
