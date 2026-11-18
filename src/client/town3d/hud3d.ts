// The walkable town's HUD drawn in 3D, a screen of the town's 3D layer in the look of the
// battle's 3D HUD (hints3d/, window3d/tools3d.ts; the reference has no walkable town): the town's name on a dark slate
// sign top left (square, unframed: not a button), what Enter does on a pill over what it acts on (the pill top centre only with nothing in reach: the
// walk keys). The gear and ↺ ↻ are window3d/tools3d.ts', as in battle.
//   Words and input: the HTML HUD (game/town-hud.ts, game/town.ts) stays, unseen (style.css .hud.townhud3d): it says
//   what to write, and its real buttons take the mouse, the taps and the screen reader. Where each part goes is
//   town-layout.ts townHud, no measure of the HTML. Nothing here
//   decides anything.
import { Group } from 'three';
import type { Act } from '../glyphs.ts';
import { LINE, NONE, Part, PILL, type Quad, type Rgba, WHITE } from '../hints3d/hints3d.ts';
import { t } from '../i18n.ts';
import { onHelp, tutorialOn } from '../key-hints.ts';
import { touchDevice } from '../screen-buttons.ts';
import { capMeshes, capRun, capsWidth } from '../ui3d/caps.ts';
import type { Ui3dLayer, Ui3dScreen } from '../ui3d/layer.ts';
import { textMesh } from '../ui3d/text.ts';
import { promptSays, townHud } from './town-layout.ts';

const EDGE: Rgba = [0.82, 0.86, 0.92, 0.35];
const LIT: Rgba = [0.33, 0.37, 0.44, 0.95]; // the button in focus
const SIZE = { name: 28, prompt: 28, act: 26 }; // px of the reference; never under 16 on the page

export class TownHud3d implements Ui3dScreen {
  readonly flat = new Group();
  readonly host: HTMLElement; // the town's name: hidden with the HUD (a window, someone talking), the drawing goes too
  private readonly fixed = new Part(); // the name and the prompt
  private readonly act = new Part(); // the balloon, moved every frame
  private readonly prompt: HTMLElement;
  private readonly balloon: HTMLElement;
  private readonly watch = new MutationObserver(() => this.draw());
  private readonly ac = new AbortController();
  private readonly unhelp = onHelp(() => this.draw()); // Options › Tutorial changed
  private actH = 0;
  private at = '';

  constructor(
    private readonly layer: Ui3dLayer,
    private readonly hud: HTMLElement,
  ) {
    const find = (cls: string) => hud.querySelector<HTMLElement>(cls)!;
    this.host = find('.tile-info');
    this.prompt = find('.town-prompt');
    this.balloon = find('.town-act');
    this.flat.add(this.fixed.group, this.act.group);
    this.fixed.want = 1;
    hud.classList.add('townhud3d');
    // what the prompt and the balloon say changes with what is in front of the walker
    this.watch.observe(this.prompt, { childList: true, characterData: true, subtree: true });
    this.watch.observe(this.balloon, { attributes: true, attributeFilter: ['data-say'] });
    const o = { signal: this.ac.signal };
    hud.addEventListener('focusin', () => this.draw(), o);
    hud.addEventListener('focusout', () => this.draw(), o);
    layer.add(this, 'townhud');
  }

  resize() {
    this.fixed.key = this.act.key = '';
    this.draw();
  }

  private label(str: string, size: number, color: string, floor = 16) {
    const px = Math.max(floor, size * this.layer.s);
    return textMesh(str, { size: px, color, font: this.layer.theme.font }, this.layer.dpr) as Quad;
  }

  // a pill with a line of text and, where there is a keyboard, the key on its cap; `x`, `y`: its middle. Its size back
  private pill(part: Part, str: string, key: string, size: number, x: number, y: number, h: number, lit = false) {
    const { s, dpr, theme } = this.layer,
      text = this.label(str, size, WHITE),
      caps = (key && capMeshes(key as Act, this.layer.keys, Math.max(22, 28 * s), dpr, theme.font)) || null,
      capW = caps ? capsWidth(caps, 4 * s) : 0,
      gap = caps ? 12 * s : 0,
      pad = 22 * s,
      w = text.scale.x + gap + capW + 2 * pad,
      left = x - w / 2;
    part.box(left, y - h / 2, w, h, h / 2, lit ? LIT : PILL, EDGE);
    part.text(text, left + pad + text.scale.x / 2, y);
    if (caps) capRun((m, cx, cy) => part.text(m, cx, cy), caps, left + w - pad - capW, y, 4 * s);
    return w;
  }

