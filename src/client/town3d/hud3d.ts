// The walkable town's HUD drawn in 3D (?townhud=3d, the default), a screen of the town's 3D layer in the look of the
// battle's 3D HUD (hints3d/, window3d/tools3d.ts; the reference has no walkable town): the town's name on a dark slate
// plate top left, what Enter does on the pill top centre, the same over what it acts on, and the menu button (3 bars).
//   Layout and input: the HTML HUD (game/town-hud.ts, game/town.ts) stays in place, unseen (style.css .hud.townhud3d):
//   it says what to write and where, and its real buttons take the mouse, the taps and the screen reader. Nothing here
//   decides anything.
import { Group } from 'three';
import { NONE, Part, PILL, type Quad, type Rgba, WHITE } from '../hints3d/hints3d.ts';
import type { Ui3dLayer, Ui3dScreen } from '../ui3d/layer.ts';
import type { Box } from '../ui3d/layout.ts';
import { textMesh } from '../ui3d/text.ts';

const EDGE: Rgba = [0.82, 0.86, 0.92, 0.35];
const LIT: Rgba = [0.33, 0.37, 0.44, 0.95]; // the button in focus
const BAR: Rgba = [0.96, 0.95, 0.9, 1];
const CAP: Rgba = [0.78, 0.75, 0.73, 1]; // a key cap, as the button hints'
const CAP_EDGE: Rgba = [0.2, 0.18, 0.16, 0.7];
const CAP_INK = '#2a2622';
const SIZE = { name: 28, prompt: 28, act: 26, cap: 18 }; // px of the reference; never under 16 on the page (a cap 12)

export class TownHud3d implements Ui3dScreen {
  readonly flat = new Group();
  readonly host: HTMLElement; // the town's name: hidden with the HUD (a window, someone talking), the drawing goes too
  private readonly fixed = new Part(); // the name, the prompt and the menu button
  private readonly act = new Part(); // the balloon, moved every frame
  private readonly prompt: HTMLElement;
  private readonly balloon: HTMLElement;
  private readonly burger: HTMLElement;
  private readonly watch = new MutationObserver(() => this.draw());
  private readonly ac = new AbortController();
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
    this.burger = find('.burger');
    this.flat.add(this.fixed.group, this.act.group);
    this.fixed.want = 1;
    hud.classList.add('townhud3d');
    // what the prompt and the balloon say changes with what is in front of the walker
    this.watch.observe(this.prompt, { childList: true, characterData: true, subtree: true });
    this.watch.observe(this.balloon, { attributes: true, attributeFilter: ['title'] });
    const o = { signal: this.ac.signal };
    hud.addEventListener('focusin', () => this.draw(), o);
    hud.addEventListener('focusout', () => this.draw(), o);
    layer.add(this);
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
    const s = this.layer.s,
      text = this.label(str, size, WHITE),
      cap = key ? this.label(key, SIZE.cap, CAP_INK, 12) : null,
      capH = Math.max(20, 28 * s),
      capW = cap ? Math.max(capH, cap.scale.x + 10 * s) : 0,
      gap = cap ? 12 * s : 0,
      pad = 22 * s,
      w = text.scale.x + gap + capW + 2 * pad,
      left = x - w / 2;
    part.box(left, y - h / 2, w, h, h / 2, lit ? LIT : PILL, EDGE);
    part.text(text, left + pad + text.scale.x / 2, y);
    if (cap) {
      const cx = left + w - pad - capW;
      part.box(cx, y - capH / 2, capW, capH, 5 * s, CAP, CAP_EDGE);
      part.text(cap, cx + capW / 2, y);
    }
    return w;
  }

  // Rebuilds only the part whose words, place or focus changed
  private draw() {
    const { layer, fixed, act, hud } = this,
      s = layer.s,
      page = layer.root.getBoundingClientRect();
    const rect = (e: Element): Box => {
      const r = e.getBoundingClientRect();
      return { x: r.left - page.left, y: r.top - page.top, w: r.width, h: r.height };
    };
    layer.wake();
    const keys = hud.classList.contains('kbd'),
      key = (e: Element) => (keys ? (e.querySelector('.hint')?.textContent ?? '') : ''),
      focus = document.activeElement;
    const name = rect(this.host),
      menu = rect(this.burger),
      line = rect(this.prompt),
      says = this.prompt.firstChild?.textContent ?? '';
    const fkey = JSON.stringify([name, menu, line, says, key(this.prompt), focus === this.burger, layer.dpr, s]);
    if (fkey !== fixed.key) {
      fixed.clear();
      fixed.key = fkey;
      // the town's name, on its corner
      const town = this.label(this.host.textContent ?? '', SIZE.name, WHITE),
        w = town.scale.x + 44 * s,
        h = Math.max(name.h, 44 * s);
      fixed.box(name.x, name.y, w, h, 10 * s, PILL, EDGE);
      fixed.text(town, name.x + w / 2, name.y + h / 2);
      if (says)
        this.pill(
          fixed,
          says,
          key(this.prompt),
          SIZE.prompt,
          line.x + line.w / 2,
          line.y + line.h / 2,
          Math.max(line.h, 48 * s),
        );
      // the menu button: the 3 bars
      fixed.box(menu.x, menu.y, menu.w, menu.h, 10 * s, focus === this.burger ? LIT : PILL, EDGE);
      const bw = menu.w * 0.46,
        bh = Math.max(2, Math.round(menu.h * 0.07));
      for (const k of [-1, 0, 1])
        fixed.box(
          menu.x + (menu.w - bw) / 2,
          Math.round(menu.y + menu.h / 2 + k * 2.4 * bh - bh / 2),
          bw,
          bh,
          bh / 2,
          BAR,
          NONE,
        );
    }
    // the balloon: what the action button does, drawn around the origin and moved over its target every frame
    const what = this.balloon.title;
    const akey = JSON.stringify([what, key(this.balloon), focus === this.balloon, layer.dpr, s]);
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
    this.ac.abort();
    this.fixed.clear();
    this.act.clear();
    this.hud.classList.remove('townhud3d');
    this.balloon.style.minWidth = this.balloon.style.minHeight = '';
  }
}