  // Rebuilds only the part whose words, place or focus changed
  private draw() {
    const { layer, fixed, act, hud } = this,
      s = layer.s;
    layer.wake();
    const keys = hud.classList.contains('kbd'),
      // the action of the HTML hint (key-hints.ts) and what it shows now, so a change of input redraws
      key = (e: Element) => (keys ? (e.querySelector<HTMLElement>('.hint')?.dataset.act ?? '') : ''),
      focus = document.activeElement;
    const { name, prompt: line } = townHud(layer.w, layer.inset, !!key(this.prompt)),
      says = promptSays(
        this.prompt.firstChild?.textContent ?? '',
        this.balloon.dataset.say ?? '',
        tutorialOn(),
        touchDevice(),
        layer.keys,
        t('Joystick: andar · Botão: falar ou entrar', 'Joystick: walk · Button: talk or go in'),
      );
    const fkey = JSON.stringify([name, line, says, key(this.prompt), layer.keys, layer.dpr, s]);
    if (fkey !== fixed.key) {
      fixed.clear();
      fixed.key = fkey;
      // the town's name, on its corner: a square plate with no frame and a rule under the name, so it reads as a sign
      // and not as a button like the ☰ that stood in the other corner (Nov 18 review: both wore the same rounded, framed slate)
      const town = this.label(this.host.textContent ?? '', SIZE.name, WHITE),
        w = town.scale.x + 44 * s,
        h = Math.max(name.h, 44 * s);
      fixed.box(name.x, name.y, w, h, 0, PILL, NONE);
      fixed.box(name.x + 16 * s, name.y + h - 8 * s, w - 32 * s, Math.max(1, 2 * s), 0, LINE, NONE);
      fixed.text(town, name.x + w / 2, name.y + h / 2 - 2 * s);
      if (says) this.pill(fixed, says, key(this.prompt), SIZE.prompt, line.x, line.y, Math.max(line.h, 48 * s));
    }
    // the balloon: what the action button does, drawn around the origin and moved over its target every frame
    const what = this.balloon.dataset.say ?? '';
    const akey = JSON.stringify([what, key(this.balloon), layer.keys, focus === this.balloon, layer.dpr, s]);
    if (akey !== act.key) {
      act.clear();
      act.key = akey;
      this.actH = Math.max(44, 52 * s);
      const w = what
        ? this.pill(act, what, key(this.balloon), SIZE.act, 0, -this.actH / 2, this.actH, focus === this.balloon)
        : 0;
      // the real button takes the drawn one's size, so a click or a tap anywhere on it acts
      this.balloon.style.minWidth = `${w}px`;
      this.balloon.style.minHeight = `${this.actH}px`;
    }
  }

  frame(dt: number) {
    const e = this.layer.still ? 10 : dt;
    let moving = this.fixed.fade(e);
    // game/town.ts places the balloon every frame: its bottom middle sits on left, top
    const b = this.balloon,
      at = b.hidden ? '' : `${b.style.left},${b.style.top}`;
    this.act.want = at ? 1 : 0;
    if (at && at !== this.at) {
      this.act.group.position.set(Number.parseFloat(b.style.left), -Number.parseFloat(b.style.top), 0);
      this.layer.wake();
    }
    this.at = at;
    moving = this.act.fade(e) || moving;
    return moving;
  }

  dispose() {
    this.layer.remove(this);
    this.watch.disconnect();
    this.unhelp();
    this.ac.abort();
    this.fixed.clear();
    this.act.clear();
    this.hud.classList.remove('townhud3d');
    this.balloon.style.minWidth = this.balloon.style.minHeight = '';
  }
}
